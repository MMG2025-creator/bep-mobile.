"use strict";
const {Pool}=require("pg");
const {readDocumentaryWorkerConfig}=require("./lib/bep-agent/config");
const {startDocumentaryWorker}=require("./lib/bep-agent/documentary-worker");
const {reportPostgresRole}=require("./lib/bep-db-role-probe");

async function main(){
 const config=readDocumentaryWorkerConfig();
 if(!config.enabled)throw new Error("BEP documentary worker refused to start: "+config.disabledReason);
 const connectionString=String(process.env.BEP_AGENT_DATABASE_URL||"").trim();
 if(!connectionString)throw new Error("BEP_AGENT_DATABASE_URL is required; DATABASE_URL is deliberately not accepted");
 const pool=new Pool({connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,idleTimeoutMillis:30000,max:2});
 let worker;
 try{
  if(process.env.BEP_DB_ROLE_PROBE==="true")await reportPostgresRole({pool,component:"documentary-worker",variable:"BEP_AGENT_DATABASE_URL"});
  await pool.query("SELECT 1");
  const schema=await pool.query("SELECT to_regclass('public.bep_agent_jobs') AS jobs,to_regclass('public.bep_agent_runs') AS runs,to_regclass('public.bep_knowledge_candidates') AS candidates");
  if(!schema.rows[0]?.jobs||!schema.rows[0]?.runs||!schema.rows[0]?.candidates)throw new Error("BEP documentary schema is not migrated; run the explicit API schema migration first");
  worker=await startDocumentaryWorker({pool,env:process.env});
 }catch(error){await pool.end();throw error}
 let stopping=false;
 async function shutdown(signal){
  if(stopping)return;stopping=true;
  console.info("BEP documentary worker stopping",signal);
  worker.stop();
  await pool.end();
  process.exit(0);
 }
 process.once("SIGTERM",()=>void shutdown("SIGTERM"));
 process.once("SIGINT",()=>void shutdown("SIGINT"));
}
main().catch(error=>{console.error("BEP documentary worker startup failed:",String(error?.message||error));process.exit(1)});
