# BEP Knowledge Engine — architecture v1

## Principle
BEP's financial calculations remain deterministic and authoritative. The AI can suggest declarative knowledge, but it cannot change calculations, write executable code, or publish rules automatically.

## Lifecycle
1. AI proposes a rule in a strict JSON schema.
2. The backend validates its type, bounds, wording and provenance.
3. Proposal is stored as `pending`; it has no effect on advice.
4. A user/admin explicitly approves it.
5. The local evaluator runs only active rules against current numeric context.
6. Every rule is versioned, attributable and can be disabled.

## Privacy
Never store personal financial context, raw transactions, names, account identifiers, prompts or model responses in the reusable knowledge base. Store only generalized rule metadata and a short rationale. Proposals are scoped to the account until an explicit governance process promotes them to shared rules.

## Initial allowlist
- `expense_ratio`: charges / income, threshold 0–1.5.
- `savings_rate`: available / income, threshold 0–0.8.
- `monthly_buffer`: available cash amount, threshold 0–100000.

No arbitrary JavaScript, SQL, expressions, external URLs or free-form formulas are accepted.

## Release gates
Unit tests, deterministic fixture tests, financial regression tests, privacy review, rule provenance and rollback test must pass before rules are enabled in production.
