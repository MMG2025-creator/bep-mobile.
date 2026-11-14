CREATE TABLE IF NOT EXISTS bep_users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT, avatar_url TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS bep_user_data (
 user_id TEXT PRIMARY KEY REFERENCES bep_users(id) ON DELETE CASCADE,
 payload JSONB NOT NULL DEFAULT '{"income":0,"budgets":[],"expenses":[],"goals":[]}'::jsonb,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);