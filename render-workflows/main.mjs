import { task } from "@renderinc/sdk/workflows";
import pg from "pg";
import { createRequire } from "node:module";
import crypto from "node:crypto";

const require=createRequire(import.meta.url);
const {Pool}=pg;
const {readDocumentaryWorkerConfig}=require("../lib/bep-agent/config.js");
const {readSourceSearchConfig}=require("../lib/bep-agent/source-search.js");
const {processOne}=require("../lib/bep-agent/worker.js");
const {GroqClient}=require("../lib/bep-agent/groq-client.js");

task(
 {name:"documentaryAnalyze",retry:{maxRetries:0},timeoutSeconds:900},
 async (_ctx,jobId)=>{
  const config=readDocumentaryWorkerConfig();
  if(!config.enabled)throw new Error("BEP_DOCUMENTARY_WORKER_DISABLED:"+config.disabledReason);
  const searchConfig=readSourceSearchConfig();
  if(!searchConfig.enabled)throw new Error("BEP_DOCUMENTARY_EXA_NOT_CONFIGURED");
  const connectionString=String(process.env.BEP_AGENT_DATABASE_URL||"").trim();
  if(!connectionString)throw new Error("BEP_AGENT_DATABASE_URL_REQUIRED");
  const id=String(jobId||"").trim();
  if(!/^[1-9]\\d{0,18}$/.test(id))throw new Error("DOCUMENTARY_JOB_ID_INVALID");
  const pool=new Pool({connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,idleTimeoutMillis:10000,max:1});
  try{
   const identity=await pool.query("SELECT current_user AS role_name,current_database() AS database_name");
   if(identity.rows[0]?.role_name!=="bep_agent_runner")throw new Error("DOCUMENTARY_DATABASE_ROLE_MISMATCH");
   if(identity.rows[0]?.database_name!=="bep_v2_db")throw new Error("DOCUMENTARY_DATABASE_TARGET_MISMATCH");
   const schema=await pool.query("SELECT to_regclass('public.bep_agent_jobs') AS jobs,to_regclass('public.bep_agent_runs') AS runs,to_regclass('public.bep_knowledge_candidates') AS candidates,to_regclass('public.bep_agent_daily_usage') AS usage,to_regclass('public.bep_agent_metrics') AS metrics");
   const tables=schema.rows[0]||{};
   if(!tables.jobs||!tables.runs||!tables.candidates||!tables.usage||!tables.metrics)throw new Error("BEP_DOCUMENTARY_SCHEMA_NOT_MIGRATED");
   const client=new GroqClient({apiKey:config.apiKey,model:config.model,timeoutMs:20000});
   const processed=await processOne({pool,client,model:config.model,workerId:"bep-render-"+crypto.randomUUID(),maxCallsPerDay:config.maxCallsPerDay,maxOutputTokens:config.maxOutputTokens,env:process.env,jobTypes:["documentary_research"],jobId:id,deferOnQuotaExhausted:false,retryOnFailure:false});
   if(!processed)throw new Error("DOCUMENTARY_JOB_NOT_CLAIMED");
   const result=await pool.query("SELECT status FROM bep_agent_jobs WHERE id::text=$1",[id]);
   const status=result.rows[0]?.status;
   if(status!=="completed")throw new Error("DOCUMENTARY_JOB_NOT_COMPLETED");
   return{jobId:id,status:"completed",provider:"groq",sourceProvider:"exa",automaticPublication:false};
  }finally{
   await pool.end();
  }
 }
);
