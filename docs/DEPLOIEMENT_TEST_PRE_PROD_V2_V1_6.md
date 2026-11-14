# BEP V1.6 — Déploiement test pré-prod V2

Date: 2026-11-14

## Parent snapshot
- V1.5 backup commit: 320f57a9032b702839ac8f11ccfe78c68290618d
- Source implementation commit: e7f8102c2033be15c67cb6e4b170a72c2db28852
- Production rollback reference: 5cae41acdafbc602041b34fb41a77cbcee61a8dd

## Purpose
Dedicated Render test deployment of the V2 codebase. This branch must not be merged into main as part of the test deployment.

## Isolation guarantees intended for this test
- New Render API and static frontend services only.
- No production DATABASE_URL, OAuth secrets, session secret, email secret, or Gemini key copied.
- No production database connection or schema migration.
- Gemini supervisor remains disabled because its explicit activation gates and dedicated secrets are not configured.
- No production service configuration is changed.

## Scope and limitations
This deployment is a code/build/startup smoke test only. Without an isolated test database and test-only credentials, authenticated workflows, persistence, migrations, Coach integration, and Gemini worker behavior are not validated.
The API health endpoint may report databaseConfigured=false and databaseReady=false; that is expected for this isolated smoke test and is not a full application readiness signal.

## Deployment status
Branch created from the V1.5 snapshot. Render deployment and runtime verification are recorded separately after the services are created and checked.
