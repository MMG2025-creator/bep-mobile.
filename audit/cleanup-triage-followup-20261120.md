# BEP — Complément de triage des branches candidates
Date : 20 novembre 2026
Branche d'audit : `audit/pre-cleanup-inventory-20261120`

## Contrôles complémentaires
Les PR fusionnées #305 à #296 ont été rapprochées de leurs branches et comparées à `main`. Aucun service Render BEP n'utilise les cinq branches ci-dessous au moment du contrôle. Toutefois, leur historique diverge de `main` : elles ont des commits en avance et en retard. Elles ne sont donc pas candidates à une suppression automatique.

| PR | Branche | Ahead | Behind | Décision |
|---:|---|---:|---:|---|
| #305 | `feat/coach-ergonomic-workspace-20261119` | 13 | 29 | Lot B — conserver |
| #304 | `fix/coach-robot-cache-refresh-20261119` | 10 | 30 | Lot B — conserver |
| #303 | `fix/coach-mobile-visual-continuity-20261119` | 6 | 31 | Lot B — conserver |
| #302 | `feat/coach-conversation-first-layout-20261119` | 11 | 32 | Lot B — conserver |
| #301 | `fix/coach-form-vertical-layout-20261119` | 7 | 33 | Lot B — conserver |
| #300 | `fix/homepage-welcome-pills-horizontal-20261119` | 7 | 34 | Lot B — conserver |
| #299 | `fix/coach-prompt-input-visible-20261119` | 6 | 35 | Lot B — conserver |
| #298 | `feat/coach-chat-first-faq-modal-objectives-20261119` | 9 | 36 | Lot B — conserver |
| #297 | `feat/coach-two-tabs-objectives-before-chat-20261119` | 14 | 37 | Lot B — conserver |
| #296 | `fix/coach-explorer-hidden-on-entry-20261119` | 7 | 38 | Lot B — conserver |

## Conclusion sur le lot 01
Les deux branches candidates A restent les seules validées par les critères stricts disponibles :
- `fix/coach-only-on-coach-tab` — PR #316, ahead 0 / behind 2.
- `fix/pwa-cache-invalidation-v27` — PR #315, ahead 0 / behind 11.

Les branches #317 à #296 examinées et qui présentent des commits en avance sur `main` restent conservées. Un PR fusionné ne suffit pas à prouver qu'une branche est redondante : la fusion squash ou une histoire divergente peut laisser des commits uniques.

## Décision opérationnelle
Aucune suppression n'a été faite. Les deux branches du lot A sont prêtes pour une suppression contrôlée une fois l'action officielle de suppression de ref accessible. En l'absence de cette capacité, on ne simule pas une suppression avec un déplacement de ref.

## Production
Aucun changement à `main`, aucun changement de service Render, aucun déploiement, aucune migration ni modification de base de données.
