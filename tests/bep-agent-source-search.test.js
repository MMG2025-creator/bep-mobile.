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
  fetchImpl:async(url,options)=>{request={url,options};return{ok:true,status:200,json:async()=>({requestId:"req-1",results:[{title:"Banque de France",url:"https://www.mesquestionsdargent.fr/particuliers/surendettement",publishedDate:"2026-11-01",highlights:["Passage sourcé"],text:"Texte complet nettoyé de la page"},{title:"Un site inconnu",url:"https://example.org/a",highlights:["non fiable"]},{title:"HTTP interdit",url:"http://mesquestionsdargent.fr/a",highlights:["non fiable"]}]})}}
 });
 const body=JSON.parse(request.options.body);
 assert.equal(request.url,"https://api.exa.ai/search");
 assert.equal(request.options.headers["x-api-key"],"exa-test-key");
 assert.ok(body.query.length<=1000);
 assert.ok(body.includeDomains.includes("mesquestionsdargent.fr"));
 assert.equal(body.contents.highlights,true);
 assert.deepEqual(body.contents.text,{maxCharacters:3500});
 assert.equal(result.resultsCount,1);
 assert.equal(result.results[0].domain,"www.mesquestionsdargent.fr");
 assert.equal(result.results[0].publishedAt,"2026-11-01T00:00:00.000Z");
 assert.deepEqual(result.results[0].highlights,["Passage sourcé"]);
 assert.equal(result.results[0].text,"Texte complet nettoyé de la page");
 assert.doesNotMatch(JSON.stringify(result),/exa-test-key/);
});

test("result validation rejects lookalike domains and credentials",()=>{
 const domains=["service-public.fr"];
 assert.equal(normalizeResult({title:"bad",url:"https://service-public.fr.attacker.tld/a",highlights:["x"]},domains),null);
 assert.equal(normalizeResult({title:"bad",url:"https://sub.service-public.fr/a",highlights:["x"]},domains),null);
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

test("provider errors preserve sanitized HTTP and Exa diagnostics",async()=>{
 await assert.rejects(()=>searchDocumentarySources({
  query:"Livret A taux plafond",
  env:{BEP_AGENT_SOURCE_SEARCH_ENABLED:"true",BEP_AGENT_EXA_API_KEY:"private-secret"},
  fetchImpl:async()=>({ok:false,status:401,headers:{get:name=>name==="x-request-id"?"exa-request-123":null},json:async()=>({error:{message:"Invalid API key private-secret",code:"invalid_api_key",param:"x-api-key"}})})
 }),error=>{
  assert.equal(error.code,"SOURCE_SEARCH_AUTH_ERROR");
  assert.equal(error.httpStatus,401);
  assert.equal(error.providerMessage,"Invalid API key [REDACTED]");
  assert.equal(error.providerCode,"invalid_api_key");
  assert.equal(error.providerParam,"x-api-key");
  assert.equal(error.requestId,"exa-request-123");
  assert.doesNotMatch(JSON.stringify(error),/private-secret/);
  return true;
 });
});
