# Audit approfondi — BP Conseil & Gemini Superviseur

- Référence auditée : BEP V1.4 — IA Agent
- Commit de référence : `5cae41acdafbc602041b34fb41a77cbcee61a8dd`
- Date : 14 novembre 2026
- Nature : audit statique du code, des migrations, de la documentation et des tests présents dans le dépôt.
- Périmètre non exécuté : aucun appel à l'API Gemini, aucune lecture de la base de production, aucun accès aux variables Render, aucun test dynamique en production, aucun déploiement.

## 1. Synthèse exécutive

La séparation des rôles est saine dans son principe : BP Conseil reste le moteur métier et l'agent Gemini est un processus asynchrone séparé. En revanche, la V1 ne réalise pas encore la supervision attendue : elle relit des documents déjà stockés sans consulter leurs sources, et elle critique un protocole de tests sans exécuter les scénarios contre le véritable Coach.

Le système est donc une **base d'agent documentaire avec validation humaine**, pas encore un superviseur capable de vérifier l'exactitude des conseils et des données financières actuelles.

## 2. BP Conseil interne : fonctionnement observé

### 2.1 Routage des demandes

Le point d'entrée conversationnel est `POST /api/ai/chat` dans `server.js`.

1. La question est validée et limitée à 4 000 caractères.
2. `routeStructuredQuestion` tente d'abord une réponse déterministe. Si elle reconnaît la demande, elle renvoie une réponse BEP structurée sans appeler le LLM.
3. Sinon, le serveur obtient la configuration du fournisseur Coach via `userAi`, consomme le quota BEP, charge le contexte financier et les connaissances, puis appelle `invokeAi`.
4. En cas d'indisponibilité du fournisseur, le serveur renvoie un fallback structuré/documentaire. Il ne bascule pas vers un autre fournisseur payant.
5. Les réponses conversationnelles sont renvoyées avec le fournisseur, le modèle, l'usage et des indicateurs résumés sur le contexte chargé.

Le fournisseur du Coach et l'agent Gemini superviseur sont deux circuits distincts. Le Coach peut être configuré avec Gemini ; cela ne prouve pas que le superviseur est activé.

### 2.2 Données métier et contexte personnel

`lib/bep-financial-intelligence.js` charge notamment :
- les données de `bep_user_data` ;
- les budgets mensuels et leur historique ;
- les revenus, charges, dépenses, objectifs, dettes et opérations d'épargne disponibles ;
- les avertissements de qualité lorsque certaines lectures échouent.

La normalisation limite les tailles des collections et les champs transmis. Le contexte envoyé au Coach est construit dans `server.js` et dans le moteur d'intelligence. Les réponses structurées sont préférées lorsque le routage le permet.

### 2.3 Connaissances

La récupération documentaire est lexicale : tokens, mots-clés, catégorie et contexte ; elle ne constitue pas une recherche sémantique vectorielle. Le moteur limite la sélection à six documents pour la réponse du Coach. Les documents et surcouches sont présentés au modèle comme données non fiables, et non comme instructions.

Les documents seed sont réinjectés au démarrage de l'initialisation. Le contenu est versionné lorsque certains champs changent. Les surcouches approuvées sont soumises à un contrôle de version et d'empreinte de la source avant d'être utilisées.

### 2.4 Limites du Coach constatées

- La recherche de connaissances est lexicale ; les formulations éloignées des mots-clés peuvent être mal couvertes.
- Les données utilisateur chargées dépendent des champs effectivement disponibles et de la qualité des données persistées.
- Le LLM peut formuler une réponse, mais le code actuel ne prouve pas automatiquement la justesse de chaque chiffre ou recommandation conversationnelle.
- La télémétrie du Coach mesure des volumes, statuts HTTP, latence et tokens ; elle ne mesure pas la qualité métier des réponses.

## 3. Gemini Superviseur V1 : fonctionnement observé

### 3.1 Activation et configuration

`lib/bep-agent/config.js` exige :
- `BEP_AGENT_ENABLED=true` ;
- `BEP_AGENT_ZERO_BILLING_CONFIRMED=true` ;
- une clé Gemini disponible.

Le code accepte la clé dédiée `BEP_AGENT_GEMINI_API_KEY`, mais aussi `BEP_AI_API_KEY` en fallback. Le champ `keySource` distingue ces cas. La confirmation de facturation est une condition de configuration ; elle ne constitue pas une garantie contractuelle de gratuité.

### 3.2 Orchestration

`lib/bep-agent/index.js` :
- initialise les tables additives si l'agent est activé ;
- met en file deux types de tâches au démarrage ;
- interroge la file toutes les 15 secondes par défaut ;
- remet ces tâches en file toutes les six heures ;
- traite une tâche par tick et par instance ;
- limite les appels quotidiens par un compteur PostgreSQL.

La file utilise `FOR UPDATE SKIP LOCKED` et un bail de dix minutes pour récupérer les tâches abandonnées. Un service Render Free pouvant être suspendu, le planning toutes les six heures n'est pas une garantie d'exécution 24/7.

### 3.3 Revue documentaire

`runKnowledgeReview` lit jusqu'à 40 documents actifs de `bep_financial_knowledge`, puis demande à Gemini des propositions prudentes de clarification, mise à jour ou désactivation.

Point déterminant : le prompt interdit explicitement la recherche externe et la création de nouvelles affirmations. Gemini ne reçoit que les métadonnées et contenus déjà stockés. Le code contrôle le type de proposition, le slug, le nom et l'URL de la source, puis stocke les candidates en attente.

L'approbation humaine vérifie de nouveau la provenance, la version et l'empreinte du document source. Une approbation crée une surcouche additive ; elle ne remplace pas le seed. Cette protection est utile contre les propositions devenues obsolètes, mais elle ne prouve pas que le texte proposé est factuellement exact.

### 3.4 Revue qualité

`runQualityReview` transmet à Gemini :
- six scénarios synthétiques fixes ;
- des métriques opérationnelles agrégées du Coach sur les trente derniers jours.

Le prompt indique correctement que les réponses réelles du Coach ne sont pas fournies et interdit à Gemini de prétendre les avoir testées. Le résultat évalue donc les limites du protocole de test, pas les réponses effectivement produites par BP Conseil.

### 3.5 Accès et données

Les routes d'administration sont protégées par authentification et une allowlist d'identifiants administrateurs. Les données de télémétrie documentées sont agrégées et n'incluent pas les questions, réponses, identifiants de compte ou montants financiers personnels. Le worker Gemini ne lit pas directement `bep_user_data`.

Ces constats sont issus de l'inspection du code et des tests ; ils ne remplacent pas une vérification de la configuration réellement déployée.

## 4. Sources documentaires initiales

Le fichier `lib/bep-financial-knowledge-seed.js` contient 14 entrées initiales, notamment :
- Banque de France / Mes questions d'argent : budget, provisions, épargne de précaution, dettes ;
- AMF : comportement, investissement, diversification et risque ;
- OCDE : revenus variables et éducation financière ;
- Service-Public.fr : crédit à la consommation ;
- règles internes BEP : intégrité des données et comptabilité de trésorerie.

Ce nombre décrit le seed du code, pas le nombre réel de lignes actuellement en base. Les URL sont enregistrées comme métadonnées ; le pipeline V1 ne télécharge pas les pages, ne vérifie pas les dates de publication et ne détecte pas les changements de contenu.

## 5. Constats et risques classés

### P0 — À traiter avant toute activation ou extension

1. **Ambiguïté de la clé Gemini** : le code autorise le fallback sur `BEP_AI_API_KEY`, alors que la documentation d'architecture présente une clé dédiée comme condition. Le partage de projet Google, de quotas et de facturation peut être involontaire. La V2 doit exiger une clé dédiée et supprimer le fallback.
2. **Le flag de facturation n'est pas une preuve de gratuité** : le nom `BEP_AGENT_ZERO_BILLING_CONFIRMED` peut donner une assurance excessive. Il doit être remplacé par une confirmation explicite de budget/plafond, et l'activation doit rester manuelle.
3. **Pas de contrôle réel du Coach** : aucune réponse du véritable endpoint n'est évaluée. Il ne faut pas qualifier le système de superviseur qualité tant que le banc de tests réel n'existe pas.

### P1 — Fiabilité de l'agent

4. **Décompte des tentatives incohérent** : `claim` incrémente déjà `attempts`, puis `fail` calcule le retry avec `attempts + 1`. La limite réelle de tentatives est donc inférieure à `max_attempts` (pour 3, deux essais seulement).
5. **Jobs reportés sans trace de run** : lorsque le quota est atteint, le job est déplacé au lendemain mais marqué comme terminé dans l'objet de run local, puis aucun run n'est enregistré. L'état de file et le journal d'audit deviennent difficiles à interpréter.
6. **Persistance des métriques non atomique** : `recordRun` écrit le run, met à jour l'usage et agrège les métriques en requêtes séparées. Une erreur intermédiaire peut laisser des compteurs incohérents.
7. **Cadence non garantie** : les intervalles en mémoire et le plan Render Free ne garantissent ni disponibilité permanente ni exécution à heure fixe. Il faut un ordonnanceur durable ou un service toujours actif, avec surveillance du retard de file.

### P1 — Qualité documentaire et factuelle

8. **Aucune collecte de source externe** : les pages officielles ne sont jamais consultées. Pas de date de publication, date d'accès, date d'effet, validité, version de texte ou historique de changement.
9. **Validation de provenance ≠ validation de vérité** : le nom et l'URL identiques ne valident pas le fond de la proposition Gemini. La V2 doit attacher des extraits exacts et vérifiables, et imposer une validation humaine.
10. **Pas de vérification de chiffres** : aucune comparaison à des API officielles ou à des fonctions déterministes de référence.

### P2 — Couverture et observabilité

11. **Corpus de six cas trop limité** : il ne couvre pas suffisamment les erreurs de calcul, les périodes, doublons, transferts, données manquantes, fiscalité, prestations, surendettement, fraude, ambiguïtés et cas de sécurité.
12. **RAG lexical** : le retrieval peut manquer des questions sémantiquement proches sans partager les mots-clés.
13. **Métriques qualité insuffisantes** : latence et codes HTTP ne permettent pas de mesurer exactitude, complétude, citation, conformité ou taux d'hallucination.
14. **État runtime non vérifié** : les variables d'environnement, le nombre de jobs en attente, les derniers appels Gemini et l'état réel de Render n'ont pas été lus. Aucun statut d'activation en production ne peut être affirmé.

## 6. Architecture V2 recommandée

Séparer strictement trois plans :

1. **Plan métier — BP Conseil** : interface, données personnelles, règles financières déterministes, calculs, décisions et réponses utilisateur.
2. **Plan de connaissance — service de sources** : connecteurs en lecture seule vers des sources officielles, collecte, normalisation, archivage, dates, empreintes, citations et alertes de fraîcheur.
3. **Plan de supervision — Gemini** : analyse des sources collectées, propositions documentaires, exécution des scénarios de test via une interface dédiée, classification des anomalies et recommandations. Aucun droit d'écriture direct sur les données métier ou la base de connaissances active.

### Flux documentaire cible

Source officielle autorisée → collecteur contrôlé → document brut versionné → extraction et empreinte → contrôle de fraîcheur/provenance → Gemini analyse et propose → validation humaine → tests de non-régression → publication versionnée → rollback possible.

### Flux de contrôle qualité cible

Cas synthétique versionné → endpoint de test isolé du Coach → réponse réelle capturée dans un environnement de test sans données personnelles → évaluateurs déterministes → vérification des références → Gemini analyse les écarts → rapport de qualité → validation humaine des corrections.

### Vérification des chiffres

Les calculs doivent être validés par des fonctions déterministes et des jeux de référence. Les données publiques volatiles doivent provenir de sources officielles/API autorisées. Gemini peut expliquer un écart ; il ne doit jamais être l'unique arbitre d'un calcul.

## 7. Ordre de réalisation

- **P0** : verrouiller la configuration et les coûts ; corriger le suivi des jobs ; définir les contrats et les limites de sécurité.
- **P1** : construire le collecteur de sources officielles, le registre de provenance et le versionnement.
- **P1** : construire le banc d'exécution réel du Coach avec données synthétiques exclusivement.
- **P1** : construire les validateurs déterministes et la comparaison des chiffres.
- **P2** : améliorer le retrieval, les métriques de qualité, les alertes et le tableau de bord.
- **P2** : mettre en place la planification durable et les procédures de reprise.

## 8. Vérifications et limites

Les tests présents dans le dépôt couvrent la configuration fail-closed, le client Gemini, la provenance des propositions, les scénarios synthétiques, la migration additive et des opérations de file PostgreSQL. Le test DB est conditionné à `DATABASE_URL`. L'existence de ces tests ne signifie pas qu'ils ont été exécutés pendant cet audit.

Aucune donnée de production, clé, variable d'environnement, journal Render, base active ou réponse réelle du Coach n'a été consultée. Aucun test dynamique n'a été lancé.

## 9. Conclusion

La V1 fournit une isolation intéressante, une file persistante, une validation humaine et des empreintes de source. Mais elle ne recherche pas les informations financières actualisées et n'évalue pas encore les réponses réelles de BP Conseil. La V2 doit donc ajouter des sources vérifiables, un banc de tests réel, des validateurs chiffrés déterministes et une orchestration fiable, sans donner à Gemini le pouvoir de modifier les données personnelles ou les règles métier.
