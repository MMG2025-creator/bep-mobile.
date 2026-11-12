# Monthly budget history — branch-first release runbook

## Current release posture

- Feature branch: `feature/monthly-budget-history`
- Draft PR: #39
- Production branch: `main`
- The module is prepared and validated on GitHub Actions using an ephemeral PostgreSQL 16 service.
- No pre-production deployment or pre-production database is required for this module.
- No production migration, user-data change, environment change or deployment has been performed.

## Branch validation before merge

1. Keep all budget changes isolated to the feature branch until the release decision.
2. Require the latest GitHub Actions run for the exact PR head SHA to pass.
3. Require Node syntax checks, frontend source/dist parity, dependency audit and PostgreSQL integration tests.
4. Review the full PR diff, SQL migration, API authorization boundaries and compatibility with existing `/api/data` behavior.
5. Confirm the release/rollback steps and production backup requirements below.
6. Do not merge or deploy while any required check is failing or stale relative to the PR head SHA.

The automated integration suite creates an isolated temporary PostgreSQL schema, applies the actual migration file, exercises the API and drops the test schema. It does not connect to Render or touch production data.

## Database migration

The additive migration is `database/migrations/20261111_monthly_budget_history.sql`. It creates the monthly budget, line-item and audit tables plus indexes. It does not alter or backfill `bep_user_data`.

The API depends on these tables. During the production rollout:
1. Confirm a current production backup and a usable restore path.
2. Apply the migration once through the approved production database access path.
3. Verify table/index presence and migration completion.
4. Deploy the matching application revision only after the migration succeeds.
5. Run post-deploy authenticated smoke tests and verify existing account data remains intact.

Do not run DDL from application startup. Do not execute the migration before the matching code is ready. Keep the migration additive and preserve the legacy JSONB payload.

## Initial user data and accounting rules

- The first monthly snapshot is created only after the user explicitly chooses a month and confirms the one-time import (including the number of lines and the fact that the copy is independent); an empty month also requires confirmation.
- No earlier months are fabricated or backfilled.
- New months copy the latest earlier snapshot as independent line items.
- Planned income, charges and savings remain distinct.
- Actual purchases are assigned by their real `at` timestamp in the user's IANA timezone; impossible calendar dates are rejected rather than normalized into another month.
- Duplicate non-empty IDs within `expenses[]` are counted once. Purchases without IDs are kept as separate entries; identical timestamps/merchant/amounts alone are not enough evidence to collapse two real purchases.
- `transactions[]` is not imported into actual expenses until its relationship to `expenses[]` is established; this avoids double counting.
- Manual monthly lines are retained when Revenus/Charges/Épargne changes synchronize legacy-managed rows.
- The monthly-to-savings bridge confirms the server write before committing the new state to local storage; a failed secondary sync is reported separately from a successfully saved monthly snapshot.
- Closing a month prevents edits. Reopening requires a reason and writes an audit entry.
- Stale writes are rejected using the version number.

## Savings ledger compatibility

The shared `/api/data` write path validates the append-only savings ledger. Every early rejection after opening a PostgreSQL transaction must explicitly roll back before returning. The feature branch includes guards and a regression assertion for invalid or oversized ledger payloads. The staging branch currently runs an earlier server revision; this correction is not present in the deployed staging service until that branch is separately updated.

## Rollback posture

Do not drop the new tables as an automatic rollback. If the application release must be stopped, roll back the application code while preserving monthly records and audit rows. Restore the database only from the verified backup if an integrity issue requires it. Never delete monthly history as the first response to a deployment issue.

## Acceptance checklist

- [ ] Latest CI run passes on the exact PR head SHA.
- [ ] PostgreSQL integration tests apply the real migration in an isolated schema.
- [ ] Cross-user isolation, unauthenticated access, invalid payloads and invalid timezones are covered.
- [ ] Month creation, idempotency, copy independence, version conflicts, closure/reopening and audit are covered.
- [ ] Actual-expense timezone boundary, duplicate-ID deduplication and impossible calendar dates are covered.
- [ ] Manual monthly rows survive legacy-module synchronization, and local state is not committed before server confirmation.
- [ ] Root/dist JavaScript, HTML and CSS assets are synchronized.
- [ ] Savings ledger and current-month cross-module synchronization are reviewed and tested.
- [ ] Existing `/api/data` compatibility is checked.
- [ ] Production backup and restore readiness confirmed before production migration.
- [ ] Final release decision recorded before merge/deploy.
