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

test("isolated provider check preserves actionable Groq HTTP 400 diagnostics",async()=>{
 class FakeGroq{
  async generateJson(){
   throw Object.assign(new Error("Groq HTTP 400 | code=invalid_request_error | type=invalid_request_error | param=response_format | detail=Unsupported response format"),{
    diagnosticCode:"GROQ_HTTP_ERROR",httpStatus:400,providerCode:"invalid_request_error",
    providerStatus:"invalid_request_error",providerMessage:"Unsupported response format",
    providerParam:"response_format",retryable:false
   });
  }
 }
 await assert.rejects(()=>runProviderConnectivityCheck({
  env,search:async()=>({resultsCount:1}),Groq:FakeGroq
 }),error=>{
  assert.equal(error.message,"PROVIDER_CHECK_GROQ_FAILED: GROQ_HTTP_ERROR | HTTP 400 | code=invalid_request_error | type=invalid_request_error | param=response_format | detail=Unsupported response format");
  assert.equal(error.stage,"groq");
  assert.equal(error.diagnosticCode,"GROQ_HTTP_ERROR");
  assert.equal(error.providerCode,"invalid_request_error");
  assert.equal(error.providerStatus,"invalid_request_error");
  assert.equal(error.providerMessage,"Unsupported response format");
  assert.equal(error.providerParam,"response_format");
  assert.equal(error.httpStatus,400);
  assert.equal(error.retryable,false);
  assert.equal(error.message.includes(env.BEP_AGENT_GROQ_API_KEY),false);
  return true;
 });
});

test("isolated provider check preserves sanitized failed_generation",async()=>{
 class FakeGroq{
  async generateJson(){
   throw Object.assign(new Error("Groq validation failed"),{
    diagnosticCode:"GROQ_HTTP_ERROR",httpStatus:400,providerCode:"json_validate_failed",
    providerMessage:"Failed to validate JSON.",providerFailedGeneration:'{"ok": true, "secret": "[REDACTED]"}',retryable:false
   });
  }
 }
 await assert.rejects(()=>runProviderConnectivityCheck({
  env,search:async()=>({resultsCount:1}),Groq:FakeGroq
 }),error=>{
  assert.match(error.message,/failed_generation=\{"ok": true, "secret": "\[REDACTED\]"\}/);
  assert.equal(error.providerFailedGeneration,'{"ok": true, "secret": "[REDACTED]"}');
  assert.equal(error.message.includes(env.BEP_AGENT_GROQ_API_KEY),false);
  return true;
 });
});

test("isolated provider check propagates sanitized raw Groq response diagnostics",async()=>{
 const raw='{"error":{"code":"json_validate_failed"},"debug":"Bearer gsk_live_abcdefghijklmnop"}';
 class FakeGroq{
  async generateJson(){
   throw Object.assign(new Error("Groq validation failed"),{
    diagnosticCode:"GROQ_HTTP_ERROR",httpStatus:400,providerCode:"json_validate_failed",
    providerResponseBody:'{"error":{"code":"json_validate_failed"},"debug":"Bearer [TOKEN_REMOVED]"}',
    providerResponseKeys:["error","debug"],providerErrorKeys:["code"],retryable:false
   });
  }
 }
 await assert.rejects(()=>runProviderConnectivityCheck({
  env,search:async()=>({resultsCount:1}),Groq:FakeGroq
 }),error=>{
  assert.equal(error.providerResponseBody,'{"error":{"code":"json_validate_failed"},"debug":"Bearer [TOKEN_REMOVED]"}');
  assert.deepEqual(error.providerResponseKeys,["error","debug"]);
  assert.deepEqual(error.providerErrorKeys,["code"]);
  assert.equal(error.message.includes("gsk_live_abcdefghijklmnop"),false);
  return true;
 });
});

test("isolated provider check reports missing Groq key without exposing secrets",async()=>{
 const noGroq={...env,BEP_AGENT_GROQ_API_KEY:""};
 await assert.rejects(()=>runProviderConnectivityCheck({env:noGroq,search:async()=>({resultsCount:1})}),error=>error.message==="PROVIDER_CHECK_GROQ_NOT_CONFIGURED");
});


test("diagnostic matrix isolates prompt syntax and token ceiling in four sequential calls",async()=>{
 const calls=[];
 class FakeGroq{
  async generateJson(args){
   calls.push({prompt:args.prompt,maxOutputTokens:args.maxOutputTokens});
   if(calls.length===1||calls.length===3){
    throw Object.assign(new Error("validation"),{
     diagnosticCode:"GROQ_HTTP_ERROR",httpStatus:400,providerCode:"json_validate_failed",
     providerFailedGeneration:"",providerMessage:"Failed to validate JSON."
    });
   }
   return{value:{ok:true},usage:{total_tokens:6}};
  }
 }
 const result=await runProviderConnectivityCheck({
  env,search:async()=>({resultsCount:1}),Groq:FakeGroq,diagnosticMatrix:true
 });
 assert.deepEqual(calls,[
  {prompt:"Return {ok:true}.",maxOutputTokens:32},
  {prompt:'Return {"ok":true}.',maxOutputTokens:32},
  {prompt:"Return {ok:true}.",maxOutputTokens:256},
  {prompt:'Return {"ok":true}.',maxOutputTokens:256}
 ]);
 assert.equal(result.mode,"diagnostic_prompt_token_matrix");
 assert.equal(result.groq.cases.length,4);
 assert.deepEqual(result.groq.cases.map(item=>item.status),["failed","passed","failed","passed"]);
 assert.equal(result.groq.cases[0].providerFailedGeneration,"");
 assert.equal(result.groq.cases[0].providerCode,"json_validate_failed");
 assert.equal(JSON.stringify(result).includes(env.BEP_AGENT_GROQ_API_KEY),false);
});
