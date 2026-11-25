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
const {assertDocumentarySchema}=require("../lib/bep-agent/documentary-schema.js");
const {runProviderConnectivityCheck}=require("../lib/bep-agent/provider-connectivity.js");

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
  if(!/^[1-9]\d{0,18}$/.test(id))throw new Error("DOCUMENTARY_JOB_ID_INVALID");
  const pool=new Pool({connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,idleTimeoutMillis:10000,max:1});
  try{
   // Temporary, allowlisted diagnostic: never log connection strings or environment values.
   const identity=await pool.query("SELECT current_user AS role_name,session_user AS session_role_name,current_database() AS database_name");
   const dbIdentity={
    currentUser:String(identity.rows[0]?.role_name||""),
    sessionUser:String(identity.rows[0]?.session_role_name||""),
    database:String(identity.rows[0]?.database_name||"")
   };
   console.info("[BEP_WORKER_DB_IDENTITY] "+JSON.stringify(dbIdentity));
   if(dbIdentity.currentUser!=="bep_agent_runner"||dbIdentity.sessionUser!=="bep_agent_runner")throw new Error("DOCUMENTARY_DATABASE_ROLE_MISMATCH");
   if(dbIdentity.database!=="bep_v2_db")throw new Error("DOCUMENTARY_DATABASE_TARGET_MISMATCH");
   await assertDocumentarySchema(pool);
   const client=new GroqClient({apiKey:config.apiKey,model:config.model,timeoutMs:20000});
   const processed=await processOne({pool,client,model:config.model,workerId:"bep-render-"+crypto.randomUUID(),maxCallsPerDay:config.maxCallsPerDay,maxOutputTokens:config.maxOutputTokens,env:process.env,jobTypes:["documentary_research"],jobId:id,deferOnQuotaExhausted:false,retryOnFailure:false});
   if(!processed){
    const state=await pool.query("SELECT status,last_error FROM bep_agent_jobs WHERE id::text=$1",[id]);
    const job=state.rows[0];
    const detail=String(job?.last_error||"no_worker_diagnostic").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").slice(0,500);
    throw new Error("DOCUMENTARY_JOB_NOT_CLAIMED:status="+String(job?.status||"missing")+";detail="+detail);
   }
   const result=await pool.query("SELECT status,last_error FROM bep_agent_jobs WHERE id::text=$1",[id]);
   const job=result.rows[0],status=job?.status;
   if(status!=="completed"){
    const detail=String(job?.last_error||"no_worker_diagnostic").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").slice(0,500);
    throw new Error("DOCUMENTARY_JOB_NOT_COMPLETED:status="+String(status||"missing")+";detail="+detail);
   }
   return{jobId:id,status:"completed",provider:"groq",sourceProvider:"exa",automaticPublication:false};
  }finally{
   await pool.end();
  }
 }
);


task(
 {name:"providerConnectivityCheck",retry:{maxRetries:0},timeoutSeconds:60},
 async ()=>{
  const result=await runProviderConnectivityCheck({env:process.env});
  console.info("[BEP_PROVIDER_CONNECTIVITY] "+JSON.stringify(result));
  return result;
 }
);
