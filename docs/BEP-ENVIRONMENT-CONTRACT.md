# BEP — Contrat officiel des environnements et des releases

**Version de référence production : V1.1**  
**Date de référence : 12 novembre 2026**  
**Dépôt :** `MMG2025-creator/bep-mobile.`  
**Décision :** contrat d'exploitation validé par le propriétaire du projet le 12 novembre 2026.

## 1. État de référence immuable

La production V1.1 est la référence stable de BEP au 12/11/2026.

- Frontend : Render `bep-mobile`, https://bep-mobile.onrender.com
- API : Render `bep-v2-api`, https://bep-v2-api.onrender.com
- Branche des deux services : `main`
- Commit de référence LIVE des deux services : `4269bb01d3a35772a77a6a28e3c24654782bebcf`
- Déploiements Render contrôlés LIVE le 12/11/2026 : frontend `dep-dbr3gqogkstc738r0lng`, API `dep-dbr3gquf240s739sbet0`.
- Branche de sauvegarde production : `backup/prod-2026-11-12`.

Cette référence est un point de restauration du code et de la configuration de publication. Elle ne constitue pas une sauvegarde PostgreSQL ni une preuve de restauration de base.

## 2. Architecture officielle de test — unique

L'environnement de test est exclusivement :

- Frontend : Render `bep-budget-test`, https://bep-budget-test.onrender.com
- Branche frontend : `test/budget-revenus-charges-liste`
- API utilisée : Render `bep-coach-staging-api`, https://bep-coach-staging-api.onrender.com
- Branche API existante : `feature/financial-intelligence-engine`
- Base de données : celle déjà configurée pour `bep-coach-staging-api`.
- Configuration Render vérifiée : le build du frontend test injecte `window.BEP_API_BASE = "https://bep-coach-staging-api.onrender.com"`.
- Branche de sauvegarde frontend test : `backup/bep-budget-test-2026-11-12`.

Le nom historique « staging » du service API est conservé. Il n'a aucune incidence fonctionnelle et ne justifie pas la création d'un autre service.

## 3. Interdictions structurelles — application obligatoire

Sauf autorisation explicite, préalable et écrite du propriétaire du projet :

1. Ne créer aucune nouvelle API, base de données, interface, frontend, domaine, service Render, Blueprint ou environnement.
2. Ne pas créer une seconde variante de BEP Budget Test ni un autre environnement parallèle.
3. Ne pas renommer, suspendre, supprimer, migrer ou remplacer `bep-coach-staging-api`.
4. Ne pas changer l'URL `BEP_API_BASE` du frontend test : elle doit rester `https://bep-coach-staging-api.onrender.com`.
5. Ne pas modifier la configuration, les secrets, la base ou la branche des services de production pour les besoins du développement test.
6. Ne jamais fusionner une branche de développement dans `main`, ni déclencher une publication de production, sans autorisation explicite après présentation du périmètre et des résultats de recette.
7. Ne jamais appliquer une migration SQL à la base de production dans le cadre d'une tâche de test.
8. Ne pas approuver le Blueprint Render `exs-dbr3l5on74is73d8chkg` : il est abandonné et n'appartient pas à l'architecture officielle.

## 4. Règles de travail pour toute évolution

- Le travail quotidien, les corrections, l'ergonomie et les nouvelles fonctionnalités se font d'abord sur `test/budget-revenus-charges-liste` et sur l'environnement `bep-budget-test`.
- Le frontend test continue d'appeler l'API staging existante. Les changements backend nécessaires à la recette doivent être identifiés séparément et annoncés avant toute modification de la branche `feature/financial-intelligence-engine`, car cette branche est reliée au service Render staging.
- Aucun développement ne doit être poussé directement sur `main`.
- Chaque évolution doit être sauvegardée par commits explicites, contrôles statiques et tests pertinents ; vérifier le déploiement test et les parcours concernés avant de proposer une fusion.
- Toute fusion vers `main` est une opération de release : présenter le diff, les tests, les limites connues, les migrations éventuelles et le plan de retour arrière ; attendre l'accord explicite du propriétaire.
- Après chaque release approuvée : vérifier les commits réellement LIVE sur les deux services de production et consigner date, SHA, déploiements, tests et éventuelles réserves dans Notion et Git.
- Les sauvegardes Git ne remplacent jamais les sauvegardes de base de données.

## 5. Procédure obligatoire avant une action d'infrastructure

Avant toute création, suppression, renommage, migration, changement d'URL, changement de branche Render, modification de secrets ou changement de base :

1. décrire précisément la ressource concernée et la conséquence ;
2. expliquer pourquoi l'architecture existante ne suffit pas ;
3. présenter les risques et le retour arrière ;
4. demander une autorisation explicite ;
5. n'exécuter qu'après cette autorisation.

En l'absence d'accord explicite : ne rien changer à l'infrastructure.

## 6. Contrôle de cohérence courant — 12 novembre 2026

- Production frontend et API : services non suspendus, branche `main`, dernier déploiement observé `LIVE` sur le commit de référence V1.1.
- Frontend test : service non suspendu, branche de test, dernier déploiement observé `LIVE`.
- API staging : service non suspendu, branche `feature/financial-intelligence-engine`, dernier déploiement observé `LIVE`.
- Frontend test -> API staging : URL confirmée dans le build command Render.
- Aucun nouveau service ou base n'a été créé pour BEP Budget Test.
- La tentative d'approbation du Blueprint dédié a échoué avant toute création de ressource ; le Blueprint est abandonné et son fichier YAML a été retiré de sa branche Git d'infrastructure.

## 7. Portée de la validation

La V1.1 est désignée par le propriétaire comme version de production stable de référence. Les deux déploiements de production ont été contrôlés LIVE sur le même SHA. Cette validation d'état de publication ne doit pas être présentée comme une certification de sécurité, une preuve de sauvegarde restaurable ou une recette exhaustive de tous les parcours authentifiés.

Toute documentation ou automatisation future doit respecter ce contrat, sauf décision explicite ultérieure qui le remplace et qui sera datée et versionnée.


## 8. Preuve opérationnelle détaillée — relevé du 12 novembre 2026

### Production V1.1

- Frontend Render service ID `srv-dbpb7ubbc2fs739nec5g`, déploiement LIVE `dep-dbr3gqogkstc738r0lng`, SHA `4269bb01d3a35772a77a6a28e3c24654782bebcf`.
- API Render service ID `srv-dbpbcb5bedkc73893520`, déploiement LIVE `dep-dbr3gquf240s739sbet0`, même SHA `4269bb01d3a35772a77a6a28e3c24654782bebcf`.

### Environnement test et API staging

- Frontend test service ID `srv-dbr2rkuc6qcc73aghgpg`, déploiement LIVE `dep-dbr3of8gkstc738r80bg`, SHA `e047aec823338edcf6e859cc30bc8b086d3c1ab8`.
- API staging service ID `srv-dbqggrgae00c738bbe00`, déploiement LIVE `dep-dbqr901srm7s738u91ng`, SHA `743591cde95887d5792c72aa1ea0a0e8a7c6d8e9`.
- Les quatre services ont été relevés non suspendus. Le frontend test conserve le build command qui injecte l'URL de l'API staging.

### Blueprint dédié abandonné

L'objet Blueprint Render `exs-dbr3l5on74is73d8chkg` existe encore dans le compte Render avec le statut `created`, `autoSync=false` et `resources=[]`. Il ne possède aucune ressource gérée et ne doit pas être approuvé. Le fichier YAML correspondant a été supprimé de la branche `infra/bep-budget-test-api` ; commit de retrait `589c34695234e2d387b8ef937942a2a8717aeea9`. Aucun nouveau service ou aucune nouvelle base n'a été créé.

Ces preuves décrivent l'état des déploiements au moment du relevé ; toute modification ultérieure doit déclencher une nouvelle vérification et une entrée datée dans le journal.
