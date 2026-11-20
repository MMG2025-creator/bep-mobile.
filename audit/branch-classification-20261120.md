# BEP — Audit de branches et sauvegarde pré-nettoyage
Date : 20 novembre 2026

## Périmètre et méthode
- Dépôt : `MMG2025-creator/bep-mobile.`
- Contrôle en lecture seule des références Git, pull requests, services Render et déploiements.
- Inventaire initial : 363 branches, SHA de `main` = `ec4f073e8c00a8b820b270bf308109037ec42cb2`.
- Une branche de sauvegarde additive a ensuite été créée : `backup/pre-cleanup-main-20261120`, pointant exactement sur ce SHA. Sa référence a été relue et vérifiée.
- Après cette création, le dépôt compte 364 branches : les 363 références de l'inventaire initial, plus cette sauvegarde.
- Aucun nettoyage, déplacement de ref, fusion, déploiement, changement de configuration ou accès aux données applicatives n'a été effectué.

## Classification initiale des 363 branches
| Préfixe | Nombre | Traitement recommandé à ce stade |
|---|---:|---|
| fix | 183 | Conserver jusqu'à rapprochement avec PR, tests et services Render |
| feature | 54 | Conserver jusqu'à rapprochement avec PR et intégrations |
| feat | 46 | Conserver jusqu'à rapprochement avec PR et intégrations |
| backup | 13 | Références de restauration ; ne jamais supprimer sans validation individuelle |
| release | 11 | Références de version ; conserver |
| work | 7 | Examiner individuellement ; conserver en attente |
| security | 4 | Conserver et auditer séparément |
| archive | 4 | Historique ; ne pas supprimer avant preuve de redondance |
| stable | 3 | Références de stabilité ; conserver |
| perf | 3 | Examiner individuellement |
| sans préfixe | 3 | Examiner individuellement |
| integration | 2 | Conserver jusqu'à vérification des intégrations |
| revert | 2 | Conserver comme références de retour arrière |
| autres préfixes (chore, ci, copy, deploy, deployment-test, docs, governance, hotfix, implementation, improve, qa, refactor, research, rollback, simulation, test, ui) | 28 | Examiner individuellement selon leur rôle et leur utilisation |
| **Total** | **363** | |

## Références de sécurité et de production
- `main` : `ec4f073e8c00a8b820b270bf308109037ec42cb2`.
- Sauvegarde pré-nettoyage : `backup/pre-cleanup-main-20261120` → même SHA exact.
- Référence V1.5 documentée dans Notion : `release/BEP-v1.5-pre-prod-v2-20261114` et `backup/BEP-v1.5-pre-prod-v2-20261114` → `320f57a9032b702839ac8f11ccfe78c68290618d`. Cette référence documentaire V1.5 est un jalon historique, pas le HEAD actuel de production.
- La page Notion « Référence officielle de production » contient une instruction de référence V1.5 stricte, alors que Render montre le frontend LIVE sur le SHA actuel de `main` (19 novembre). Cette divergence documentaire doit être arbitrée avant de fixer une cible de restauration ou une base de travail.
- Inventaire initial : `audit/pre-cleanup-inventory-20261120.json`.
- Pull requests ouvertes relevées : 40. Toute branche liée à une PR ouverte est exclue de tout lot de nettoyage jusqu'à clôture et vérification de l'état fusionné/abandonné.
- L'inventaire de branches indique `protected=false` pour les 363 refs inspectées et l'API Rulesets retourne une liste vide. La lecture du endpoint classique de protection de branche a été refusée par l'intégration (403) : la configuration complète des règles de protection n'est donc pas certifiée par ce contrôle.

## Visibilité du dépôt
Le dépôt GitHub est actuellement public. Les branches Git ne peuvent pas être rendues privées individuellement : la confidentialité est un réglage du dépôt entier. Aucune modification de visibilité n'a été réalisée. En conséquence, le code et les branches présents dans ce dépôt sont publiquement consultables.

## Render — inventaire sans modification
18 services Render rattachés au dépôt BEP ont été relevés, dont les services de production et plusieurs services de test/QA/staging. Les services de production frontend et API sont configurés sur `main` avec auto-déploiement désactivé. Plusieurs services non-production ont l'auto-déploiement activé, y compris certains attachés à `main` : ils devront être identifiés explicitement avant toute modification de `main` ou des services.

Déploiements consultés :
- Frontend `bep-mobile` : déploiement LIVE `dep-dbvioaafngtc73cdh9d0`, commit `ec4f073e8c00a8b820b270bf308109037ec42cb2` (identique à `main`).
- API `bep-v2-api` : déploiement LIVE `dep-dbv567ek1f9s73bfuuog`, commit `ca9279fb879e9f1631e125a60d66a032188d193b`. Ce commit est ancêtre de `main`, avec 40 commits d'écart. La comparaison des fichiers montre uniquement des changements frontend/PWA/tests dans l'écart observé, aucun fichier API/serveur modifié dans cette comparaison. Ne pas déclencher de redéploiement sur cette seule base.
- PostgreSQL `bep-v2-db` : instance disponible, PostgreSQL 18, Francfort, base `bep_v2_db`.

## Réserve majeure — sauvegarde des données
La sauvegarde créée ici est une sauvegarde Git du code. Aucun export PostgreSQL, snapshot de base vérifié ni test de restauration n'a été exécuté. La base n'est donc pas déclarée sauvegardée/restaurable. Les secrets et variables d'environnement ne sont pas exportés dans Git.

## Anomalies et points à traiter avant tout nettoyage
1. Le dépôt est public et les branches ne sont pas signalées comme protégées dans l'inventaire ; vérifier les règles de protection depuis un accès GitHub autorisé.
2. 40 PR ouvertes imposent une exclusion stricte de leurs branches.
3. Les services Render non-production doivent être rapprochés des branches qu'ils consomment ; aucun service ne doit être supprimé dans le cadre de l'audit.
4. Le décalage de 40 commits entre l'API LIVE et `main` est documenté ; les fichiers modifiés sont frontend/PWA/tests selon la comparaison disponible.
5. La sauvegarde PostgreSQL et son test de restauration restent à réaliser par une procédure autorisée et vérifiable.

## Règles pour les futurs lots
- Lot A : branches manifestement fusionnées, sans PR ouverte, sans service Render associé, sans rôle de sauvegarde/release/security/stable/rollback et dont le contenu est déjà intégralement présent dans une référence conservée.
- Lot B : branches de travail obsolètes sans PR ouverte, après comparaison de commits et revue du contenu.
- Exclusion permanente tant qu'une preuve contraire n'est pas établie : `main`, `backup/*`, `release/*`, `stable/*`, `archive/*`, `security/*`, `rollback/*`, branches de PR ouvertes, branches utilisées par Render.
- Chaque lot doit avoir un manifeste des branches, SHA avant opération, preuve de fusion ou de redondance, vérification post-opération et point d'arrêt en cas d'écart.
- Aucune suppression en masse. Aucune suppression avant validation de la sauvegarde de code et de la sauvegarde de données.
