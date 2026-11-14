# BEP Gemini peripheral JSON service

This service is separate from the BEP application runtime. Its binding data-flow contract is documented in [DATA_FLOW_CONTRACT.md](./DATA_FLOW_CONTRACT.md).

## Data boundary

The PostgreSQL shared knowledge corpus is the source of truth. The permitted flow is:

`BEP PostgreSQL (SELECT only) -> trusted BEP exporter -> versioned JSON snapshots -> Gemini GET endpoints`

JSON -> PostgreSQL is prohibited. Gemini has no PostgreSQL dependency, connection pool, database credential, or import/write-back capability.

The trusted exporter runs only in the BEP repository environment. It requires a dedicated PostgreSQL identity with SELECT on exactly `public.bep_financial_knowledge` and `public.bep_agent_approved_knowledge`.

Configure `BEP_KNOWLEDGE_READONLY_DATABASE_URL` only in that trusted exporter environment, never in Gemini. Before any knowledge SELECT, the exporter runs a read-only catalog preflight and fails closed unless the identity has:
- no superuser, create-role, create-database, replication or bypass-RLS attributes, including inherited role attributes;
- no database CREATE/TEMP or non-system schema CREATE privilege;
- SELECT and no write/trigger/reference privilege on exactly the two approved tables;
- no other application relation or sequence access.

Run the read-only privilege check:

```sh
BEP_KNOWLEDGE_READONLY_DATABASE_URL='postgresql://...' npm run check:coach-exporter-role
```

This command performs catalog SELECTs only. It does not create roles, grant privileges, or change schema/data. No role has been created or modified by this implementation.

Only after the check passes, the export command can be run:

```sh
BEP_KNOWLEDGE_READONLY_DATABASE_URL='postgresql://...' npm run export:coach-snapshots
```

The export itself uses `BEGIN READ ONLY` and exactly two SELECT statements. Its publication uses staging and rollback-capable directory renames; those renames are not one filesystem-atomic exchange and briefly leave the destination path absent.

## Snapshot contents

- Knowledge comes from active rows in `bep_financial_knowledge`, merged with matching approved overlays using the canonical BEP source fingerprint.
- Matching inactive overlays suppress their source; stale and orphan overlays are ignored.
- `approved_by` and user-specific data are excluded; exported document fields use a strict allowlist.
- Reasoning rules and regression cases remain versioned repository sources, not PostgreSQL exports.

## Gemini endpoints

- `GET /api/health`
- `GET /api/knowledge`
- `GET /api/reasoning`

All other HTTP methods are rejected. No database integration or JSON-to-database ingestion may be added.

## Deployment gate

This implementation does not authorize running the preflight against a live database, exporting real data, scheduling, Render changes, deployment, or publication to a running service. Each requires separate owner authorization. The Git-source placeholder builder is not a production synchronization mechanism.
