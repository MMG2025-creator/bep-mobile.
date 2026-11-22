"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const root=path.join(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");
const {processOne}=require("../lib/bep-agent/worker");
const {readDocumentaryWorkerConfig}=require("../lib/bep-agent/config");

test("documentary pipeline stays behind admin auth and dispatches an isolated Render Workflow task",()=>{
 const server=read("server.js"),workflow=read("render-workflows/main.mjs"),dispatch=read("lib/bep-agent/render-dispatch.js"),worker=read("lib/bep-agent/worker.js"),repository=read("lib/bep-agent/repository.js"),role=read("database/operations/bep_agent_runner_role.sql");
 assert.ok(server.includes('app.post("/api/admin/bep-agent/source-search",auth,requireBepAgentAdmin'));
 assert.ok(server.includes('app.post("/api/admin/bep-agent/documentary-analyze",auth,requireBepAgentAdmin'));
 assert.ok(server.includes("dispatchDocumentaryWorkflow({jobId})"));
 assert.ok(server.includes('execution:"render_workflows_on_demand"'));
 assert.ok(dispatch.includes('const API_ROOT="https://api.render.com/v1"'));
 assert.ok(dispatch.includes('API_ROOT+"/task-runs"'));
 assert.ok(dispatch.includes('idempotencyKey:"bep-documentary-"'));
 assert.ok(workflow.includes("process.env.BEP_AGENT_DATABASE_URL"));
 assert.doesNotMatch(workflow,/process\\.env\\.DATABASE_URL/);
 execFileSync(process.execPath,["--check",path.join(root,"render-workflows/main.mjs")]);
 assert.ok(workflow.includes('role_name!=="bep_agent_runner"'));
 assert.ok(workflow.includes('database_name!=="bep_v2_db"'));
 assert.ok(workflow.includes('jobTypes:["documentary_research"],jobId:id'));
 assert.ok(workflow.includes("retry:{maxRetries:0}"));
 assert.ok(worker.includes('jobTypes=["knowledge_review","coach_quality_review"],jobId=null'));
 assert.ok(repository.includes("AND id::text=$2"));
 assert.ok(role.includes("GRANT SELECT, UPDATE ON TABLE bep_agent_jobs"));
 assert.ok(role.includes("GRANT INSERT ON TABLE bep_knowledge_candidates"));
 assert.doesNotMatch(role,/GRANT .* ON ALL TABLES/);
});


test("documentary workflow config requires its dedicated worker and provider credentials",()=>{
 const config=readDocumentaryWorkerConfig({
  BEP_AGENT_ENABLED:"true",
  BEP_AGENT_RUN_AS_WORKER:"true",
  BEP_AGENT_RUN_MODE:"admin_on_demand",
  BEP_AGENT_FREE_TIER_ACKNOWLEDGED:"true",
  BEP_AGENT_AI_PROVIDER:"groq",
  BEP_AGENT_GROQ_API_KEY:"test-key",
  BEP_AGENT_SOURCE_SEARCH_ENABLED:"true",
  BEP_AGENT_EXA_API_KEY:"exa-test"
 });
 assert.equal(config.enabled,true);
 assert.equal(config.provider,"groq");
 assert.equal(readDocumentaryWorkerConfig({BEP_AGENT_ENABLED:"true",BEP_AGENT_RUN_MODE:"admin_on_demand",BEP_AGENT_FREE_TIER_ACKNOWLEDGED:"true",BEP_AGENT_AI_PROVIDER:"groq",BEP_AGENT_GROQ_API_KEY:"x"}).enabled,false);
});

test("documentary migration permits create candidates and the dedicated job type",()=>{
 const migration=read("database/migrations/20261122_bep_documentary_pipeline.sql");
 assert.match(migration,/job_type IN \('knowledge_review','coach_quality_review','documentary_research'\)/);
 assert.match(migration,/proposal_type IN \('clarify','update','deactivate','create'\)/);
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
