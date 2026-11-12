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

## Production backup and restore protocol

This section is an operational procedure, not authorization to access production. Execute it only from an approved operator workstation or managed deployment runner with least-privilege credentials. Never paste a production connection string into chat, commit it, print it, or place it in shell history.

### A. Preconditions and change record

1. Name the release operator and a second reviewer. Record the intended application commit, migration filename, production database identifier, PostgreSQL major version, UTC start time, and change/ticket reference.
2. Confirm the production API and database are healthy. Confirm the database is PostgreSQL 16-compatible with the tested migration. If health, storage, connection capacity, or backup status is uncertain, stop.
3. Confirm the exact application revision to be released is the same revision whose migration and tests were reviewed. Confirm the PR's required checks are green on the exact head SHA.
4. Announce a short change window. Prevent concurrent schema changes by other operators. The application can remain online for a normal `pg_dump`; do not run destructive maintenance during the backup.
5. Confirm sufficient free storage for the dump plus a second restored copy, and a secure destination outside the production database host/account.

### B. Create and verify a recoverable backup

Use the managed database provider's supported snapshot/backup mechanism where available, and additionally create a logical backup when permitted. A provider snapshot is not considered restorable until a restore drill succeeds.

For a logical backup, load the connection string from the approved secret manager into the process environment (not a command-line argument). Example commands:

```bash
set -euo pipefail
umask 077
: "${DATABASE_URL:?DATABASE_URL must be injected from the secret manager}"
BACKUP_FILE="bep-prod-before-monthly-budget-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$BACKUP_FILE"
test -s "$BACKUP_FILE"
pg_restore --list "$BACKUP_FILE" >/dev/null
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
```

- Run with a PostgreSQL client version compatible with the server.
- Copy the dump and checksum to the approved encrypted, access-controlled off-host backup location. Do not rely on a local workstation copy as the only backup.
- Verify the remote object exists, its byte size is non-zero, and its SHA-256 matches the locally generated checksum after transfer.
- Record backup object identifier, checksum, size, timestamp, retention/expiry, and operator in the change record. Keep the pre-release backup under the organization's normal retention policy.
- A successful `pg_dump` or `pg_restore --list` proves archive readability only; it does not prove that a restore is usable.

### C. Mandatory isolated restore drill

Restore into a new, isolated, access-restricted database on the same PostgreSQL major version. Never restore over production as a test.

```bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL must target a disposable empty database}"
pg_restore --dbname="$RESTORE_DATABASE_URL" --no-owner --no-acl --exit-on-error "$BACKUP_FILE"
```

After restore:
- Confirm the restore command exits successfully and the database accepts connections.
- Compare key object inventory and row counts with the source backup metadata, including `bep_users`, `bep_user_data`, `user_sessions`, and all existing application tables. Do not export or expose personal row contents in the release log.
- Verify application-critical constraints and indexes exist; run read-only integrity checks approved for the production schema.
- Start the exact candidate application revision against the restored clone using isolated credentials and a non-production origin. Verify login/session behavior with a dedicated test account, `/api/health`, existing `/api/data` read/write compatibility, and monthly-budget list/detail/create/update/close/reopen flows. Delete the disposable clone and its credentials after the drill according to policy.
- Record restore duration, validation results, any warnings, and reviewer sign-off. If any step fails, the backup is not accepted and release is blocked.

### D. Migration and deployment sequence

1. Reconfirm backup checksum, off-host availability, and successful restore-drill sign-off immediately before the change window.
2. Confirm the candidate code is ready and the additive migration has been reviewed. This migration references the existing `bep_users` table; verify that prerequisite exists before execution.
3. Apply `database/migrations/20261111_monthly_budget_history.sql` exactly once through the approved production database access path, with stop-on-error enabled. Example:

```bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be injected from the secret manager}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f database/migrations/20261111_monthly_budget_history.sql
```

4. Verify the three tables `bep_monthly_budgets`, `bep_monthly_budget_items`, `bep_budget_audit_log` and their expected indexes/constraints exist. Confirm the migration transaction committed and no partial DDL remains.
5. Deploy only the application revision matching the reviewed migration. Do not deploy the frontend or API independently if they would be incompatible.
6. Run authenticated smoke tests using a dedicated authorized test account. Verify the new monthly endpoints, cross-user isolation, legacy `/api/data` behavior, Savings synchronization, and that existing users' data is unchanged. Confirm no sensitive data is emitted in logs.
7. Monitor API/database errors, latency, connection pool saturation and user reports throughout the observation window. Record the final result and reviewer sign-off.

### E. Stop, rollback and recovery decision

- **Before migration:** cancel the release; no database action is needed.
- **Migration fails:** stop deployment. Because the migration is wrapped in a transaction, verify the transaction rolled back and the three new tables were not partially installed. Capture logs without secrets and investigate; do not improvise manual DDL.
- **Migration succeeds but application deployment or smoke tests fail:** roll the application back to the previous known-good revision while leaving the additive tables in place. The previous application is expected to ignore these new tables. Do not drop tables or delete monthly/audit data as a first response.
- **Data corruption or confirmed database-wide integrity issue:** declare an incident, stop writes if required by the incident commander, and choose recovery point/time with the data owner. Restore the verified backup to a separate database first, validate it, then perform a separately approved controlled cutover. Do not overwrite production automatically; account for writes made after the backup and reconcile them before any recovery cutover.
- Record decision maker, recovery point, data-loss window, application revision, and verification evidence. A production restore/cutover requires explicit change authorization.

### F. Required release evidence

The release record must contain: exact application SHA; PR and CI run links; migration checksum; production database identifier (not its URL); backup timestamp/object ID/size/SHA-256; restore-drill target and outcome/duration; migration start/end and outcome; smoke-test results; monitoring window; operator and reviewer approvals; and final go/no-go decision. Keep credentials, tokens, user payloads and personally identifying data out of this record.

## Initial user data and accounting rules

- The first monthly snapshot is created only after the user explicitly chooses a month and confirms the one-time import (including the number of lines and the fact that the copy is independent); an empty month also requires confirmation.
- No earlier months are fabricated or backfilled.
- New months copy the latest earlier snapshot as independent line items.
- Planned income, charges and savings remain distinct.
- Actual purchases are assigned by their real `at` timestamp in the user's IANA timezone; impossible calendar dates are rejected rather than normalized into another month.
- If no actual purchase is recorded for a month, the interface displays `Non renseigné` and does not calculate a misleading variance against planned charges.
- Duplicate non-empty IDs within `expenses[]` are counted once. Purchases without IDs are kept as separate entries; identical timestamps/merchant/amounts alone are not enough evidence to collapse two real purchases.
- `transactions[]` is not imported into actual expenses until its relationship to `expenses[]` is established; this avoids double counting.
- Manual monthly lines are retained when Revenus/Charges/Épargne changes synchronize legacy-managed rows.
- The monthly-to-savings bridge confirms the server write before committing the new state to local storage; a failed secondary sync is reported separately from a successfully saved monthly snapshot.
- Closing a month prevents edits. Reopening requires a reason and writes an audit entry.
- Stale writes are rejected using the version number.

## Savings ledger compatibility

The shared `/api/data` write path validates the append-only savings ledger. Every early rejection after opening a PostgreSQL transaction must explicitly roll back before returning. The feature branch includes guards and a regression assertion for invalid or oversized ledger payloads. The staging branch currently runs an earlier server revision; this correction is not present in the deployed staging service until that branch is separately updated.

- The savings interface uses an objective-first layout with separate `Mes objectifs` and `Mes mouvements` tabs. The tab controls support keyboard navigation as well as pointer/touch input.
- Removing a movement hides both the original operation and its compensating entry from the visible history. The append-only ledger retains the compensation internally so the balance remains correct without exposing a second “annulation” row.

## Rollback posture

Do not drop the new tables as an automatic rollback. If the application release must be stopped, roll back the application code while preserving monthly records and audit rows. Restore the database only from the verified backup if an integrity issue requires it. Never delete monthly history as the first response to a deployment issue.

## Acceptance checklist

- [x] Latest pull-request CI run passes on the exact PR head SHA `444b197e9848d6eef8b004a0edd496ac6185d5af`.
- [x] PostgreSQL integration tests apply the real migration in an isolated schema.
- [x] Cross-user isolation, unauthenticated access, invalid payloads and invalid timezones are covered.
- [x] Month creation, idempotency, copy independence, version conflicts, closure/reopening and audit are covered.
- [x] Actual-expense timezone boundary, duplicate-ID deduplication and impossible calendar dates are covered.
- [x] Manual monthly rows survive legacy-module synchronization, and local state is not committed before server confirmation.
- [x] Root/dist JavaScript, HTML and CSS assets are synchronized.
- [x] Savings ledger and current-month cross-module synchronization are covered by integration and frontend regression checks.
- [x] Savings objective/movement tabs, keyboard navigation and hidden compensating reversals are covered by frontend regression checks.
- [x] Missing actual purchases display as `Non renseigné`; no variance is calculated without actual data.
- [ ] Existing `/api/data` compatibility has not yet had an authenticated end-to-end browser acceptance test.
- [ ] Authenticated browser acceptance on the intended deployment target.
- [x] Production backup, isolated restore-drill, migration, deployment, stop/rollback and evidence-recording procedures documented.
- [ ] A real production backup has been created, transferred to approved off-host storage, checksum-verified and successfully restored to an isolated database.
- [ ] Production backup and restore readiness signed off before production migration.
- [ ] Final release decision recorded before merge/deploy.
