# BEP external AI exchange — schema v1

## Purpose
The exchange is a separate, human-mediated workflow. It does not use an AI API and does not alter the encrypted .bep backup format.

## Export
- File: bep-bilan-ia-v1.json
- Format: UTF-8 JSON, schema=bep-coach-exchange, schema_version=1
- Contains an aggregated financial snapshot only.
- Does not export names, email addresses, account IDs, free-text labels, merchant names, transaction descriptions, or individual transaction rows.
- Currency is EUR. Values are supplied as facts from the BEP local state, not estimates.

## Provider instructions
The UI provides separate instruction text for ChatGPT, Gemini, Claude, Mistral and generic assistants. The external assistant must return JSON only:
- source=external_ai
- recommendations[]
- knowledge_updates[]
- financial_analysis is informational only and is not stored as financial truth.

## Import allowlist
Only recommendations and reusable coaching knowledge are accepted. The importer ignores all other properties, including any changed income, expenses, balances, envelopes, goals, or transactions.
- Max file size: 1 MiB.
- Max 50 items of each type.
- Text fields are length-limited and HTML-escaped on display.
- Confidence is constrained to low/medium/high.
- Category and priority are allowlisted.
- Imported content is stored per authenticated user in bep_user_coach_knowledge.
- Unique key (user, external ID, kind) prevents repeated imports of the same item.
- Imported content is not executable and cannot add rules or code to the deterministic engine.

## Privacy and encryption
- This exchange file is intentionally readable by an external AI and is NOT a backup.
- Never upload the encrypted BEP backup, its passphrase, account credentials, or API keys to an AI provider.
- The existing encrypted backup controls and format are kept separate and untouched by this feature.
- No external provider is called by BEP. The user manually uploads/downloads files with the AI provider.

## Current rollout boundary
Imported knowledge is persisted and displayed in the user's private coaching library. It is not yet automatically promoted to shared/global rules or injected into deterministic advice. That requires a separate review and regression-test stage before activation.
