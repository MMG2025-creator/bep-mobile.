"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {GroqClient}=require("../lib/bep-agent/groq-client");
const {GeminiDiagnosticError}=require("../lib/bep-agent/gemini-client");

test("Groq 413 TPM errors retain provider code, type, message and rejected parameter",async()=>{
 const previousFetch=global.fetch;
 global.fetch=async()=>new Response(JSON.stringify({error:{
  message:"Request too large for model in tokens per minute: Limit 8000, Requested 28600",
  type:"tokens",code:"rate_limit_exceeded",param:"messages"
 }}),{status:413,headers:{"content-type":"application/json"}});
 try{
  const client=new GroqClient({apiKey:"gsk_test_key_123456789",model:"openai/gpt-oss-20b"});
  await assert.rejects(
   ()=>client.generateJson({system:"system",prompt:"prompt",jsonSchema:{name:"test",schema:{type:"object"}}}),
   error=>{
    assert.ok(error instanceof GeminiDiagnosticError);
    assert.equal(error.diagnosticCode,"GROQ_QUOTA_EXCEEDED");
    assert.equal(error.httpStatus,413);
    assert.equal(error.providerCode,"rate_limit_exceeded");
    assert.equal(error.providerStatus,"tokens");
    assert.equal(error.providerParam,"messages");
    assert.match(error.message,/param=messages/);
    assert.match(error.message,/Limit 8000, Requested 28600/);
    return true;
   }
  );
 }finally{global.fetch=previousFetch}
});

test("Groq HTTP errors retain sanitized raw response when failed_generation is not at error root",async()=>{
 const previousFetch=global.fetch;
 const payload={error:{message:"Failed to validate JSON.",type:"invalid_request_error",code:"json_validate_failed"},diagnostics:{failed_generation:'{"ok": true, "debug": "Bearer gsk_live_abcdefghijklmnop"}'}};
 global.fetch=async()=>new Response(JSON.stringify(payload),{status:400,headers:{"content-type":"application/json"}});
 try{
  const client=new GroqClient({apiKey:"gsk_test_key_123456789",model:"openai/gpt-oss-20b"});
  await assert.rejects(
   ()=>client.generateJson({system:"system",prompt:"prompt",jsonSchema:{name:"test",schema:{type:"object"}}}),
   error=>{
    assert.equal(error.providerCode,"json_validate_failed");
    assert.equal(error.providerFailedGeneration,null);
    assert.match(error.providerResponseBody,/"failed_generation"/);
    assert.match(error.providerResponseBody,/"Bearer \[TOKEN_REMOVED\]"/);
    assert.deepEqual(error.providerResponseKeys,["error","diagnostics"]);
    assert.equal(error.providerResponseBody.includes("gsk_live_abcdefghijklmnop"),false);
    return true;
   }
  );
 }finally{global.fetch=previousFetch}
});

test("Groq HTTP errors preserve sanitized failed_generation diagnostics",async()=>{
 const previousFetch=global.fetch;
 const failedGeneration='{"ok": true, "debug": "Bearer gsk_live_abcdefghijklmnop"}';
 global.fetch=async()=>new Response(JSON.stringify({error:{
  message:"Failed to validate JSON. Please adjust your prompt.",
  type:"invalid_request_error",code:"json_validate_failed",param:null,failed_generation:failedGeneration
 }}),{status:400,headers:{"content-type":"application/json"}});
 try{
  const client=new GroqClient({apiKey:"gsk_test_key_123456789",model:"openai/gpt-oss-20b"});
  await assert.rejects(
   ()=>client.generateJson({system:"system",prompt:"prompt",jsonSchema:{name:"test",schema:{type:"object"}}}),
   error=>{
    assert.equal(error.providerCode,"json_validate_failed");
    assert.equal(error.providerFailedGeneration,'{"ok": true, "debug": "Bearer [TOKEN_REMOVED]"}');
    assert.match(error.message,/failed_generation=/);
    assert.equal(error.message.includes("gsk_live_abcdefghijklmnop"),false);
    return true;
   }
  );
 }finally{global.fetch=previousFetch}
});
