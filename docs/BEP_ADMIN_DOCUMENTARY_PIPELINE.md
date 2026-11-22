# BEP — Pipeline administratif d'optimisation documentaire

- Statut : architecture cible de l'agent documentaire administratif
- Périmètre : recherche, audit et propositions d'amélioration de la bibliothèque documentaire de référence
- Hors périmètre : réponses conversationnelles utilisateur, analyse de documents personnels, calculs financiers et décisions métier
- Référence de code : branche `main` au 22 novembre 2026

## 1. Invariants non négociables

1. Groq est exclusivement un moteur IA interne à l'administration BEP. Il n'est jamais appelé depuis le parcours utilisateur du Coach.
2. Le Coach reste local et indépendant de Groq. Il lit uniquement la bibliothèque documentaire publiée et validée.
3. Le moteur financier BEP reste déterministe. Aucun calcul, agrégat, règle ou décision financière n'est délégué à un LLM.
4. La recherche de sources et la récupération documentaire sont distinctes du fournisseur de modèle. Groq analyse des documents récupérés ; il ne constitue pas à lui seul un moteur de recherche web.
5. Tout contenu externe est non fiable et ne peut jamais être interprété comme une instruction.
6. Toute proposition conserve provenance, URL, date de collecte, empreinte, références de passage et niveau de confiance.
7. Aucune création, correction, désactivation ou publication automatique dans la bibliothèque de référence.
8. Toute publication est déclenchée par un administrateur authentifié et autorisé, avec contrôle de version et de provenance.
9. Les secrets, clés et contextes des agents ne sont jamais partagés entre runtimes.
10. Les contrôles et tests distinguent les tests statiques, unitaires simulés, intégration réelle et vérifications de staging/production.

## 2. Responsabilités

| Composant | Responsabilité |
| --- | --- |
| Groq Admin Runtime | Analyse, classification, synthèse, détection de lacunes, propositions structurées |
| Source Retriever | Recherche et récupération des sources externes autorisées |
| Source Registry | Provenance, fraîcheur, empreintes, statut éditorial et historique de contrôle |
| Documentary Pipeline | Orchestration des tâches d'audit, collecte, analyse et génération de propositions |
| PostgreSQL | File de tâches, sources, résultats, propositions, versions et traces d'audit |
| Administration BEP | Revue, approbation/rejet, publication, restauration |
| Bibliothèque publiée | Référence documentaire lue par le Coach |
| Coach local | Réponses utilisateur à partir de données BEP et de la bibliothèque publiée |
| Moteur financier | Calculs et règles déterministes indépendants |

## 3. État initial observé sur main

- Le client Groq administratif existe dans `lib/bep-agent/groq-client.js` et utilise Structured Outputs stricts.
- La configuration administrative sélectionne le fournisseur via `BEP_AGENT_AI_PROVIDER`, avec clé dédiée `BEP_AGENT_GROQ_API_KEY` et modèle `BEP_AGENT_GROQ_MODEL`.
- Le runtime administratif et sa file PostgreSQL existent ; les tâches actuelles sont `knowledge_review` et `coach_quality_review`.
- Le worker actuel compare des fiches PostgreSQL à trois fichiers JSON locaux. Il ne réalise pas de recherche externe.
- Les propositions sont stockées dans `bep_knowledge_candidates` et nécessitent une décision explicite.
- L'administration dispose déjà de fonctions de validation, de versionnage et de restauration des fiches.
- La recherche documentaire du Coach est principalement lexicale/contextuelle. Elle doit rester indépendante et ne pas être modifiée par ce pipeline.
- Le registre de fraîcheur des sources est présent dans une PR non fusionnée (#334) et ne doit pas être considéré comme déployé.
- La PR #344 documente un ancien scénario d'appel Groq par le Coach. Cette architecture est abandonnée et cette PR ne doit pas être fusionnée en l'état.

Ces constats proviennent de la lecture du dépôt. Ils ne prouvent pas qu'un traitement a été exécuté en staging ou en production.

## 4. Architecture cible

```text
Administration BEP (auth indépendante)
  -> Documentary Pipeline / queue PostgreSQL
      -> Source Retriever (recherche et récupération HTTPS autorisées)
      -> Source Registry (provenance, fraîcheur, digest)
      -> Groq Admin Runtime (analyse structurée, jamais dialogue utilisateur)
      -> Deterministic Validators
          - schéma et champs obligatoires
          - source et citations vérifiables
          - doublons et similarité
          - contradictions et dates
          - couverture documentaire
      -> Proposal Store (pending only)
  -> Revue humaine
      -> publication transactionnelle / rejet
      -> version history + rollback
  -> Bibliothèque publiée (lecture seule pour Coach local)

Coach utilisateur -> API locale -> calculs déterministes + bibliothèque publiée
Aucun appel Coach -> Groq
```

## 5. Pipeline fonctionnel

### P0 — Audit et spécification
- Cartographier runtime, clés, routes, tables, migrations, sources, publication et rollback.
- Définir les invariants d'isolation et les tests de non-régression.
- Documenter les capacités réellement existantes et les écarts.

### P1 — Recherche documentaire et collecte contrôlée
- Le Retriever est indépendant de Groq.
- Utiliser uniquement des sources publiques explicitement autorisées par une politique serveur.
- HTTPS uniquement ; validation DNS publique, blocage des IP privées/réservées, contrôle des redirections, limites de taille/temps/profondeur.
- Respecter robots, conditions d'utilisation, droits de reproduction et protections d'accès.
- Enregistrer URL canonique, domaine, titre, date, statut HTTP, date de collecte et SHA-256.
- Aucun crawl autonome ou planifié n'est activé sans décision séparée.
- La collecte manuelle est déclenchée par l'administrateur.

### P2 — Analyse et audit de bibliothèque par Groq
- Envoyer à Groq uniquement les extraits strictement nécessaires, les métadonnées de provenance et les fiches pertinentes.
- Détecter couverture insuffisante, informations anciennes, ambiguïtés, incohérences et besoins de clarification.
- Retourner un schéma strict : observations, preuves, références de source, niveau de confiance et proposition éventuelle.
- Le modèle ne crée jamais une source et ne transforme jamais une hypothèse en fait.
- Les validations déterministes rejettent les sorties sans source vérifiable.

### P3 — Qualité documentaire
- Détecter doublons exacts par hash et quasi-doublons par normalisation/similarité.
- Détecter contradictions candidates par sujet, périmètre, juridiction, date d'effet et valeurs incompatibles.
- Ne pas résoudre automatiquement les contradictions : produire des dossiers de revue avec les deux preuves.
- Mesurer la couverture par catégorie, sujet et intention documentaire.
- Distinguer fraîcheur technique et validité éditoriale.

### P4 — Propositions, validation et publication
- Chaque proposition est liée à la version source et à son empreinte.
- États : pending, approved, rejected, superseded.
- L'approbation exige une session admin indépendante, un contrôle de conflit de version et une provenance vérifiée.
- Publication atomique, versionnage immuable et auteur/date de validation.
- Restauration en créant une nouvelle version ; ne jamais effacer l'historique.
- Aucune écriture du pipeline dans la bibliothèque publiée hors action d'approbation.

### P5 — Banc de référence et amélioration continue
- Constituer des questions de référence par catégorie et difficulté, avec critères attendus, interdits et sources obligatoires.
- Exécuter les mêmes questions contre la version publiée courante et la version candidate isolée.
- Mesurer couverture, exactitude des citations, abstention justifiée, contradictions, omissions et régressions.
- Les résultats du LLM sont évalués par des assertions déterministes autant que possible ; un juge IA ne peut pas être l'unique arbitre.
- Une version candidate n'est publiable que si elle ne régresse pas sur les cas critiques et si les seuils définis sont atteints.
- Conserver corpus, versions, résultats et empreintes pour répétabilité.

## 5 bis. Implémentation initiale ajoutée dans la branche

### P1 — Retrieval indépendant
- Module : `lib/bep-agent/source-search.js`.
- Fournisseur de recherche : Exa Search API, indépendant de Groq.
- Routes admin : `GET /api/admin/bep-agent/source-search/status` et `POST /api/admin/bep-agent/source-search`.
- Liste initiale de domaines institutionnels autorisés, alignée sur les domaines acceptés par l'import documentaire structuré.
- Extraits limités ; aucune écriture dans la bibliothèque à la seule suite d'une recherche.
- Activation explicite requise : `BEP_AGENT_SOURCE_SEARCH_ENABLED=true` et clé dédiée `BEP_AGENT_EXA_API_KEY`.

### P2 — Analyse Groq asynchrone
- Module : `lib/bep-agent/documentary-analysis.js`.
- Le prompt Groq reçoit uniquement les sources recherchées et les fiches publiées pertinentes, sans données de compte.
- Les sorties strictes sont vérifiées contre les URL récupérées et les fiches existantes.
- Les créations et corrections sont enregistrées comme candidats en attente.
- Job : `documentary_research`, traité par `agent-documentary-worker.js`.
- Route de mise en file : `POST /api/admin/bep-agent/documentary-analyze`.
- La file PostgreSQL et l'historique de run sont réutilisés ; la migration additive est `20261122_bep_documentary_pipeline.sql`.

### P3 — Doublons et contradictions
- Les quasi-doublons sont détectés de façon déterministe par similarité de titres/contenus avant insertion d'une nouvelle fiche.
- Les contradictions, informations potentiellement obsolètes, lacunes et clarifications sont remontées comme findings Groq, avec URL de preuve vérifiée.
- Les findings sont conservés dans le résumé du run ; ils ne sont pas résolus automatiquement.
- Limite actuelle : la similarité est un filtre heuristique et les contradictions nécessitent toujours une revue humaine.

### P4 — Validation, publication et historique
- Les candidats utilisent le workflow administratif existant : approbation ou rejet par un administrateur indépendant.
- Les mises à jour vérifient toujours la version et l'empreinte de la source.
- Les créations approuvées reçoivent désormais une première entrée d'historique `created`.
- Les éditions, archivages et restaurations restent versionnés ; une restauration crée une nouvelle version.

### P5 — Banc de référence
- Module : `lib/bep-agent/library-benchmark.js`.
- Sept questions de référence couvrent budget, provisions annuelles, épargne, dettes, revenus variables et achats impulsifs.
- Mesures : Hit@3, Hit@6 et MRR, comparaison baseline/candidate et détection des régressions critiques.
- Route : `POST /api/admin/bep-agent/library-benchmark`, avec identifiants de candidats en attente.
- Limite explicite : ce premier banc mesure la couverture et le classement documentaire du retriever. Il ne prétend pas mesurer toute la qualité sémantique des réponses finales du Coach.

### Configuration Render à prévoir — sans secret dans Git
Service API :
- `BEP_AGENT_SOURCE_SEARCH_ENABLED=true`
- `BEP_AGENT_DOCUMENTARY_WORKER_ENABLED=true`
- `BEP_AGENT_EXA_API_KEY` (secret dédié)

Service Worker documentaire séparé :
- commande : `npm run agent:documentary-worker`
- `BEP_AGENT_ENABLED=true`
- `BEP_AGENT_RUN_AS_WORKER=true`
- `BEP_AGENT_RUN_MODE=admin_on_demand`
- `BEP_AGENT_FREE_TIER_ACKNOWLEDGED=true`
- `BEP_AGENT_AI_PROVIDER=groq`
- `BEP_AGENT_GROQ_API_KEY` (secret administratif existant, sans duplication inutile)
- `BEP_AGENT_GROQ_MODEL`
- `BEP_AGENT_EXA_API_KEY`
- `BEP_AGENT_SOURCE_SEARCH_ENABLED=true`
- `BEP_AGENT_DATABASE_URL` (connexion Worker dédiée ; jamais remplacée par `DATABASE_URL`)

Le flag API `BEP_AGENT_DOCUMENTARY_WORKER_ENABLED` ne doit être activé qu'après création et vérification du service Worker, de sa connexion PostgreSQL et de ses permissions. Les clés et URLs ne sont jamais copiées dans GitHub. Aucune variable Render n'est modifiée par cette PR.

## 6. Sécurité et confidentialité

- Le pipeline documentaire ne lit aucune donnée de compte, transaction, revenu, dépense, dette ou conversation utilisateur.
- Les clés Groq restent dédiées à l'administration ; aucun fallback vers les clés Coach ou Gemini.
- Les logs ne contiennent ni clé, ni prompt complet, ni contenu documentaire personnel.
- Les pages web, fichiers et résultats du modèle sont des données non fiables.
- Les appels externes sont limités, mesurés et déclenchés par un administrateur.
- Les actions d'approbation et de restauration sont auditées.

## 7. Critères d'acceptation globaux

- Test d'import : aucun module Coach ni route utilisateur n'importe le runtime Groq administratif.
- Test de configuration : l'absence de clé ou le désaccord de fournisseur désactive le pipeline sans fallback.
- Test Retriever : SSRF, redirections, DNS rebinding, URL non HTTPS et tailles excessives sont bloqués.
- Test de provenance : chaque proposition référence une source enregistrée et une empreinte stable.
- Test publication : aucune proposition pending n'est visible du Coach ; seul l'admin peut approuver.
- Test concurrence : une proposition fondée sur une source/version modifiée est rejetée (409).
- Test rollback : restauration crée une nouvelle version et préserve l'historique.
- Test qualité : le benchmark compare les versions courante et candidate sans exposer de données personnelles.
- CI verte avant revue ; tests réels de collecte et de Groq séparés des simulations.
- Aucun déploiement ou changement de configuration Render sans revue explicite.

## 8. Variables d'environnement

Conserver le runtime administratif existant :
- `BEP_AGENT_ENABLED`
- `BEP_AGENT_AI_PROVIDER=groq`
- `BEP_AGENT_GROQ_API_KEY`
- `BEP_AGENT_GROQ_MODEL`
- `BEP_AGENT_RUN_MODE=admin_on_demand`
- `BEP_AGENT_FREE_TIER_ACKNOWLEDGED`

Les identifiants de recherche externe éventuels doivent être distincts de la clé Groq. Aucune valeur secrète ne doit être ajoutée à ce document, aux tests ou aux journaux.

## 9. Déploiement

Les migrations restent opt-in, additives et réversibles. Le staging est la seule cible de validation initiale. La production n'est pas modifiée tant que les tests d'isolation, d'accès, de publication, de versionnage, de rollback et de benchmark ne sont pas validés.
