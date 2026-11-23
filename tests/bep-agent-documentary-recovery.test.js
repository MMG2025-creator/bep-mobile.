"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {recoverOrphanedQueuedJob}=require("../lib/bep-agent/repository");

function makePool({job={},stale=true,hasRun=false,closeRows=1}={}){
 const calls=[];
 const row={id:27,job_type:"documentary_research",payload:{query:"audit library"},status:"queued",attempts:0,locked_at:null,locked_by:null,created_at:"2026-11-23T09:00:00.000Z",updated_at:"2026-11-23T09:00:00.000Z",...job};
 const client={
  async query(sql,params=[]){
   calls.push({sql,params});
   if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK")return{rowCount:0,rows:[]};
   if(sql.startsWith("SELECT id,job_type,payload,status,attempts"))return{rowCount:1,rows:[row]};
   if(sql.startsWith("SELECT ($1::timestamptz"))return{rowCount:1,rows:[{stale}]};
   if(sql.startsWith("SELECT id FROM bep_agent_runs"))return{rowCount:hasRun?1:0,rows:hasRun?[{id:9}]:[]};
   if(sql.startsWith("UPDATE bep_agent_jobs SET status='failed'"))return{rowCount:closeRows,rows:closeRows?[{id:27}]:[]};
   if(sql.startsWith("INSERT INTO bep_agent_jobs"))return{rowCount:1,rows:[{id:28}]};
   throw new Error("Unexpected SQL in test: "+sql);
  },
  release(){calls.push({sql:"RELEASE",params:[]})}
 };
 return{pool:{connect:async()=>client},calls};
}

test("orphan recovery atomically closes the stale job and creates a replacement with the same payload",async()=>{
 const {pool,calls}=makePool();
 const result=await recoverOrphanedQueuedJob(pool,"27");
 assert.deepEqual(result,{previousJobId:"27",jobId:"28"});
 const closeIndex=calls.findIndex(x=>x.sql.startsWith("UPDATE bep_agent_jobs SET status='failed'"));
 const insertIndex=calls.findIndex(x=>x.sql.startsWith("INSERT INTO bep_agent_jobs"));
 assert.ok(closeIndex>=0&&insertIndex>closeIndex,"release the partial unique index before inserting the replacement");
 assert.deepEqual(calls[insertIndex].params,[JSON.stringify({query:"audit library"})]);
 assert.ok(calls.some(x=>x.sql==="COMMIT"));
 assert.ok(!calls.some(x=>x.sql==="ROLLBACK"));
});

test("recovery rejects a job that is not queued, untouched, unlocked documentary work",async()=>{
 for(const job of [
  {status:"running"},
  {status:"completed"},
  {job_type:"knowledge_review"},
  {attempts:1},
  {locked_at:"2026-11-23T09:00:00.000Z"},
  {locked_by:"worker-1"}
 ]){
  const {pool,calls}=makePool({job});
  await assert.rejects(()=>recoverOrphanedQueuedJob(pool,"27"),{code:"DOCUMENTARY_RECOVERY_JOB_NOT_ELIGIBLE"});
  assert.ok(calls.some(x=>x.sql==="ROLLBACK"));
  assert.ok(!calls.some(x=>x.sql.startsWith("INSERT INTO bep_agent_jobs")));
 }
});

test("recovery rejects recent jobs and jobs with execution history",async()=>{
 const recent=makePool({stale:false});
 await assert.rejects(()=>recoverOrphanedQueuedJob(recent.pool,"27"),{code:"DOCUMENTARY_RECOVERY_JOB_NOT_STALE"});
 const withRun=makePool({hasRun:true});
 await assert.rejects(()=>recoverOrphanedQueuedJob(withRun.pool,"27"),{code:"DOCUMENTARY_RECOVERY_JOB_HAS_RUN_HISTORY"});
 for(const state of [recent,withRun])assert.ok(state.calls.some(x=>x.sql==="ROLLBACK"));
});

test("recovery validates the ID and handles a concurrent state change without creating a replacement",async()=>{
 const {pool,calls}=makePool({closeRows:0});
 await assert.rejects(()=>recoverOrphanedQueuedJob(pool,"0"),{code:"DOCUMENTARY_RECOVERY_JOB_ID_INVALID"});
 await assert.rejects(()=>recoverOrphanedQueuedJob(pool,"27"),{code:"DOCUMENTARY_RECOVERY_JOB_STATE_CHANGED"});
 assert.ok(!calls.some(x=>x.sql.startsWith("INSERT INTO bep_agent_jobs")));
});

test("recovery endpoint is admin-only, checks pipeline readiness, and dispatches only the replacement job",()=>{
 const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
 const start=server.indexOf('app.post("/api/admin/bep-agent/documentary-recover"');
 const end=server.indexOf('app.get("/api/admin/bep-agent/library-benchmark/cases"',start);
 const route=server.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(route,/auth,requireBepAgentAdmin/);
 assert.match(route,/recoverOrphanedQueuedJob\(pool,jobId\)/);
 assert.match(route,/dispatchDocumentaryWorkflow\(\{jobId:recovered\.jobId\}\)/);
 assert.match(route,/automaticPublication:false/);
 assert.doesNotMatch(route,/dispatchDocumentaryWorkflow\(\{jobId\}\)/);
});
