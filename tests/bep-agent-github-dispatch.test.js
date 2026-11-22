"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {readDocumentaryDispatchConfig,dispatchDocumentaryWorkflow}=require("../lib/bep-agent/github-dispatch");

const env={BEP_AGENT_GITHUB_DISPATCH_TOKEN:"test-token",BEP_AGENT_GITHUB_REPOSITORY:"MMG2025-creator/bep-mobile.",BEP_AGENT_GITHUB_WORKFLOW_ID:"bep-documentary-on-demand.yml",BEP_AGENT_GITHUB_REF:"feat/admin-documentary-optimization-20261122"};

test("GitHub dispatch configuration requires a dedicated credential and valid target",()=>{
 assert.equal(readDocumentaryDispatchConfig(env).enabled,true);
 assert.equal(readDocumentaryDispatchConfig({...env,BEP_AGENT_GITHUB_DISPATCH_TOKEN:""}).enabled,false);
 assert.equal(readDocumentaryDispatchConfig({...env,BEP_AGENT_GITHUB_REPOSITORY:"https://github.com/x/y"}).enabled,false);
 assert.equal(readDocumentaryDispatchConfig({...env,BEP_AGENT_GITHUB_REF:""}).enabled,false);
});

test("workflow dispatch sends only the job id and never exposes the token",async()=>{
 let request;
 const result=await dispatchDocumentaryWorkflow({jobId:"123e4567-e89b-12d3-a456-426614174000",env,fetchImpl:async(url,options)=>{request={url,options};return{status:204}}});
 assert.equal(result.dispatched,true);
 assert.match(request.url,/actions\/workflows\/bep-documentary-on-demand\.yml\/dispatches$/);
 assert.equal(request.options.headers.Authorization,"Bearer test-token");
 assert.deepEqual(JSON.parse(request.options.body),{ref:env.BEP_AGENT_GITHUB_REF,inputs:{job_id:"123e4567-e89b-12d3-a456-426614174000"}});
});

test("workflow dispatch rejects malformed job ids and non-204 responses",async()=>{
 await assert.rejects(()=>dispatchDocumentaryWorkflow({jobId:"bad",env,fetchImpl:async()=>({status:204})}),/DOCUMENTARY_JOB_ID_INVALID/);
 await assert.rejects(()=>dispatchDocumentaryWorkflow({jobId:"123e4567-e89b-12d3-a456-426614174000",env,fetchImpl:async()=>({status:403})}),/DOCUMENTARY_DISPATCH_HTTP_403/);
});
