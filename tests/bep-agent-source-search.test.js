"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {readSourceSearchConfig,searchDocumentarySources,normalizeResult}=require("../lib/bep-agent/source-search");

test("source search is disabled without its own explicit Exa key and flag",()=>{
 const config=readSourceSearchConfig({});
 assert.equal(config.enabled,false);
 assert.equal(config.provider,"exa");
 assert.equal(config.keySource,"missing");
});

test("source search sends only a bounded query and the official-domain allowlist",async()=>{
 let request;
 const result=await searchDocumentarySources({
  query:" règles de surendettement ".repeat(100),
  env:{BEP_AGENT_SOURCE_SEARCH_ENABLED:"true",BEP_AGENT_EXA_API_KEY:"exa-test-key"},
  fetchImpl:async(url,options)=>{request={url,options};return{ok:true,status:200,json:async()=>({requestId:"req-1",results:[{title:"Banque de France",url:"https://www.mesquestionsdargent.fr/particuliers/surendettement",publishedDate:"2026-11-01",highlights:["Passage sourcé"]},{title:"Un site inconnu",url:"https://example.org/a",highlights:["non fiable"]},{title:"HTTP interdit",url:"http://mesquestionsdargent.fr/a",highlights:["non fiable"]}]})}}
 });
 const body=JSON.parse(request.options.body);
 assert.equal(request.url,"https://api.exa.ai/search");
 assert.equal(request.options.headers["x-api-key"],"exa-test-key");
 assert.ok(body.query.length<=1000);
 assert.ok(body.includeDomains.includes("mesquestionsdargent.fr"));
 assert.equal(body.contents.highlights,true);
 assert.equal(result.resultsCount,1);
 assert.equal(result.results[0].domain,"www.mesquestionsdargent.fr");
 assert.equal(result.results[0].publishedAt,"2026-11-01T00:00:00.000Z");
 assert.deepEqual(result.results[0].highlights,["Passage sourcé"]);
 assert.doesNotMatch(JSON.stringify(result),/exa-test-key/);
});

test("result validation rejects lookalike domains and credentials",()=>{
 const domains=["service-public.fr"];
 assert.equal(normalizeResult({title:"bad",url:"https://service-public.fr.attacker.tld/a",highlights:["x"]},domains),null);
 assert.equal(normalizeResult({title:"bad",url:"https://user:pass@service-public.fr/a",highlights:["x"]},domains),null);
 assert.equal(normalizeResult({title:"bad",url:"http://service-public.fr/a",highlights:["x"]},domains),null);
});

test("source search fails closed on provider rate limits without exposing the API key",async()=>{
 await assert.rejects(()=>searchDocumentarySources({
  query:"test",
  env:{BEP_AGENT_SOURCE_SEARCH_ENABLED:"true",BEP_AGENT_EXA_API_KEY:"private-secret"},
  fetchImpl:async()=>({ok:false,status:429,json:async()=>({error:"private-secret"})})
 }),error=>error.code==="SOURCE_SEARCH_RATE_LIMIT"&&!String(error.message).includes("private-secret"));
});
