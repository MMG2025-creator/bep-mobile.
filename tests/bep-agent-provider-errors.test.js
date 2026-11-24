"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {searchDocumentarySources}=require("../lib/bep-agent/source-search");
const {GroqClient}=require("../lib/bep-agent/groq-client");
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
  global.fetch=async()=>({ok:false,status,text:async()=>JSON.stringify({error:{message:"Invalid request groq_secret_key_123456789",type:"invalid_request_error",code:"invalid_parameter"}})});
  try{
   await assert.rejects(()=>client.generateJson({system:"system",prompt:"prompt",jsonSchema:{name:"test",schema:{type:"object"}}}),error=>{
    assert.equal(error.httpStatus,status);
    assert.equal(error.providerCode,"invalid_parameter");
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
 assert.equal(MAX_SOURCE_TEXT_CHARS,2500);
 assert.equal(MAX_SOURCE_HIGHLIGHTS,3);
 assert.equal(MAX_SOURCE_HIGHLIGHT_CHARS,350);
 assert.equal(MAX_LIBRARY_DOCUMENTS,15);
 assert.equal(MAX_LIBRARY_CONTENT_CHARS,600);
 assert.equal(MAX_ANALYSIS_PROMPT_CHARS,30000);
});
