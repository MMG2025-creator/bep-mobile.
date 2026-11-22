-- Execute as the database owner or an authorized migration role in bep_v2_db.
-- Create the isolated login role without embedding a password in source control.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bep_agent_runner') THEN
  CREATE ROLE bep_agent_runner LOGIN;
 ELSE
  ALTER ROLE bep_agent_runner LOGIN;
 END IF;
END
$$;

GRANT CONNECT ON DATABASE bep_v2_db TO bep_agent_runner;
GRANT USAGE ON SCHEMA public TO bep_agent_runner;

-- Claim exactly one documentary_research job and persist its terminal state.
GRANT SELECT, UPDATE ON TABLE bep_agent_jobs TO bep_agent_runner;

-- Persist execution audit and aggregate usage only.
GRANT INSERT ON TABLE bep_agent_runs TO bep_agent_runner;
GRANT SELECT, INSERT, UPDATE ON TABLE bep_agent_daily_usage TO bep_agent_runner;
GRANT SELECT, INSERT, UPDATE ON TABLE bep_agent_metrics TO bep_agent_runner;

-- Read the published knowledge base; never read user or account data.
GRANT SELECT ON TABLE bep_financial_knowledge TO bep_agent_runner;
GRANT SELECT ON TABLE bep_agent_approved_knowledge TO bep_agent_runner;

-- New proposals are pending human review; the runner cannot approve or publish.
GRANT INSERT ON TABLE bep_knowledge_candidates TO bep_agent_runner;

-- BIGSERIAL identifiers used by INSERT statements.
GRANT USAGE, SELECT ON SEQUENCE bep_agent_runs_id_seq TO bep_agent_runner;
GRANT USAGE, SELECT ON SEQUENCE bep_knowledge_candidates_id_seq TO bep_agent_runner;

-- Set the password interactively in psql after running this file:
--   psql command: \password bep_agent_runner
-- Never place the password in this file, Git, logs, or chat.
