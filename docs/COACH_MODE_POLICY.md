# BEP Coach — Product mode policy

Status: target behavior for the local financial coach rollout.
Branch: feature/local-financial-coach-engine

## Default experience
- The deterministic local financial coach is the default and always-on advice engine.
- Remove the user-facing activate/deactivate AI toggle from the advice area and all advice surfaces.
- Do not show an AI enabled/disabled badge or mode switch in the advice area.
- Advice must work without an external API key, network access, or paid inference.
- Local rules, calculations, and knowledge base are the baseline for every user.

## Optional advanced external AI connection
- Preserve external AI/API configuration for technically advanced users.
- Keep provider, endpoint/model (where supported), API key and connection test fields in a dedicated advanced settings area, not in everyday advice UI.
- Label it clearly as optional and advanced: "Connexion IA externe — avancé".
- Never require external AI to use BEP's coach.
- Never silently send financial data to an external provider. Connection and data-sharing must be explicit, with a clear notice explaining what data may be transmitted.
- Store credentials securely server-side where possible; never commit keys, expose them in client logs, or store raw keys in ordinary user profile records.
- If external AI is configured, it may enrich or formulate responses only under an explicit user-selected advanced setting. The local engine remains available as fallback.
- If API calls fail, time out, exceed quota, or return malformed output, fall back to local advice. Do not block financial advice.
- The local engine remains deterministic and auditable. External model output must not override safety priorities, legal-source freshness checks, or calculations without validation.

## Data and API contract
- Remove the shared aiCoachEnabled boolean from the normal advice flow.
- Replace it with an explicit advanced configuration state, e.g. externalAi.enabled, scoped to the account and defaulting to false.
- Distinguish:
  - local: local engine only (default)
  - external_assist: local rules/calculations plus external wording or supplementary reasoning, only when explicitly configured
- Do not call /api/ai/chat merely because a user is signed in or because a provider status endpoint says available.
- An external call is permitted only if the user explicitly enabled external assist, a provider is configured, and consent to transmit the relevant financial context is current.
- The local engine must answer all advice zones: home, budget, savings, expenses, post-purchase advice, and free-form coach chat.
- Advanced configuration can control optional external assist for those same zones; it must not create a second, inconsistent rules engine.

## Migration requirements
1. Remove activate/deactivate AI controls from all advice UI components.
2. Remove status badges and copy implying users must activate AI for advice to work.
3. Keep API/provider settings available in a dedicated advanced settings section.
4. Preserve API connection test and configuration flows for technically advanced users.
5. Default all existing accounts to local mode; do not auto-enable external AI during migration.
6. Preserve local fallback on any external failure.
7. Add tests proving every advice surface works with no API config and no external request is sent unless explicit advanced consent is present.
8. Update help text and privacy copy to explain local-first processing and optional external transmission.

## Acceptance criteria
- A new account can use all advice features without entering an API key.
- No AI activation toggle is visible in the advice page.
- External API fields remain accessible in advanced settings.
- A user without technical knowledge is never confronted with API configuration during normal use.
- A technically advanced user can configure and test an external provider.
- No financial context leaves the device/server for an external provider without explicit opt-in.
