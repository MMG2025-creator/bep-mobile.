# BEP — Journal de triage étendu des branches fusionnées
Date : 20 novembre 2026
Branche de travail documentaire : `audit/pre-cleanup-inventory-20261120`

## Méthode
Pour chaque PR examinée : lecture de l'état fusionné, vérification de la branche source et de son SHA, comparaison de la tête de branche à `main`. Une branche avec `ahead > 0` est conservée, car elle contient des commits qui ne sont pas présents dans l'historique de `main` selon cette comparaison. Une PR fusionnée n'est pas, à elle seule, une preuve de redondance.

## Décision positive — candidates A
- PR #316 `fix/coach-only-on-coach-tab` : ahead 0 / behind 2.
- PR #315 `fix/pwa-cache-invalidation-v27` : ahead 0 / behind 11.
- PR #290 `fix/multi-device-session-sync` : SHA `31dc21dee35eab95b0468a86bb2a2bc45ab16f33`, PR fusionnée, ahead 0 / behind 45. SHA de l'inventaire et SHA de tête de PR identiques ; aucun service Render rattaché lors du contrôle.

Les trois restent des candidates à suppression contrôlée, pas des suppressions exécutées. Le SHA doit être revérifié au dernier instant avant suppression.

## Branches examinées et conservées — historique divergent
| PR | Branche | Ahead | Behind |
|---:|---|---:|---:|
| #305 | `feat/coach-ergonomic-workspace-20261119` | 13 | 29 |
| #304 | `fix/coach-robot-cache-refresh-20261119` | 10 | 30 |
| #303 | `fix/coach-mobile-visual-continuity-20261119` | 6 | 31 |
| #302 | `feat/coach-conversation-first-layout-20261119` | 11 | 32 |
| #301 | `fix/coach-form-vertical-layout-20261119` | 7 | 33 |
| #300 | `fix/homepage-welcome-pills-horizontal-20261119` | 7 | 34 |
| #299 | `fix/coach-prompt-input-visible-20261119` | 6 | 35 |
| #298 | `feat/coach-chat-first-faq-modal-objectives-20261119` | 9 | 36 |
| #297 | `feat/coach-two-tabs-objectives-before-chat-20261119` | 14 | 37 |
| #296 | `fix/coach-explorer-hidden-on-entry-20261119` | 7 | 38 |
| #295 | `fix/coach-explorer-hide-all-themes-20261119` | 6 | 39 |
| #294 | `feat/coach-explorer-expand-collapse-all-20261119` | 6 | 40 |
| #293 | `feat/coach-explorer-accordion-answer-modal-20261119` | 16 | 41 |
| #292 | `feat/admin-coach-knowledge-editor-20261119` | 21 | 42 |
| #291 | `fix/coach-mobile-navigation-clean-20261119` | 14 | 43 |
| #289 | `fix/api-readiness-healthcheck-20261119` | 4 | 68 |
| #286 | `feature/coach-guided-exploration-20261118` | 29 | 69 |
| #284 | `fix/coach-local-budget-vs-actual-explanation` | 3 | 70 |
| #283 | `fix/coach-relevance-intent-precision-v2` | 10 | 71 |
| #281 | `fix/coach-no-false-zero-and-relevance` | 3 | 72 |
| #280 | `fix/coach-local-fallback-understands-intent` | 2 | 73 |
| #279 | `fix/coach-contextual-conversation` | 8 | 74 |
| #278 | `feature/coach-page-context-layer-20261118` | 4 | 75 |
| #277 | `improve/coach-knowledge-relevance-20261118` | 4 | 76 |
| #276 | `feat/admin-article-accordion-import-cleaning` | 17 | 77 |
| #274 | `fix/bep-admin-super-admin-allowlist-20261118` | 3 | 78 |
| #273 | `feat/bep-financial-knowledge-20-20261118` | 10 | 79 |
| #272 | `feat/admin-auth-loader-20261118` | 3 | 80 |
| #271 | `feat/admin-menu-logout-cache-20261118` | 5 | 81 |
| #269 | `fix/admin-independent-session-flow` | 5 | 82 |
| #266 | `feature/admin-navigation-menu` | 2 | 83 |
| #265 | `feature/bep-knowledge-56-candidates` | 4 | 84 |
| #264 | `fix/bep-coach-json-import-rebased-20261118` | 12 | 85 |
| #262 | `feature/bep-document-ingestion-no-ai` | 15 | 86 |

## Autres exclusions
La branche de rollback #314 reste exclue des opérations automatiques, même si sa PR est fusionnée. Les branches de PR ouvertes, les branches attachées à un service Render, les sauvegardes, les branches d'archive et les branches de release ne sont pas candidates.

## Limite d'exécution
L'intégration GitHub disponible n'expose pas d'action de suppression de branche/ref. Aucune suppression ne sera simulée par déplacement de ref ou suppression de fichiers. Il faut une capacité GitHub de suppression de branche explicite pour réaliser le lot A.

## Garde-fous confirmés
- `main` observé : `ec4f073e8c00a8b820b270bf308109037ec42cb2`.
- Frontend Render LIVE vérifié : déploiement `dep-dbvioaafngtc73cdh9d0`, même SHA.
- Aucun déploiement ni changement de service, base de données ou secrets.
