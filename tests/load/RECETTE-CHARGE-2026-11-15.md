# BEP — Recette de charge HTTP et préparation de la recette métier

Date de référence : 15 novembre 2026 (Europe/Paris)  
Exécution k6 : 15 novembre 2026, 00:08:11–00:45:52 UTC (01:08:11–01:45:52, heure de Paris)  
Dépôt : [MMG2025-creator/bep-mobile.](https://github.com/MMG2025-creator/bep-mobile.)  
Branche d'exécution : `test/k6-production-load-20261115`  
Workflow : [GitHub Actions #43656665519](https://github.com/MMG2025-creator/bep-mobile./actions/runs/43656665519)

## 1. Résultat de la recette HTTP publique

| Indicateur | Résultat |
|---|---:|
| Durée k6 | 37 min 32 s |
| Charge maximale | 50 VUs |
| Requêtes HTTP totales, préflight inclus | 2 704 |
| Requêtes de charge | 2 694 |
| Vérifications HTTP réussies | 2 694 |
| Taux d'erreur HTTP | 0 % |
| Latence p50 | 25,81 ms |
| Latence p95 | 192,72 ms |
| Latence maximale | 787,92 ms |
| Latence p99 | Non documentée dans l'export principal |

Montée en charge : 20 VUs au départ, +2 VUs toutes les 2 minutes jusqu'à 50 VUs, puis maintien à 50 VUs pendant 5 minutes.

Endpoints contrôlés : `/`, `/styles.css`, `/app.js`, `/financial-engine.js`, `/offline-storage.js`, `/monthly-budget-ui.js`, `/spend-experience.js`, `/pwa.js`, `/api/health`, `/api/auth/status`.

### Ressources Render observées

| Ressource | Moyenne | Pic |
|---|---:|---:|
| CPU API | 0,00079 | 0,00196 |
| Mémoire API | 61,6 MiB | 66,2 MiB |
| CPU PostgreSQL | 0,00763 | 0,01043 |
| Mémoire PostgreSQL | 46,3 MiB | 57,2 MiB |
| Connexions PostgreSQL actives | 1,39 | 4 |

Aucune saturation ni aucun déclenchement anticipé des seuils d'arrêt n'ont été constatés dans les relevés disponibles. Les métriques Render de volume HTTP et de latence étaient absentes ; les mesures de requêtes et latence proviennent de k6.

### Anomalies de reporting

- L'étape GitHub Actions de publication du rapport a échoué après le test à cause d'un heredoc Bash mal indenté. L'exécution k6 et l'upload de l'artefact ont abouti.
- Le p99 n'est pas exporté numériquement : ajouter `p(99)` à `summaryTrendStats`.
- Les indicateurs de seuil du fichier secondaire `k6-summary-export.json` sont contradictoires avec le résumé principal ; réconcilier les deux exports avant la prochaine recette.

**Conclusion limitée :** la couche HTTP publique a passé ce scénario de charge. Cette exécution ne teste pas les parcours authentifiés ni les opérations métier.

## 2. Périmètre non couvert

Non validés par ce test : authentification avec session, isolation entre utilisateurs, création/modification/suppression de dépenses, budgets, report d'épargne, écritures PostgreSQL, synchronisation multi-appareils, mode hors ligne et reprise de synchronisation.

## 3. Recette suivante proposée — parcours métier authentifiés

Statut : **préparée, non exécutée**. Aucun compte de test, aucune donnée financière et aucune opération d'écriture n'ont été créés par la présente documentation.

### Objectifs

1. Vérifier les parcours authentifiés de lecture et d'écriture avec des comptes synthétiques dédiés.
2. Vérifier l'isolation stricte des données entre deux utilisateurs de test A et B.
3. Mesurer latence, erreurs applicatives, charge API/DB et cohérence des données sous concurrence.
4. Contrôler les scénarios de budgets, dépenses, revenus, report d'épargne et synchronisation sans toucher aux données réelles.

### Préconditions bloquantes

- [ ] Identifier précisément les routes API et contrats JSON réels dans le code courant ; ne pas inventer de routes.
- [ ] Disposer d'un environnement de recette isolé ou d'un mécanisme serveur validé garantissant que les comptes et données synthétiques ne peuvent pas être confondus avec des données utilisateur réelles.
- [ ] Créer deux comptes dédiés A et B avec données entièrement synthétiques, via le parcours normal d'authentification.
- [ ] Confirmer la procédure de nettoyage/rollback des seules données de test.
- [ ] Vérifier les limites Render, la capacité PostgreSQL et les seuils d'arrêt avant toute charge.
- [ ] Définir un responsable de surveillance et une fenêtre de test.
- [ ] Stocker les identifiants de test uniquement dans les secrets GitHub Actions ; aucun mot de passe, cookie ou token dans Git, les logs ou Notion.
- [ ] Obtenir une validation explicite avant d'exécuter des écritures authentifiées en production. À défaut, exécuter exclusivement en staging isolé.

### Matrice fonctionnelle

| ID | Scénario | Vérification attendue |
|---|---|---|
| AUTH-01 | Connexion A et B | Session valide, cookie sécurisé, aucune fuite de secret |
| AUTH-02 | Lecture des données A/B | Chaque compte ne lit que son propre jeu de données |
| AUTH-03 | Accès croisé A vers B | Refus serveur ; aucune donnée B exposée |
| DATA-01 | Lecture du payload financier | Schéma et valeurs synthétiques conformes |
| EXP-01 | Créer une dépense synthétique | Écriture persistée une seule fois |
| EXP-02 | Modifier une dépense synthétique | Valeurs et agrégats cohérents |
| EXP-03 | Supprimer une dépense synthétique | Suppression limitée à l'enregistrement de test |
| BUD-01 | Créer/modifier un budget | Totaux, période et solde recalculés correctement |
| SAV-01 | Report d'épargne | Montant reporté exact, sans double comptabilisation |
| SYNC-01 | Synchronisation après reconnexion | Pas de perte ni de duplication des changements |
| SYNC-02 | Conflit entre deux états | Conflit détecté, données locales en attente préservées |
| PERSIST-01 | Relecture après reconnexion | État conservé après nouvelle session |

Les routes, payloads et assertions devront être adaptés aux contrats effectivement présents dans le dépôt après inspection du code. Les cas non implémentés seront marqués NOT APPLICABLE, jamais simulés comme réussis.

### Montée en charge proposée

| Phase | Charge | Durée indicative | But |
|---|---:|---:|---|
| Fonctionnel séquentiel | 1 VU par compte | 5 min | Établir les résultats attendus |
| Palier de contrôle | 5 VUs | 5 min | Détecter les défauts de scénario |
| Charge modérée | 10 VUs | 5 min | Mesurer les parcours authentifiés |
| Charge intermédiaire | 20 VUs | 10 min | Vérifier API et DB sous concurrence |
| Charge cible | 30 VUs | 10 min | Vérifier stabilité métier |
| Extension éventuelle | 50 VUs | 5 min | Seulement si les paliers précédents sont stables et autorisés |

La charge cible initiale de cette recette métier est 30 VUs. Le palier 50 VUs est conditionnel, non automatique. Répartir les VUs entre comptes de test dédiés et conserver un jeu de données isolé par compte.

### Seuils de surveillance et arrêt

- Objectif initial : taux d'erreur applicative inférieur à 1 %.
- Objectif initial : p95 inférieur à 1 seconde sur les routes mesurées, à confirmer selon le contrat et le profil des opérations.
- Arrêt immédiat si erreurs >= 5 % pendant 30 secondes, p95 >= 2,5 secondes pendant 30 secondes, hausse anormale des connexions DB, erreurs 5xx en rafale, redémarrage du service, incohérence de données ou impact sur des utilisateurs réels.
- Ne jamais poursuivre un palier après une anomalie d'isolation A/B ou une écriture dupliquée.
- Les seuils sont des garde-fous proposés pour la recette, pas des SLA déjà garantis.

### Critères de sortie

- [ ] Tous les tests fonctionnels séquentiels passent.
- [ ] Les contrôles d'isolation A/B passent sans exception.
- [ ] Aucune écriture dupliquée ou perte de données synthétiques.
- [ ] Totaux dépenses/budgets/report d'épargne conformes aux assertions.
- [ ] Latences, taux d'erreur, CPU, mémoire et connexions DB consignés par palier.
- [ ] Nettoyage des seules données synthétiques vérifié.
- [ ] Artefacts k6 et journaux expurgés conservés.
- [ ] Rapport final PASS / FAIL / INCONCLUSIVE / NOT RUN publié.

## 4. Actions techniques avant la prochaine exécution

- [ ] Corriger le heredoc du workflow GitHub Actions.
- [ ] Ajouter p(99) à l'export k6.
- [ ] Unifier la source de vérité des seuils entre `k6-summary.json` et `k6-summary-export.json`.
- [ ] Ajouter des checks explicites sur les statuts HTTP et les assertions métier, pas seulement la disponibilité.
- [ ] Séparer clairement les scénarios lecture seule et les scénarios d'écriture authentifiée.

## 5. Preuves

- [Workflow GitHub Actions #43656665519](https://github.com/MMG2025-creator/bep-mobile./actions/runs/43656665519)
- [Artefact k6](https://github.com/MMG2025-creator/bep-mobile./actions/runs/43656665519/artifacts/14139517053)
- [Script k6 exécuté](https://github.com/MMG2025-creator/bep-mobile./blob/test/k6-production-load-20261115/tests/load/k6-production.js)



## Exécution de la recette métier — préflight automatisé (15 novembre 2026)

- Workflow : [BEP business recipe preflight — run #43663137672](https://github.com/MMG2025-creator/bep-mobile./actions/runs/43663137672)
- Branche : `test/k6-production-load-20261115`
- Commit exécuté : `7b065c2485c91386cc8535b3222531ef5c73a328`
- Runner GitHub Actions isolé, Node.js 22.23.4.
- Aucun `DATABASE_URL` / `TEST_DATABASE_URL` fourni ; aucune écriture en production possible.

### Résultat suite Node

**FAIL — 106 tests : 99 PASS, 4 FAIL, 3 SKIP.**

Échecs relevés dans `tests/frontend-integration.test.js` :

1. Test 52 — `mobile connection status` : assertion CSS attend `padding-bottom:calc(104px + env(safe-area-inset-bottom))`, mais le CSS utilise une propriété raccourcie `padding:... calc(...)`. Assertion à vérifier.
2. Test 59 — `destructive settings actions` : l'assertion « pending offline changes must block local erasure » échoue. Priorité d'investigation avant toute modification.
3. Test 60 — `purchase statistics` : attente de `details.open=true` non retrouvée dans `spend-experience.js`. Comportement UX à vérifier.
4. Test 65 — `successful local-data clearing` : le test attend `app.js?v=112&bep=local-clear-render-guard-20261114`, absent du HTML de cette branche. Vérifier la validité de l'assertion et la synchronisation des assets.

Les tests nécessitant PostgreSQL sont SKIP, faute de `TEST_DATABASE_URL`. Aucun parcours navigateur ni session authentifiée n'a été exercé.

### Cartographie API observée dans le code

- Auth : `POST /api/auth/register`, `POST /api/auth/verify-email`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/status`.
- Profil : `GET /api/me`, `PUT /api/profile`.
- Données financières : `GET /api/data`, `PUT /api/data`.
- Budgets : routeur sous `/api/budgets` avec `GET/POST /months`, `GET /months/:monthKey`, `GET /months/:monthKey/actuals`, `PUT /months/:monthKey`, `POST /months/:monthKey/close` et `/reopen`.
- Les routes métier exigent une session ; les écritures sont également protégées par contrôle d'origine.

### Blocages de la recette authentifiée

- L'inscription e-mail nécessite un code de vérification envoyé par le service e-mail ; aucun compte/boîte de test ni secret dédié n'est fourni.
- Aucun PostgreSQL de recette isolé n'est configuré dans le workflow.
- Le test d'intégration budgétaire crée un schéma PostgreSQL temporaire et deux utilisateurs fictifs, puis supprime le schéma ; il doit être exécuté sur une base de recette dédiée, jamais sur la base de production sans isolation validée.

**Verdict : préflight automatisé FAIL (4 assertions) ; recette métier authentifiée NOT RUN.** Aucun compte, aucune donnée financière et aucune écriture de production n'ont été créés.
