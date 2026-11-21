"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateSources,registerCoachSources,listCoachSources,refreshCoachSource,refreshCoachSources,MAX_BATCH_SOURCES}=require("../lib/bep-coach-source-registry");
const source=(id="mqa-01",url="https://www.mesquestionsdargent.fr/budget/faire-des-economies",category="budget")=>({id,title:"Faire des économies",category,url});
function mockPool({existing=[]}={}){
 const state=[...existing],calls=[];
 const client={query:async(sql,params=[])=>{
  calls.push({sql,params});
  if(["BEGIN","COMMIT","ROLLBACK"].includes(sql)||/^CREATE TABLE|^ALTER TABLE|^CREATE INDEX/.test(sql))return{rowCount:0,rows:[]};
  if(/^INSERT INTO bep_coach_source_registry/.test(sql)){const [source_id,source_url,title,category]=params;if(state.some(row=>row.source_id===source_id||row.source_url===source_url))return{rowCount:0,rows:[]};const row={source_id,source_url,title,category,status:"pending_validation",last_checked_at:null,last_success_at:null,content_digest:null,freshness_status:"unchecked",last_http_status:null,last_error_code:null,stale_after_days:30};state.push(row);return{rowCount:1,rows:[{source_id}]}}
  if(/^SELECT source_id/.test(sql))return{rowCount:state.filter(row=>params[0]?.includes(row.source_id)).length,rows:state.filter(row=>params[0]?.includes(row.source_id))};
  throw new Error("Unexpected SQL: "+sql);
 },release:()=>{}};
 const pool={connect:async()=>client,query:client.query};
 return{pool,calls,state};
}
test("validates HTTPS URLs on the Banque de France Mes questions d'argent hosts",()=>{
 assert.equal(validateSources([source()]).length,1);
 assert.equal(validateSources([source("mqa-02","https://www.mesquestionsdargent.fr/a","debt")])[0].category,"debt");
 assert.equal(validateSources([source("mqa-03","https://mesquestionsdargent.fr/budget/faire-des-economies")])[0].url,"https://mesquestionsdargent.fr/budget/faire-des-economies");
 for(const url of ["http://mesquestionsdargent.fr/a","https://evil.example/a","https://user:pass@mesquestionsdargent.fr/a","https://mesquestionsdargent.fr:444/a","https://mesquestionsdargent.fr/a?x=1","https://mesquestionsdargent.fr/"])assert.throws(()=>validateSources([source("mqa-51",url)]),/INVALID_SOURCE/);
});
test("enforces a maximum of ten and rejects duplicate IDs and URLs",()=>{
 assert.throws(()=>validateSources([]),/INVALID_BATCH_SIZE/);
 assert.throws(()=>validateSources(Array.from({length:MAX_BATCH_SOURCES+1},(_,i)=>source("mqa-"+String(i+1).padStart(2,"0"),"https://www.mesquestionsdargent.fr/a"+i))),/INVALID_BATCH_SIZE/);
 assert.throws(()=>validateSources([source(),source()]),/DUPLICATE_SOURCE_ID/);
 assert.throws(()=>validateSources([source(),source("mqa-02")]),/DUPLICATE_SOURCE_URL/);
});
test("registers pending references without web fetch, Gemini or publication",async()=>{
 const {pool,calls,state}=mockPool(),result=await registerCoachSources({pool,sources:[source()]});
 assert.equal(result.inserted,1);assert.equal(result.alreadyPresent,0);assert.equal(result.status,"pending_validation");
 assert.equal(result.automaticPublication,false);assert.equal(result.geminiCalls,0);assert.equal(result.webFetches,0);
 assert.equal(state[0].status,"pending_validation");assert.equal(calls[0].sql,"BEGIN");assert.equal(calls.at(-1).sql,"COMMIT");
 assert.ok(calls.some(call=>/ADD COLUMN IF NOT EXISTS last_checked_at/.test(call.sql)));
});
test("is idempotent and preserves an existing review status",async()=>{
 const row={source_id:"mqa-01",source_url:source().url,title:"Faire des économies",category:"budget",status:"validated",freshness_status:"fresh"};
 const {pool,state}=mockPool({existing:[row]}),result=await registerCoachSources({pool,sources:[source()]});
 assert.equal(result.inserted,0);assert.equal(result.alreadyPresent,1);assert.equal(state[0].status,"validated");
});
test("rejects conflicting reuse of a source ID",async()=>{
 const row={source_id:"mqa-01",source_url:"https://www.mesquestionsdargent.fr/other",title:"Other",category:"budget",status:"validated"};
 const {pool}=mockPool({existing:[row]});
 await assert.rejects(()=>registerCoachSources({pool,sources:[source()]}),/SOURCE_ID_CONFLICT/);
});
test("rolls back on database errors",async()=>{
 let rolledBack=false;const client={query:async(sql)=>{if(sql==="BEGIN")return{};if(/^CREATE TABLE/.test(sql))throw new Error("db error");if(sql==="ROLLBACK")rolledBack=true;return{}},release:()=>{}};
 await assert.rejects(()=>registerCoachSources({pool:{connect:async()=>client},sources:[source()]}),/db error/);assert.equal(rolledBack,true);
});
test("refresh computes a content digest and marks first successful check fresh without publishing knowledge",async()=>{
 const {pool,state}=mockPool();await registerCoachSources({pool,sources:[source()]});
 const row=state[0];let updateParams=null;
 pool.query=async(sql,params=[])=>{if(/^CREATE TABLE|^ALTER TABLE|^CREATE INDEX/.test(sql))return{rows:[]};if(/^SELECT source_id/.test(sql))return{rows:[row]};if(/^UPDATE bep_coach_source_registry/.test(sql)){updateParams=params;Object.assign(row,{last_checked_at:params[1],last_success_at:params[1],content_digest:params[2],freshness_status:params[3],last_http_status:200,last_error_code:null});return{rows:[row],rowCount:1}};throw new Error("Unexpected SQL "+sql)};
 const result=await refreshCoachSource({pool,sourceId:"mqa-01",fetchPage:async url=>({url,text:"Contenu officiel suffisamment long pour établir une empreinte documentaire stable et vérifiable."}),now:new Date("2026-11-21T12:00:00Z")});
 assert.equal(result.ok,true);assert.equal(result.contentChanged,false);assert.equal(result.source.freshness_status,"fresh");assert.match(result.source.content_digest,/^[a-f0-9]{64}$/);assert.equal(updateParams[3],"fresh");assert.equal(result.automaticPublication,false);assert.equal(result.knowledgeUpdated,false);
});
test("refresh detects a changed document by comparing SHA-256 fingerprints",async()=>{
 const {pool,state}=mockPool();await registerCoachSources({pool,sources:[source()]});
 const row=state[0];row.content_digest="a".repeat(64);
 pool.query=async(sql,params=[])=>{if(/^CREATE TABLE|^ALTER TABLE|^CREATE INDEX/.test(sql))return{rows:[]};if(/^SELECT source_id/.test(sql))return{rows:[row]};if(/^UPDATE bep_coach_source_registry/.test(sql)){Object.assign(row,{content_digest:params[2],freshness_status:params[3],last_checked_at:params[1]});return{rows:[row]}};throw new Error("Unexpected SQL "+sql)};
 const result=await refreshCoachSource({pool,sourceId:"mqa-01",fetchPage:async()=>({text:"Nouveau contenu officiel suffisamment long pour établir une nouvelle empreinte documentaire."})});
 assert.equal(result.ok,true);assert.equal(result.contentChanged,true);assert.equal(result.source.freshness_status,"changed");assert.equal(result.knowledgeUpdated,false);
});
test("refresh records safe error state and does not overwrite the previous digest",async()=>{
 const {pool,state}=mockPool();await registerCoachSources({pool,sources:[source()]});
 const row=state[0];row.content_digest="b".repeat(64);
 pool.query=async(sql,params=[])=>{if(/^CREATE TABLE|^ALTER TABLE|^CREATE INDEX/.test(sql))return{rows:[]};if(/^SELECT source_id/.test(sql))return{rows:[row]};if(/^UPDATE bep_coach_source_registry/.test(sql)){Object.assign(row,{last_checked_at:params[1],freshness_status:"error",last_error_code:params[2]});return{rows:[row]}};throw new Error("Unexpected SQL "+sql)};
 const result=await refreshCoachSource({pool,sourceId:"mqa-01",fetchPage:async()=>{throw new Error("SOURCE_TIMEOUT")},now:new Date()});
 assert.equal(result.ok,false);assert.equal(result.freshness_status,"error");assert.equal(result.errorCode,"SOURCETIMEOUT");assert.equal(row.content_digest,"b".repeat(64));
});
test("source listing computes unchecked and stale states from check timestamps",async()=>{
 const {pool}=mockPool();
 pool.query=async(sql)=>{if(/^CREATE TABLE|^ALTER TABLE|^CREATE INDEX/.test(sql))return{rows:[]};if(/^SELECT source_id/.test(sql))return{rows:[
 {source_id:"mqa-01",freshness_status:"unchecked",computed_freshness_status:"unchecked"},
 {source_id:"mqa-02",freshness_status:"fresh",computed_freshness_status:"stale"},
 {source_id:"mqa-03",freshness_status:"changed",computed_freshness_status:"changed"}
 ]};throw new Error("Unexpected SQL "+sql)};
 const result=await listCoachSources({pool});
 assert.deepEqual(result.counts,{total:3,unchecked:1,fresh:0,stale:1,changed:1,error:0});assert.equal(result.automaticPublication,false);
});
test("batch refresh rejects duplicates and more than ten source IDs",async()=>{
 await assert.rejects(()=>refreshCoachSources({pool:{query:async()=>({rows:[]})},sourceIds:["mqa-01","mqa-01"],fetchPage:async()=>({text:"x".repeat(100)})}),/DUPLICATE_SOURCE_ID/);
 await assert.rejects(()=>refreshCoachSources({pool:{query:async()=>({rows:[]})},sourceIds:Array.from({length:11},(_,i)=>"mqa-"+i),fetchPage:async()=>({text:"x".repeat(100)})}),/INVALID_BATCH_SIZE/);
});
