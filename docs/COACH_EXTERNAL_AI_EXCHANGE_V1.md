# BEP external AI exchange — schema v1

## Purpose
A manual, user-controlled exchange with ChatGPT, Gemini, Claude, Mistral or another external AI. BEP does not call an external AI API and does not alter the encrypted .bep backup format.

## Export
One click downloads two files:
- `bep-bilan-ia-v1.json`: anonymized, aggregated financial snapshot and immutable-facts contract.
- `bep-prompt-conseiller-financier-<provider>.txt`: provider-specific, autonomous one-pass mission prompt.

The prompt assigns the role of a firm, precise personal-finance coach; requires a complete data check, financial diagnosis, grounded recommendations and reusable coaching knowledge; forbids intermediate questions and requires generation of `bep-coach-retour-v1.json`. If the provider cannot create attachments, it must return the complete raw JSON as a fallback. The prompt explicitly distinguishes facts, uncertainty and missing data, and prohibits inventing or rewriting financial facts.

The snapshot excludes direct identifiers, free-text labels, merchant names, transaction descriptions and individual transaction rows. It is readable and may contain amounts; it is not the encrypted .bep backup.

## Import contract
The returned file must use:
- schema = `bep-coach-exchange`
- schema_version = `1`
- source = `external_ai`
- provider, model
- financial_analysis.summary and financial_analysis.observations[]
- recommendations[]
- knowledge_updates[]

Recommendations and knowledge use the allowlisted categories, confidence and priority values described in the prompt. The importer stores only recommendations and knowledge; financial_analysis remains informational and financial data returned by the external AI is ignored.

## Import safeguards
- Max file size: 1 MiB.
- Max 50 recommendations and 50 knowledge items.
- Text fields are length-limited and HTML-escaped on display.
- Confidence, category and priority are allowlisted.
- Imported content is stored per authenticated user in `bep_user_coach_knowledge`.
- Unique key (user, external ID, kind) prevents repeated imports of the same item.
- Imported content is not executable and is not automatically injected into deterministic advice.

## Privacy and encryption
Never upload the encrypted BEP backup, its passphrase, account credentials or API keys to an external AI. No external provider is called by BEP; the user manually uploads and downloads files.

## Rollout boundary
Imported content is persisted in the user's private coaching library and remains pending validation. It is not automatically promoted to shared/global rules or injected into deterministic advice.
