"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {Pool}=require("pg");
const repo=require("../lib/bep-agent/repository");

test("agent schema is additive, idempotent and supports persistent queue operations",async t=>{
 if(!process.env.DATABASE_URL){t.skip("DATABASE_URL not configured");return}
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 try{
  await repo.ensureSchema(pool);
  await repo.ensureSchema(pool);
  const tables=await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE 'bep_agent_%' OR table_name='bep_knowledge_candidates')");
  const names=new Set(tables.rows.map(x=>x.table_name));
  for(const name of ["bep_agent_jobs","bep_agent_runs","bep_knowledge_candidates","bep_agent_daily_usage","bep_agent_metrics","bep_agent_approved_knowledge","bep_agent_coach_metrics"])assert.ok(names.has(name),name+" missing");
  const candidate=await pool.query("INSERT INTO bep_knowledge_candidates(source_slug,source_version,source_digest,proposal_type,title,content,source_name,source_url,evidence_level,confidence,rationale,input_digest) VALUES('test-source',7,'digest-7','clarify','Test','Test content','Test source','https://example.org','test','high','test rationale','test-input') RETURNING source_version,source_digest");
  assert.equal(Number(candidate.rows[0].source_version),7);
  assert.equal(candidate.rows[0].source_digest,"digest-7");
  const jobId=await repo.enqueue(pool,"coach_quality_review",{test:true});
  assert.ok(jobId);
  const claimed=await repo.claim(pool,"test-worker");
  assert.equal(String(claimed.id),String(jobId));
  await repo.complete(pool,jobId);
  const staleId=await repo.enqueue(pool,"knowledge_review",{test:true});
  const firstClaim=await repo.claim(pool,"test-worker");assert.equal(String(firstClaim.id),String(staleId));
  await pool.query("UPDATE bep_agent_jobs SET locked_at=NOW()-INTERVAL '11 minutes' WHERE id=$1",[staleId]);
  const recovered=await repo.claim(pool,"restarted-worker");assert.equal(String(recovered.id),String(staleId));
  await repo.deferUntilTomorrow(pool,recovered);
  const deferred=await pool.query("SELECT status,run_after>CURRENT_DATE+INTERVAL '23 hours' AS deferred FROM bep_agent_jobs WHERE id=$1",[staleId]);
  assert.equal(deferred.rows[0].status,"queued");assert.equal(deferred.rows[0].deferred,true);
  await repo.complete(pool,staleId);
  assert.equal(await repo.reserveCall(pool,1),1);
  assert.equal(await repo.reserveCall(pool,1),null);
  await repo.recordRun(pool,{jobId,jobType:"coach_quality_review",status:"completed",model:"test-model",inputDigest:"input",outputDigest:"output",summary:{findings:[]},usage:{totalTokenCount:12},startedAt:new Date(),candidatesCreated:0,qualityFindings:0});
  const run=await pool.query("SELECT output_summary,usage FROM bep_agent_runs WHERE job_id=$1",[jobId]);
  assert.equal(run.rowCount,1);
  assert.deepEqual(run.rows[0].output_summary,{findings:[]});
  const usage=await pool.query("SELECT calls,tokens FROM bep_agent_daily_usage WHERE day_key=CURRENT_DATE");
  assert.equal(Number(usage.rows[0].calls),1);assert.equal(Number(usage.rows[0].tokens),12);
 }finally{await pool.end()}
});
