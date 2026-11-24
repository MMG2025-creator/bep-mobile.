"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {runDocumentaryResearch}=require("../lib/bep-agent/worker");

test("documentary research reads the Exa allowlist and completes analysis",async()=>{
 const originalFetch=global.fetch;
 const requested=[];
 global.fetch=async(url,options)=>{
  requested.push({url:String(url),options});
  return new Response(JSON.stringify({
   requestId:"exa-test-request",
   results:[{
    title:"Source institutionnelle de test",
    url:"https://docs.example.test/guide",
    text:"Contenu documentaire vérifié pour le test du pipeline BEP."
   }]
  }),{status:200,headers:{"content-type":"application/json"}});
 };
 try{
  const queries=[];
  const pool={query:async(sql,params)=>{
   queries.push({sql,params});
   if(sql.startsWith("SELECT slug,category,title,content,keywords,source_name,source_url,evidence_level,version FROM bep_financial_knowledge"))return{rows:[]};
   if(sql.startsWith("SELECT slug,category,title,content,keywords,source_name,source_url,evidence_level,active,source_version,source_digest,version FROM bep_agent_approved_knowledge"))return{rows:[]};
   throw new Error("Unexpected SQL in documentary research test");
  }};
  const client={generateJson:async input=>{
   assert.ok(input.prompt.includes("Source institutionnelle de test"));
   return{value:{findings:[],proposals:[]},usage:{total_tokens:12}};
  }};
  const result=await runDocumentaryResearch({
   pool,client,model:"test-model",
   job:{payload:{query:"guide budget"}},
   env:{
    BEP_AGENT_SOURCE_SEARCH_ENABLED:"true",
    BEP_AGENT_EXA_API_KEY:"exa-test-key",
    BEP_AGENT_SOURCE_DOMAINS:"docs.example.test"
   }
  });
  assert.equal(requested.length,1);
  assert.equal(requested[0].url,"https://api.exa.ai/search");
  assert.equal(result.summary.sourceSearch.provider,"exa");
  assert.equal(result.summary.sourceSearch.resultsCount,1);
  assert.equal(result.candidatesCreated,0);
  assert.equal(result.summary.automaticPublication,false);
  assert.equal(queries.length,2);
 }finally{
  global.fetch=originalFetch;
 }
});
