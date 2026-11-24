"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {runProviderConnectivityCheck}=require("../lib/bep-agent/provider-connectivity");

const env={
 BEP_AGENT_SOURCE_SEARCH_ENABLED:"true",
 BEP_AGENT_EXA_API_KEY:"exa_test_secret_123456",
 BEP_AGENT_SOURCE_DOMAINS:"service-public.gouv.fr",
 BEP_AGENT_AI_PROVIDER:"groq",
 BEP_AGENT_GROQ_API_KEY:"groq_test_secret_123456",
 BEP_AGENT_GROQ_MODEL:"openai/gpt-oss-20b"
};

test("isolated provider check validates Exa and Groq without database or job access",async()=>{
 let exaCalls=0,groqCalls=0;
 class FakeGroq{
  constructor(){groqCalls++}
  async generateJson(){return{value:{ok:true},usage:{total_tokens:5}}}
 }
 const result=await runProviderConnectivityCheck({
  env,
  search:async args=>{exaCalls++;assert.equal(args.numResults,1);return{resultsCount:1}},
  Groq:FakeGroq
 });
 assert.equal(exaCalls,1);
 assert.equal(groqCalls,1);
 assert.equal(result.status,"passed");
 assert.equal(result.exa.httpStatus,200);
 assert.equal(result.groq.status,"authenticated");
 assert.equal(JSON.stringify(result).includes("secret"),false);
});

test("isolated provider check stops safely when Exa authentication fails",async()=>{
 class NeverGroq{constructor(){assert.fail("Groq must not be called after Exa failure")}}
 await assert.rejects(()=>runProviderConnectivityCheck({
  env,
  search:async()=>{throw Object.assign(new Error("sensitive"),{code:"SOURCE_SEARCH_AUTH_ERROR",httpStatus:401})},
  Groq:NeverGroq
 }),error=>error.stage==="exa"&&error.providerCode==="SOURCE_SEARCH_AUTH_ERROR"&&error.httpStatus===401&&!error.message.includes("sensitive"));
});

test("isolated provider check reports missing Groq key without exposing secrets",async()=>{
 const noGroq={...env,BEP_AGENT_GROQ_API_KEY:""};
 await assert.rejects(()=>runProviderConnectivityCheck({env:noGroq,search:async()=>({resultsCount:1})}),error=>error.message==="PROVIDER_CHECK_GROQ_NOT_CONFIGURED");
});

test("isolated provider check preserves sanitized Groq provider diagnostics",async()=>{
 const secret="groq_secret_key_123456";
 class DiagnosticGroq{
  constructor(){}
  async generateJson(){
   throw Object.assign(new Error("generic"),{
    diagnosticCode:"GROQ_HTTP_ERROR",httpStatus:400,
    providerCode:"invalid_parameter",providerStatus:"invalid_request_error",
    providerMessage:"Unsupported response format using groq_secret_key_123456",
    providerParam:"response_format"
   });
  }
 }
 await assert.rejects(()=>runProviderConnectivityCheck({
  env:{...env,BEP_AGENT_GROQ_API_KEY:secret},
  search:async()=>({resultsCount:1}),
  Groq:DiagnosticGroq
 }),error=>{
  assert.equal(error.diagnosticCode,"GROQ_HTTP_ERROR");
  assert.equal(error.providerCode,"invalid_parameter");
  assert.equal(error.providerStatus,"invalid_request_error");
  assert.equal(error.providerMessage,"Unsupported response format using [REDACTED]");
  assert.equal(error.providerParam,"response_format");
  assert.equal(error.httpStatus,400);
  assert.doesNotMatch(error.providerMessage,/groq_secret_key/);
  return true;
 });
});
