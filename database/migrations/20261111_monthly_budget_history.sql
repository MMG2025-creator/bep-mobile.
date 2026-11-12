-- BEP monthly budget history — additive migration
-- Safe to apply once; does not alter or backfill existing user data.
BEGIN;

CREATE TABLE IF NOT EXISTS bep_monthly_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES bep_users(id) ON DELETE CASCADE,
  month_key DATE NOT NULL CHECK (
    EXTRACT(DAY FROM month_key) = 1
    AND month_key >= DATE '2000-01-01'
    AND month_key < DATE '2100-01-01'
  ),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  planned_income_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (planned_income_total >= 0),
  planned_charges_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (planned_charges_total >= 0),
  planned_savings_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (planned_savings_total >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, month_key),
  UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS bep_monthly_budgets_user_month_idx
  ON bep_monthly_budgets (user_id, month_key DESC);

CREATE TABLE IF NOT EXISTS bep_monthly_budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES bep_monthly_budgets(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('income', 'charge', 'savings')),
  source_item_id TEXT,
  label TEXT NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 160),
  category TEXT CHECK (category IS NULL OR length(category) <= 80),
  nature TEXT CHECK (nature IS NULL OR length(nature) <= 40),
  planned_amount NUMERIC(14,2) NOT NULL CHECK (planned_amount >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bep_monthly_budget_items_budget_type_idx
  ON bep_monthly_budget_items (budget_id, item_type);

CREATE TABLE IF NOT EXISTS bep_budget_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES bep_users(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'closed', 'reopened', 'imported')),
  before_state JSONB,
  after_state JSONB,
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (budget_id, user_id) REFERENCES bep_monthly_budgets(id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS bep_budget_audit_log_budget_created_idx
  ON bep_budget_audit_log (budget_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bep_budget_audit_log_user_created_idx
  ON bep_budget_audit_log (user_id, created_at DESC);

COMMIT;
