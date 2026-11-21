"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {GeminiClient}=require("../lib/bep-agent/gemini-client");
test("Gemini client sends a minimal synthetic JSON probe to the configured model",async()=>{
 const original=global.fetch;let request;
 global.fetch=async(url,options)=>{request={url,options};return{ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'{"ok":true,"probe":"BEP_GEMINI_CONNECTIVITY"}'}]}}],usageMetadata:{promptTokenCount:18,candidatesTokenCount:12,totalTokenCount:30}})}};
 try{
  const client=new GeminiClient({apiKey:"test-key-not-real",model:"gemini-3.8-flash"});
  const result=await client.generateJson({system:"Connectivity diagnostic only.",prompt:'Return {"ok":true,"probe":"BEP_GEMINI_CONNECTIVITY"}.',maxOutputTokens:128});
  assert.equal(request.url,"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  assert.equal(request.options.method,"POST");assert.equal(request.options.redirect,"error");
  assert.equal(request.options.headers["x-goog-api-key"],"test-key-not-real");
  const body=JSON.parse(request.options.body);
  assert.equal(body.generationConfig.maxOutputTokens,128);
  assert.deepEqual(result.value,{ok:true,probe:"BEP_GEMINI_CONNECTIVITY"});
  assert.equal(result.usage.totalTokenCount,30);
 }finally{global.fetch=original}
});
test("Gemini client reports provider HTTP status without leaking credentials",async()=>{
 const original=global.fetch;global.fetch=async()=>({ok:false,status:429,json:async()=>({error:{message:"quota exceeded"}})});
 try{const client=new GeminiClient({apiKey:"secret-test-key",model:"gemini-3.8-flash"});await assert.rejects(()=>client.generateJson({prompt:"synthetic",system:"test"}),error=>error.diagnosticCode==="GEMINI_QUOTA_EXCEEDED"&&error.httpStatus===429&&!error.message.includes("secret-test-key"))}finally{global.fetch=original}
});
test("Gemini client rejects empty and invalid JSON responses",async()=>{
 const original=global.fetch;
 try{
  global.fetch=async()=>({ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:""}]}}]})});
  await assert.rejects(()=>new GeminiClient({apiKey:"x",model:"gemini-3.8-flash"}).generateJson({prompt:"test"}),error=>error.diagnosticCode==="GEMINI_EMPTY_RESPONSE");
  global.fetch=async()=>({ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:"not-json"}]}}]})});
  await assert.rejects(()=>new GeminiClient({apiKey:"x",model:"gemini-3.8-flash"}).generateJson({prompt:"test"}),error=>error.diagnosticCode==="GEMINI_INVALID_RESPONSE");
 }finally{global.fetch=original}
});

test("Gemini client preserves safe Google error details and classifies INVALID_ARGUMENT",async()=>{
 const original=global.fetch;
 global.fetch=async()=>({ok:false,status:400,json:async()=>({error:{code:400,status:"INVALID_ARGUMENT",message:"Invalid request using secret-test-key; contact admin@example.com"}})});
 try{
  const client=new GeminiClient({apiKey:"secret-test-key",model:"gemini-3.8-flash"});
  await assert.rejects(()=>client.generateJson({prompt:"synthetic",system:"test"}),error=>{
   assert.equal(error.diagnosticCode,"GEMINI_INVALID_ARGUMENT");
   assert.equal(error.httpStatus,400);
   assert.equal(error.providerCode,400);
   assert.equal(error.providerStatus,"INVALID_ARGUMENT");
   assert.match(error.providerMessage,/Invalid request using \[REDACTED\]/);
   assert.match(error.providerMessage,/\[REDACTED_EMAIL\]/);
   assert.doesNotMatch(error.providerMessage,/secret-test-key|admin@example.com/);
   return true;
  });
 }finally{global.fetch=original}
});
test("Gemini provider error messages are bounded and control characters are removed",async()=>{
 const {sanitizeProviderMessage}=require("../lib/bep-agent/gemini-client");
 const value=sanitizeProviderMessage("A\nB\u0000"+"x".repeat(700));
 assert.equal(value.length,500);
 assert.doesNotMatch(value,/[\u0000-\u001f\u007f]/);
 assert.ok(value.startsWith("A B"));
});
