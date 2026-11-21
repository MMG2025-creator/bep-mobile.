-- BEP Coach documentary source freshness registry (additive and idempotent).
CREATE TABLE IF NOT EXISTS bep_coach_source_registry (
 id BIGSERIAL PRIMARY KEY,
 source_id TEXT NOT NULL UNIQUE,
 source_url TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('budget','spending','savings','debt','behavior','income','planning','general')),
 status TEXT NOT NULL DEFAULT 'pending_validation' CHECK(status IN ('pending_validation','validated','rejected')),
 last_checked_at TIMESTAMPTZ,
 last_success_at TIMESTAMPTZ,
 content_digest TEXT,
 freshness_status TEXT NOT NULL DEFAULT 'unchecked' CHECK(freshness_status IN ('unchecked','fresh','stale','changed','error')),
 last_http_status INTEGER,
 last_error_code TEXT,
 stale_after_days INTEGER NOT NULL DEFAULT 30 CHECK(stale_after_days BETWEEN 1 AND 365),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bep_coach_source_registry ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE bep_coach_source_registry ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;
ALTER TABLE bep_coach_source_registry ADD COLUMN IF NOT EXISTS content_digest TEXT;
ALTER TABLE bep_coach_source_registry ADD COLUMN IF NOT EXISTS freshness_status TEXT NOT NULL DEFAULT 'unchecked';
ALTER TABLE bep_coach_source_registry ADD COLUMN IF NOT EXISTS last_http_status INTEGER;
ALTER TABLE bep_coach_source_registry ADD COLUMN IF NOT EXISTS last_error_code TEXT;
ALTER TABLE bep_coach_source_registry ADD COLUMN IF NOT EXISTS stale_after_days INTEGER NOT NULL DEFAULT 30;
CREATE INDEX IF NOT EXISTS bep_coach_source_registry_freshness_idx
 ON bep_coach_source_registry(freshness_status,last_checked_at);
