"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {readDocumentaryWorkerConfig}=require("../lib/bep-agent/config");
const {startDocumentaryWorker}=require("../lib/bep-agent/documentary-worker");

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
