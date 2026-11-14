# BEP V1.6 — Déploiement test pré-prod V2

Date: 2026-11-14

## Parent snapshot
- V1.5 backup commit: 320f57a9032b702839ac8f11ccfe78c68290618d
- Source implementation commit: e7f8102c2033be15c67cb6e4b170a72c2db28852
- V1.6 deployment-test commit: 40cc10b9b5e72394a3c649ef119993e3a45a1bbb (deployment source)
- Production rollback reference: 5cae41acdafbc602041b34fb41a77cbcee61a8dd

## Render test services
- API: https://bep-v1-6-preprod-v2-api-test.onrender.com
  - Service ID: srv-dbs5eomc6qcc7387jcu0
  - Current deployment: dep-dbs5es3o00dc73c2q64g — live
- Frontend: https://bep-v1-6-preprod-v2-frontend-test.onrender.com
  - Service ID: srv-dbs5eqmi0phs73c5tr7g
  - Deployment: dep-dbs5equi0phs73c5trn0 — live
- Both services track this V1.6 branch with autoDeploy disabled.
- API CORS origin points only to the V1.6 test frontend.
- API has BEP_AGENT_ENABLED=false. No Gemini credentials or production secrets were copied.

## Isolation guarantees
- New Render API and static frontend services only.
- No production DATABASE_URL, OAuth secrets, session secret, email secret, or Gemini key copied.
- No production database connection or schema migration.
- Gemini supervisor explicitly disabled.
- No production service configuration changed.
- V1.5 backup and production main remain untouched.

## Runtime checks
- API build: SUCCESS (npm install; 0 vulnerabilities reported by npm audit).
- API process: STARTED; logs show "BEP V2 server listening".
- API deployment: LIVE.
- Gemini: DISABLED as intended; log reports "BEP Gemini supervisor disabled: BEP_AGENT_ENABLED is not true".
- Frontend deployment: LIVE.
- Browser check: frontend rendered title "BEP — Build, Earn & Preserve" and dashboard UI; no visible browser errors.
- API health browser check: returned {"error":"RATE_LIMIT_UNAVAILABLE"} because no DATABASE_URL/pool is configured; the rate limiter requires the database before the health route is reached.
- The API is therefore deployed and booting, but is NOT functionally ready. Auth, persistence, database migrations, Coach flows, and full integration are not validated.

## Database blocker
- No database was created or attached.
- Render rejected creation of another Free PostgreSQL instance because the workspace already has an active Free-tier database.
- Existing database "bep-test-db" was identified, but its IP allowlist is empty and read-only inspection was blocked. It was not connected or modified.
- A paid isolated database would require explicit cost approval. Do not connect the production database.

## Scope and limitations
This is an isolated code/build/startup deployment smoke test only. It is not a certified pre-production environment and not a production release. The V2 architecture remains incomplete: durable scheduler, source registry/provenance, deterministic validators, synthetic tests against the real Coach service, cost accounting/kill switch, and human approval/rollback workflow remain blockers.

## Next required step
Obtain approval to use the existing bep-test-db (after confirming its contents/ownership) or to provision a separate paid test database. Then configure test-only credentials, run migrations only against that isolated database, and execute automated plus end-to-end tests before considering production.
