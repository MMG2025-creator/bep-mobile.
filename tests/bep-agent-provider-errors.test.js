"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {searchDocumentarySources}=require("../lib/bep-agent/source-search");
const {GroqClient}=require("../lib/bep-agent/groq-client");
const {runProviderConnectivityCheck}=require("../lib/bep-agent/provider-connectivity");
const {sourceMapFor,MAX_SOURCE_TEXT_CHARS,MAX_SOURCE_HIGHLIGHTS,MAX_SOURCE_HIGHLIGHT_CHARS,MAX_LIBRARY_DOCUMENTS,MAX_LIBRARY_CONTENT_CHARS,MAX_ANALYSIS_PROMPT_CHARS}=require("../lib/bep-agent/documentary-analysis");

test("Exa 401 preserves a sanitized provider diagnostic without exposing its key",async()=>{
 const apiKey="exa_secret_key_123456789";
 await assert.rejects(()=>searchDocumentarySources({
  query:"aide budget",env:{BEP_AGENT_SOURCE_SEARCH_ENABLED:"true",BEP_AGENT_EXA_API_KEY:apiKey},
  fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{message:"Invalid API key exa_secret_key_123456789"}})})
 }),error=>{
  assert.equal(error.code,"SOURCE_SEARCH_AUTH_ERROR");
  assert.match(error.message,/Invalid API key/);
  assert.doesNotMatch(error.message,/exa_secret_key/);
  return true;
 });
});

for(const status of [400,413]){
 test("Groq HTTP "+status+" preserves safe provider details",async()=>{
  const apiKey="groq_secret_key_123456789";
  const client=new GroqClient({apiKey});
  const original=global.fetch;
  global.fetch=async()=>({ok:false,status,text:async()=>JSON.stringify({error:{message:"Invalid request groq_secret_key_123456789",type:"invalid_request_error",code:"invalid_parameter",param:"response_format"}})});
  try{
   await assert.rejects(()=>client.generateJson({system:"system",prompt:"prompt",jsonSchema:{name:"test",schema:{type:"object"}}}),error=>{
    assert.equal(error.httpStatus,status);
    assert.equal(error.providerCode,"invalid_parameter");
    assert.equal(error.providerParam,"response_format");
    assert.equal(error.providerMessage,"Invalid request [REDACTED]");
    assert.match(error.message,/Invalid request/);
    assert.doesNotMatch(error.message,/groq_secret_key/);
    return true;
   });
  }finally{global.fetch=original;}
 });
}

test("documentary analysis accepts only configured allowlisted HTTPS sources",()=>{
 const configured=["docs.example.org"];
 const accepted={url:"https://docs.example.org/guide",text:"source text",highlights:[]};
 const rejected={url:"https://www.amf-france.org/guide",text:"source text",highlights:[]};
 const map=sourceMapFor([accepted,rejected],configured);
 assert.equal(map.size,1);
 assert.equal(map.has(accepted.url),true);
 assert.equal(map.has(rejected.url),false);
});

test("documentary prompt payload limits stay bounded",()=>{
 assert.equal(MAX_SOURCE_TEXT_CHARS,1000);
 assert.equal(MAX_SOURCE_HIGHLIGHTS,2);
 assert.equal(MAX_SOURCE_HIGHLIGHT_CHARS,250);
 assert.equal(MAX_LIBRARY_DOCUMENTS,8);
 assert.equal(MAX_LIBRARY_CONTENT_CHARS,300);
 assert.equal(MAX_ANALYSIS_PROMPT_CHARS,14000);
});


test("Groq connectivity wrapper preserves sanitized provider diagnostics",async()=>{
 const apiKey="groq_secret_key_123456789";
 const expected={
  diagnosticCode:"GROQ_HTTP_ERROR",
  providerCode:"invalid_parameter",
  providerStatus:"invalid_request_error",
  providerMessage:"Invalid request [REDACTED]",
  providerParam:"response_format",
  httpStatus:400,
  retryable:false
 };
 await assert.rejects(()=>runProviderConnectivityCheck({
  env:{BEP_AGENT_SOURCE_SEARCH_ENABLED:"true",BEP_AGENT_EXA_API_KEY:"exa_secret_key_123456789",BEP_AGENT_AI_PROVIDER:"groq",BEP_AGENT_GROQ_API_KEY:apiKey},
  search:async()=>({resultsCount:1}),
  Groq:class{constructor(){} async generateJson(){throw Object.assign(new Error("PROVIDER_CHECK_GROQ_FAILED"),expected)}}
 }),error=>{
  assert.equal(error.message,"PROVIDER_CHECK_GROQ_FAILED: GROQ_HTTP_ERROR | HTTP 400 | code=invalid_parameter | type=invalid_request_error | param=response_format | detail=Invalid request [REDACTED]");
  assert.equal(error.stage,"groq");
  for(const [key,value] of Object.entries(expected))assert.equal(error[key],value);
  assert.doesNotMatch(JSON.stringify(error),/groq_secret_key_123456789|exa_secret_key_123456789/);
  return true;
 });
});


test("Groq schema diagnostic returns code, provider message and rejected parameter",async()=>{
 const {runGroqSchemaDiagnostic}=require("../lib/bep-agent/groq-schema-diagnostic");
 const diagnostic={
  diagnosticCode:"GROQ_HTTP_ERROR",
  httpStatus:400,
  providerCode:"json_validate_failed",
  providerStatus:"invalid_request_error",
  providerMessage:"Invalid JSON schema supplied",
  providerParam:"response_format",
  retryable:false
 };
 const result=await runGroqSchemaDiagnostic({
  apiKey:"groq_secret_key_123456789",
  clientFactory:()=>({generateJson:async()=>{throw Object.assign(new Error("Groq rejected request"),diagnostic)}})
 });
 assert.equal(result.success,false);
 assert.equal(result.code,"GROQ_HTTP_ERROR");
 assert.equal(result.httpStatus,400);
 assert.equal(result.providerCode,"json_validate_failed");
 assert.equal(result.providerStatus,"invalid_request_error");
 assert.equal(result.providerMessage,"Invalid JSON schema supplied");
 assert.equal(result.providerParam,"response_format");
 assert.equal(result.databaseAccess,false);
 assert.equal(result.libraryWrites,false);
 assert.doesNotMatch(JSON.stringify(result),/groq_secret_key_123456789/);
});
