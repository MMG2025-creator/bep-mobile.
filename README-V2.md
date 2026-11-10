# BEP V2 setup
Backend: Express + PostgreSQL + Google OAuth 2.0.
Required Render environment variables:
- DATABASE_URL: PostgreSQL internal connection string
- GOOGLE_CLIENT_ID: Google OAuth Web client ID
- GOOGLE_CLIENT_SECRET: server-only OAuth secret
- GOOGLE_REDIRECT_URI: https://YOUR-APP-DOMAIN/api/auth/google/callback
- SESSION_SECRET: long random secret (32+ random bytes)
- NODE_ENV=production

Google Cloud Console OAuth client:
Authorized origin: https://YOUR-APP-DOMAIN
Redirect URI: https://YOUR-APP-DOMAIN/api/auth/google/callback

Never commit OAuth secrets. The browser must never receive GOOGLE_CLIENT_SECRET.
The API scopes all data by the verified Google subject stored in the server session. The frontend still needs the login UI and local-data migration/sync integration before the app can be considered fully multi-user.
