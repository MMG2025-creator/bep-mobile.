# BEP Gemini peripheral JSON service

This service is separate from the BEP application runtime. Its binding data-flow contract is documented in [DATA_FLOW_CONTRACT.md](./DATA_FLOW_CONTRACT.md).

## Data boundary

The PostgreSQL shared knowledge corpus is the source of truth. The permitted flow is:

`BEP PostgreSQL (SELECT only) -> trusted BEP exporter -> versioned JSON snapshots -> Gemini GET endpoints`

JSON -> PostgreSQL is prohibited. Gemini has no PostgreSQL dependency, connection pool, database credential, or import/write-back capability.

The trusted exporter runs only in the BEP repository environment. It requires the dedicated PostgreSQL identity `bep_knowledge_exporter` with SELECT on exactly `public.bep_financial_knowledge` and `public.bep_agent_approved_knowledge`. The role was provisioned and its six write privileges on those two tables were independently verified as false.

Configure `BEP_KNOWLEDGE_READONLY_DATABASE_URL` only as a GitHub Actions repository secret for the trusted exporter workflow, never in Gemini, Render, source files, or workflow logs. Add the secret through the repository's Settings > Secrets and variables > Actions interface. Do not paste the connection string into issues, commits, or chat.

Before any knowledge SELECT, the exporter runs a read-only catalog preflight and fails closed unless the identity has:
- no superuser, create-role, create-database, replication or bypass-RLS attributes, including inherited role attributes;
- no database CREATE or non-system schema CREATE privilege;
- SELECT and no write/trigger/reference privilege on exactly the two approved tables;
- no other application relation or sequence access.

## Controlled manual export

The workflow `.github/workflows/bep-gemini-snapshot-export.yml` is manually triggered only and is restricted to `feature/gemini-peripheral-json-service-v1`.

After the repository secret `BEP_KNOWLEDGE_READONLY_DATABASE_URL` has been configured:
1. Open the repository's Actions tab.
2. Select **BEP controlled Gemini snapshot export**.
3. Select **Run workflow** on branch `feature/gemini-peripheral-json-service-v1`.
4. Inspect the run result and its role-preflight/export summary.

The workflow:
- installs dependencies without lifecycle scripts or lockfile changes;
- runs the exporter-role preflight;
- runs the exporter, which uses `BEGIN READ ONLY` and exactly two SELECT statements;
- validates the snapshot schemas and field allowlist;
- commits only `services/gemini-agent/data/knowledge-bep-coach.json` and `services/gemini-agent/data/reasoning-bep-coach.json` to the same dedicated branch;
- does not deploy, schedule recurring exports, or write to PostgreSQL.

The workflow requires the repository's GitHub Actions token to have Contents write permission for that branch. If branch protection blocks the push, the run fails without bypassing branch protection; publish the validated files through the normal reviewed Git workflow instead.

The exporter's publication uses staging and rollback-capable directory renames; those renames are not one filesystem-atomic exchange and briefly leave the destination path absent. A failed export preserves the last known-good snapshot files.

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

## Deployment boundary

The manual export workflow does not deploy or publish to the running Gemini service. Render configuration, branch changes, service deployment, recurring scheduling, and production publication remain separate operations requiring explicit owner authorization. The existing Render Gemini test service must be verified against this branch and these snapshot paths before any deployment change.
