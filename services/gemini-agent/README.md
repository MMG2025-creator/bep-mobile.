# BEP Gemini peripheral JSON service

This service is deliberately separate from the BEP application runtime. Its binding data-flow contract is documented in [DATA_FLOW_CONTRACT.md](./DATA_FLOW_CONTRACT.md).

## Data boundary

The PostgreSQL shared knowledge corpus is the source of truth for approved shared knowledge. The permitted flow is:

`BEP PostgreSQL (SELECT only) -> trusted BEP exporter -> versioned JSON snapshots -> Gemini GET endpoints`

JSON -> PostgreSQL is formally prohibited. The Gemini service has no PostgreSQL dependency, connection pool, database credential, or import/write-back capability.

The trusted exporter is `scripts/export-bep-coach-snapshots.js` at the BEP repository root. It must run only in a trusted BEP environment with a dedicated PostgreSQL identity granted SELECT on exactly:
- `bep_financial_knowledge`
- `bep_agent_approved_knowledge`

Configure only `BEP_KNOWLEDGE_READONLY_DATABASE_URL` in that trusted exporter environment. Never configure it in the Gemini service. The database role must be read-only at the PostgreSQL privilege level; the script additionally opens a `BEGIN READ ONLY` transaction and executes only two SELECT statements.

Run from the repository root:

```sh
BEP_KNOWLEDGE_READONLY_DATABASE_URL='postgresql://...' npm run export:coach-snapshots
```

The exporter writes:
- `services/gemini-agent/data/knowledge-bep-coach.json`
- `services/gemini-agent/data/reasoning-bep-coach.json`

It stages both files in a temporary directory and swaps the snapshot directory atomically. If export, validation, or publication fails, the last known-good directory is retained.

## Snapshot contents and provenance

- Knowledge is read from active rows in `bep_financial_knowledge`, merged with approved overlays only when `source_version` and `source_digest` match the current source. A matching inactive overlay suppresses its source document. Stale/orphan overlays are ignored.
- The exporter deliberately omits `approved_by` and all user-specific data.
- Reasoning scenarios, guardrails and regression cases currently remain sourced from the versioned repository rule files because no PostgreSQL reasoning table is defined in the inspected schema. Their provenance is explicitly labelled as repository rules, not database-exported data.

## Gemini endpoints

- `GET /api/health`
- `GET /api/knowledge`
- `GET /api/reasoning`

All other HTTP methods are rejected. Do not add database access or JSON-to-database ingestion.

## Deployment gate

The exporter implementation does not authorize deployment, live database access, automatic scheduling, Render changes, or publication to a running service. Those require separate approval. Do not use the Git-source placeholder builder as a production synchronization mechanism.
