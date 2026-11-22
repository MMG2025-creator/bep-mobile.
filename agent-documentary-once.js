"use strict";
const {Pool}=require("pg");
const {readDocumentaryWorkerConfig}=require("./lib/bep-agent/config");
const {readSourceSearchConfig}=require("./lib/bep-agent/source-search");
const {processOne}=require("./lib/bep-agent/worker");
const {GroqClient}=require("./lib/bep-agent/groq-client");

async function main(){
 const config=readDocumentaryWorkerConfig();
 if(!config.enabled)throw new Error("BEP documentary one-shot refused to start: "+config.disabledReason);
 const jobId=String(process.env.BEP_AGENT_DOCUMENTARY_JOB_ID||"").trim();
 if(!/^[1-9]\d{0,18}$/.test(jobId))throw new Error("BEP_AGENT_DOCUMENTARY_JOB_ID is required and must be a valid job identifier");
 if(!readSourceSearchConfig().enabled)throw new Error("Dedicated Exa source retrieval is not configured");
 const connectionString=String(process.env.BEP_AGENT_DATABASE_URL||"").trim();
 if(!connectionString)throw new Error("BEP_AGENT_DATABASE_URL is required; DATABASE_URL is deliberately not accepted");
 const pool=new Pool({connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,idleTimeoutMillis:10000,max:1});
 const client=new GroqClient({apiKey:config.apiKey,model:config.model,timeoutMs:20000});
 try{
  await pool.query("SELECT 1");
  const schema=await pool.query("SELECT to_regclass('public.bep_agent_jobs') AS jobs,to_regclass('public.bep_agent_runs') AS runs,to_regclass('public.bep_knowledge_candidates') AS candidates");
  if(!schema.rows[0]?.jobs||!schema.rows[0]?.runs||!schema.rows[0]?.candidates)throw new Error("BEP documentary schema is not migrated");
  const processed=await processOne({pool,client,model:config.model,workerId:"bep-gha-"+jobId,maxCallsPerDay:config.maxCallsPerDay,maxOutputTokens:config.maxOutputTokens,env:process.env,jobTypes:["documentary_research"],jobId,deferOnQuotaExhausted:false});
  if(!processed)throw new Error("DOCUMENTARY_JOB_NOT_CLAIMED");
  const status=await pool.query("SELECT status FROM bep_agent_jobs WHERE id::text=$1",[jobId]);
  const jobStatus=status.rows[0]?.status;
  console.info("BEP documentary one-shot finished",JSON.stringify({jobId,status:jobStatus||"missing",processed:true}));
  if(jobStatus!=="completed")throw new Error("DOCUMENTARY_JOB_NOT_COMPLETED");
 }finally{await pool.end()}
}
main().catch(error=>{console.error("BEP documentary one-shot failed:",String(error?.message||error).slice(0,180));process.exitCode=1});
