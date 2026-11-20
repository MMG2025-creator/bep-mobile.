# BEP — PostgreSQL backup and restore runbook

## Production database facts

- Render resource: `bep-v2-db`
- Database: `bep_v2_db`
- PostgreSQL: 18
- Current compute plan: `0.1c-256mb` (paid plan)
- Current storage: 1 GB
- High availability: disabled
- IP allowlist: restricted; do not widen it to `0.0.0.0/0` for backup tooling.

Render documents PITR and dashboard logical exports for paid Postgres instances. Free Postgres instances do not support managed backups. Confirm the Recovery page displays available recovery points and exports before treating the policy as active.

## Scheduled / pre-change backup

1. Open the production database in the Render Dashboard.
2. Open **Recovery**.
3. Trigger **Create export** before a schema migration or production release.
4. Wait for the export to complete and download the `.dir.tar.gz` archive.
5. Store a copy outside Render in encrypted, access-controlled object storage.
6. Record the UTC timestamp, database resource ID, PostgreSQL major version, archive size and SHA-256 checksum.
7. Retain a documented retention policy (recommended: daily copies, 30 days; monthly copies, 12 months) and verify the archive can be read.

Render retains dashboard logical exports for seven days. Download any export that must be retained longer.

## Point-in-time recovery

1. In **Recovery**, confirm the available PITR window.
2. Select **Restore Database** and create a separate recovery instance with a distinct name.
3. Choose a restore timestamp; Render does not allow a target within the most recent ten minutes.
4. Do not change production `DATABASE_URL` yet.
5. Wait until the new instance is Available.
6. Validate schema, key table counts, recent user data, and application health against the recovery instance.
7. Only after validation and an approved cutover, update the production service connection string.
8. Verify authenticated application flows and database health.
9. Keep the original database intact until the cutover is proven and the rollback window has passed.

PITR creates a new database; it does not overwrite the source. Recovery instances are billable. Never delete the original database as part of the initial restore test.

## Logical restore test

Restore a downloaded export into a new, empty, isolated PostgreSQL database of a compatible major version. Do not use `--clean` against the production database.

For a Render directory-format export:

```bash
tar -xzf <export>.dir.tar.gz
pg_restore --dbname="$ISOLATED_TARGET_DATABASE_URL" \
  --format=directory --no-owner --no-privileges --verbose \
  <extracted-directory>
```

Then verify:

- `pg_restore` exits successfully.
- Expected tables, indexes, constraints and migrations exist.
- Critical table row counts and referential integrity checks match the source snapshot.
- The API can start against the isolated database and pass health plus authenticated read/write smoke tests using test accounts only.

## External dump fallback

For a portable backup, use PostgreSQL client tools compatible with the database major version:

```bash
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner \
  --file="bep_v2_db_$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_restore --list <backup-file>.dump
sha256sum <backup-file>.dump
```

Keep `DATABASE_URL` in a secret manager or shell environment; never paste it into chat, commit it, or print it in CI logs. Transfer the dump to encrypted off-site storage and test restoration quarterly.

## Current verification status

- Render resource metadata confirms a paid `0.1c-256mb` compute plan.
- The Render integration available in this workspace does not expose Recovery-page exports or PITR status.
- A hosted SQL diagnostic connection was refused because its source IP is not on the database allowlist. Do not open the allowlist globally to work around this.
- No backup export was created or downloaded during this audit.
- No restore was run and no production database or service was modified.

**Do not mark backups as verified until a real export is downloaded and a restore into an isolated database succeeds.**
