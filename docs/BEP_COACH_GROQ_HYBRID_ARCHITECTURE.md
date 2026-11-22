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


## 16. Contrats détaillés des quatre flux de données

Les quatre flux ci-dessous sont des parcours cibles distincts. Ils décrivent les contrôles à implémenter ; ils ne prétendent pas que ces parcours existent déjà. Le serveur détermine toujours l'identité et le propriétaire depuis la session authentifiée. Aucun identifiant user_id, rôle, droit ou statut de consentement transmis par le client ne fait autorité.

### 16.1 Flux A — Dialogue local sans fournisseur externe

\`\`\`text
Navigateur Coach
  -> API Coach : question
    -> Authentification de session
    -> résolution serveur du user_id
    -> validation de la question
    -> moteur déterministe BEP
    -> Knowledge Engine local
         -> bibliothèque commune publiée/validée (lecture seule)
         -> données personnelles autorisées du user_id courant
    -> assemblage local + citations
  <- réponse locale / couverture insuffisante
\`\`\`

Garanties :
- Aucun appel Groq, Gemini, fournisseur d'embeddings distant ou autre service LLM.
- Aucun prompt ni extrait personnel ne quitte l'environnement BEP.
- Les calculs financiers restent déterministes et exécutés côté serveur.
- Le moteur documentaire applique les droits avant le classement et avant la construction de la réponse.
- Une réponse locale insuffisamment étayée indique explicitement cette limite.
- Le mode local est le mode initial par défaut, conformément à la politique Coach existante (docs/COACH_MODE_POLICY.md).

### 16.2 Flux B — Dialogue assisté par Groq Coach

\`\`\`text
Navigateur Coach
  -> API Coach : question + demande de mode assisté
    -> Authentification + user_id issu de la session
    -> lecture serveur du mode et du consentement courant
    -> routage déterministe/local en premier
    -> sélection des seules données utiles à l'intention
    -> minimisation + agrégation + occultation
    -> contrôle de consentement immédiatement avant l'envoi
    -> client Groq Coach + clé BEP_COACH dédiée
    -> validation stricte du format et des sources
    -> réponse contrôlée + indicateur de mode
  <- réponse assistée ou refus/local-only
\`\`\`

Préconditions cumulatives :
1. L'utilisateur a activé explicitement le mode avancé/assisté selon le parcours de consentement existant ; le mode local seul reste le défaut.
2. Le consentement est actif, non expiré, non retiré et couvre la finalité, le fournisseur et les catégories de données effectivement envoyées.
3. Le runtime Coach est activé et son budget/quota autorise l'appel.
4. La minimisation a été effectuée côté serveur à partir d'une allowlist de champs définie par type de question. Le prompt ne reçoit jamais l'objet complet retourné par buildIntelligence().
5. Une dernière vérification du consentement est exécutée juste avant l'appel réseau, pas seulement au début de la requête.

Règles de contenu :
- Par défaut, transmettre la question et les seuls faits strictement nécessaires ; préférer les agrégats calculés côté BEP.
- Exclure les lignes de transactions, libellés libres, identifiants de comptes, coordonnées directes, historiques complets et données psychologiques/personnelles sans nécessité documentée.
- Le client Groq Coach ne peut importer ni configurer le client Admin.
- Les erreurs 429/5xx/timeout n'autorisent aucun fallback vers Gemini ou le runtime Admin.
- Si l'opt-in est absent, refusé ou retiré, rester local et expliquer la limite si nécessaire.

### 16.3 Flux C — Document personnel déposé par l'utilisateur

\`\`\`text
Navigateur Coach
  -> API upload authentifiée
    -> user_id résolu depuis la session
    -> contrôle taille / extension / MIME réel / signature
    -> analyse malware si disponible
    -> stockage privé rattaché au propriétaire
    -> extraction + segmentation + provenance
    -> aperçu des catégories et extraits retenus
    -> choix utilisateur : analyse locale ou traitement distant
    -> si distant : opt-in valable + sélection/minimisation/redaction
    -> contrôle final du consentement
    -> Groq Coach (jamais Admin)
    -> validation de sortie + citations vers le document privé
  <- résultat privé au propriétaire
\`\`\`

Garanties et règles :
- Le dépôt d'un document ne vaut jamais consentement à transmettre son contenu à Groq.
- Le fichier est privé dès sa création ; toutes les lectures, analyses, listes et suppressions vérifient le propriétaire côté serveur et en base.
- Avant tout traitement distant, l'utilisateur voit un aperçu compréhensible des catégories/extraits proposés et confirme cette analyse distante. Les passages non nécessaires sont exclus ; l'occultation doit être proposée lorsque techniquement pertinente.
- Aucun document complet n'est envoyé par défaut. Les documents particulièrement sensibles ou hors périmètre sont exclus du traitement distant par défaut.
- Les chunks, caches et embeddings héritent du propriétaire et des contrôles d'accès du document parent.
- La suppression déclenche une suppression en cascade des fichiers, textes extraits, chunks, index/embeddings, résultats, caches et références associées, sous réserve des délais de purge des sauvegardes explicitement documentés.
- Les tâches asynchrones recontrôlent propriété, statut du document et consentement avant chaque étape externe. Un job en attente est annulé si le consentement est retiré.
- Les contenus documentaires sont non fiables : les instructions qu'ils contiennent ne peuvent modifier les consignes système ou les permissions.

### 16.4 Flux D — Recherche et collecte web à la demande

\`\`\`text
Navigateur Coach
  -> API Coach : demande explicite de recherche/collecte
    -> Authentification + user_id session
    -> confirmation du périmètre / URL / finalité
    -> contrôle allowlist + quotas
    -> validation URL + DNS public + protections SSRF
    -> fetch HTTP sécurisé + limites + contrôle redirections
    -> extraction + hash + provenance
    -> stockage privé temporaire ou durable selon choix explicite
    -> analyse locale par défaut
    -> si analyse Groq : consentement externe + minimisation
    -> résultat sourcé dans l'espace privé utilisateur
  <- sources, résultat et limites
\`\`\`

Garanties et règles :
- La recherche/collecte web et l'analyse distante par Groq sont deux permissions distinctes. Autoriser le fetch d'une page publique n'autorise pas son envoi à Groq.
- La demande de collecte doit être explicite et limitée à une finalité, un domaine/ensemble d'URLs et un volume borné ; aucune veille ni collecte en arrière-plan en V1.
- Une politique serveur d'allowlist doit avoir un propriétaire opérationnel, un processus d'ajout/retrait et une règle par défaut de refus. Une URL fournie par l'utilisateur ne contourne pas l'allowlist.
- Vérifier DNS et adresse IP à chaque connexion et redirection ; bloquer loopback, link-local, réseaux privés, adresses réservées, IPv4 et IPv6 non publiques, URLs avec credentials et schémas autres que HTTPS.
- À ce stade, le code existant bloque les redirections et ne fournit pas de politique d'allowlist métier complète : toute évolution de ces comportements doit être conçue et testée explicitement, sans supposer qu'elle existe déjà.
- Les pages collectées restent des données non fiables, privées et sourcées. Fetch, stockage privé, indexation personnelle et proposition à la bibliothèque commune sont quatre actions distinctes.
- Toute contribution à la bibliothèque commune passe par le circuit Admin et une validation humaine ; aucune écriture directe dans les candidats Admin depuis Coach.

## 17. Frontières de confiance et règles d'accès

| Frontière | Entrée considérée non fiable | Contrôles obligatoires | Destination autorisée |
|---|---|---|---|
| Navigateur → API Coach | Question, IDs, fichiers, URLs, mode demandé | Session, CSRF selon conventions, validation, limites ; identité/owner/rôle déterminés côté serveur | Services Coach |
| API Coach → données BEP | Paramètres de requête et identifiants de ressources | Autorisation par propriétaire en base ; requêtes paramétrées ; filtrage avant récupération | Données du compte courant et corpus publié |
| Documents/Internet → extracteur | Texte, HTML, métadonnées, liens et instructions incorporées | MIME/signature, limites, SSRF, encodage, nettoyage, provenance, défense prompt injection | Zone de quarantaine puis espace privé |
| Orchestrateur Coach → Groq | Prompt et données sélectionnées | Consentement valide, minimisation, allowlist de champs, quota, clé Coach dédiée, TLS, validation de sortie | Fournisseur Groq selon conditions contractuelles vérifiées |
| Coach → bibliothèque commune | Résultat ou suggestion issue d'un utilisateur | Aucun accès direct en écriture ; revue Admin et approbation humaine | Candidature par processus Admin séparé uniquement |
| Runtime Coach ↔ Runtime Admin | Toute tentative d'import, appel ou partage de contexte | Interdiction d'import direct/transitif, secrets et clients séparés, tests d'architecture | Aucun échange runtime ; seule lecture du corpus publié |
| Journaux/observabilité | Métadonnées de requête et erreurs | Pseudonymisation, minimisation, pas de prompt/document/contenu financier en clair, accès restreint | Télémétrie technique minimale |

Principes transverses :
- Le propriétaire d'un document, d'un chunk, d'une analyse, d'un embedding ou d'un job est dérivé côté serveur et propagé par le service ; il n'est jamais accepté depuis un champ client.
- Les contrôles d'accès sont appliqués à chaque opération et dans chaque requête de données, y compris les chemins asynchrones, caches, recherches lexicales et vectorielles.
- Une donnée dérivée (résumé, chunk, embedding, cache, index) conserve la classification, le propriétaire, la rétention et les restrictions de la donnée source.
- Les données issues d'une page web ou d'un fichier ne sont jamais des instructions de contrôle. Le prompt les encadre comme contenu cité non fiable.
- Aucun composant Coach ne doit importer directement ou indirectement lib/bep-agent/config.js, lib/bep-coach-ingestion.js, un client Gemini Admin, un service de candidats Admin ou un module qui déclenche ces dépendances. lib/bep-document-ingestion.js ne peut être importé si son graphe de dépendances atteint le circuit Admin.
- Une primitive réseau partagée n'est acceptable que si son graphe de dépendances est neutre et si ses effets de bord sont nuls ; l'isolation doit être prouvée par un test automatisé du graphe d'import.

## 18. Politique opérationnelle de consentement, retrait et rétention

Cette architecture doit rester alignée sur docs/COACH_MODE_POLICY.md : **local-only par défaut**, mode avancé explicite, consentement actuel vérifié côté serveur. La présente section précise les contrôles d'architecture ; elle ne remplace pas la revue juridique ni la notice destinée aux utilisateurs.

### Portée du consentement

Le consentement doit être granulaire et traçable, au minimum par :
- utilisateur authentifié ;
- version de la notice présentée ;
- finalité (dialogue assisté, analyse d'un document, analyse d'une collecte web, embeddings distants) ;
- fournisseur et catégorie de traitement ;
- catégories de données autorisées ;
- date d'activation et date de retrait éventuelle ;
- état courant et preuve technique de l'action utilisateur.

Un opt-in générique au mode avancé ne doit pas autoriser automatiquement tous les traitements documentaires ou tous les embeddings distants. Le consentement à déposer ou stocker un document, le consentement à collecter une page, et le consentement à transmettre un contenu à Groq sont séparés.

### Ordre de contrôle serveur

Pour toute opération externe :
1. authentifier la session et déterminer le propriétaire ;
2. vérifier le mode choisi et le consentement courant correspondant à la finalité ;
3. exécuter d'abord les traitements déterministes et locaux qui suffisent ;
4. sélectionner les seuls champs/extraits autorisés par l'intention ;
5. minimiser, agréger et occulter ;
6. afficher/obtenir la confirmation spécifique lorsque le contenu documentaire ou web est concerné ;
7. vérifier à nouveau le consentement immédiatement avant l'appel fournisseur ;
8. réserver quota/budget de façon atomique ;
9. envoyer au seul runtime Coach ;
10. enregistrer uniquement les métadonnées minimales de traitement.

Tout échec d'une étape bloque l'appel externe. Il ne doit pas y avoir de « best effort » qui enverrait les données malgré un statut incertain.

### Retrait et tâches asynchrones

- Le retrait prend effet côté serveur immédiatement pour les nouveaux appels.
- Les jobs en file d'attente qui n'ont pas encore transmis de données sont annulés ; chaque worker revalide le consentement juste avant toute transmission.
- Les traitements multi-étapes revalident le consentement avant chaque nouvelle transmission (LLM, embeddings ou service tiers).
- Une requête déjà transmise au fournisseur ne peut pas être rappelée techniquement. Le système doit interrompre les étapes suivantes, marquer l'opération comme déjà transmise/en cours au moment du retrait et informer l'utilisateur de cette limite.
- Les résultats déjà reçus sont conservés ou supprimés selon le choix utilisateur et la politique de rétention documentée ; leur conservation ne permet aucun nouvel envoi externe.
- La désactivation du mode avancé remet le parcours en local-only ; aucune relance automatique ultérieure n'est permise.

### Rétention et suppression

Avant implémentation, définir des durées distinctes pour fichiers originaux, textes extraits, chunks, embeddings, résultats, caches, journaux techniques et sauvegardes. Les durées doivent être justifiées par la finalité et affichées dans l'information utilisateur. La suppression doit couvrir les données dérivées et les index ; les délais de purge des sauvegardes et les limites techniques doivent être explicités. Ne pas prétendre à une suppression instantanée des sauvegardes si le mécanisme ne le garantit pas.

### Embeddings

Les embeddings sont des données dérivées du contenu et héritent de sa sensibilité. Pour la V1 :
- préférer recherche lexicale et, si disponible et validée, embeddings calculés localement ;
- aucun service d'embedding distant sans consentement spécifique, minimisation et validation contractuelle du fournisseur ;
- documenter modèle, version, dimension, date, propriétaire, version d'index et procédure de réindexation ;
- supprimer les vecteurs et caches associés lors de la suppression ou du retrait de l'indexation ;
- ne pas activer pgvector avant vérification réelle de disponibilité, permissions, sauvegarde, restauration et coût sur la base cible.

## 19. Tests d'acceptation détaillés et critères de blocage

Les tests ci-dessous sont des critères de sortie obligatoires avant toute activation fonctionnelle. Un test unitaire isolé ne suffit pas pour les garanties de sécurité : combiner tests unitaires, intégration, tests d'architecture et tests dynamiques sur environnement autorisé. Toute défaillance d'isolation, de consentement ou de fuite de données est bloquante.

### A. Tests d'architecture et d'isolation Admin/Coach
- Construire le graphe transitif des imports du runtime Coach et échouer si un chemin atteint lib/bep-agent/config.js, lib/bep-coach-ingestion.js, un client Gemini/Admin ou le service/stockage de candidats Admin.
- Vérifier que lib/bep-document-ingestion.js ne peut être importé par Coach si une dépendance transitive atteint le circuit Admin.
- Vérifier que les variables, clés, clients, quotas, sessions et journaux Coach/Admin sont indépendants ; une clé absente dans un runtime ne déclenche jamais l'autre.
- Vérifier que les endpoints Coach ne lisent/écrivent aucun job, run ou candidat Admin, y compris par appel indirect.
- Vérifier que seules les connaissances publiées/validées sont lisibles en lecture seule par Coach ; un candidat pending/rejected est invisible.
- Vérifier qu'aucune donnée de conversation ou financière personnelle n'apparaît dans les logs ou le stockage Admin.

### B. Tests de consentement et de minimisation
- Mode local par défaut : zéro appel réseau Groq, Gemini ou embedding distant pour dialogue, document et collecte.
- Absence, refus, expiration, portée incorrecte ou retrait du consentement : zéro appel externe ; vérifier cela au niveau du mock réseau et des traces serveur.
- Consentement actif pour dialogue simple : seuls les champs allowlistés pour l'intention sont sérialisés dans le prompt.
- Ajouter des champs sentinelles interdits (transactions détaillées, libellés, nom, email, identifiant, secret, données hors sujet) et prouver qu'ils n'apparaissent ni dans le prompt, ni dans les logs.
- Un consentement au dialogue ne vaut pas consentement à l'analyse distante d'un document, à la collecte web ou aux embeddings distants.
- Un document déposé sans confirmation spécifique n'est jamais transmis à Groq ; seuls les extraits explicitement retenus et nécessaires sont envoyés après confirmation.
- Une URL collectée publiquement n'est pas envoyée à Groq sans consentement distinct à l'analyse distante.
- Retrait pendant une tâche en file : le worker annule le job avant transmission. Retrait entre deux étapes : l'étape externe suivante est bloquée.
- Retrait pendant un appel déjà transmis : aucune étape supplémentaire n'est lancée ; statut et limite de rappel sont correctement présentés.
- Vérifier que les erreurs de consentement ne sont jamais interprétées comme une autorisation par défaut.

### C. Tests du flux A — dialogue local
- Questions structurées : calculs identiques au moteur BEP de référence et aucune invocation fournisseur.
- Récupération documentaire : seuls les documents et connaissances autorisés pour l'utilisateur courant sont accessibles.
- Corpus insuffisant : réponse explicite, sans invention de source ni appel fournisseur implicite.
- Mode local forcé : test réseau vérifiant l'absence de tout trafic vers les fournisseurs externes.

### D. Tests du flux B — dialogue assisté
- Ordre d'exécution vérifié : auth → consentement → routage local → minimisation → contrôle final → quota → appel Groq.
- Le prompt est inspecté dans les tests et comparé à l'allowlist de champs de chaque intention.
- Réponse hors schéma, citation inexistante, affirmation non étayée ou contenu interdit : rejet ou réponse contrôlée.
- Timeout, 429, 5xx, clé Coach absente et budget dépassé : mode local si suffisant, sinon erreur explicite ; aucun fallback fournisseur.
- Les calculs financiers ne sont jamais délégués au modèle.

### E. Tests du flux C — documents personnels
- Vérifier propriété pour upload, liste, aperçu, extraction, analyse, téléchargement, indexation et suppression ; A ne peut accéder à aucune ressource de B, même en substituant un ID.
- Tester MIME falsifié, extension incohérente, fichier tronqué, archive/pièce malveillante, taille excessive, contenu vide et format non supporté.
- Tester prompt injection dans le texte, métadonnées, noms de fichiers et OCR éventuel.
- Vérifier le consentement spécifique avant transmission et l'absence d'envoi du document complet par défaut.
- Vérifier que chaque chunk, embedding, cache et résultat conserve owner_id et document_id du parent et que les recherches filtrent avant classement.
- Vérifier suppression en cascade et invalidation des caches/index ; tester le traitement documenté des sauvegardes.
- Tester annulation d'un job en attente et revalidation de consentement dans chaque worker.

### F. Tests du flux D — collecte web
- Refus par défaut pour domaine absent de l'allowlist ; tester ajout/retrait de domaine et journal d'approbation.
- Tests SSRF : localhost, IPv4 privée, IPv6 privée/link-local, loopback, IP réservées, DNS rebinding, résolution multiple, URL avec credentials, schémas non HTTPS et redirection vers réseau privé.
- Vérifier que la validation DNS/IP est répétée à chaque connexion et redirection ; aucun redirect ne contourne les contrôles.
- Tester limites par requête : nombre d'URLs/pages, profondeur, octets totaux, taille d'une page, timeout, fréquence par compte et quota global.
- Tester pages JS-only, PDF et contenus non supportés : échec explicite, aucun fallback implicite et aucune fausse citation.
- Vérifier séparation fetch public / stockage privé / indexation / analyse Groq / proposition Admin : chaque transition requiert sa propre autorisation.
- Tester injection de prompt et liens malveillants dans le HTML extrait.

### G. Tests données, embeddings, quotas et observabilité
- Tests de cloisonnement multi-utilisateur sur tables, caches, recherche lexicale et vectorielle, tâches et résultats.
- Embeddings distants désactivés sans consentement spécifique ; suppression/réindexation vérifiée pour modèle/version.
- Quotas par compte et globaux atomiques sous concurrence ; réservations libérées ou comptabilisées correctement sur erreur, timeout et retry.
- Limites de tokens entrée/sortie, coût estimé/réel et budget dur vérifiés côté serveur.
- Aucune donnée personnelle en clair dans logs, traces, métriques, erreurs, événements ou candidats Admin ; test par chaînes sentinelles.
- Rétention et suppression vérifiées pour originaux, extraits, chunks, embeddings, résultats, caches et sauvegardes selon les garanties annoncées.

### H. Tests de non-régression
- Parcours Coach local existant, réponses structurées, bibliothèque active et connaissances personnelles.
- Authentification Admin indépendante, client Groq Admin, Gemini Admin et circuit de revue/approbation.
- Routes, contrats API, protections CSRF/session et comportements frontend source/dist.
- Vérifier qu'une modification du Coach ne change ni les variables, ni les clés, ni les prompts, ni les quotas, ni les parcours Admin.

### Critères de validation
L'architecture ne peut être déclarée prête pour développement que si :
1. les quatre flux sont représentés dans les spécifications d'API et de séquence ;
2. les frontières et dépendances interdites sont testables automatiquement ;
3. la politique de consentement est alignée avec COACH_MODE_POLICY.md et ses états sont définis côté serveur ;
4. les allowlists de champs, règles de minimisation et durées de rétention sont définies ;
5. les quotas et limites de collecte sont chiffrés et testables ;
6. les conditions fournisseur Groq et les obligations applicables ont été vérifiées ;
7. les tests bloquants ci-dessus sont traduits en tests automatisés ou en procédures dynamiques vérifiables ;
8. les décisions non résolues (stockage, formats, embeddings, pgvector, budget) ont un responsable et une décision documentée.

Aucun appel externe en production ne doit être activé tant que les points 3 à 6 ne sont pas satisfaits. Aucun merge, déploiement ou publication de connaissances n'est autorisé par ce document.
