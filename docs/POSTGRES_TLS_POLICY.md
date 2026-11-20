# PostgreSQL TLS policy

The API derives its PostgreSQL transport policy from the Render connection URL:

- Internal Render connection strings omit `sslmode` and use Render's private network without TLS.
- External Render connection strings include `sslmode=require`; the Node PostgreSQL client uses TLS and validates the server certificate against Node's system trust store.
- Explicit `disable`, `prefer`, or unknown modes are rejected instead of silently weakening the connection.

Render documents that external PostgreSQL connections require TLS and use Render-managed certificates. Render's internal private-network connections do not require TLS.

The policy is covered by `tests/bep-postgres-ssl.test.js`. Runtime verification against production is still required after confirming which connection-string form is configured in Render. Do not change production environment variables or deploy until that verification is complete.
