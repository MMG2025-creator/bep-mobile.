# BEP — Audit global du 20 novembre 2026

## Synthèse exécutive

- **Aucun incident critique P0 identifié** dans le périmètre contrôlé.
- **P1 :** branche `main` non protégée ; validation TLS PostgreSQL désactivée ; sauvegarde/restauration de la base non démontrée ; capacité de production non validée pour une montée en charge ; quatre modèles ONNX absents du dépôt, donc tests modèles impossibles à exécuter ici.
- **P2 :** CSP absente du frontend statique ; rate limiting lié au cookie appareil sans limite complémentaire par IP/compte ; environnement API Coach de test sans base joignable ; plusieurs API de préproduction répondent 503 ; absence de lockfile ; 358 branches et 20 services Render à rationaliser.
- **Corrections de code proposées dans la PR #318** : états dynamiques du Coach, mise à jour PWA sur action explicite, synchronisation des assets publiés et actualisation des tests.
- **Production non modifiée** pendant cet audit. Le PR #318 n'est pas fusionné et aucun déploiement n'a été déclenché.

## Périmètre et méthode

- Dépôt : `MMG2025-creator/bep-mobile.`
- Branche auditée : `main`, commit `ec4f073e8c00a8b820b270bf308109037ec42cb2`.
- Inventaire : 183 fichiers suivis, 29 fichiers de tests, 7 workflows GitHub Actions.
- Infrastructure : 20 services Render recensés, dont le frontend et l'API de production ; PostgreSQL `bep_v2_db`.
- Contrôles : revue statique ciblée, inspection GitHub/Render, métriques, logs et requêtes HTTP GET non destructives.
- Limites : pas de pentest externe, pas de test OAuth authentifié, pas de création/modification de données de production, pas de restauration de sauvegarde, pas de test de charge, pas de scan complet des secrets/dépendances.

## Anomalies classées par criticité

### P1 — Haute

| ID | Constat vérifié | Risque | Correction recommandée |
|---|---|---|---|
| P1-01 | `main` renvoie `protected: false` et aucun ruleset de protection n'est présent. | Fusion ou push direct sans validations obligatoires ; les échecs CI ne bloquent pas nécessairement la livraison. | Protéger `main`, interdire force-push/suppression, exiger PR et les checks `full-regression`, `monthly-budget`, `offline-client-guard` et `offline-sync-guard`. |
| P1-02 | Le pool PostgreSQL configure `ssl: { rejectUnauthorized: false }`. | Le certificat du serveur PostgreSQL n'est pas authentifié ; risque d'interception malgré TLS. | Récupérer/valider la CA Render, puis activer `rejectUnauthorized: true` et tester la connexion avant déploiement. |
| P1-03 | La base est sur le plan `0.1c-256mb`, disque 1 Go, sans haute disponibilité ni read replica. L'API de production est sur un plan Free. | Aucune preuve de capacité ou de résilience pour une charge importante ; disponibilité et performances limitées. | Définir le SLO et le profil de charge, choisir un plan dimensionné, activer pooling/monitoring et exécuter un test de charge progressif. |
| P1-04 | Aucune sauvegarde ni restauration testée n'a été confirmée dans cet audit. | Risque de perte de données ou de restauration non maîtrisée. | Vérifier la politique de sauvegarde/PITR Render, documenter RPO/RTO et réaliser un exercice de restauration sur une base isolée. |
| P1-05 | Aucun fichier `.onnx` ni chemin de modèle ONNX n'est présent dans l'arbre du dépôt audité. | Les tests de bout en bout des quatre modèles et du scoring ne peuvent pas être reproduits depuis ce dépôt. | Fournir l'emplacement des quatre modèles, leurs checksums, versions, pré/post-traitements et jeux d'essai ; intégrer un job de validation dédié. |

### P2 — Moyenne

| ID | Constat vérifié | Risque | Correction recommandée |
|---|---|---|---|
| P2-01 | Le frontend statique n'a pas de CSP dans `_headers` ni de meta CSP dans `index.html`. L'API conserve sa CSP Helmet. | Défense en profondeur insuffisante contre l'exécution de scripts injectés côté frontend. | Ajouter une CSP HTTP adaptée aux ressources réellement utilisées, puis tester OAuth, polices, OCR/PDF et API. |
| P2-02 | Le rate limiter PostgreSQL actuel identifie le client par cookie appareil signé ; il n'applique pas de quota distinct par IP ou compte. | La suppression/rotation du cookie peut renouveler l'identité de limitation. | Ajouter une limite secondaire par IP et, après authentification, par compte ; conserver le stockage partagé et calibrer les seuils pour les réseaux partagés. |
| P2-03 | `bep-coach-functional-test-api-vouu` ne peut pas résoudre l'hôte PostgreSQL configuré ; les logs indiquent `ENOTFOUND` et l'initialisation DB échoue. | L'environnement de test Coach ne peut pas valider les parcours métier ; le rate limiter partagé est également indisponible. | Corriger `DATABASE_URL` vers une base de test existante ou suspendre cet environnement s'il n'est plus utilisé. |
| P2-04 | Trois endpoints API non-production testés ont répondu HTTP 503. Pour deux d'entre eux, la cause n'a pas été établie ; le laboratoire Coach a une erreur DNS DB confirmée. | Préproduction et tests fonctionnels non fiables. | Diagnostiquer chaque service, rétablir une base de test et un health check, ou retirer les services obsolètes. |
| P2-05 | Aucun `package-lock.json`, `npm-shrinkwrap.json` ou lockfile équivalent n'est présent. Le workflow utilise `npm install`. | Résolution des dépendances non reproductible et audit transitif difficile à tracer. | Générer/versionner le lockfile, passer à `npm ci`, ajouter `npm audit` et une politique de mise à jour des dépendances. |
| P2-06 | 358 branches GitHub et 20 services Render sont recensés ; plusieurs services de test/préproduction restent publics et certains sont liés à des branches anciennes. | Complexité opérationnelle, surface d'exposition et risque de confusion entre environnements. | Inventorier propriétaire/usage/dernier déploiement, puis archiver ou suspendre uniquement après validation de leur non-utilisation. |
| P2-07 | La revue `SECURITY_REVIEW.md` décrit encore certains états antérieurs (rate limiting en mémoire/par IP) qui ne correspondent plus au code actuel (limitation PostgreSQL par cookie appareil). | Documentation de sécurité non alignée sur le comportement réel. | Mettre à jour la revue et lier chaque contrôle à un test automatisé ou une preuve dynamique. |

### P3 — Faible

| ID | Constat vérifié | Correction recommandée |
|---|---|---|
| P3-01 | Les workflows `actions/checkout@v4` et `actions/setup-node@v4` génèrent un avertissement de dépréciation Node 20 sur les runners. | Planifier la mise à jour des actions vers des versions compatibles Node 24 après vérification de compatibilité. |
| P3-02 | L'inventaire des branches contient beaucoup d'archives, sauvegardes et branches de fonctionnalités historiques. | Définir une convention de nommage, une durée de rétention et des propriétaires par famille de branches. |

## Vérifications dynamiques de production

| Contrôle GET | Résultat observé le 20/11/2026 | Interprétation |
|---|---|---|
| Frontend `https://bep-mobile.onrender.com/` | Page BEP accessible | Service frontend opérationnel au niveau HTTP |
| API `/api/health` | `ok=true`, authentification configurée, base configurée et prête | API et connexion DB opérationnelles au moment du test |
| API `/api/me` sans session | HTTP 401 | Accès non authentifié refusé |
| API `/api/data` sans session | HTTP 401 | Données privées non exposées sans session |
| API `/server.js` | HTTP 404 | Fichier serveur non servi |
| Frontend `/server.js` | HTTP 404 | Fichier serveur non servi |

Aucune opération POST/PUT/DELETE ni aucune modification de données de production n'a été exécutée.

## Validation automatisée de la PR #318

Commit de tête validé : `18788b69a089f2e2c4755377b3bca3ecc4b099dd0`.

| Workflow / suite | Résultat |
|---|---:|
| BEP full regression — `npm test` | 286 / 286 réussis |
| Contrôles mensuels — `check:monthly-budget` | 116 / 116 réussis |
| Offline client regression guard | 11 / 11 réussis |
| Offline sync regression guard | 25 / 25 réussis |

Les sept échecs précédemment observés sur le commit de production se répartissaient entre attentes de tests obsolètes (versions CSS/Service Worker) et deux comportements manquants : états dynamiques du Coach et mise à jour PWA sur action explicite. La PR corrige les deux comportements et aligne les attentes de tests sur les versions publiées. Tous les workflows de cette PR sont verts.

## État Render et capacité

- Frontend de production : branche `main`, auto-deploy désactivé, service LIVE.
- API de production : branche `main`, auto-deploy désactivé, service LIVE.
- PostgreSQL : disponible, 256 Mo de mémoire, disque 1 Go, haute disponibilité désactivée.
- Les métriques récentes montrent une faible utilisation observée, mais les métriques HTTP de requêtes/latence n'ont pas fourni de série exploitable. Cette faible utilisation ne constitue donc pas un test de capacité.

## Plan de remédiation recommandé

1. **Avant toute nouvelle fusion en production :** activer la protection de `main` et rendre les quatre workflows requis.
2. **Avant toute donnée utilisateur réelle à grande échelle :** corriger la validation TLS PostgreSQL et confirmer les sauvegardes/restaurations.
3. **Avant toute montée en charge :** dimensionner API/DB, ajouter des quotas par IP/compte et exécuter un test de charge.
4. **Avant de déclarer le scoring validé :** fournir les quatre modèles ONNX et exécuter leurs tests de bout en bout.
5. **Avant de certifier la sécurité frontend :** ajouter et tester la CSP HTTP.
6. **Hygiène continue :** lockfile, npm ci, audit dépendances, rationalisation des branches et services de test.

## Décision finale

**Production : opérationnelle au niveau des contrôles HTTP non authentifiés.**

**Code de la PR #318 : validé par les workflows automatisés.**

**BEP : non certifiable comme entièrement validé de bout en bout à ce stade.** Les contrôles authentifiés, OAuth, tests de charge, restauration PostgreSQL et tests des quatre modèles ONNX restent à réaliser. La PR #318 n'est pas fusionnée ; aucune correction de cette PR n'est donc présente en production.
