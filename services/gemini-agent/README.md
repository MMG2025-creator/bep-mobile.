# BEP Gemini peripheral JSON service

This service is deliberately separate from the BEP application runtime. Its binding data-flow contract is documented in [DATA_FLOW_CONTRACT.md](./DATA_FLOW_CONTRACT.md). The PostgreSQL shared knowledge corpus is the source of truth; the only permitted direction is database → read-only export → JSON snapshots → Gemini. JSON → database is formally prohibited until the project owner explicitly authorizes it in writing.

## Data boundary

- Reads versioned, general-purpose knowledge from repository source files.
- Generates two JSON snapshots at startup:
  - `data/knowledge-bep-coach.json`
  - `data/reasoning-bep-coach.json`
- Does not create a PostgreSQL pool, read environment database URLs, or access user accounts, sessions, conversations, or personal financial records.
- Does not write to BEP production or alter the Coach runtime.

## Snapshot endpoints

- `GET /api/health`
- `GET /api/knowledge`
- `GET /api/reasoning`

The endpoints expose only general BEP knowledge and reasoning rules. They are read-only.

## Render configuration

For the existing dedicated Gemini test service:

- Root Directory: `services/gemini-agent`
- Build Command: `npm install`
- Start Command: `npm start`
- Auto-Deploy: keep disabled until the pre-deployment checks are complete.

The service must be deployed from a branch containing this directory. Do not configure `DATABASE_URL` or any BEP production database credential on this service.

## Snapshot provenance and refresh

Important: the current Git-source snapshot builder is a development placeholder, not the production synchronization mechanism. The required database-to-JSON read-only exporter has not yet been implemented. Do not deploy this service as a synchronized Gemini knowledge source until that exporter is implemented and verified. Never add a JSON-to-database import path.
