# BEP — Triage complémentaire des PR fusionnées #261 à #243
Date : 20 novembre 2026
Branche d'audit : `audit/pre-cleanup-inventory-20261120`

Les PR listées ci-dessous sont fusionnées. Leurs branches ont été comparées à `main`. Chaque branche a un ou plusieurs commits en avance sur `main` : elles sont conservées, sans suppression automatique.

| PR | Branche | Ahead | Behind |
|---:|---|---:|---:|
| #261 | `feat/bep-coach-source-registry` | 2 | 93 |
| #260 | `fix/bep-coach-staging-cors-20261117` | 1 | 94 |
| #259 | `fix/bep-coach-reuse-existing-gemini-key` | 4 | 95 |
| #258 | `feat/bep-coach-50-source-batch` | 6 | 96 |
| #255 | `fix/gemini-503-retry-diagnostics-20261116` | 5 | 97 |
| #254 | `fix/manual-ingestion-dns-lookup-20261116` | 2 | 98 |
| #253 | `feat/manual-source-ingestion-v2-20261116` | 14 | 99 |
| #251 | `fix/gemini-search-interactions-api-20261116` | 11 | 100 |
| #250 | `feat/admin-gemini-ops-visibility-20261116` | 8 | 101 |
| #249 | `fix/coach-grounding-quota-metering` | 23 | 104 |
| #248 | `fix/gemini-free-tier-activation` | 7 | 105 |
| #247 | `feat/coach-document-library-explorer` | 5 | 106 |
| #246 | `feat/integrate-coach-research-admin` | 13 | 107 |
| #244 | `fix/gemini-agent-independent-admin-auth` | 2 | 108 |
| #243 | `fix/admin-pseudonymized-aggregate-view` | 6 | 109 |

## Interprétation
Le fait qu'une branche soit très en retard sur `main` ne prouve pas qu'elle est inutile. Les commits en avance peuvent contenir du travail historique non repris par le merge, notamment des contenus, tests, configurations ou scripts. Ces branches restent à examiner avant toute suppression.

## État des lots
Le lot A validé techniquement reste constitué de trois branches : #316, #315 et #290. Aucune suppression n'a été exécutée. La capacité GitHub de suppression de branche n'est pas disponible dans les actions connectées.

## Garde-fous
Aucun changement de `main`, Render, production, PostgreSQL ou secrets. Ce document est uniquement un journal d'audit.
