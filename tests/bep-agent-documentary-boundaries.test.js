"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");
const {processOne}=require("../lib/bep-agent/worker");

test("documentary pipeline stays behind admin auth and runs one requested job through GitHub Actions",()=>{
 const server=read("server.js"),entry=read("agent-documentary-once.js"),worker=read("lib/bep-agent/worker.js"),repository=read("lib/bep-agent/repository.js"),workflow=read(".github/workflows/bep-documentary-on-demand.yml");
 assert.match(server,/app\.post\("\/api\/admin\/bep-agent\/source-search",auth,requireBepAgentAdmin/);
 assert.match(server,/app\.post\("\/api\/admin\/bep-agent\/documentary-analyze",auth,requireBepAgentAdmin/);
 assert.match(server,/dispatchDocumentaryWorkflow\(\{jobId\}\)/);
 assert.doesNotMatch(server,/BEP_AGENT_DOCUMENTARY_WORKER_ENABLED/);
 assert.match(entry,/BEP_AGENT_DATABASE_URL is required/);
 assert.match(entry,/DATABASE_URL is deliberately not accepted/);
 assert.match(entry,/new GroqClient\(\{apiKey:config\.apiKey,model:config\.model/);
 assert.match(entry,/processOne\(\{pool,client,model:config\.model/);
 assert.match(entry,/deferOnQuotaExhausted:false/);
 assert.match(entry,/retryOnFailure:false/);
 assert.match(entry,/jobTypes:\["documentary_research"\],jobId/);
 assert.match(worker,/jobTypes=\["knowledge_review","coach_quality_review"\],jobId=null/);
 assert.match(repository,/AND id::text=\$2/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/BEP_AGENT_DOCUMENTARY_JOB_ID/);
 assert.doesNotMatch(server,/app\.post\("\/api\/ai\/chat"[^]*?new GroqClient/);
});

test("approved new knowledge gets an immutable initial version and corrections are versioned",()=>{
 const server=read("server.js"),admin=read("lib/bep-coach-knowledge-admin.js");
 assert.match(server,/change_type,actor_ref\) VALUES\(\$1,1,\$2::jsonb,'created'/);
 assert.match(server,/ON CONFLICT\(slug,version\) DO NOTHING/);
 assert.match(server,/currentVersion=Number\(currentDocument\.version\)/);
 assert.match(admin,/change_type IN \('created','edited','restored','archived'\)/);
 assert.match(admin,/r\.post\("\/:slug\/restore\/:version"/);
});

test("one-shot quota exhaustion marks the task failed instead of leaving it queued",async()=>{
 let taskStatus="running";
 const poolQueries=[];
 const client={query:async(sql)=>{
  if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK")return{rowCount:0,rows:[]};
  if(sql.startsWith("UPDATE bep_agent_jobs SET status=CASE"))return{rowCount:0,rows:[]};
  if(sql.includes("SELECT id,job_type,payload,attempts,max_attempts"))return{rowCount:1,rows:[{id:481,job_type:"documentary_research",payload:{query:"budget"},attempts:1,max_attempts:3}]};
  if(sql.startsWith("UPDATE bep_agent_jobs SET status='running'")){taskStatus="running";return{rowCount:1,rows:[]}}
  return{rowCount:0,rows:[]};
 },release(){}};
 const pool={connect:async()=>client,query:async(sql)=>{
  poolQueries.push(sql);
  if(sql.startsWith("INSERT INTO bep_agent_daily_usage"))return{rowCount:0,rows:[]};
  if(sql.startsWith("UPDATE bep_agent_jobs SET status='failed'")){taskStatus="failed";return{rowCount:1,rows:[]}}
  return{rowCount:1,rows:[]};
 }};
 await processOne({pool,client:{generateJson:async()=>{throw new Error("must not call Groq")}},model:"test-model",workerId:"test",maxCallsPerDay:1,jobTypes:["documentary_research"],jobId:"481",deferOnQuotaExhausted:false,retryOnFailure:false});
 assert.equal(taskStatus,"failed");
 assert.equal(poolQueries.some(sql=>sql.includes("run_after=CASE WHEN")),false,"one-shot failure must not enqueue a retry without a resident worker");
});
