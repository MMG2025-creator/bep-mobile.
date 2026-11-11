# BEP email service (Google Apps Script)

This folder contains the deployable source for the transactional email bridge used by the BEP API.

## Supported messages

- `email_verification`: sends the existing six-digit registration code.
- `password_reset`: sends a branded HTML email with a clickable **Choisir un nouveau mot de passe** button and a plain-text fallback link.

The API sends the following JSON fields: `secret`, `email`, `code`, `type`, `resetUrl`, and `subject`. For password resets, the API currently sends the same reset URL in `code` and `resetUrl` for compatibility. The Apps Script ignores a client-provided subject and chooses a fixed subject from the message type.

## Deploy the source

1. Open [Google Apps Script](https://script.google.com/) and create a dedicated project named **BEP Transactional Mailer**.
2. Copy the complete contents of [Code.gs](./Code.gs) into the Apps Script editor.
3. In **Project Settings → Script Properties**, add:
   - `BEP_MAIL_SECRET`: the exact same random secret as the Render environment variable `BEP_MAIL_SECRET`.
4. In **Project Settings**, confirm the project uses the V8 runtime.
5. Select **Deploy → New deployment → Web app**:
   - Execute as: **Me**.
   - Who has access: **Anyone** (the handler authenticates every request with the shared secret).
6. Authorize the requested Gmail permissions and deploy.
7. Copy the deployed Web App URL (ending in `/exec`) into the Render API service environment variable `GMAIL_APPS_SCRIPT_URL`.
8. Confirm Render has `BEP_MAIL_SECRET` set to the same value as the Apps Script property, then restart/redeploy the API service.
9. If the public BEP frontend hostname changes, update the strict hostname allowlist in `isAllowedResetUrl_` before deploying a new Apps Script version.

## Security properties

- The shared secret is stored in Script Properties and is never committed to Git.
- Reset links are accepted only over HTTPS, for the configured BEP frontend hostname, with a 64-character hexadecimal token.
- The API stores only a SHA-256 token hash; the raw token is delivered only in the email URL.
- Reset tokens expire after 30 minutes and are single-use (enforced by the API/database).
- HTML values are escaped before insertion into the message.
- The endpoint does not return the submitted email address or reset URL.

## Verification checklist

- [ ] Deploy the Apps Script Web App and configure the Render URL/secret.
- [ ] Send a registration verification code to a controlled test inbox.
- [ ] Request a password reset for a controlled BEP test account.
- [ ] Confirm the email subject is **Réinitialisation du mot de passe BEP**.
- [ ] Confirm the button and fallback URL both open the BEP reset form.
- [ ] Complete the reset, then confirm the old password fails and the new password works.
- [ ] Confirm a second use of the same link fails.
- [ ] Confirm a link older than 30 minutes fails.
- [ ] Confirm an unknown email receives the same public API response as a known email.

**Important:** committing this source does not deploy it to Google Apps Script. The real email flow becomes operational only after the Web App is deployed and its URL/secret are configured in Render, then tested end-to-end.
