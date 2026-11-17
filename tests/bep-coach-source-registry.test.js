"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {validateSources,registerCoachSources,MAX_BATCH_SOURCES}=require("../lib/bep-coach-source-registry");
const source=(id="mqa-01",url="https://www.mesquestionsdargent.fr/budget/economies")=>({id,title:"Faire des économies",category:"budget",url});
function mockPool({existing=[]}={}){
 const state=[...existing],calls=[];
 const client={query:async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK"||/^CREATE TABLE/.test(sql))return{rowCount:0,rows:[]};
  if(/^INSERT INTO bep_coach_source_registry/.test(sql)){
   const [source_id,source_url,title,category]=params;
   if(state.some(row=>row.source_id===source_id||row.source_url===source_url))return{rowCount:0,rows:[]};
   state.push({source_id,source_url,title,category,status:"pending_validation"});
   return{rowCount:1,rows:[{source_id}]};
  }
  if(/^SELECT source_id/.test(sql))return{rowCount:state.filter(row=>params[0].includes(row.source_id)).length,rows:state.filter(row=>params[0].includes(row.source_id))};
  throw new Error("Unexpected SQL");
 },release:()=>{}};
 return{pool:{connect:async()=>client},calls,state};
}
test("source registry accepts only approved Banque de France HTTPS references",()=>{
 assert.equal(validateSources([source()]).length,1);
 assert.throws(()=>validateSources([source("mqa-51","http://www.mesquestionsdargent.fr/a")]),/INVALID_SOURCE/);
 assert.throws(()=>validateSources([source("mqa-51","https://evil.example/a")]),/INVALID_SOURCE/);
 assert.throws(()=>validateSources([{...source(),url:"https://user:pass@www.mesquestionsdargent.fr/a"}]),/INVALID_SOURCE/);
});
test("source registry enforces batch size and duplicate guards",()=>{
 assert.throws(()=>validateSources([]),/INVALID_BATCH_SIZE/);
 assert.throws(()=>validateSources(Array.from({length:MAX_BATCH_SOURCES+1},(_,i)=>source("mqa-"+String(i+1).padStart(2,"0"),"https://www.mesquestionsdargent.fr/a"+i))),/INVALID_BATCH_SIZE/);
 assert.throws(()=>validateSources([source(),source()]),/DUPLICATE_SOURCE_ID/);
 assert.throws(()=>validateSources([source(),source("mqa-02")]),/DUPLICATE_SOURCE_URL/);
});
test("source registry inserts pending references transactionally without fetching pages or calling Gemini",async()=>{
 const {pool,calls,state}=mockPool();
 const result=await registerCoachSources({pool,sources:[source()]});
 assert.equal(result.inserted,1);
 assert.equal(result.alreadyPresent,0);
 assert.equal(result.status,"pending_validation");
 assert.equal(result.automaticPublication,false);
 assert.equal(result.geminiCalls,0);
 assert.equal(result.webFetches,0);
 assert.equal(state[0].status,"pending_validation");
 assert.equal(calls[0].sql,"BEGIN");
 assert.equal(calls.at(-1).sql,"COMMIT");
 assert.equal(calls.some(call=>/https?\.request|generativelanguage|fetch/i.test(call.sql)),false);
});
test("source registry is idempotent and preserves existing review status",async()=>{
 const initial={source_id:"mqa-01",source_url:source().url,title:"Faire des économies",category:"budget",status:"validated"};
 const {pool,state}=mockPool({existing:[initial]});
 const result=await registerCoachSources({pool,sources:[source()]});
 assert.equal(result.inserted,0);
 assert.equal(result.alreadyPresent,1);
 assert.equal(state[0].status,"validated");
});
test("source registry rejects a conflicting reuse of an existing source ID",async()=>{
 const initial={source_id:"mqa-01",source_url:"https://www.mesquestionsdargent.fr/other",title:"Other",category:"budget",status:"validated"};
 const {pool}=mockPool({existing:[initial]});
 await assert.rejects(()=>registerCoachSources({pool,sources:[source()]}),/SOURCE_ID_CONFLICT/);
});
test("source registry rolls back on database errors",async()=>{
 let rolledBack=false;
 const client={query:async(sql)=>{if(sql==="BEGIN")return{};if(/^CREATE TABLE/.test(sql))throw new Error("db error");if(sql==="ROLLBACK")rolledBack=true;return{}},release:()=>{}};
 await assert.rejects(()=>registerCoachSources({pool:{connect:async()=>client},sources:[source()]}),/db error/);
 assert.equal(rolledBack,true);
});
