-- Add the isolated administrative documentary research job type.
ALTER TABLE bep_agent_jobs
 DROP CONSTRAINT IF EXISTS bep_agent_jobs_job_type_check;
ALTER TABLE bep_agent_jobs
 ADD CONSTRAINT bep_agent_jobs_job_type_check
 CHECK (job_type IN ('knowledge_review','coach_quality_review','documentary_research'));

-- Allow documentary proposals to create a new library entry for human review.
ALTER TABLE bep_knowledge_candidates
 DROP CONSTRAINT IF EXISTS bep_knowledge_candidates_proposal_type_check;
ALTER TABLE bep_knowledge_candidates
 ADD CONSTRAINT bep_knowledge_candidates_proposal_type_check
 CHECK (proposal_type IN ('clarify','update','deactivate','create'));
