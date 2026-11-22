"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {inspectDocumentarySchema,assertDocumentarySchema,readDocumentaryDispatchConfig,REQUIRED_TABLES}=require("../lib/bep-agent/documentary-schema");

function readyPool({jobCheck="CHECK ((job_type = ANY (ARRAY['knowledge_review'::text, 'coach_quality_review'::text, 'documentary_research'::text])))",candidateCheck="CHECK ((proposal_type = ANY (ARRAY['clarify'::text, 'update'::text, 'deactivate'::text, 'create'::text])))"}={}){
 return{query:async(sql)=>{
  if(sql.startsWith("SELECT to_regclass"))return{rows:[Object.fromEntries(REQUIRED_TABLES.map(name=>[name,true]))]};
  if(sql.includes("FROM pg_constraint"))return{rows:[
   {conname:"bep_agent_jobs_job_type_check",definition:jobCheck},
   {conname:"bep_knowledge_candidates_proposal_type_check",definition:candidateCheck}
  ]};
  throw new Error("unexpected query");
 }};
}

test("documentary API dispatch config needs flags but no Groq, Exa or Render secret",()=>{
 const result=readDocumentaryDispatchConfig({
  BEP_AGENT_ENABLED:"true",
  BEP_AGENT_RUN_MODE:"admin_on_demand",
  BEP_AGENT_FREE_TIER_ACKNOWLEDGED:"true",
  BEP_AGENT_SOURCE_SEARCH_ENABLED:"true",
  BEP_AGENT_AI_PROVIDER:"groq"
 });
 assert.equal(result.enabled,true);
 assert.equal(readDocumentaryDispatchConfig({BEP_AGENT_ENABLED:"true"}).enabled,false);
});

test("documentary schema requires all pipeline tables and both exact check constraints",async()=>{
 const result=await inspectDocumentarySchema(readyPool());
 assert.equal(result.ready,true);
 await assert.doesNotReject(()=>assertDocumentarySchema(readyPool()));
 const missingJob=await inspectDocumentarySchema(readyPool({jobCheck:"CHECK (job_type IN ('knowledge_review','coach_quality_review'))"}));
 assert.equal(missingJob.ready,false);
 assert.deepEqual(missingJob.missingConstraints,["bep_agent_jobs_job_type_check"]);
 const missingCreate=await inspectDocumentarySchema(readyPool({candidateCheck:"CHECK (proposal_type IN ('clarify','update','deactivate'))"}));
 assert.equal(missingCreate.ready,false);
 assert.deepEqual(missingCreate.missingConstraints,["bep_knowledge_candidates_proposal_type_check"]);
});

test("documentary schema guard fails closed when required tables are missing",async()=>{
 const pool={query:async()=>({rows:[Object.fromEntries(REQUIRED_TABLES.map((name,index)=>[name,index!==2]))]})};
 const result=await inspectDocumentarySchema(pool);
 assert.equal(result.ready,false);
 assert.deepEqual(result.missingTables,["bep_knowledge_candidates"]);
 await assert.rejects(()=>assertDocumentarySchema(pool),/BEP_DOCUMENTARY_SCHEMA_NOT_READY/);
});
