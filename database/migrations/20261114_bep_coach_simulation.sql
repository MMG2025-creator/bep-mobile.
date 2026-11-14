-- Corpus de simulation BEP : données strictement fictives et isolées.
CREATE TABLE IF NOT EXISTS bep_simulation_profiles (
  profile_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  socio_professional_category TEXT NOT NULL,
  monthly_income NUMERIC(12,2) NOT NULL CHECK(monthly_income BETWEEN 1500 AND 8000),
  household JSONB NOT NULL CHECK(jsonb_typeof(household)='object'),
  fixed_charges JSONB NOT NULL CHECK(jsonb_typeof(fixed_charges)='array'),
  savings_target_rate NUMERIC(5,2) NOT NULL CHECK(savings_target_rate BETWEEN 0 AND 100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS bep_simulation_months (
  profile_id TEXT NOT NULL REFERENCES bep_simulation_profiles(profile_id) ON DELETE CASCADE,
  month_key DATE NOT NULL CHECK(EXTRACT(DAY FROM month_key)=1),
  income NUMERIC(12,2) NOT NULL CHECK(income>=0),
  rent NUMERIC(12,2) NOT NULL CHECK(rent>=0),
  fixed_charges_total NUMERIC(12,2) NOT NULL CHECK(fixed_charges_total>=0),
  variable_expenses NUMERIC(12,2) NOT NULL CHECK(variable_expenses>=0),
  planned_savings NUMERIC(12,2) NOT NULL CHECK(planned_savings>=0),
  actual_savings NUMERIC(12,2) NOT NULL CHECK(actual_savings>=0),
  savings_attainment_pct NUMERIC(5,2) NOT NULL CHECK(savings_attainment_pct BETWEEN 10 AND 90),
  month_status TEXT NOT NULL CHECK(month_status IN ('on_track','under_pressure','overspend','recovery')),
  events JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(events)='array'),
  PRIMARY KEY(profile_id,month_key)
);
CREATE TABLE IF NOT EXISTS bep_simulation_conversations (
  conversation_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  month_key DATE NOT NULL,
  sequence_no INTEGER NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  user_message TEXT NOT NULL,
  coach_response TEXT NOT NULL,
  intent TEXT NOT NULL,
  behavioral_signals JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(behavioral_signals)='array'),
  financial_context JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(financial_context)='object'),
  synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK(synthetic=TRUE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(profile_id,month_key) REFERENCES bep_simulation_months(profile_id,month_key) ON DELETE CASCADE,
  UNIQUE(profile_id,month_key,sequence_no)
);
CREATE INDEX IF NOT EXISTS bep_simulation_conversations_month_idx ON bep_simulation_conversations(month_key,occurred_at);
CREATE INDEX IF NOT EXISTS bep_simulation_conversations_profile_idx ON bep_simulation_conversations(profile_id,occurred_at);
