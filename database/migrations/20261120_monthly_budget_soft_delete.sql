-- BEP monthly budget soft deletion
-- Additive migration: preserves snapshots and audit history for recovery.
BEGIN;

ALTER TABLE bep_monthly_budgets
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

ALTER TABLE bep_budget_audit_log
  DROP CONSTRAINT IF EXISTS bep_budget_audit_log_action_check;

ALTER TABLE bep_budget_audit_log
  ADD CONSTRAINT bep_budget_audit_log_action_check
  CHECK (action IN ('created', 'updated', 'closed', 'reopened', 'imported', 'deleted', 'restored'));

CREATE INDEX IF NOT EXISTS bep_monthly_budgets_deleted_user_month_idx
  ON bep_monthly_budgets (user_id, month_key DESC)
  WHERE deleted_at IS NOT NULL;

COMMIT;
