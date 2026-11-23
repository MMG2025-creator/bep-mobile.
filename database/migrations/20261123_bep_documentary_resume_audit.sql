-- Durable documentary batch resumption and explicit deferred-run audit status.
ALTER TABLE bep_agent_runs DROP CONSTRAINT IF EXISTS bep_agent_runs_status_check;
ALTER TABLE bep_agent_runs ADD CONSTRAINT bep_agent_runs_status_check
 CHECK(status IN ('completed','failed','deferred'));
ALTER TABLE bep_agent_metrics ADD COLUMN IF NOT EXISTS jobs_deferred INTEGER NOT NULL DEFAULT 0;
