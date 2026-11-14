# BEP module boundaries

This refactor keeps the shared application core intact while moving feature assets behind explicit loading boundaries.

## Current loading map

| Feature | JavaScript | CSS | Activation |
|---|---|---|---|
| Authentication | `auth-page.js`, `auth-recovery.js` | `auth-page.css` | Initial page |
| Core financial state, navigation, budget, savings logic, charts and coach | `app.js` | `styles.css`, `ui-polish.css` | Initial page |
| Purchases | `spend-clean-ui.js`, `spend-experience.js` | `spend-clean-ui.css`, `spend-experience.css` | First click on Purchases |
| Monthly budget history | `monthly-budget-ui.js` | `monthly-budget-ui.css` | First click on Monthly budgets |
| Savings presentation | Existing savings logic in `app.js` | `savings-ui.css` | First click on Savings |
| Receipt OCR engine | `receipt-ocr.js` | — | First receipt processing |

## Integration contracts

- `lazy-load.js` is loaded before `app.js` and exposes `window.BEPLoadModule(name)`.
- The monthly-budget module is loaded after the core application. It relies on `BEP_API_BASE`, `BEPFinancialEngine`, `BEP_APPLY_MONTHLY_ITEMS`, and the shared authentication/state lifecycle events.
- The purchase experience is an enhancement over the core purchase form and shared purchase state. Its scripts initialize immediately when dynamically loaded after `DOMContentLoaded`.
- Receipt processing requests the OCR module before accessing `window.BEPReceiptOCR`.
- Feature CSS is scoped to its owning panel: `#purchases`, `#budget`, `#savings`, or `.auth-gate`.

## Deliberate remaining coupling

`app.js` still owns the shared state and several feature controllers. Budget income/charges, savings operations, charts, coach, bank statement import, and purchase capture still share this core. Moving those controllers into independent JavaScript modules requires an explicit dependency-injection/event-contract pass; mechanically cutting functions out of the current IIFE would risk state, offline synchronization, authentication, and PWA regressions.

## Verification

`tests/module-boundaries.test.js` checks asset ordering, lazy-load declarations, CSS scoping, dynamic initialization, and cross-module lifecycle contracts. These are static integration-contract checks; they do not replace browser-based functional tests against a running test environment.
