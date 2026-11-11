# Monthly budget history — controlled release runbook

## Current release posture

- Feature branch: `feature/monthly-budget-history`
- Draft PR: #39
- Production branch: `main`
- The migration has not been executed against Render PostgreSQL.
- No production service or user data has been changed by this feature branch.

## Before release

1. Require GitHub Actions to pass, including PostgreSQL integration tests.
2. Run authenticated browser E2E against an isolated staging deployment and non-production database.
3. Verify staging schema, PostgreSQL version, extensions and permissions.
4. Confirm a current backup and tested restore path for production.
5. Review the PR diff, dependency installation output, application logs and security checklist.
6. Capture a baseline export of existing JSONB payloads and verify its integrity.

## Migration

The additive migration is `database/migrations/20261111_monthly_budget_history.sql`. It creates three tables and indexes. It does not alter or backfill `bep_user_data`. The API routes depend on these tables, so deploy the backend only after the migration succeeds.

Execute the SQL exactly once through the approved Render database access path, with a controlled maintenance window and verified backup. `IF NOT EXISTS` and a transaction do not replace staging validation. Do not run DDL from application startup.

## Initial user data

The UI offers a one-time explicit import of the currently stored incomes, planned charges and monthly savings goals into the first chosen month. It does not fabricate earlier months or import historical expenses into planned lines.

The actual-expense view reads existing `expenses[]` entries and assigns each purchase by its `at` timestamp. Duplicate IDs inside that array are counted once. Imported `transactions[]` are not added because their relationship to `expenses[]` has not been established; counting both could double-count purchases.

## Rollback posture

Do not drop the new tables as an automatic rollback. If release must be stopped, disable access to the new monthly-history UI/API through a reviewed code rollback and preserve the new tables and audit rows. Restore the database only from the approved backup if a verified integrity issue requires it. Never delete monthly history as the first response to a deployment issue.

## Acceptance gates

- [ ] CI syntax, unit and PostgreSQL integration tests pass.
- [ ] Authenticated E2E on desktop and mobile passes.
- [ ] Savings ledger append-only, reversals, archived goals and current-month synchronization pass on staging.
- [ ] Cross-user access, closed-month edits, stale-version writes and malformed payload tests pass.
- [ ] Existing `/api/data` read/write and login/logout regression tests pass.
- [ ] Staging migration and API startup/read/write pass.
- [ ] Actual-expense date grouping and deduplication policy are verified.
- [ ] Production backup and restore readiness confirmed.
- [ ] Final release decision recorded before merge/deploy.
