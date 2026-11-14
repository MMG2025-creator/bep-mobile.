# BEP Gemini — Data flow contract (binding)

Status: **mandatory security boundary** for the peripheral Gemini service.

## 1. Authoritative direction

PostgreSQL is the source of truth for approved shared Coach knowledge. The only permitted flow is:

`BEP PostgreSQL -> read-only export -> versioned JSON snapshots -> Gemini GET reads`

JSON is not an import format, write-back queue, migration format, or source of truth.

## 2. Absolute prohibition: JSON -> database

No JSON produced, edited, returned, or enriched by Gemini may be inserted, imported, upserted, merged, or otherwise written into any BEP database without separate explicit written authorization from the project owner. This includes candidate/staging tables, migrations, jobs, queues, webhooks, APIs and indirect writeback. Human approval alone does not authorize import.

## 3. Read-only exporter

The exporter may read only approved shared knowledge from:
- `public.bep_financial_knowledge`
- `public.bep_agent_approved_knowledge`

It excludes user-specific data, accounts, sessions, conversations, financial records, pending candidates and internal approver identity.

Before either table is read, a read-only catalog preflight must fail closed unless the connected identity has:
- no elevated or inherited role attributes (superuser, create-role, create-database, replication, bypass-RLS);
- no database CREATE/TEMP or non-system schema CREATE privileges;
- SELECT and no write/trigger/reference privilege on exactly the two approved relations;
- no access to other application relations or sequences.

The export then runs in a `BEGIN READ ONLY` transaction with two SELECT statements. The preflight itself performs catalog reads only; it never creates roles, grants privileges, or changes schema/data. Gemini never receives database credentials.

Snapshots require schema version, timestamp, provenance, source revision and validation. Failed export or validation must preserve the last known-good snapshots. Publication uses staged rollback-capable directory renames, not a single filesystem-atomic exchange.

## 4. Gemini service boundary

Gemini reads snapshots through GET-only endpoints. It must not contain database credentials, a database pool, mutation endpoints, import scripts or writeback routes. It must not modify live Coach runtime decisions or write its output into the approved snapshots.

## 5. Operational gate

Role preflight, real-data export, snapshot transfer, scheduling, deployment and publication each require separate owner authorization. A successful synthetic CI run does not establish live database permissions or production readiness.

## 6. Change control

Only the project owner may lift or amend the JSON-to-database prohibition by explicit written instruction.
