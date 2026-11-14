# BEP Gemini peripheral JSON service

This service is deliberately separate from the BEP application runtime.

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

The startup build reads the checked-in BEP source files and regenerates the JSON snapshots. Updating the source knowledge in Git and deploying this service refreshes the snapshots. A scheduled production-to-service JSON export is a separate future integration; it must use a controlled, read-only export of approved general knowledge only.
