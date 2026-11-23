"use strict";
const fs=require("node:fs");
const path=require("node:path");

const MIGRATION_PATHS=[
 "20261114_bep_gemini_agent.sql",
 "20261118_bep_knowledge_create_candidates.sql",
 "20261122_bep_documentary_pipeline.sql"
].map(name=>path.join(__dirname,"..","..","database","migrations",name));
async function ensureSchema(pool){
 for(const migrationPath of MIGRATION_PATHS)await pool.query(fs.readFileSync(migrationPath,"utf8"));
}
async function enqueue(pool,type,payload={}){const r=await pool.query("INSERT INTO bep_agent_jobs(job_type,payload) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING RETURNING id",[type,JSON.stringify(payload)]);return r.rows[0]?.id||null}
async function claim(pool,workerId,jobTypes=["knowledge_review","coach_quality_review"],jobId=null){
 const allowed=Array.isArray(jobTypes)?jobTypes.filter(x=>typeof x==="string"&&x.trim()):[];
 if(!allowed.length)throw new Error("worker job type allowlist is required");
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  await c.query("UPDATE bep_agent_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,run_after=NOW(),locked_at=NULL,locked_by=NULL,last_error='worker lease expired',updated_at=NOW() WHERE status='running' AND locked_at<NOW()-INTERVAL '10 minutes' AND job_type=ANY($1::text[])"+(jobId?" AND id::text=$2":""),jobId?[allowed,String(jobId)]:[allowed]);
  const claimSql="SELECT id,job_type,payload,attempts,max_attempts FROM bep_agent_jobs WHERE status='queued' AND run_after<=NOW() AND job_type=ANY($1::text[])"+(jobId?" AND id::text=$2":"")+" ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED";
  const r=await c.query(claimSql,jobId?[allowed,String(jobId)]:[allowed]);
  if(!r.rowCount){await c.query("COMMIT");return null}
  const job=r.rows[0];await c.query("UPDATE bep_agent_jobs SET status='running',attempts=attempts+1,locked_at=NOW(),locked_by=$2,updated_at=NOW() WHERE id=$1",[job.id,workerId]);await c.query("COMMIT");return job;
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{c.release()}
}
async function complete(pool,id){await pool.query("UPDATE bep_agent_jobs SET status='completed',locked_at=NULL,locked_by=NULL,last_error=NULL,updated_at=NOW() WHERE id=$1",[id])}
async function deferUntilTomorrow(pool,job){await pool.query("UPDATE bep_agent_jobs SET status='queued',run_after=date_trunc('day',NOW())+INTERVAL '1 day',locked_at=NULL,locked_by=NULL,last_error='daily BEP administrative agent quota reached',updated_at=NOW() WHERE id=$1",[job.id])}
async function fail(pool,job,error){const retry=Number(job.attempts)+1<Number(job.max_attempts);await pool.query("UPDATE bep_agent_jobs SET status=$2,run_after=CASE WHEN $2='queued' THEN NOW()+INTERVAL '10 minutes' ELSE run_after END,locked_at=NULL,locked_by=NULL,last_error=$3,updated_at=NOW() WHERE id=$1",[job.id,retry?"queued":"failed",String(error?.message||"agent error").slice(0,240)])}
async function recoverOrphanedQueuedJob(pool,jobId){
 const id=String(jobId||"").trim();
 if(!/^[1-9]\\d{0,18}$/.test(id))throw Object.assign(new Error("DOCUMENTARY_RECOVERY_JOB_ID_INVALID"),{code:"DOCUMENTARY_RECOVERY_JOB_ID_INVALID"});
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  const selected=await c.query("SELECT id,job_type,payload,status,attempts,locked_at,locked_by,created_at,updated_at FROM bep_agent_jobs WHERE id::text=$1 FOR UPDATE",[id]);
  if(!selected.rowCount)throw Object.assign(new Error("DOCUMENTARY_RECOVERY_JOB_NOT_FOUND"),{code:"DOCUMENTARY_RECOVERY_JOB_NOT_FOUND"});
  const job=selected.rows[0];
  if(job.job_type!=="documentary_research"||job.status!=="queued"||Number(job.attempts)!==0||job.locked_at||job.locked_by)throw Object.assign(new Error("DOCUMENTARY_RECOVERY_JOB_NOT_ELIGIBLE"),{code:"DOCUMENTARY_RECOVERY_JOB_NOT_ELIGIBLE"});
  const age=await c.query("SELECT ($1::timestamptz<=NOW()-INTERVAL '10 minutes') AS stale",[job.updated_at||job.created_at]);
  if(age.rows[0]?.stale!==true)throw Object.assign(new Error("DOCUMENTARY_RECOVERY_JOB_NOT_STALE"),{code:"DOCUMENTARY_RECOVERY_JOB_NOT_STALE"});
  const runs=await c.query("SELECT id FROM bep_agent_runs WHERE job_id=$1 LIMIT 1",[job.id]);
  if(runs.rowCount)throw Object.assign(new Error("DOCUMENTARY_RECOVERY_JOB_HAS_RUN_HISTORY"),{code:"DOCUMENTARY_RECOVERY_JOB_HAS_RUN_HISTORY"});
  const closed=await c.query("UPDATE bep_agent_jobs SET status='failed',locked_at=NULL,locked_by=NULL,last_error='DOCUMENTARY_JOB_ORPHANED_RECOVERED',updated_at=NOW() WHERE id=$1 AND status='queued' AND attempts=0 RETURNING id",[job.id]);
  if(!closed.rowCount)throw Object.assign(new Error("DOCUMENTARY_RECOVERY_JOB_STATE_CHANGED"),{code:"DOCUMENTARY_RECOVERY_JOB_STATE_CHANGED"});
  const replacement=await c.query("INSERT INTO bep_agent_jobs(job_type,payload) VALUES('documentary_research',$1::jsonb) RETURNING id",[JSON.stringify(job.payload||{})]);
  if(!replacement.rowCount)throw new Error("DOCUMENTARY_RECOVERY_REPLACEMENT_NOT_CREATED");
  await c.query("COMMIT");
  return{previousJobId:String(job.id),jobId:String(replacement.rows[0].id)};
 }catch(error){await c.query("ROLLBACK").catch(()=>{});throw error}
 finally{c.release()}
}
async function reserveCall(pool,maxCalls){const r=await pool.query("INSERT INTO bep_agent_daily_usage(day_key,calls) VALUES(CURRENT_DATE,1) ON CONFLICT(day_key) DO UPDATE SET calls=bep_agent_daily_usage.calls+1,updated_at=NOW() WHERE bep_agent_daily_usage.calls<$1 RETURNING calls",[maxCalls]);return r.rowCount?Number(r.rows[0].calls):null}
async function recordRun(pool,run){
 await pool.query("INSERT INTO bep_agent_runs(job_id,job_type,status,model,input_digest,output_digest,output_summary,usage,error_code,started_at,finished_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,NOW())",[run.jobId,run.jobType,run.status,run.model,run.inputDigest||"",run.outputDigest||null,JSON.stringify(run.summary||null),JSON.stringify(run.usage||null),run.errorCode||null,run.startedAt]);
 const tokens=Number(run.usage?.totalTokenCount)||0;await pool.query("UPDATE bep_agent_daily_usage SET tokens=tokens+$1,updated_at=NOW() WHERE day_key=CURRENT_DATE",[tokens]);
 await pool.query("INSERT INTO bep_agent_metrics(day_key,jobs_completed,jobs_failed,candidates_created,quality_findings) VALUES(CURRENT_DATE,$1,$2,$3,$4) ON CONFLICT(day_key) DO UPDATE SET jobs_completed=bep_agent_metrics.jobs_completed+EXCLUDED.jobs_completed,jobs_failed=bep_agent_metrics.jobs_failed+EXCLUDED.jobs_failed,candidates_created=bep_agent_metrics.candidates_created+EXCLUDED.candidates_created,quality_findings=bep_agent_metrics.quality_findings+EXCLUDED.quality_findings,updated_at=NOW()",[run.status==="completed"?1:0,run.status==="failed"?1:0,run.candidatesCreated||0,run.qualityFindings||0]);
}
module.exports={ensureSchema,enqueue,claim,complete,fail,deferUntilTomorrow,recoverOrphanedQueuedJob,reserveCall,recordRun};
