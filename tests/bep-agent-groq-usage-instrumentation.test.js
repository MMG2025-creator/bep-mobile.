"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {GroqClient}=require("../lib/bep-agent/groq-client");
const {recordRun}=require("../lib/bep-agent/repository");

test("Groq client records normalized token usage, latency and rate-limit headers",async()=>{
 const previous=global.fetch;
 global.fetch=async()=>({
  ok:true,status:200,
  headers:{get(name){return({
   "x-ratelimit-limit-requests":"1000",
   "x-ratelimit-remaining-requests":"999",
   "x-ratelimit-limit-tokens":"8000",
   "x-ratelimit-remaining-tokens":"7200",
   "x-ratelimit-reset-tokens":"1.2s"
  })[name]??null}},
  async text(){return JSON.stringify({choices:[{message:{content:'{"ok":true}'}}],usage:{prompt_tokens:1200,completion_tokens:80,total_tokens:1280}})}
 });
 try{
  const client=new GroqClient({apiKey:"test-key",model:"openai/gpt-oss-20b"});
  const result=await client.generateJson({system:"system",prompt:"prompt",maxOutputTokens:256,jsonSchema:{name:"test",schema:{type:"object",properties:{ok:{type:"boolean"}},required:["ok"],additionalProperties:false}}});
  assert.deepEqual(result.value,{ok:true});
  assert.equal(result.usage.prompt_tokens,1200);
  assert.equal(result.usage.completion_tokens,80);
  assert.equal(result.usage.total_tokens,1280);
  assert.equal(result.usage.request_metrics.systemChars,6);
  assert.equal(result.usage.request_metrics.promptChars,6);
  assert.equal(result.usage.request_metrics.requestedMaxOutputTokens,256);
  assert.equal(result.usage.rate_limits["x-ratelimit-limit-tokens"],"8000");
  assert.equal(result.usage.rate_limits["x-ratelimit-remaining-tokens"],"7200");
 }finally{global.fetch=previous}
});

test("daily BEP token accounting accepts Groq total_tokens field",async()=>{
 const calls=[];
 const pool={query:async(sql,params)=>{calls.push({sql,params});return{rowCount:1,rows:[]}}};
 await recordRun(pool,{jobId:7,jobType:"documentary_research",status:"completed",model:"openai/gpt-oss-20b",inputDigest:"in",outputDigest:"out",summary:{},usage:{prompt_tokens:1200,completion_tokens:80,total_tokens:1280},startedAt:new Date()});
 const update=calls.find(x=>x.sql.includes("UPDATE bep_agent_daily_usage SET tokens=tokens+$1"));
 assert.ok(update);
 assert.equal(update.params[0],1280);
});
