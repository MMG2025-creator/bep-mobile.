"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const queue=require("../lib/bep-coach-ingestion-queue");

test("only transient Gemini, timeout and network failures are retryable",()=>{
 for(const message of ["GEMINI_HTTP_503_HTTP_ERROR: high demand","GEMINI_HTTP_429_RATE_LIMIT","SOURCE_TIMEOUT","ECONNRESET","EAI_AGAIN"]){
  assert.equal(queue.classifyIngestionError(new Error(message)).retryable,true,message);
 }
 for(const message of ["GEMINI_HTTP_400_INVALID_ARGUMENT","URL_HOST_NOT_PUBLIC","SOURCE_HTTP_404","GEMINI_INVALID_JSON"]){
  assert.equal(queue.classifyIngestionError(new Error(message)).retryable,false,message);
 }
 assert.equal(queue.classifyIngestionError(Object.assign(new Error("timed out"),{name:"TimeoutError"})).code,"SOURCE_TIMEOUT");
});

test("manual ingestion jobs require explicit consent and valid bounded input",async()=>{
 const pool={query:async()=>({rows:[],rowCount:0})};
 await assert.rejects(queue.enqueueIngestionJob({pool,url:"https://example.org",consent:false}),/EXPLICIT_CONSENT_REQUIRED/);
 await assert.rejects(queue.enqueueIngestionJob({pool,url:"https://example.org",mode:"automatic",consent:true}),/INVALID_INGESTION_INPUT/);
});

test("enqueue stores only URL and options, and uses a stable idempotency digest",async()=>{
 const calls=[];
 const pool={query:async(sql,params=[])=>{calls.push({sql,params});if(/RETURNING id,status/.test(sql))return{rows:[{id:"job-1",status:"queued",attempts:0,max_attempts:4,inserted:true}],rowCount:1};return{rows:[],rowCount:0}}};
 const job=await queue.enqueueIngestionJob({pool,url:"https://example.org/page",mode:"deep",category:"budget",consent:true});
 assert.equal(job.id,"job-1");
 assert.equal(job.duplicate,false);
 const insert=calls.find(x=>/INSERT INTO bep_coach_ingestion_jobs/.test(x.sql));
 assert.equal(insert.params[1],"https://example.org/page");
 assert.equal(insert.params[2],"deep");
 assert.equal(insert.params[3],"budget");
 assert.match(insert.sql,/VALUES\(\$1,\$2,\$3,\$4,TRUE\)/);
 assert.equal(insert.sql.includes("content"),false);
 assert.equal(insert.sql.includes("api_key"),false);
});

test("claim uses a single skip-locked lease and returns a lease token",async()=>{
 const calls=[];
 const pool={query:async(sql,params=[])=>{calls.push({sql,params});if(/WITH candidate AS/.test(sql))return{rows:[{id:"job-1",lease_token:"lease-1",consent:true,attempts:1,max_attempts:4}],rowCount:1};return{rows:[],rowCount:0}}};
 const job=await queue.claimIngestionJob({pool,jobId:"job-1"});
 assert.equal(job.lease_token,"lease-1");
 const claim=calls.find(x=>/WITH candidate AS/.test(x.sql));
 assert.match(claim.sql,/FOR UPDATE SKIP LOCKED/);
 assert.match(claim.sql,/lease_token=gen_random_uuid/);
 assert.match(claim.sql,/attempts<max_attempts/);
});

test("stale lease tokens cannot settle a different worker's job",async()=>{
 const calls=[];
 const pool={query:async(sql,params=[])=>{calls.push({sql,params});if(/SELECT attempts,max_attempts/.test(sql))return{rows:[{attempts:1,max_attempts:4}],rowCount:1};if(/UPDATE bep_coach_ingestion_jobs SET status/.test(sql))return{rows:[],rowCount:0};return{rows:[],rowCount:0}}};
 const result=await queue.settleIngestionJob({pool,jobId:"job-1",leaseToken:"old-lease",error:new Error("GEMINI_HTTP_503_HTTP_ERROR"),now:"2026-11-17T00:00:00Z"});
 assert.equal(result,null);
 const update=calls.find(x=>/UPDATE bep_coach_ingestion_jobs SET status/.test(x.sql));
 assert.match(update.sql,/lease_token=\$6/);
 assert.equal(update.params[5],"old-lease");
});

test("successful settlement stores a summary only, never source page content",async()=>{
 let update;
 const pool={query:async(sql,params=[])=>{if(/UPDATE bep_coach_ingestion_jobs SET status='succeeded'/.test(sql)){update={sql,params};return{rows:[{id:"job-1",status:"succeeded"}],rowCount:1}}return{rows:[],rowCount:0}}};
 const result=await queue.settleIngestionJob({pool,jobId:"job-1",leaseToken:"lease-1",result:{enabled:true,candidatesCreated:2,pagesAnalysed:1,model:"gemini-3.8-flash",pages:[{text:"private content"}]}});
 assert.equal(result.status,"succeeded");
 assert.equal(update.params[1].includes("private content"),false);
 assert.match(update.sql,/lease_token=\$3/);
});

test("queued execution remains inert while Gemini gates are disabled",async()=>{
 const pool={query:async()=>{throw new Error("database must not be touched while disabled")}};
 const result=await queue.runQueuedIngestionJob({pool,jobId:"job-1",env:{}});
 assert.equal(result.claimed,false);
 assert.equal(result.enabled,false);
 assert.match(result.reason,/aucun appel externe/);
});
