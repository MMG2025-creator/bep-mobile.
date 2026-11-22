"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {readDocumentaryWorkerConfig}=require("../lib/bep-agent/config");
const {startDocumentaryWorker}=require("../lib/bep-agent/documentary-worker");
const {claim}=require("../lib/bep-agent/repository");

const base={BEP_AGENT_ENABLED:"true",BEP_AGENT_RUN_AS_WORKER:"true",BEP_AGENT_RUN_MODE:"admin_on_demand",BEP_AGENT_FREE_TIER_ACKNOWLEDGED:"true",BEP_AGENT_AI_PROVIDER:"groq",BEP_AGENT_GROQ_API_KEY:"groq-test-key",BEP_AGENT_SOURCE_SEARCH_ENABLED:"true",BEP_AGENT_EXA_API_KEY:"exa-test-key"};

test("documentary worker requires the dedicated Groq provider and separate worker mode",()=>{
 assert.equal(readDocumentaryWorkerConfig(base).enabled,true);
 assert.equal(readDocumentaryWorkerConfig({...base,BEP_AGENT_AI_PROVIDER:"gemini",BEP_AGENT_GEMINI_API_KEY:"gemini-key"}).enabled,false);
 assert.equal(readDocumentaryWorkerConfig({...base,BEP_AGENT_RUN_AS_WORKER:"false"}).enabled,false);
 assert.equal(readDocumentaryWorkerConfig({...base,BEP_AGENT_GROQ_API_KEY:""}).enabled,false);
});

test("documentary worker refuses to start without Exa source retrieval credentials",async()=>{
 await assert.rejects(()=>startDocumentaryWorker({pool:{},env:{...base,BEP_AGENT_EXA_API_KEY:""},logger:{}}),/dedicated Exa source search/);
});

test("documentary worker refuses to start without a dedicated database pool",async()=>{
 await assert.rejects(()=>startDocumentaryWorker({env:base,logger:{}}),/BEP_AGENT_DATABASE_URL pool is required/);
});

test("documentary worker claims only documentary jobs and drains active work on stop",async()=>{
 let startedResolve,releaseResolve;
 const started=new Promise(resolve=>{startedResolve=resolve});
 const gate=new Promise(resolve=>{releaseResolve=resolve});
 const worker=await startDocumentaryWorker({pool:{},env:{...base,BEP_AGENT_POLL_MS:"60000"},logger:{},processOneImpl:async args=>{
  assert.deepEqual(args.jobTypes,["documentary_research"]);
  startedResolve();
  await gate;
 }});
 await started;
 let stopped=false;
 const stopping=worker.stop().then(()=>{stopped=true});
 await Promise.resolve();
 assert.equal(stopped,false,"stop must wait for the in-flight job");
 releaseResolve();
 await stopping;
 assert.equal(stopped,true);
});

test("PostgreSQL claim applies the explicit worker job-type allowlist",async()=>{
 const calls=[];
 const client={query:async(sql,params)=>{calls.push({sql,params});if(sql==="SELECT id,job_type,payload,attempts,max_attempts FROM bep_agent_jobs WHERE status='queued' AND run_after<=NOW() AND job_type=ANY($1::text[]) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED")return{rowCount:0,rows:[]};return{rowCount:0,rows:[]}},release(){}};
 const pool={connect:async()=>client};
 await claim(pool,"test-worker",["documentary_research"]);
 const select=calls.find(x=>x.sql.includes("job_type=ANY"));
 assert.deepEqual(select.params,[["documentary_research"]]);
});
