# BEP Coach — Architecture Groq hybride

- **Statut :** proposition technique — non implémentée
- **Périmètre :** Coach utilisateur, documents personnels, recherche documentaire hybride
- **Référence :** branche `main`, commit `0b22c042f4bd0aaa10db4a3d8e401d6949e38625`
- **Principe :** séparation stricte entre le Coach et l'agent administratif

## 1. Objectifs et invariants

BEP Coach doit pouvoir utiliser Groq pour :
1. assister les réponses conversationnelles ;
2. analyser les documents déposés par l'utilisateur ;
3. assister la collecte et la qualification documentaire selon un périmètre et des sources explicitement autorisés.

L'architecture conserve les règles suivantes :

- Les calculs, agrégations, règles financières et contrôles métier sont exécutés par BEP de façon déterministe.
- Le LLM formule, explique, classe et synthétise ; il n'est jamais la source de vérité des données financières.
- Toute réponse documentaire doit distinguer les faits du compte, les règles BEP, les sources documentaires et les limites de couverture.
- Les documents importés et contenus externes sont des données non fiables, jamais des instructions système.
- Les documents personnels sont cloisonnés par utilisateur.
- Aucune proposition administrative en attente ne peut être consultée par le Coach.
- Aucun contenu ne rejoint la bibliothèque commune validée sans validation humaine explicite.
- Aucune bascule silencieuse vers Gemini ou vers la clé de l'autre runtime n'est autorisée.

## 2. État existant observé

L'audit du code sur `main` a identifié :

| Composant | État observé | Conséquence |
|---|---|---|
| `POST /api/ai/chat` | Parcours Coach local, construit autour de `buildIntelligence()` et `routeStructuredQuestion()` | Son évolution vers un appel Groq doit être explicite et testée |
| `lib/bep-financial-intelligence.js` | Assemble bibliothèque BEP active, connaissances administratives approuvées et connaissances personnelles acceptées/non expirées | Réutiliser les règles de sélection et conserver les filtres d'accès |
| Recherche documentaire | Lexicale/contextuelle : mots normalisés, mots-clés, titre, contenu, catégorie et contexte financier | Pas de recherche vectorielle/sémantique identifiée dans l'audit |
| `lib/bep-document-ingestion.js` | Collecte HTTP native de pages web et création de candidats administratifs en attente | Composant du circuit Admin ; ne pas le réutiliser directement dans le runtime Coach | 
| `lib/bep-coach-ingestion.js` | Module existant audité : dépend de `resolveAdminGeminiKey` dans `lib/bep-agent/config.js`, des paramètres `BEP_AGENT_*` et du workflow de candidats Admin ; son analyse appelle Gemini | Dépendance Admin à isoler ; non réutilisable par le Coach en l'état |
| `lib/bep-agent/groq-client.js` | Client Groq administratif, sorties JSON Schema strictes | Référence d'implémentation seulement ; ne pas partager le runtime |
| `lib/bep-agent/config.js` | Configuration administrative et clé dédiée `BEP_AGENT_GROQ_API_KEY` | Conserver cette configuration indépendante |
| `tests/bep-agent.test.js` | Tests d'isolation et de comportement administratif | Étendre les tests sans affaiblir les garanties existantes |

Les constats ci-dessus décrivent les fichiers consultés. Ils ne constituent pas une validation d'exécution en staging ou en production. La disponibilité de pgvector, le schéma exact des tables utilisateur, les limites de stockage et les formats de fichiers réellement supportés restent à vérifier avant implémentation.

## 3. Architecture logique cible

```text
Espace Coach
  UI Coach
    -> API Coach authentifiée
      -> Coach Orchestrator
        -> règles et calculs BEP déterministes
        -> Knowledge Engine (lecture filtrée)
        -> Groq Coach Runtime
        -> validation de sortie et citations

Espace Administration (indépendant)
  UI Admin
    -> API Admin avec authentification admin indépendante
      -> Admin Orchestrator existant
        -> Groq Admin Runtime
        -> candidats / revue / approbation humaine

Seul partage autorisé :
  bibliothèque BEP publiée et validée
  exposée en lecture seule au Coach
```

Le partage porte sur des données publiées et validées, pas sur les processus, les identifiants, les clés, les sessions, les files de travail ou les contextes des agents.

## 4. Isolation des runtimes

### Coach

Variables proposées, à confirmer avec les conventions de configuration du dépôt :

- `BEP_COACH_AI_ENABLED`
- `BEP_COACH_GROQ_API_KEY`
- `BEP_COACH_GROQ_MODEL`
- `BEP_COACH_MAX_CALLS_PER_DAY`
- `BEP_COACH_MAX_TOKENS`
- budget/coût maximal explicite si la facturation le nécessite.

### Administration

Conserver le runtime existant et sa clé :

- `BEP_AGENT_GROQ_API_KEY`
- configuration et quotas administratifs existants.

### Règles de séparation

- Aucun fallback Coach vers `BEP_AGENT_GROQ_API_KEY`.
- Aucun fallback Admin vers `BEP_COACH_GROQ_API_KEY`.
- Aucun partage de client singleton si celui-ci transporte configuration, quota ou contexte.
- Le runtime Admin ne reçoit pas les données personnelles ou conversations du Coach par défaut.
- Le Coach ne lit ni les jobs Admin, ni les runs Admin, ni les candidats en attente.
- Les endpoints Coach et Admin gardent leurs mécanismes d'authentification propres.
- Les journaux ne contiennent ni clés, ni documents complets, ni questions/réponses personnelles en clair.

## 5. Orchestration du dialogue Coach

Le point d'entrée existant reste `POST /api/ai/chat`, sous réserve de validation du contrat actuel.

Flux cible :

1. Authentifier la session BEP.
2. Valider et borner la question.
3. Charger le contexte financier du compte authentifié.
4. Router les questions reconnues vers les réponses structurées déterministes.
5. Récupérer les règles BEP et documents autorisés via le Knowledge Engine.
6. Construire un contexte limité, sourcé et séparant faits du compte, règles BEP et documents personnels.
7. Appeler Groq via le runtime Coach dédié lorsque cela apporte une valeur.
8. Valider la structure, les affirmations et les références de la réponse.
9. Retourner la réponse, ses sources, les limites éventuelles et un indicateur de mode (déterministe, documentaire ou assisté par IA).

Si Groq est indisponible, le système peut retourner une réponse déterministe ou documentaire locale lorsque celle-ci est suffisante. Sinon il doit signaler la limite. Il ne doit pas inventer une réponse ni changer de fournisseur en silence.

## 6. Knowledge Engine hybride

Modules proposés :

```text
lib/bep-knowledge-engine/
  retrieval.js
  lexical-search.js
  vector-search.js
  ranking.js
  citations.js
```

Sources autorisées :
1. bibliothèque BEP institutionnelle publiée ;
2. surcouches administratives explicitement approuvées et toujours conformes à leur empreinte source ;
3. connaissances personnelles explicitement acceptées et non expirées ;
4. documents personnels appartenant à l'utilisateur authentifié.

Stratégie de recherche :
- recherche lexicale existante comme baseline ;
- recherche vectorielle optionnelle après preuve de faisabilité PostgreSQL ;
- fusion et classement des résultats ;
- filtrage des permissions avant assemblage du contexte ;
- citations stables vers document, page/section ou segment ;
- seuil de pertinence et réponse « couverture insuffisante » en dessous du seuil.

Avant de retenir pgvector, vérifier l'extension sur la base cible, les droits d'installation, les versions, le volume attendu, les coûts de stockage et la stratégie de génération/versionnement des embeddings. Prévoir une solution lexicale fonctionnelle si le vectoriel n'est pas disponible.

## 7. Intelligence documentaire et documents personnels

### Frontière stricte avec l'ingestion administrative existante

Le module existant `lib/bep-coach-ingestion.js` est rattaché au circuit administratif : il importe `resolveAdminGeminiKey` depuis `lib/bep-agent/config.js`, dépend notamment de `BEP_AGENT_ENABLED`, `BEP_AGENT_RUN_MODE` et `BEP_AGENT_FREE_TIER_ACKNOWLEDGED`, et son analyse utilise Gemini ainsi que le workflow de candidats administratifs. **Il est interdit de l'importer ou de l'appeler depuis le runtime Coach**, même pour une fonction apparemment générique.

Même interdiction de réutilisation directe pour `lib/bep-document-ingestion.js` lorsqu'elle entraîne la création ou la consultation de candidats Admin. Le Coach dispose de son propre service d'ingestion et de ses propres interfaces.

Une mutualisation future est possible uniquement après extraction et audit de primitives réellement neutres (par exemple validation HTTPS/URL, résolution DNS publique et extraction HTTP native), dans un module sans import Admin, sans clé fournisseur, sans variable `BEP_AGENT_*`, sans accès aux jobs/candidats et sans effet de bord métier. Ces primitives doivent être couvertes par des tests SSRF et de non-régression. À défaut, implémenter une version Coach indépendante plutôt que créer un couplage. Les clés, clients LLM, prompts, files de travail, quotas, journaux et permissions restent séparés.

Modules proposés :

```text
lib/bep-document-intelligence/
  ingestion.js
  extraction.js
  classification.js
  chunking.js
  analysis.js
  provenance.js
```

Parcours cible :
- dépôt authentifié ;
- validation du type réel de fichier, taille, extension et signature MIME ;
- contrôle antivirus/malware si l'infrastructure le permet ;
- stockage privé, hors répertoire public ;
- extraction du texte et conservation des métadonnées utiles ;
- découpage en segments avec références de page/section ;
- empreinte SHA-256, propriétaire, dates, type et statut ;
- analyse Groq avec schéma de sortie strict ;
- validation et présentation des résultats à l'utilisateur ;
- indexation dans le périmètre privé de ce compte ;
- suppression cohérente du fichier, des segments, embeddings et métadonnées associées.

Formats à décider après vérification des dépendances et des limites : PDF, DOCX, TXT et éventuellement formats bureautiques supplémentaires. Ne pas annoncer un support de format avant test réel.

Les documents peuvent contenir des instructions malveillantes ou trompeuses. Leur contenu doit être explicitement encadré comme données citées, jamais comme instructions à suivre. Les sorties IA doivent rester des propositions explicables et sourcées.

## 8. Collecte documentaire externe

La collecte externe accessible depuis le Coach est **déclenchée explicitement par l'utilisateur**, dans le cadre de sa demande ou après confirmation claire de l'action proposée. Aucun crawl autonome, aucune veille en arrière-plan et aucune collecte planifiée ne sont inclus dans ce périmètre initial.

- Le Coach peut rechercher et collecter des pages publiques utiles à la demande de l'utilisateur, uniquement sur des domaines autorisés par une politique serveur explicite (allowlist initiale configurable et contrôlée). Une URL fournie par l'utilisateur ne contourne jamais cette politique.
- Avant toute requête, appliquer validation HTTPS, résolution DNS publique, blocage des IP privées/réservées, contrôle de chaque redirection, limites de taille, durée, profondeur et nombre de pages. Ne jamais accepter de credentials, de schéma non HTTP(S), ni d'accès à des ressources internes.
- Conserver URL canonique, date de collecte, titre, hash, contenu extrait, domaine et provenance. Présenter les sources à l'utilisateur et signaler les pages inaccessibles ou non extractibles.
- Les contenus collectés sont des données non fiables et restent privés dans l'espace de l'utilisateur demandeur par défaut. Ils ne deviennent pas automatiquement des connaissances personnelles acceptées, ni des éléments de la bibliothèque commune.
- L'utilisateur peut demander l'analyse d'une source ou d'un ensemble de sources ; l'indexation dans son espace privé doit respecter les mêmes règles de consentement, rétention et suppression que les documents déposés.
- Tout contenu proposé pour la bibliothèque commune suit exclusivement le circuit Admin existant, avec candidat distinct, revue et approbation humaine. Le Coach ne lit ni n'écrit directement dans la file Admin.
- Respecter les droits d'accès, conditions d'utilisation et droits de reproduction des sources ; ne pas contourner paywalls, authentifications ou protections techniques.

## 9. Routes envisagées

À confirmer par recherche exhaustive des routes existantes avant codage :

| Route proposée | Fonction | Contrôle |
|---|---|---|
| `POST /api/ai/chat` | Dialogue enrichi | Session utilisateur |
| `POST /api/ai/documents` | Dépôt d'un document personnel | Session + quota + propriété |
| `GET /api/ai/documents` | Liste des documents personnels | Session + filtrage propriétaire |
| `POST /api/ai/documents/:id/analyze` | Analyse d'un document | Session + propriété |
| `DELETE /api/ai/documents/:id` | Suppression | Session + propriété |

Les routes Admin restent dans leur espace indépendant. Aucun endpoint Admin ne doit être appelé depuis le parcours conversationnel utilisateur.

## 10. Modèle de données — proposition, non migration

Le modèle cible devra au minimum permettre de stocker :

- document : identifiant, propriétaire, nom, type, taille, hash, emplacement privé, statut, dates ;
- segment : document parent, propriétaire, numéro/page, texte extrait ou référence sécurisée, hash ;
- index : modèle/version d'embedding, vecteur si disponible, date d'indexation ;
- analyse : document, version de prompt/modèle, résultat validé, références, date ;
- quotas : propriétaire, période, nombre d'appels, tokens et coûts agrégés.

Les noms définitifs, contraintes, index, clés étrangères et politiques de rétention seront établis après inspection des migrations et tables existantes. Ne pas exécuter de migration avant validation du schéma et du plan de rollback.

## 11. Sécurité, confidentialité et coûts

### Données transmises au fournisseur Groq

L'appel à Groq constitue une transmission à un fournisseur externe. Il ne doit pas être activé implicitement par le simple fait d'utiliser le Coach.

- Avant le premier traitement externe, présenter une information compréhensible indiquant les catégories de données susceptibles d'être transmises, la finalité, le fournisseur, les durées/règles de conservation applicables connues, les éventuels transferts et les choix disponibles. Recueillir un consentement/opt-in explicite, distinct et révocable, selon les exigences juridiques applicables.
- Le statut de consentement est vérifié côté serveur à chaque appel externe. Sans consentement valide, aucun prompt, document, extrait, embedding ou contexte personnel n'est envoyé à Groq.
- Prévoir un mode **local uniquement** en cas de refus ou de retrait : réponses déterministes BEP, recherche locale et documents traités localement si l'infrastructure le permet. Si la réponse nécessite réellement le LLM distant, expliquer la limite et ne pas contourner le choix.
- Appliquer la minimisation avant construction du prompt : n'envoyer que les champs strictement nécessaires à la question, privilégier des agrégats ou valeurs dérivées, limiter le nombre d'opérations et d'extraits, tronquer les historiques et exclure les données sans rapport avec la demande.
- Ne jamais transmettre les mots de passe, tokens de session, clés API, coordonnées bancaires complètes, données de carte, secrets d'authentification ou identifiants techniques. Les identifiants directs (nom, adresse, email, téléphone, numéros de compte) sont exclus par défaut et ne peuvent être inclus que si une nécessité démontrée et une base/autorisation appropriée le justifient.
- Les données financières (revenus, dépenses, transactions, dettes, soldes, objectifs et historique) sont considérées comme sensibles dans le modèle de menace BEP : elles ne sont transmises que si elles sont indispensables à la question et couvertes par l'opt-in. Préférer les totaux, catégories et plages aux lignes détaillées.
- Les documents personnels ne sont jamais envoyés en intégralité par défaut. Afficher les catégories/extraits destinés à l'analyse, permettre une sélection ou une occultation lorsque c'est pertinent, puis n'envoyer que les passages nécessaires. Les documents contenant des données particulièrement sensibles ou sans rapport sont exclus du traitement distant par défaut.
- Ne pas générer d'embeddings via un service tiers sans appliquer le même contrôle de consentement et de minimisation : un embedding dérivé reste une donnée issue du contenu personnel.
- Ne pas journaliser prompts, réponses, documents ou extraits personnels en clair. Les traces techniques se limitent aux identifiants techniques pseudonymisés, fournisseur/modèle, horodatage, compteurs de tokens/coûts et codes d'erreur nécessaires.

### Vérifications fournisseur obligatoires avant activation

Les conditions réelles de traitement, de rétention, d'utilisation pour l'entraînement, de localisation et de sous-traitance de Groq ne sont pas établies par cette spécification. Elles doivent être vérifiées dans les documents contractuels et paramètres applicables au compte BEP avant toute activation en production. Ne pas promettre « zéro rétention » ou « aucune utilisation pour l'entraînement » sans preuve contractuelle applicable. Si ces garanties et l'analyse juridique requise ne sont pas satisfaisantes, conserver le mode local uniquement.

### Contrôles techniques complémentaires

- Contrôle d'accès par propriétaire au niveau de chaque requête SQL, pas seulement dans l'interface.
- Protection CSRF et validation de session selon les conventions BEP existantes.
- Limites de taille, débit, durée d'extraction, nombre de pages et nombre de documents.
- Protection SSRF pour toute collecte URL, validation des redirections et blocage des réseaux privés.
- Quotas et budgets Coach indépendants des quotas Admin.
- Timeout, gestion des erreurs, limitation des retries et circuit breaker.
- Pas de fallback silencieux vers Gemini ou vers le runtime Admin.
- Rétention et suppression documentées, y compris fichiers, extraits, index, embeddings, caches et sauvegardes selon la politique définie.
- Traçabilité du consentement (version de notice, date, portée, retrait) sans stocker le contenu personnel dans cette trace.

## 12. Tests d'acceptation obligatoires

### Isolation
- Un utilisateur A ne peut ni lister, ni lire, ni analyser, ni supprimer un document de B.
- Les endpoints Coach ne peuvent pas accéder aux candidats, jobs ou runs Admin.
- Les endpoints Admin n'accèdent pas au contexte financier personnel par défaut.
- Les clés Coach et Admin ne sont jamais interchangeables.
- Les propositions non approuvées ne sont jamais visibles par le Coach.

### Dialogue et exactitude
- Les questions calculatoires reconnues continuent d'utiliser les règles BEP déterministes.
- Les calculs sont identiques à ceux du moteur BEP, indépendamment de la formulation Groq.
- Les réponses documentaires citent les sources réellement récupérées.
- Une couverture insuffisante est explicitement signalée.
- Une réponse IA invalide ou non conforme au schéma est rejetée.

### Documents
- Tests réels d'extraction pour chaque format annoncé.
- Tests de fichiers trop volumineux, malformés, falsifiés ou malveillants.
- Tests d'injection de prompt dans les documents.
- Suppression complète des données dérivées.
- Provenance et références de pages conservées.

### Résilience et coûts
- Groq timeout, 429, 5xx et réponse malformée.
- Quotas appliqués côté serveur.
- Aucun fallback fournisseur implicite.
- Mode local déterministe/documentaire fonctionnel lorsque possible.

### Non-régression
- Parcours Coach existant.
- Bibliothèque documentaire active et connaissances personnelles.
- Authentification Admin indépendante.
- Circuits de revue et d'approbation Admin.
- Frontend source/dist si les deux sont maintenus.

## 13. Phasage proposé

1. **Phase 0 — audit approfondi** : schémas, routes, stockage, dépendances, configuration Render, contrats API et tests actuels.
2. **Phase 1 — runtime Coach** : clé dédiée, client Groq, quotas, validation, observabilité minimale.
3. **Phase 2 — dialogue** : orchestration et tests du parcours `/api/ai/chat`.
4. **Phase 3 — recherche hybride** : évaluation lexicale, preuve vectorielle, ranking et citations.
5. **Phase 4 — documents personnels** : upload, extraction, analyse, stockage et suppression.
6. **Phase 5 — collecte externe Coach** : sources autorisées, provenance et validation.
7. **Phase 6 — audit sécurité** : tests d'isolation, tests dynamiques, coûts et non-régression.

Chaque phase doit être livrée sur une branche isolée et faire l'objet d'une revue distincte. Aucun merge, déploiement staging ou publication n'est inclus dans cette spécification.

## 14. Cartographie initiale des zones du dépôt à auditer avant développement

| Zone | Rôle dans l'audit |
|---|---|
| `server.js` | Routes Coach/Admin, middleware, authentification et orchestration |
| `lib/bep-financial-intelligence.js` | Contexte financier, récupération documentaire et isolation |
| `lib/bep-document-ingestion.js` | Collecte web existante, SSRF, provenance et candidats |
| `lib/bep-coach-ingestion.js` | Module existant rattaché au circuit Admin/Gemini ; analyser ses dépendances et le maintenir hors du runtime Coach |
| `lib/bep-coach-services.js` | Politique de recherche et catégories autorisées |
| `lib/bep-agent/groq-client.js` | Référence de client Groq JSON Schema, sans partage runtime |
| `lib/bep-agent/config.js` | Référence de configuration Admin, à préserver |
| `database/migrations/` | Schémas, contraintes et possibilité d'extension |
| `tests/` | Tests de sécurité, contrats et non-régression |
| `package.json` | Dépendances d'extraction, parsing et tests |
| stockage / configuration Render | Emplacement privé, limites et variables séparées |

Cette cartographie est une liste de zones à examiner, pas une affirmation que chaque fonctionnalité est présente dans ces fichiers.

## 15. Décisions encore ouvertes

Aucune décision technique ne doit être prise par défaut sur ces points :
- extension vectorielle réellement disponible et autorisée ;
- fournisseur et modèle d'embeddings ;
- formats de fichiers de la V1 ;
- stockage privé et durée de rétention ;
- politique de collecte externe accessible depuis le Coach ;
- limites de taille, quotas et budget ;
- politique de conservation des documents après analyse ;
- comportement produit exact lorsque Groq est indisponible.

**Critère de sortie de la phase 0 :** un audit de code et de schéma documenté, des contrats API précis, un modèle de menace, des tests d'acceptation et un chiffrage de coûts. Aucun développement fonctionnel ne commence avant validation de ces éléments.
