-- Execute as the database owner or an authorized migration role in bep_v2_db.
-- This script is idempotent and does not contain or set a password.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bep_agent_runner') THEN
  CREATE ROLE bep_agent_runner LOGIN;
 END IF;
END
$$;
ALTER ROLE bep_agent_runner WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT CONNECT ON DATABASE bep_v2_db TO bep_agent_runner;
GRANT USAGE ON SCHEMA public TO bep_agent_runner;

-- Remove any previous broad grants before applying the least-privilege grants below.
REVOKE ALL ON TABLE bep_agent_jobs,bep_agent_runs,bep_agent_daily_usage,bep_agent_metrics,
 bep_financial_knowledge,bep_agent_approved_knowledge,bep_knowledge_candidates FROM bep_agent_runner;
REVOKE ALL ON SEQUENCE bep_agent_runs_id_seq,bep_knowledge_candidates_id_seq FROM bep_agent_runner;

-- The runner can see and claim documentary_research jobs only.
ALTER TABLE bep_agent_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bep_agent_runner_documentary_only ON bep_agent_jobs;
CREATE POLICY bep_agent_runner_documentary_only ON bep_agent_jobs
 FOR ALL TO bep_agent_runner
 USING (job_type='documentary_research')
 WITH CHECK (job_type='documentary_research');

-- Preserve the API role's existing access to all agent jobs while RLS is enabled.
DROP POLICY IF EXISTS bep_api_agent_jobs_access ON bep_agent_jobs;
CREATE POLICY bep_api_agent_jobs_access ON bep_agent_jobs
 FOR ALL TO bep_v2_db_user
 USING (true)
 WITH CHECK (true);

GRANT SELECT (id,job_type,payload,status,attempts,max_attempts,run_after,locked_at,locked_by,created_at)
 ON TABLE bep_agent_jobs TO bep_agent_runner;
GRANT UPDATE (status,attempts,run_after,locked_at,locked_by,last_error,updated_at)
 ON TABLE bep_agent_jobs TO bep_agent_runner;

-- Append-only execution audit.
GRANT INSERT (job_id,job_type,status,model,input_digest,output_digest,output_summary,usage,error_code,started_at,finished_at)
 ON TABLE bep_agent_runs TO bep_agent_runner;

-- Daily usage counters: only the columns used by reserveCall/recordRun.
GRANT SELECT (day_key,calls,tokens,updated_at), INSERT (day_key,calls),
 UPDATE (calls,tokens,updated_at) ON TABLE bep_agent_daily_usage TO bep_agent_runner;

-- Aggregate job metrics only.
GRANT SELECT (day_key,jobs_completed,jobs_failed,candidates_created,quality_findings,updated_at),
 INSERT (day_key,jobs_completed,jobs_failed,candidates_created,quality_findings),
 UPDATE (jobs_completed,jobs_failed,candidates_created,quality_findings,updated_at)
 ON TABLE bep_agent_metrics TO bep_agent_runner;

-- Read-only access to published financial knowledge; no user/account tables.
GRANT SELECT (slug,category,title,content,keywords,source_name,source_url,evidence_level,version,active)
 ON TABLE bep_financial_knowledge TO bep_agent_runner;
GRANT SELECT (slug,category,title,content,keywords,source_name,source_url,evidence_level,active,source_version,source_digest,version)
 ON TABLE bep_agent_approved_knowledge TO bep_agent_runner;

-- Insert pending proposals only. The runner cannot read, approve, edit or publish candidates.
GRANT INSERT (source_slug,source_version,source_digest,proposal_type,title,content,source_name,source_url,evidence_level,confidence,rationale,review_status,input_digest),
 SELECT (id) ON TABLE bep_knowledge_candidates TO bep_agent_runner;

GRANT USAGE,SELECT ON SEQUENCE bep_agent_runs_id_seq,bep_knowledge_candidates_id_seq TO bep_agent_runner;

-- Set the password interactively in psql after running this file:
--   \password bep_agent_runner
-- Never place the password in this file, Git, logs, or chat.
