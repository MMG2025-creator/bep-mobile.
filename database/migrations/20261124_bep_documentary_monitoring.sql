-- Add persistent Render Task Run correlation for documentary jobs.
-- Existing jobs remain readable; historical rows may have no Render ID if they
-- were dispatched before correlation was persisted.
ALTER TABLE bep_agent_jobs
 ADD COLUMN IF NOT EXISTS task_run_id TEXT,
 ADD COLUMN IF NOT EXISTS task_run_status TEXT;
CREATE INDEX IF NOT EXISTS bep_agent_jobs_documentary_created_idx
 ON bep_agent_jobs(job_type,created_at DESC);
