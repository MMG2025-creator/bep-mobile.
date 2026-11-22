-- Add the isolated administrative documentary research job type.
ALTER TABLE bep_agent_jobs
 DROP CONSTRAINT IF EXISTS bep_agent_jobs_job_type_check;
ALTER TABLE bep_agent_jobs
 ADD CONSTRAINT bep_agent_jobs_job_type_check
 CHECK (job_type IN ('knowledge_review','coach_quality_review','documentary_research'));
