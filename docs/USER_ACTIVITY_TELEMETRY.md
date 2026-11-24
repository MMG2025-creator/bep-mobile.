# BEP authenticated activity telemetry

## Scope
This change measures real authenticated use of BEP, not account registrations, open browser tabs, anonymous visits, or session checks.

## Activity definition
A user is counted once per UTC calendar day when an authenticated request successfully loads `GET /api/data` or commits `PUT /api/data`. Health checks, authentication status, admin endpoints, static assets, polling/session checks, failed requests, and Coach-only telemetry do not count.

## Storage minimization
- One row per internal user ID and UTC date; the composite primary key deduplicates repeated activity.
- The table stores only the internal user ID, activity date, and latest activity timestamp.
- No email, IP address, user-agent, financial payload, endpoint history, or event body is stored.
- Account deletion cascades to activity rows.
- Rows older than 35 UTC calendar days are opportunistically pruned during activity writes.

## Metrics
The admin-only `GET /api/admin/dashboard/activity` endpoint returns:
- DAU: distinct users active on the current UTC calendar day.
- WAU: distinct users active during the current day and previous six UTC calendar days.
- MAU: distinct users active during the current day and previous 29 UTC calendar days.

The endpoint is independently protected by the BEP admin authentication middleware and sends `Cache-Control: no-store`. It returns aggregate counts only.

## Limitations and release gates
- No historical backfill: metrics begin when this code is deployed and the activity table exists.
- A successful data load or save is the defined proxy for meaningful use; this does not claim to measure every navigation or every interaction.
- Before production, review the user-facing privacy notice and lawful basis/retention wording. The 35-day cleanup is the configured technical retention period; the controller must still document and validate the applicable lawful basis and user-facing notice before production.
- Production remains blocked until unit/regression/security/browser checks, code review, merge approval, and explicit Render deployment verification are complete.
