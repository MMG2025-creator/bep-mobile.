"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateSources,registerCoachSources,MAX_BATCH_SOURCES}=require("../lib/bep-coach-source-registry");
const source=(id="mqa-01",url="https://www.mesquestionsdargent.fr/budget/faire-des-economies",category="budget")=>({id,title:"Faire des économies",category,url});
function mockPool({existing=[]}={}){
 const state=[...existing],calls=[];
 const client={query:async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK"||/^CREATE TABLE/.test(sql))return{rowCount:0,rows:[]};
  if(/^INSERT INTO bep_coach_source_registry/.test(sql)){const [source_id,source_url,title,category]=params;if(state.some(row=>row.source_id===source_id||row.source_url===source_url))return{rowCount:0,rows:[]};state.push({source_id,source_url,title,category,status:"pending_validation"});return{rowCount:1,rows:[{source_id}]}}
  if(/^SELECT source_id/.test(sql))return{rowCount:state.filter(row=>params[0].includes(row.source_id)).length,rows:state.filter(row=>params[0].includes(row.source_id))};
  throw new Error("Unexpected SQL");
 },release:()=>{}};
 return{pool:{connect:async()=>client},calls,state};
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
});
test("is idempotent and preserves an existing review status",async()=>{
 const row={source_id:"mqa-01",source_url:source().url,title:"Faire des économies",category:"budget",status:"validated"};
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
