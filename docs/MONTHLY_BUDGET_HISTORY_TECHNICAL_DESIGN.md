# BEP — Historisation des budgets mensuels
## Dossier de conception technique — V1

Statut : préparation sur branche dédiée, non déployée.
Branche : `feature/monthly-budget-history`
Base de référence : `main` — commit `ba1a32ecc77cdec846cee237341c56b17f863f14`.

## 1. Audit de l'existant

### Persistance et synchronisation
- Le navigateur charge l'état depuis `localStorage`, clé `bep-mobile-v1`.
- Les valeurs par défaut actuelles sont `income`, `budgets`, `expenses`, `goals` et `transactions`; les sources de revenus détaillées sont dans `incomes`.
- Les utilisateurs connectés chargent `payload` depuis `GET /api/data`.
- `save()` écrit d'abord l'état complet dans localStorage, puis envoie l'objet complet à `PUT /api/data`.
- Le serveur normalise actuellement le payload en conservant explicitement `income`, `incomes`, `budgets`, `expenses`, `goals` et `transactions` (2 000 dernières transactions). Toute nouvelle propriété envoyée par le client serait donc actuellement supprimée à la sauvegarde serveur.
- `PUT /api/data` remplace l'intégralité du JSONB `bep_user_data.payload` pour l'utilisateur. Il n'existe pas de version/conflit optimiste dans ce contrat.
- La table `bep_user_data` est liée à `bep_users` par clé étrangère et suppression en cascade.

### Modèle métier observé
- Les revenus sont des sources dans `incomes[]`, le total `income` étant synchronisé.
- Les charges planifiées sont dans `budgets[]`, avec notamment `id`, `category`, `label`, `amount`, `nature`.
- Les achats/dépenses réels sont dans `expenses[]`; leur date est `at`. L'écran achats filtre le mois à partir de cette date.
- Les opérations importées peuvent aussi exister dans `transactions[]`. Le traitement actuel des achats utilise principalement `expenses[]`; il faut éviter de compter deux fois une même opération.
- Aucun identifiant de période budgétaire n'est actuellement présent dans le contrat.

### Conséquence technique
Une simple propriété `monthlyBudgets` ajoutée dans le navigateur ne serait pas persistée par le serveur. La normalisation serveur et la stratégie d'écriture complète doivent être traitées explicitement avant activation fonctionnelle.

## 2. Objectifs fonctionnels

1. Un budget est identifié par utilisateur et mois civil (`YYYY-MM`).
2. Chaque mois est une photographie autonome : modifier le budget d'un mois ne modifie jamais les mois antérieurs.
3. Créer un mois copie les valeurs du mois précédent ou du modèle de référence, puis crée un instantané indépendant.
4. Les revenus et charges prévisionnels sont séparés des revenus et dépenses réellement constatés.
5. Les dépenses réelles sont affectées au mois de leur date de transaction, pas au mois actuellement affiché.
6. Un mois clôturé reste consultable. Une correction ultérieure est explicite et traçable.
7. Aucun mois historique ne doit être inventé à partir de la seule photographie courante.
8. L'absence de données réelles reste « non renseignée », et ne doit pas être assimilée à zéro.

## 3. Modèle de données proposé

### `bep_monthly_budgets`
- `id` UUID primary key
- `user_id` TEXT not null references `bep_users(id)` on delete cascade
- `month_key` DATE not null (toujours le premier jour du mois)
- `status` TEXT not null check in (`open`, `closed`)
- `currency` CHAR(3) not null default `EUR`
- `planned_income_total` NUMERIC(14,2) not null default 0
- `planned_charges_total` NUMERIC(14,2) not null default 0
- `planned_savings_total` NUMERIC(14,2) not null default 0
- `created_at`, `updated_at` TIMESTAMPTZ not null
- `version` INTEGER not null default 1
- unique (`user_id`, `month_key`)

### `bep_monthly_budget_items`
- `id` UUID primary key
- `budget_id` UUID not null references `bep_monthly_budgets(id)` on delete cascade
- `item_type` TEXT not null check in (`income`, `charge`, `savings`)
- `source_item_id` TEXT nullable (identifiant de la ligne source, sans dépendance destructive)
- `label` TEXT not null
- `category` TEXT nullable
- `nature` TEXT nullable
- `planned_amount` NUMERIC(14,2) not null check (planned_amount >= 0)
- `metadata` JSONB not null default '{}'
- `created_at`, `updated_at` TIMESTAMPTZ not null

### `bep_budget_audit_log`
- `id` BIGSERIAL primary key
- `user_id` TEXT not null references `bep_users(id)` on delete cascade
- `budget_id` UUID not null references `bep_monthly_budgets(id)` on delete cascade
- `action` TEXT not null
- `before_state`, `after_state` JSONB
- `reason` TEXT nullable
- `created_at` TIMESTAMPTZ not null default now()

Les dépenses réellement enregistrées restent dans le modèle de transactions/achats existant pour la V1. Le rattachement au mois se fait à partir de la date réelle validée; une table de rapprochement dédiée ne sera ajoutée qu'après audit des doublons et des identifiants de transaction.

## 4. Contrat API proposé

- `GET /api/budgets/months` : liste des mois disponibles pour l'utilisateur authentifié.
- `POST /api/budgets/months` : création idempotente d'un mois, avec source explicite (`previous`, `template`, `empty`).
- `GET /api/budgets/months/:monthKey` : photographie et agrégats du mois.
- `PUT /api/budgets/months/:monthKey` : mise à jour atomique des lignes, avec `expectedVersion` obligatoire.
- `POST /api/budgets/months/:monthKey/close` : clôture idempotente.
- `POST /api/budgets/months/:monthKey/reopen` : réouverture explicite et auditée, raison obligatoire.

Toutes les routes sont protégées par `auth`, bornées par le rate limiter existant, valident strictement `YYYY-MM`, les montants et les types, et n'acceptent jamais un `user_id` fourni par le client. L'identité vient exclusivement de la session.

Les écritures des entêtes, lignes et événements d'audit s'effectuent dans une transaction SQL unique. Le contrôle `expectedVersion` empêche une sauvegarde ancienne d'écraser une édition plus récente.

## 5. Règles de calcul

- Prévisionnel disponible = revenus planifiés − charges planifiées − épargne planifiée.
- Réel disponible = revenus réellement constatés − dépenses réellement constatées − épargne réellement constatée, uniquement si les données réelles nécessaires sont disponibles.
- Ne pas présenter le prévisionnel comme un solde bancaire.
- Les dépenses sont classées par date effective de transaction; date invalide ou absente = élément non agrégé, signalé pour correction.
- Les remboursements/avoirs et montants négatifs nécessitent une règle métier dédiée avant leur inclusion; ne pas les transformer arbitrairement en dépenses positives.
- Les opérations importées et achats saisis doivent être dédupliqués par identifiant stable ou rapprochement explicite avant agrégation.

## 6. Migration et compatibilité

Migration additive uniquement :
1. Créer les trois nouvelles tables et index dans une migration versionnée et idempotente.
2. Ne pas supprimer ni renommer `bep_user_data` ou ses propriétés.
3. Conserver l'ancien écran et le contrat `/api/data` pendant la phase de transition.
4. À la première activation d'un mois, demander explicitement quel mois représente l'ancien budget courant. Ne pas attribuer automatiquement une date historique.
5. Importer une seule fois les revenus/charges courants dans un mois choisi, avec clé d'idempotence et trace d'audit.
6. Comparer les totaux source et destination avant de permettre l'édition du nouveau modèle.
7. Prévoir un mode lecture seule de l'ancien budget pendant la transition.
8. Ne pas faire de double écriture silencieuse entre JSONB et les nouvelles tables.

## 7. Interface prévue

- Sélecteur de mois clair, avec navigation mois précédent/suivant.
- État « mois non créé » avec action de création et source clairement indiquée.
- Indicateurs séparés : prévu, réel, écart.
- Historique consultable et comparatif mensuel/annuel uniquement sur les périodes réellement renseignées.
- Statut ouvert/clôturé visible.
- Avertissement avant modification d'un mois clôturé; motif obligatoire pour correction/réouverture.
- Aucune suppression d'historique par action utilisateur standard.

## 8. Tests d'acceptation obligatoires

### Isolation et historisation
- Modifier juin ne modifie pas mai.
- Créer juillet depuis juin copie les valeurs mais n'établit aucun lien mutable.
- Recréer un mois existant ne duplique pas ses lignes.
- Deux utilisateurs ne peuvent jamais lire ou modifier les budgets l'un de l'autre.

### API et intégrité
- Non authentifié : 401 sur toutes les routes.
- Accès à un mois d'un autre utilisateur : 404 ou 403 sans divulgation.
- Mois invalide, montant négatif, type inconnu, payload trop volumineux : 400.
- Deux écritures avec même version : une seule réussit, l'autre reçoit un conflit 409.
- Échec SQL au milieu de l'écriture : rollback complet, aucun état partiel.
- Clôture et réouverture idempotentes; toute correction est auditée.
- Limites de pagination et volumes d'items définis et testés.

### Compatibilité et calculs
- Le contrat actuel `/api/data` continue de charger et sauvegarder les propriétés historiques.
- Les achats sont rattachés à leur date effective, même si un autre mois est sélectionné.
- Les transactions importées et les achats ne sont pas comptés deux fois.
- Périodes sans données réelles affichent « non renseigné », pas 0 €.
- Les totaux calculés côté serveur et côté interface sont identiques.
- Tests de migration sur payloads historiques représentatifs, sans données personnelles réelles.

### Non-régression et publication
- Tests unitaires du calcul et de la validation.
- Tests d'intégration API avec PostgreSQL isolé.
- Test de migration aller/retour sur base de test.
- Parcours E2E authentifié : créer, modifier, naviguer, clôturer, consulter l'historique.
- Contrôle sécurité : isolation par utilisateur, injection SQL, IDOR, validation, rate limit, absence de données sensibles dans les logs.
- Build et vérification des fichiers servis dans `dist`.
- Déploiement staging/preview, smoke tests, puis publication production séparée.

## 9. Risques et décisions ouvertes avant implémentation

- L'application sert actuellement des fichiers statiques depuis `dist`; les modifications d'interface devront être répercutées et vérifiées dans la sortie réellement publiée.
- `PUT /api/data` remplace le payload entier et ne dispose pas de verrou de version : ne pas y ajouter une écriture concurrente du nouvel historique.
- Le contrat actuel tronque `transactions[]` aux 2 000 dernières opérations; définir une stratégie d'historique long terme si les graphiques annuels s'appuient sur ces transactions.
- Les achats `expenses[]` et opérations `transactions[]` ont des usages qui se recoupent potentiellement; l'audit du schéma réel et des producteurs est requis avant de créer une agrégation commune.
- Le schéma SQL versionné ne décrit que les tables utilisateur et payload, alors que `server.js` crée d'autres tables à l'initialisation. Les migrations doivent devenir explicites et versionnées.
- La base Render BEP est actuellement sur l'offre gratuite et l'accès SQL via l'outil distant est bloqué par TLS/liste IP. Aucun schéma ou volume réel n'a été lu; les propositions ci-dessus sont fondées sur le code versionné, pas sur une inspection des données de production.

## 10. État du chantier

- [x] Audit statique du modèle applicatif et du contrat API.
- [x] Identification du risque d'écrasement JSONB et du filtrage serveur des propriétés.
- [x] Branche de travail créée depuis `main`.
- [x] Dossier de conception technique versionné.
- [ ] Audit de données réelles et volumétrie (accès SQL requis).
- [ ] Validation finale des règles d'affectation et de déduplication des opérations.
- [x] Schéma SQL additif versionné préparé dans `database/migrations/20261111_monthly_budget_history.sql` (non appliqué à une base).
- [x] Routes API isolées préparées dans `monthly-budget-routes.js` et montées sous `/api/budgets` (non activées en production; tables requises).
- [x] Tests unitaires de validation et calcul ajoutés avec `node:test`.
- [ ] Exécution CI des tests et tests d’intégration PostgreSQL.
- [x] Interface dédiée de consultation/création/édition mensuelle préparée et synchronisée dans `dist/`.
- [ ] Raccordement des formulaires historiques revenus/charges au mois sélectionné.
- [ ] Intégration des dépenses réelles datées et dédoublonnage.
- [ ] Tests automatisés et E2E.
- [ ] Revue de sécurité et contrôle de non-régression.
- [ ] Publication (validation distincte avant déploiement).


## 11. Avancement d'implémentation — 11 novembre 2026

- Migration additive préparée, sans exécution sur Render ni modification de données.
- API isolée : liste des mois, création vide ou copie du mois précédent, lecture, mise à jour avec contrôle de version, clôture et réouverture auditée.
- Toutes les lectures/écritures sont filtrées par l'identifiant de session; aucun identifiant utilisateur n'est accepté depuis le corps de requête.
- Les écritures multi-tables utilisent une transaction SQL; les mises à jour remplacent les lignes du seul mois ciblé et incrémentent sa version.
- Contrôles d'entrée : format de mois, types, libellés, montants, métadonnées, nombre de lignes et plafonds d'agrégats.
- Tests unitaires Node intégrés et workflow GitHub Actions préparé.
- Le backend ne lance volontairement pas la migration au démarrage. Tant que la migration n'est pas appliquée explicitement, les nouvelles routes ne peuvent pas être utilisées; cela évite tout DDL implicite en production.
- L’interface dédiée existe, mais les formulaires historiques revenus/charges ne sont pas encore raccordés au mois sélectionné. L’intégration des dépenses réelles datées, la migration contrôlée de la photographie budgétaire et les tests PostgreSQL/E2E restent à réaliser.
- Aucun déploiement, aucune migration de base, aucune modification de données et aucune activation côté utilisateur n'ont été effectués.


### Contrôles statiques d'intégration — 11 novembre 2026

Contrôle du contenu publié depuis `dist/` :
- Aucun identifiant HTML dupliqué dans `dist/index.html`.
- Tous les identifiants DOM référencés par `monthly-budget-ui.js` existent dans le HTML publié.
- Script UI, feuilles de style et cache-busters référencés présents dans `dist/`.
- Styles de l'historique présents dans `dist/styles.css`.
- Événements de session présents dans `dist/app.js` pour initialisation et purge de l'interface à la déconnexion.
- Routeur monté dans `server.js`, endpoints attendus présents, trois tables de migration identifiées.
- Trois groupes de tests unitaires ajoutés.

Ces contrôles sont des vérifications statiques de cohérence des fichiers. Ils ne remplacent ni `node --check`, ni l'exécution de `node --test`, ni les tests PostgreSQL et E2E.


### Compléments — recettes métier et sécurité

- L'API expose aussi les dépenses réelles du mois depuis `bep_user_data.payload.expenses[]`, filtrées par `at` et par fuseau IANA transmis par le navigateur. Le regroupement tient compte des changements de mois locaux, pas uniquement du mois UTC.
- Les achats sont dédupliqués par identifiant ; en l'absence d'identifiant, une empreinte déterministe date/enseigne/catégorie/montant est utilisée.
- Les lignes mensuelles peuvent être ajoutées, modifiées et retirées avant sauvegarde.
- L'import initial gère également l'ancien revenu scalaire si la liste des revenus n'est pas encore renseignée.
- Une limite de 200 lignes est appliquée à l'import initial et à chaque sauvegarde.
- Les tests PostgreSQL couvrent création, lecture inter-utilisateurs, copie indépendante, version obsolète, clôture/réouverture, idempotence, audit, dépenses datées et dédoublonnage, ainsi que le changement de mois selon le fuseau Europe/Paris.
- Un runbook de publication et de retour arrière est disponible dans `docs/MONTHLY_BUDGET_HISTORY_RELEASE_RUNBOOK.md`.
- La CI prévoit Node 20, PostgreSQL 16, les tests et `npm audit --omit=dev`. Aucun résultat CI n'est disponible dans GitHub au dernier contrôle ; l'exécution reste donc non certifiée.
- Le contrôle E2E authentifié sur navigateur et l'exécution de la migration sur un PostgreSQL de staging ne sont pas encore réalisés.
