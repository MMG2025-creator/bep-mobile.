# BEP — Local Financial Coach Engine

## Architecture decision
The local coach is a deterministic, explainable decision engine. It is not a language model and must not pretend to be one. It combines:
1. text normalization and entity extraction;
2. intent and scenario detection;
3. financial profile construction from confirmed facts;
4. amount/time/household contextualization;
5. prioritized rule evaluation;
6. deterministic calculations;
7. response composition from reusable blocks;
8. source, freshness and confidence controls.

## Runtime pipeline
`message -> tokens -> entities -> intents -> missing_facts -> profile -> scenarios -> cross_signals -> priority -> calculations -> advice_blocks -> response`

No network call is required. The source registry documents where facts come from; volatile legal/tax/rate data must be refreshed and versioned before being used as current.

## Required modules
- `tokenizer.js`: amount, currency, period, date, frequency, intent, urgency and sentiment extraction.
- `profileStore.js`: normalized household financial snapshot; provenance per fact (user-entered/imported/calculated), timestamp and confidence.
- `scenarioMatcher.js`: multi-label matching; one utterance can trigger several scenarios.
- `ruleEngine.js`: priority ordering, conditions, exclusions, confidence and conflict resolution.
- `financialMath.js`: pure functions with unit/period validation and tests.
- `responseComposer.js`: templates, variable slots, explanation, next actions and source display.
- `knowledge/financialCoachKnowledge.fr.js`: stable scenario and decision knowledge.
- `knowledge/financialCoachSources.fr.json`: official sources and refresh policy.
- `knowledge/financialCoachFacts.fr.json`: dated facts only (rates, thresholds, ceilings, benefit parameters); each fact must have validFrom, validUntil, checkedAt, sourceId and unit.
- `tests/coach-cases.fr.json`: regression cases.

## Amount intelligence
A nominal amount is never interpreted alone. Evaluate:
- amount and currency;
- one-off vs recurring frequency;
- net/gross and monthly/annual period;
- amount as a share of monthly net income;
- impact on cash available before next income;
- upcoming direct debits and due dates;
- liquid reserve after the action;
- debt rate, fees and legal/essential consequences;
- household size, dependants and income volatility.

The amount bands in the knowledge file are routing hints, not financial affordability thresholds. An amount of €30 can be critical if repeated daily or if the account is overdrawn; €8,000 can be affordable for one household and dangerous for another.

## Token and entity model
Each extracted entity should retain:
`{ type, normalizedValue, rawText, unit, period, frequency, confidence, sourceSpan }`.
Do not discard original user text. Do not silently convert gross to net. For ambiguous expressions (e.g. “1,5” with no currency/context), ask one targeted clarification.

## Rule record contract
A production rule should include:
`{ id, version, domain, when, unless, requiredFacts, priority, severity, actions, explanation, sourceIds, validFrom, validUntil, confidence, testIds }`.
Rules must be composable and idempotent. Conflicting rules are resolved by priority, then specificity, then source reliability; unresolved conflicts require clarification.

## Response contract
Each answer should:
- restate the actual financial issue briefly;
- show the key calculation and assumptions;
- distinguish confirmed facts from estimates;
- give 1–3 ordered actions, scaled to urgency;
- explain what not to do when a material risk exists;
- cite official sources for legal/tax/rate assertions;
- ask at most one question if a missing fact changes the recommendation.

## Safety and boundaries
- Never recommend borrowing as the default answer to a recurring deficit.
- Never treat a credit limit as income or savings.
- Never advise risky investment of money required for essentials or short-term goals.
- Never promise returns or infer guaranteed eligibility for public benefits.
- For eviction, enforcement, seizure, limitation, tax litigation, family obligations or legal deadlines, request exact documents/dates and refer to official/professional support.
- Fraud in progress: stop transfers, contact the bank via official contact details, secure access, preserve evidence.
- Essential-needs distress: prioritize food, housing, energy, access to rights and free human support (Point Conseil Budget, CCAS, Banque de France as appropriate).
- Minimize personal data; never ask for passwords, full card numbers, SMS codes or bank credentials.

## Validation plan
Unit tests:
- parsing French number formats and words;
- distinguishing amount from date, percentage, monthly payment and annual amount;
- annualizing recurring small costs;
- period alignment and zero/missing values;
- cash available before next confirmed income;
- negative cashflow and arrears priority;
- high-cost debt vs savings comparison;
- investment gating when emergency reserve is absent;
- source expiry and missing source fail closed;
- multiple simultaneous scenarios;
- response confidence and clarification behavior.

Regression examples:
1. “Il me reste 80 € jusqu'au 28 et 45 € de prélèvements” => determine safe remaining amount only after confirming essential food/transport and dates.
2. “Je dépense 12 € par mois en applis” => annualized €144, audit recurring use; don't overstate urgency.
3. “J'ai 400 € de découvert et 2 crédits” => cashflow/debt triage; no new loan by default.
4. “Je gagne 2 000 €, loyer 850 €, crédits 430 €” => calculate ratios only after defining net income and charges included; do not declare a universal safe ratio.
5. “J'ai reçu 30 000 €” => ask net/tax status, urgent debt, horizon and purpose before recommending allocation.
6. “Je veux investir 500 € en crypto alors que mon loyer est en retard” => essentials and arrears override investment.
7. “J'ai 50 € de côté, comment commencer ?” => small sustainable savings plan, no shame or arbitrary minimum.
8. “Je peux rembourser 5 000 € de crédit ?” => compare rate, emergency liquidity, fees and contractual terms.
9. “Un conseiller me demande un code SMS pour débloquer 10 000 €” => critical fraud response.
10. “Je n'arrive plus à payer mon loyer et mes crédits” => essential needs and human support; evaluate overindebtedness information, not investment.

## Current status
Knowledge v1 and source register v1 are initial foundations, not an exhaustive finished product. The next implementation pass must add dated fact tables, detailed scenario packs (housing, energy, insurance, family, mobility, healthcare, tax, savings, investment, fraud, life events), tokenizer, rule execution, composer and automated regression tests. Do not label the coach “AI” or “expert” until the test suite and coverage review justify the claim.
