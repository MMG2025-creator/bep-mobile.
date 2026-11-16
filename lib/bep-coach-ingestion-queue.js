"use strict";
const crypto=require("node:crypto");

const RETRYABLE_CODES=new Set(["GEMINI_HTTP_503","GEMINI_HTTP_429","SOURCE_TIMEOUT","ETIMEDOUT","ECONNRESET","ECONNREFUSED","EAI_AGAIN","ENOTFOUND","NETWORK_ERROR"]);
const MAX_ATTEMPTS=4;
const LEASE_SECONDS=180;
const sha=value=>crypto.createHash("sha256").update(String(value)).digest("hex");

function classifyIngestionError(error){
 const message=String(error?.message||error||"UNKNOWN_ERROR").replace(/[\\r\\n\\t]+/g," ").slice(0,220);
 const match=message.match(/^(GEMINI_HTTP_(?:429|503)|SOURCE_TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|NETWORK_ERROR)/);
 return {retryable:!!match&&RETRYABLE_CODES.has(match[1]),code:(match?.[1]||message.split(/[ :]/)[0]||"UNKNOWN_ERROR").slice(0,80),message};
}

async function ensureIngestionQueueSchema(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS bep_coach_ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_digest TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL CHECK(length(source_url)<=2048),
  mode TEXT NOT NULL CHECK(mode IN ('page','deep')),
  category TEXT NOT NULL,
  consent BOOLEAN NOT NULL CHECK(consent=TRUE),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','retry','succeeded','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  max_attempts INTEGER NOT NULL DEFAULT 4 CHECK(max_attempts BETWEEN 1 AND 6),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_until TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  result_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
 )`);
 await pool.query("CREATE INDEX IF NOT EXISTS bep_coach_ingestion_jobs_due_idx ON bep_coach_ingestion_jobs(next_attempt_at,created_at) WHERE status IN ('queued','retry')");
 await pool.query("CREATE INDEX IF NOT EXISTS bep_coach_ingestion_jobs_lease_idx ON bep_coach_ingestion_jobs(lease_until) WHERE status='running'");
}

async function enqueueIngestionJob({pool,url,mode="page",category="general",consent=false}={}){
 if(!pool)throw new Error("DATABASE_REQUIRED");
 if(consent!==true)throw new Error("EXPLICIT_CONSENT_REQUIRED");
 const sourceUrl=String(url||"").trim();
 if(!sourceUrl||sourceUrl.length>2048||!["page","deep"].includes(mode)||!category)throw new Error("INVALID_INGESTION_INPUT");
 await ensureIngestionQueueSchema(pool);
 const requestDigest=sha(JSON.stringify({url:sourceUrl,mode,category}));
 const result=await pool.query(
  "INSERT INTO bep_coach_ingestion_jobs(request_digest,source_url,mode,category,consent) VALUES($1,$2,$3,$4,TRUE) ON CONFLICT(request_digest) DO UPDATE SET updated_at=NOW() RETURNING id,status,attempts,max_attempts,next_attempt_at,created_at",
  [requestDigest,sourceUrl,mode,category]
 );
 return {...result.rows[0],id:String(result.rows[0].id),duplicate:result.rows[0].created_at&&result.rows[0].status!=="queued"};
}

async function claimIngestionJob({pool,jobId=null,leaseSeconds=LEASE_SECONDS}={}){
 if(!pool)throw new Error("DATABASE_REQUIRED");
 await ensureIngestionQueueSchema(pool);
 const params=[Math.max(30,Math.min(600,Number(leaseSeconds)||LEASE_SECONDS))];
 let filter="";
 if(jobId){params.push(String(jobId));filter="AND id=$2";}
 const result=await pool.query(
  `WITH candidate AS (
    SELECT id FROM bep_coach_ingestion_jobs
    WHERE ((status IN ('queued','retry') AND next_attempt_at<=NOW()) OR (status='running' AND lease_until<NOW()))
    ${filter}
    ORDER BY next_attempt_at,created_at
    FOR UPDATE SKIP LOCKED LIMIT 1
   )
   UPDATE bep_coach_ingestion_jobs j
   SET status='running',attempts=j.attempts+1,lease_until=NOW()+($1::int * INTERVAL '1 second'),updated_at=NOW()
   FROM candidate WHERE j.id=candidate.id
   RETURNING j.id,j.source_url,j.mode,j.category,j.consent,j.attempts,j.max_attempts`,
  params
 );
 return result.rows[0]||null;
}

async function settleIngestionJob({pool,jobId,error=null,result=null,now=null}={}){
 if(!pool||!jobId)throw new Error("DATABASE_AND_JOB_REQUIRED");
 const stamp=now?new Date(now):new Date();
 if(error){
  const info=classifyIngestionError(error);
  const state=await pool.query("SELECT attempts,max_attempts FROM bep_coach_ingestion_jobs WHERE id=$1",[jobId]);
  if(!state.rowCount)return null;
  const retry=info.retryable&&Number(state.rows[0].attempts)<Number(state.rows[0].max_attempts);
  const delay=Math.min(60,Math.pow(2,Math.max(0,Number(state.rows[0].attempts)-1)))*60;
  const next=retry?new Date(stamp.getTime()+delay*1000):null;
  const updated=await pool.query(
   "UPDATE bep_coach_ingestion_jobs SET status=$2,next_attempt_at=COALESCE($3,NOW()),lease_until=NULL,last_error_code=$4,last_error_message=$5,updated_at=NOW(),completed_at=CASE WHEN $2='failed' THEN NOW() ELSE NULL END WHERE id=$1 RETURNING id,status,attempts,next_attempt_at,last_error_code",
   [jobId,retry?"retry":"failed",next,info.code,info.message]
  );
  return updated.rows[0]||null;
 }
 const summary={enabled:!!result?.enabled,candidatesCreated:Number(result?.candidatesCreated)||0,pagesAnalysed:Number(result?.pagesAnalysed)||0,model:String(result?.model||"").slice(0,80)};
 const updated=await pool.query("UPDATE bep_coach_ingestion_jobs SET status='succeeded',lease_until=NULL,last_error_code=NULL,last_error_message=NULL,result_summary=$2::jsonb,updated_at=NOW(),completed_at=NOW() WHERE id=$1 RETURNING id,status,attempts,result_summary",[jobId,JSON.stringify(summary)]);
 return updated.rows[0]||null;
}

module.exports={RETRYABLE_CODES,MAX_ATTEMPTS,LEASE_SECONDS,classifyIngestionError,ensureIngestionQueueSchema,enqueueIngestionJob,claimIngestionJob,settleIngestionJob};
