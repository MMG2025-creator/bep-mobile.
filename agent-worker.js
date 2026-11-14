"use strict";
const {Pool}=require("pg");
const {readConfig}=require("./lib/bep-agent/config");
const {startBepAgent}=require("./lib/bep-agent");

async function main(){
 const config=readConfig();
 if(!config.enabled)throw new Error("BEP Gemini supervisor refused to start: "+config.disabledReason);
 const connectionString=String(process.env.BEP_AGENT_DATABASE_URL||"").trim();
 if(!connectionString)throw new Error("BEP_AGENT_DATABASE_URL is required; DATABASE_URL is deliberately not accepted");
 const pool=new Pool({connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,idleTimeoutMillis:30000,max:2});
 let agent;
 try{
  await pool.query("SELECT 1");
  agent=await startBepAgent({pool,env:process.env});
 }catch(error){await pool.end();throw error}
 if(!agent.enabled){await pool.end();throw new Error("Supervisor did not start")}
 let stopping=false;
 async function shutdown(signal){
  if(stopping)return;stopping=true;
  console.info("BEP supervisor stopping",signal);
  agent.stop();
  await pool.end();
  process.exit(0);
 }
 process.once("SIGTERM",()=>void shutdown("SIGTERM"));
 process.once("SIGINT",()=>void shutdown("SIGINT"));
}
main().catch(error=>{console.error("BEP supervisor startup failed:",String(error?.message||error));process.exit(1)});
