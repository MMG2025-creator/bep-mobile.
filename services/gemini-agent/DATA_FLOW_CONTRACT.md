# BEP Gemini — Data flow contract (binding)

Status: **mandatory security boundary** for the peripheral Gemini service.

## 1. Authoritative direction

The PostgreSQL BEP knowledge database is the source of truth for shared, approved Coach knowledge.

The permitted flow is strictly:

`BEP PostgreSQL (approved shared knowledge) -> read-only export -> JSON snapshots -> Gemini reads snapshots`

The JSON files are a one-way publication format for Gemini. They are not a write-back queue, import format, migration format, or source of truth.

## 2. Absolute prohibition: JSON -> database

**Until a separate, explicit written authorization changes this policy, no JSON produced, edited, returned, or enriched by Gemini may be inserted, imported, upserted, merged, or otherwise written into any BEP database.**

This prohibition includes:
- INSERT, UPDATE, UPSERT, DELETE, MERGE, COPY, bulk load, and stored-procedure calls that mutate data;
- automatic ingestion of Gemini output, even into candidate, staging, or pending-approval tables;
- database migrations or schema changes initiated by the Gemini service;
- indirect write-back through BEP APIs, jobs, queues, webhooks, or another service.

Human approval alone does not authorize an import. A separate explicit authorization from the project owner is required before any JSON-to-database pathway is designed, enabled, tested against a database, or executed.

## 3. Read-only export requirements

The export process must:
- select only general shared knowledge that is approved for publication;
- exclude personal/user-specific knowledge, accounts, sessions, conversations, financial records, and pending candidate material unless separately approved for publication;
- use a dedicated read-only database identity or a trusted BEP-side exporter with equivalent least-privilege controls;
- execute SELECT-only operations and expose no database credentials to Gemini;
- generate versioned JSON snapshots with provenance, schema version, generated timestamp, and source revision;
- validate the snapshot before publication and publish atomically;
- fail closed: if export, validation, or publication fails, retain the last known-good snapshot and report the failure.

## 4. Gemini service boundary

Gemini may read the published JSON snapshots and may produce research notes or proposed enrichments outside the BEP database.

The service must not:
- contain database credentials or a database connection pool;
- expose database mutation endpoints;
- call BEP database write APIs;
- write Gemini output into the JSON snapshots that are the approved source for its own context;
- modify the live BEP Coach or its runtime decisions.

The read endpoints are GET-only. Any future snapshot publication endpoint, if needed, must accept only authenticated exporter publication into the service's file/object snapshot store; it must never write to PostgreSQL.

## 5. Operational gate

Before deployment, verify:
1. the JSON snapshots originate from the approved shared database corpus through a read-only export;
2. no database credentials are present in the Gemini service environment;
3. there is no JSON-to-database route, job, trigger, queue consumer, or import script;
4. the service exposes only the intended read endpoints to Gemini;
5. the deployed snapshot has a verifiable version and provenance.

Until the database-to-JSON exporter has been implemented and verified, the current Git-source snapshot builder is a development placeholder only. It must not be represented as a live database synchronization.

## 6. Change control

Only the project owner may lift or amend the JSON-to-database prohibition, by explicit written instruction. No agent, model, workflow, CI job, operator, or human reviewer may infer permission from a successful test, an approval status, or the presence of a candidate record.
