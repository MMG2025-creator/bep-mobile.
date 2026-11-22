"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {readRenderDispatchConfig,dispatchDocumentaryWorkflow}=require("../lib/bep-agent/render-dispatch");

test("Render dispatch requires a dedicated API key and a valid workflow task slug",()=>{
 assert.equal(readRenderDispatchConfig({BEP_AGENT_RENDER_TASK_SLUG:"bep-documentary-runner/documentaryAnalyze"}).enabled,false);
 assert.equal(readRenderDispatchConfig({RENDER_API_KEY:"rnd_test",BEP_AGENT_RENDER_TASK_SLUG:"invalid slug"}).enabled,false);
 const config=readRenderDispatchConfig({RENDER_API_KEY:"rnd_test",BEP_AGENT_RENDER_TASK_SLUG:"bep-documentary-runner/documentaryAnalyze"});
 assert.equal(config.enabled,true);
 assert.equal(config.taskSlug,"bep-documentary-runner/documentaryAnalyze");
});

test("Render dispatch starts one idempotent task with only the documentary job ID",async()=>{
 let request;
 const result=await dispatchDocumentaryWorkflow({
  jobId:"481",
  env:{RENDER_API_KEY:"rnd_test",BEP_AGENT_RENDER_TASK_SLUG:"bep-documentary-runner/documentaryAnalyze"},
  fetchImpl:async(url,options)=>{
   request={url,options};
   return{status:202,json:async()=>({id:"trn-abc123",status:"pending"})};
  }
 });
 assert.equal(request.url,"https://api.render.com/v1/task-runs");
 assert.equal(request.options.method,"POST");
 assert.equal(request.options.headers.Authorization,"Bearer rnd_test");
 assert.deepEqual(JSON.parse(request.options.body),{task:"bep-documentary-runner/documentaryAnalyze",input:["481"],idempotencyKey:"bep-documentary-481"});
 assert.deepEqual(result,{dispatched:true,taskSlug:"bep-documentary-runner/documentaryAnalyze",taskRunId:"trn-abc123",status:"pending"});
});

test("Render dispatch refuses malformed job IDs and non-202 responses",async()=>{
 await assert.rejects(()=>dispatchDocumentaryWorkflow({jobId:"../481",env:{RENDER_API_KEY:"rnd_test",BEP_AGENT_RENDER_TASK_SLUG:"bep-documentary-runner/documentaryAnalyze"}}),/DOCUMENTARY_JOB_ID_INVALID/);
 await assert.rejects(()=>dispatchDocumentaryWorkflow({jobId:"481",env:{RENDER_API_KEY:"rnd_test",BEP_AGENT_RENDER_TASK_SLUG:"bep-documentary-runner/documentaryAnalyze"},fetchImpl:async()=>({status:403,json:async()=>({})})}),/DOCUMENTARY_RENDER_DISPATCH_HTTP_403/);
});
