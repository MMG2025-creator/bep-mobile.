"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {GroqClient}=require("../lib/bep-agent/groq-client");
const {ANALYSIS_SCHEMA}=require("../lib/bep-agent/documentary-analysis");
const {failureInputDigest}=require("../lib/bep-agent/worker");

test("Groq client sends strict JSON Schema structured output for the documentary model",async()=>{
 const original=global.fetch;let request;
 global.fetch=async(url,options)=>{request={url,options};return{ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'{"findings":[],"proposals":[]}'}}],usage:{total_tokens:12}})}};
 try{
  const client=new GroqClient({apiKey:"synthetic-test-key",model:"openai/gpt-oss-20b"});
  const result=await client.generateJson({system:"synthetic",prompt:"return empty result",jsonSchema:ANALYSIS_SCHEMA});
  assert.equal(request.url,"https://api.groq.com/openai/v1/chat/completions");
  assert.equal(request.options.redirect,"error");
  const body=JSON.parse(request.options.body);
  assert.equal(body.model,"openai/gpt-oss-20b");
  assert.deepEqual(body.response_format,{type:"json_schema",json_schema:{name:ANALYSIS_SCHEMA.name,strict:true,schema:ANALYSIS_SCHEMA.schema}});
  assert.deepEqual(result.value,{findings:[],proposals:[]});
  assert.equal(result.usage.total_tokens,12);
 }finally{global.fetch=original}
});

test("documentary JSON Schema uses closed objects and declares every property required",()=>{
 const visit=node=>{
  if(!node||typeof node!=="object")return;
  if(node.type==="object"){
   assert.equal(node.additionalProperties,false,"all object schemas must be closed");
   assert.deepEqual([...node.required].sort(),Object.keys(node.properties||{}).sort(),"all declared fields must be required in strict mode");
  }
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==="object")visit(value);
 };
 visit(ANALYSIS_SCHEMA.schema);
});

test("Groq HTTP 400 preserves sanitized provider diagnostics without exposing credentials",async()=>{
 const original=global.fetch;
 global.fetch=async()=>({ok:false,status:400,text:async()=>JSON.stringify({error:{message:"Invalid JSON schema for key synthetic-secret-key; contact admin@example.com",type:"invalid_request_error",code:"invalid_json_schema"}})});
 try{
  const client=new GroqClient({apiKey:"synthetic-secret-key",model:"openai/gpt-oss-20b"});
  await assert.rejects(()=>client.generateJson({system:"synthetic",prompt:"probe",jsonSchema:ANALYSIS_SCHEMA}),error=>{
   assert.equal(error.diagnosticCode,"GROQ_INVALID_ARGUMENT");
   assert.equal(error.httpStatus,400);
   assert.equal(error.providerCode,"invalid_json_schema");
   assert.equal(error.providerStatus,"invalid_request_error");
   assert.match(error.providerMessage,/\[REDACTED\]/);
   assert.match(error.providerMessage,/\[REDACTED_EMAIL\]/);
   assert.doesNotMatch(error.providerMessage,/synthetic-secret-key|admin@example.com/);
   assert.match(error.diagnosticDetail,/invalid_json_schema/);
   return true;
  });
 }finally{global.fetch=original}
});


test("failed documentary run records the full analysis inputDigest, not sourceDigest",()=>{
 const checkpoint={analysis:{sourceDigest:"source-only-digest",inputDigest:"query-sources-library-digest"}};
 assert.equal(failureInputDigest(checkpoint),"query-sources-library-digest");
 assert.equal(failureInputDigest({analysis:{sourceDigest:"source-only-digest"}}),"");
 assert.equal(failureInputDigest(null),"");
});
