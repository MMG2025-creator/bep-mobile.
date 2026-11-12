# BEP Coach — preproduction setup

## Services
- Frontend: https://bep-coach-staging.onrender.com
- API: https://bep-coach-staging-api.onrender.com
- Both services deploy from `feature/financial-intelligence-engine`.
- The existing savings preproduction services are not changed.

## Required API environment
Set these values on the `bep-coach-staging-api` Render service, Environment page:
- `DATABASE_URL`: Internal Database URL of the dedicated `bep-preproduction-db` Render PostgreSQL instance. Do not use the production database.
- `SESSION_SECRET`: Generate a new secret in Render; do not reuse production's session secret.
- `FRONTEND_ORIGIN`: `https://bep-coach-staging.onrender.com` (already configured).
- `BEP_FINANCIAL_INTELLIGENCE_ENABLED`: `true` (already configured).
- `BEP_AI_PROVIDER`: `gemini` (already configured).
- `BEP_AI_MODEL`: `gemini-2.5-flash` (already configured).
- `BEP_AI_API_KEY`: Gemini API key for the staging service. Enter it directly in Render; never commit it or send it in chat.
- `GMAIL_APPS_SCRIPT_URL` and `BEP_MAIL_SECRET`: required if testing email verification and password reset. Enter them directly in Render; do not commit or share them in chat.

Google OAuth is optional. If enabled, configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI=https://bep-coach-staging-api.onrender.com/api/auth/google/callback`, and add that exact callback URL to the Google OAuth client.

## Validation gates
1. Confirm `GET /api/health` reports `databaseConfigured: true` and `databaseReady: true`.
2. Confirm the knowledge table contains the 10 seeded records.
3. Test sign-in and one test account with synthetic data only.
4. Confirm `GET /api/ai/status` reports mode `bep` and financialIntelligence.enabled `true`.
5. Exercise chat, module advice, monthly history and accepted/rejected personal knowledge.
6. Verify account isolation and confirm the existing savings staging URL still serves the savings branch.

## Safety
The engine reads financial context and accepted knowledge; it does not write or mutate budgets, goals, expenses, savings operations, or closed monthly snapshots. No production URL, database, branch, or environment variable is used by these services.
