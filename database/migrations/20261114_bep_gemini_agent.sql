-- BEP Gemini Agent V1 — migration additive, sans modification des tables métier.
CREATE TABLE IF NOT EXISTS bep_agent_jobs (
 id BIGSERIAL PRIMARY KEY,
 job_type TEXT NOT NULL CHECK(job_type IN ('knowledge_review','coach_quality_review')),
 payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object'),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 max_attempts INTEGER NOT NULL DEFAULT 3,
 run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 locked_at TIMESTAMPTZ,
 locked_by TEXT,
 last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bep_agent_jobs_ready_idx ON bep_agent_jobs(status,run_after,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS bep_agent_jobs_one_active_type ON bep_agent_jobs(job_type) WHERE status IN ('queued','running');

CREATE TABLE IF NOT EXISTS bep_agent_runs (
 id BIGSERIAL PRIMARY KEY,
 job_id BIGINT REFERENCES bep_agent_jobs(id) ON DELETE SET NULL,
 job_type TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('completed','failed')),
 model TEXT NOT NULL,
 input_digest TEXT NOT NULL,
 output_digest TEXT,
 output_summary JSONB,
 usage JSONB,
 error_code TEXT,
 started_at TIMESTAMPTZ NOT NULL,
 finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bep_knowledge_candidates (
 id BIGSERIAL PRIMARY KEY,
 source_slug TEXT NOT NULL,
 source_version INTEGER NOT NULL,
 source_digest TEXT NOT NULL,
 proposal_type TEXT NOT NULL CHECK(proposal_type IN ('clarify','update','deactivate')),
 title TEXT NOT NULL,
 content TEXT NOT NULL,
 source_name TEXT NOT NULL,
 source_url TEXT NOT NULL,
 evidence_level TEXT NOT NULL,
 confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high')),
 rationale TEXT NOT NULL,
 review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','accepted','rejected')),
 input_digest TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_at TIMESTAMPTZ,
 UNIQUE(source_slug,proposal_type,input_digest)
);
CREATE INDEX IF NOT EXISTS bep_knowledge_candidates_review_idx ON bep_knowledge_candidates(review_status,created_at DESC);

-- Approved knowledge overlays seed documents without overwriting the seed source.
CREATE TABLE IF NOT EXISTS bep_agent_approved_knowledge (
 slug TEXT PRIMARY KEY,
 category TEXT NOT NULL,
 title TEXT NOT NULL,
 content TEXT NOT NULL,
 keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
 source_name TEXT NOT NULL,
 source_url TEXT NOT NULL DEFAULT '',
 evidence_level TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 approved_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aggregate-only Coach telemetry: no account IDs, questions, answers or financial values.
CREATE TABLE IF NOT EXISTS bep_agent_coach_metrics (
 day_key DATE NOT NULL,
 mode TEXT NOT NULL,
 status_code INTEGER NOT NULL,
 calls INTEGER NOT NULL DEFAULT 0,
 total_latency_ms BIGINT NOT NULL DEFAULT 0,
 total_tokens BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(day_key,mode,status_code)
);

CREATE TABLE IF NOT EXISTS bep_agent_daily_usage (
 day_key DATE PRIMARY KEY,
 calls INTEGER NOT NULL DEFAULT 0,
 tokens INTEGER NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bep_agent_metrics (
 day_key DATE PRIMARY KEY,
 jobs_completed INTEGER NOT NULL DEFAULT 0,
 jobs_failed INTEGER NOT NULL DEFAULT 0,
 candidates_created INTEGER NOT NULL DEFAULT 0,
 quality_findings INTEGER NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
