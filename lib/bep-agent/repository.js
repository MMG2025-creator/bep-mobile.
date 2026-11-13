"use strict";

async function ensureSchema(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS bep_agent_jobs(
  id BIGSERIAL PRIMARY KEY,job_type TEXT NOT NULL CHECK(job_type IN ('knowledge_review','coach_quality_review')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object'),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),locked_at TIMESTAMPTZ,locked_by TEXT,
  last_error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await pool.query("CREATE INDEX IF NOT EXISTS bep_agent_jobs_ready_idx ON bep_agent_jobs(status,run_after,created_at)");
 await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS bep_agent_jobs_one_active_type ON bep_agent_jobs(job_type) WHERE status IN ('queued','running')");
 await pool.query(`CREATE TABLE IF NOT EXISTS bep_agent_runs(
  id BIGSERIAL PRIMARY KEY,job_id BIGINT REFERENCES bep_agent_jobs(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('completed','failed')),
  model TEXT NOT NULL,input_digest TEXT NOT NULL,output_digest TEXT,output_summary JSONB,usage JSONB,
  error_code TEXT,started_at TIMESTAMPTZ NOT NULL,finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS bep_knowledge_candidates(
  id BIGSERIAL PRIMARY KEY,source_slug TEXT NOT NULL,source_version INTEGER NOT NULL,source_digest TEXT NOT NULL,
  proposal_type TEXT NOT NULL CHECK(proposal_type IN ('clarify','update','deactivate')),
  title TEXT NOT NULL,content TEXT NOT NULL,source_name TEXT NOT NULL,source_url TEXT NOT NULL,
  evidence_level TEXT NOT NULL,confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high')),
  rationale TEXT NOT NULL,review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','accepted','rejected')),
  input_digest TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),reviewed_at TIMESTAMPTZ,
  UNIQUE(source_slug,proposal_type,input_digest)
 )`);
 await pool.query("CREATE INDEX IF NOT EXISTS bep_knowledge_candidates_review_idx ON bep_knowledge_candidates(review_status,created_at DESC)");
 await pool.query(`CREATE TABLE IF NOT EXISTS bep_agent_approved_knowledge(
  slug TEXT PRIMARY KEY,category TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,source_name TEXT NOT NULL,source_url TEXT NOT NULL DEFAULT '',
  evidence_level TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,active BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS bep_agent_coach_metrics(
  day_key DATE NOT NULL,mode TEXT NOT NULL,status_code INTEGER NOT NULL,calls INTEGER NOT NULL DEFAULT 0,
  total_latency_ms BIGINT NOT NULL DEFAULT 0,total_tokens BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY(day_key,mode,status_code)
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS bep_agent_daily_usage(
  day_key DATE PRIMARY KEY,calls INTEGER NOT NULL DEFAULT 0,tokens INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS bep_agent_metrics(
  day_key DATE PRIMARY KEY,jobs_completed INTEGER NOT NULL DEFAULT 0,jobs_failed INTEGER NOT NULL DEFAULT 0,
  candidates_created INTEGER NOT NULL DEFAULT 0,quality_findings INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
}
async function enqueue(pool,type,payload={}){const r=await pool.query("INSERT INTO bep_agent_jobs(job_type,payload) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING RETURNING id",[type,JSON.stringify(payload)]);return r.rows[0]?.id||null}
async function claim(pool,workerId){
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  await c.query("UPDATE bep_agent_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,run_after=NOW(),locked_at=NULL,locked_by=NULL,last_error='worker lease expired',updated_at=NOW() WHERE status='running' AND locked_at<NOW()-INTERVAL '10 minutes'");
  const r=await c.query("SELECT id,job_type,payload,attempts,max_attempts FROM bep_agent_jobs WHERE status='queued' AND run_after<=NOW() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED");
  if(!r.rowCount){await c.query("COMMIT");return null}
  const job=r.rows[0];await c.query("UPDATE bep_agent_jobs SET status='running',attempts=attempts+1,locked_at=NOW(),locked_by=$2,updated_at=NOW() WHERE id=$1",[job.id,workerId]);await c.query("COMMIT");return job;
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{c.release()}
}
async function complete(pool,id){await pool.query("UPDATE bep_agent_jobs SET status='completed',locked_at=NULL,locked_by=NULL,last_error=NULL,updated_at=NOW() WHERE id=$1",[id])}
async function deferUntilTomorrow(pool,job){await pool.query("UPDATE bep_agent_jobs SET status='queued',run_after=date_trunc('day',NOW())+INTERVAL '1 day',locked_at=NULL,locked_by=NULL,last_error='daily Gemini agent quota reached',updated_at=NOW() WHERE id=$1",[job.id])}
async function fail(pool,job,error){const retry=Number(job.attempts)+1<Number(job.max_attempts);await pool.query("UPDATE bep_agent_jobs SET status=$2,run_after=CASE WHEN $2='queued' THEN NOW()+INTERVAL '10 minutes' ELSE run_after END,locked_at=NULL,locked_by=NULL,last_error=$3,updated_at=NOW() WHERE id=$1",[job.id,retry?"queued":"failed",String(error?.message||"agent error").slice(0,240)])}
async function reserveCall(pool,maxCalls){const r=await pool.query("INSERT INTO bep_agent_daily_usage(day_key,calls) VALUES(CURRENT_DATE,1) ON CONFLICT(day_key) DO UPDATE SET calls=bep_agent_daily_usage.calls+1,updated_at=NOW() WHERE bep_agent_daily_usage.calls<$1 RETURNING calls",[maxCalls]);return r.rowCount?Number(r.rows[0].calls):null}
async function recordRun(pool,run){
 await pool.query("INSERT INTO bep_agent_runs(job_id,job_type,status,model,input_digest,output_digest,output_summary,usage,error_code,started_at,finished_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,NOW())",[run.jobId,run.jobType,run.status,run.model,run.inputDigest,run.outputDigest||null,JSON.stringify(run.summary||null),JSON.stringify(run.usage||null),run.errorCode||null,run.startedAt]);
 const tokens=Number(run.usage?.totalTokenCount)||0;await pool.query("UPDATE bep_agent_daily_usage SET tokens=tokens+$1,updated_at=NOW() WHERE day_key=CURRENT_DATE",[tokens]);
 await pool.query("INSERT INTO bep_agent_metrics(day_key,jobs_completed,jobs_failed,candidates_created,quality_findings) VALUES(CURRENT_DATE,$1,$2,$3,$4) ON CONFLICT(day_key) DO UPDATE SET jobs_completed=bep_agent_metrics.jobs_completed+EXCLUDED.jobs_completed,jobs_failed=bep_agent_metrics.jobs_failed+EXCLUDED.jobs_failed,candidates_created=bep_agent_metrics.candidates_created+EXCLUDED.candidates_created,quality_findings=bep_agent_metrics.quality_findings+EXCLUDED.quality_findings,updated_at=NOW()",[run.status==="completed"?1:0,run.status==="failed"?1:0,run.candidatesCreated||0,run.qualityFindings||0]);
}
module.exports={ensureSchema,enqueue,claim,complete,fail,deferUntilTomorrow,reserveCall,recordRun};
