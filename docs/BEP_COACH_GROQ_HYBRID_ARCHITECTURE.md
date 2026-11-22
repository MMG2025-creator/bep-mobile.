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

## 20. Décisions d'architecture verrouillées — contrat de référence

Cette section tranche les points précédemment ouverts. En cas de divergence avec une formulation plus générale des sections 4, 5, 10 à 12 et 16 à 19, **la présente section prévaut**. Ces décisions définissent la cible ; elles ne décrivent pas une fonctionnalité déjà implémentée.

### 20.1 Contrat HTTP du dialogue

#### Requête cible — `POST /api/ai/chat`

Le contrat public accepte uniquement :

```json
{
  "question": "string, 1 à 4000 caractères",
  "pageContext": {
    "page": "home|budget|savings|spending|income|debt|goals|learning|profile|general",
    "subPage": "string facultative, 40 caractères maximum"
  }
}
```

Règles :
- La session authentifiée fournit l'identité ; le serveur déduit `user_id`. Aucun `user_id`, rôle, droit, consentement, solde, revenu ou autre fait financier envoyé par le navigateur n'est accepté comme vérité.
- `financialContext` fourni par le client est ignoré et retiré du contrat cible. Il ne doit jamais être utilisé comme contexte de calcul ou de prompt. Les faits financiers proviennent exclusivement des tables BEP associées à `req.session.user.id`.
- `pageContext.page` est une indication d'interface non sensible, validée contre l'énumération ci-dessus. `subPage` est tronqué à 40 caractères et ne peut modifier les droits ou le routage de sécurité.
- Toute propriété inconnue est ignorée ; corps JSON supérieur à 16 Ko : HTTP 413 ; JSON invalide : HTTP 400 ; question vide ou supérieure à 4000 caractères : HTTP 400.
- Le mode externe et le consentement ne sont pas pilotables par un champ de requête. Ils sont lus dans la configuration persistée côté serveur et contrôlés à chaque appel.

#### Réponse cible

Conserver les champs historiques afin de ne pas casser le frontend, et ajouter des champs stables :

```json
{
  "answer": "string",
  "provider": "bep-local|groq-coach",
  "model": "string",
  "mode": "structured|documentary|external_assist|local_fallback",
  "usage": null,
  "quota": null,
  "sources": [
    { "id": "string", "title": "string", "source": "string", "url": "string|null" }
  ],
  "limitations": ["string"]
}
```

- `sources` ne contient que des identifiants de sources réellement récupérées et autorisées pour l'utilisateur.
- Une citation inconnue, inventée ou appartenant à un autre utilisateur invalide la réponse assistée ; le système retourne une réponse locale si elle est suffisante, sinon une erreur contrôlée.
- Les calculs et montants sont calculés par BEP. Le LLM ne renvoie jamais un montant calculé qui remplace un résultat serveur.
- Aucun prompt, contenu personnel ou extrait documentaire ne figure dans la réponse technique ou les journaux.

### 20.2 Contrat de données financières transmis à Groq

Le serveur construit un DTO dédié, jamais l'objet complet de `buildIntelligence()`, de `loadUserFinancialContext()` ou de `req.body`.

DTO de base autorisé :
- `question` : question utilisateur, après contrôle des secrets et identifiants ;
- `intent` : valeur issue du classifieur serveur ;
- `page` : valeur d'interface validée ;
- `knowledge` : au maximum 3 extraits de connaissances publiées/validées ou personnelles acceptées, 1200 caractères chacun, avec identifiant de source ;
- `financialFacts` : absent par défaut ; ajouté uniquement selon la matrice ci-dessous.

| Intention serveur | Données personnelles autorisées au fournisseur | Données interdites |
|---|---|---|
| `explain`, `steps`, `list`, `overview`, `general`, `contextual` | Aucune donnée financière ; question, page et extraits documentaires autorisés uniquement | Tous revenus, soldes, dépenses, opérations, dettes, objectifs nominatifs, historiques |
| `amount` | Un seul agrégat calculé côté serveur, explicitement nécessaire à la question (ex. total mensuel des charges), avec période et devise | Lignes d'opérations, libellés, contreparties, identifiants, historique complet |
| `recommendation` | Au plus 3 agrégats calculés côté serveur parmi revenu mensuel total, charges mensuelles totales, disponible mensuel, progression agrégée d'un objectif ; uniquement si la question l'exige | Détail de revenus/dépenses, transactions, psychologie, libellés libres, coordonnées, historique mensuel complet |
| `compare` | Au plus 3 agrégats nécessaires à la comparaison, calculés côté serveur et étiquetés avec période/devise | Données transactionnelles, données d'un tiers, données hors sujet |
| Toute intention documentaire | Extraits explicitement sélectionnés et confirmés pour cette analyse, après occultation ; 10 extraits maximum, 1200 caractères chacun, 8000 caractères cumulés | Fichier complet, pages non sélectionnées, métadonnées personnelles non nécessaires |

Contrôles obligatoires :
- Les agrégats sont produits par le backend et accompagnés de leur période, devise et statut de fraîcheur. Le modèle ne reçoit pas les objets source.
- Aucun identifiant direct (nom, adresse, email, téléphone, identifiant de compte), secret, token, donnée bancaire complète, donnée de carte ou donnée de tiers n'est transmis.
- Les lignes `transactions`, `expenses`, `savingsOperations`, `incomes`, `debts`, `budgets` et `monthlyHistory` ne sont jamais sérialisées directement dans un prompt.
- Les données psychologiques/comportementales personnelles ne sont pas transmises en V1.
- La question elle-même est filtrée pour retirer les secrets évidents ; si elle contient une donnée particulièrement sensible ou un identifiant direct non nécessaire, demander une reformulation ou rester local.
- Le DTO est validé par schéma fermé (`additionalProperties: false`) avant sérialisation. Les tests inspectent le corps réseau réellement émis, pas uniquement l'objet avant filtrage.

### 20.3 Décision credentials Groq

**Choix V1 : clé de service dédiée au Coach, pas de BYOK utilisateur dans le runtime Coach.**

- Coach : `BEP_COACH_GROQ_API_KEY`, secret exclusivement injecté dans le service d'inférence Coach.
- Admin : `BEP_AGENT_GROQ_API_KEY`, conservé dans le service Admin existant.
- Les deux clés sont différentes, créées séparément, non interchangeables, non copiées dans le dépôt, les builds frontend, les logs ou la base utilisateur.
- Aucun fallback d'un runtime vers la clé de l'autre ; clé Coach absente = mode local uniquement et statut explicite ; clé Admin absente = comportement Admin existant, sans recours à la clé Coach.
- Aucun champ de clé API fourni par un utilisateur n'est lu par le runtime Coach V1. Les éventuels réglages historiques `bep_user_ai`/BYOK restent hors de ce chemin et ne peuvent pas être utilisés implicitement par le Coach. Toute réintroduction de BYOK nécessite une décision et une revue séparées.
- La configuration Coach comprend aussi `BEP_COACH_GROQ_MODEL`, `BEP_COACH_AI_ENABLED`, les limites et budgets ci-dessous. Le modèle est fixé côté serveur sur une référence explicitement validée ; aucun nom de modèle client n'est accepté.
- Le secret est rotatif, avec procédure de rotation sans journalisation de sa valeur. Les tests utilisent des clés factices et vérifient qu'aucune valeur de secret ne se retrouve dans les réponses ou les logs.
- Le mode local demeure le défaut. Le fait que la clé de service soit configurée ne constitue ni activation du mode externe, ni consentement.

### 20.4 Isolation des processus et des déploiements

La séparation par simples modules ou variables d'environnement dans un même processus Node.js n'est pas suffisante pour la cible.

Décision :
1. **Coach API / orchestration** : processus de service Coach dédié, responsable de l'authentification utilisateur, du contexte financier, du consentement, du DTO minimisé, des quotas Coach et de la réponse.
2. **Coach inference worker** : processus/service Render distinct, responsable uniquement de l'appel Groq, de la validation du schéma de sortie et du comptage technique. Il ne possède ni accès direct à la base financière, ni accès aux sessions utilisateurs, ni accès aux tables Admin.
3. **Admin API/runtime** : conserve son service, ses routes, sa clé `BEP_AGENT_GROQ_API_KEY`, ses prompts, ses quotas et son circuit de candidats/revue. Aucun import, client, cache, file de jobs ou secret partagé avec Coach.
4. **Communication Coach API → Coach inference worker** : réseau HTTPS privé/authentifié par identité de service et secret dédié `BEP_COACH_WORKER_AUTH_SECRET` (secret distinct de la clé Groq). Le worker n'accepte que le DTO fermé de la section 20.2 ; taille maximale 32 Ko ; aucune URL arbitraire, aucun nom de table et aucun identifiant de compte.
5. Le worker retourne uniquement la réponse structurée, les citations parmi les IDs fournis et les compteurs d'usage. Il ne peut appeler ni l'Admin, ni la base BEP, ni une URL fournie dans le prompt.
6. Le worker ne charge aucun module du dépôt Admin et ne reçoit jamais `BEP_AGENT_*`. L'API Coach ne reçoit jamais `BEP_AGENT_GROQ_API_KEY`.

Le partage de la bibliothèque publiée/validée est un accès de données explicitement autorisé, en lecture seule, avec compte DB limité ; il ne constitue pas un canal de communication entre agents.

**Conséquence opérationnelle :** la cartographie Render et le routage de session doivent être audités en phase 0 avant de créer les services. Aucun service Render, secret, route ou configuration n'est créé/modifié par cette spécification. La mise en œuvre exige une PR de code distincte et une validation d'architecture avant tout déploiement.

### 20.5 Valeurs V1 concrètes et seuils de tests

Ces valeurs constituent les plafonds initiaux de sécurité et les seuils d'acceptation ; elles pourront être modifiées uniquement par décision documentée et nouvelle revue.

| Contrôle | Valeur V1 | Résultat attendu au seuil dépassé |
|---|---:|---|
| Corps HTTP dialogue | 16 Ko | HTTP 413, aucun appel externe |
| Question utilisateur | 1–4000 caractères | HTTP 400 si hors plage |
| Timeout appel worker/Groq | 15 secondes | abandon, local si suffisant, aucun fallback fournisseur |
| Tentatives automatiques | 1 (aucun retry automatique) | 429/5xx/timeout remonté au circuit local |
| Sortie Groq | 1200 tokens maximum | troncature interdite ; réponse rejetée si limite non respectée |
| Extraits documentaires dialogue | 3 × 1200 caractères | excédent exclu avant appel |
| Extraits document personnel | 10 maximum, 1200 caractères chacun, 8000 caractères cumulés | analyse refusée ou sélection réduite avant appel |
| Appels externes par utilisateur | 20 par jour UTC | blocage externe, réponse locale si suffisante |
| Débit par utilisateur | 3 appels par minute | HTTP 429, aucun appel Groq |
| Tokens d'entrée par utilisateur | 30 000 par jour UTC | blocage externe |
| Tokens de sortie par utilisateur | 6 000 par jour UTC | blocage externe |
| Budget par utilisateur | 0,50 USD par jour UTC | blocage dur avant appel |
| Budget global Coach | 10 USD par jour UTC | coupe-circuit global, local-only |
| Réservation de quota | atomique avant appel | une seule réservation gagnante en concurrence |
| Upload document V1 | 20 Mo par fichier ; 5 documents actifs/utilisateur | HTTP 413 ou HTTP 429 |
| Texte extrait par document | 100 000 caractères maximum | document rejeté ou contenu tronqué avec statut explicite |
| Segmentation | 1200 tokens/chunk, recouvrement 150 tokens | test de bornes déterministe |
| Collecte web | 5 URLs/requête, 10 pages/URL, 2 Mo/page, 8 Mo/requête, 10 s/page, 30 s/requête | arrêt contrôlé et provenance des pages déjà collectées |
| Rétention document personnel V1 | 30 jours par défaut, renouvelable par action utilisateur | purge vérifiable de l'original et des dérivés |
| Logs de contenu | 0 prompt/réponse/extrait en clair | toute sentinelle détectée = test bloquant |

Le coût est calculé côté serveur avec une grille tarifaire versionnée correspondant au modèle autorisé. Si le tarif ou le coût d'une requête ne peut pas être estimé de façon fiable, l'appel est bloqué plutôt que considéré comme gratuit. Les réservations sont atomiques ; les tokens réellement retournés réconcilient la réservation ; un échec avant émission réseau libère la réservation, un résultat fournisseur ou timeout ambigu reste comptabilisé au plafond réservé jusqu'à réconciliation.

### 20.6 Contrat de tests automatisables

Chaque test de sécurité critique doit comporter : ID stable, fixture, action exacte, résultat HTTP, résultat DB, nombre d'appels réseau attendu, assertion anti-fuite et nettoyage. Les sentinelles doivent être uniques, par exemple `SENTINEL_USER_A_9f31`, `SENTINEL_TXN_SECRET_2c77`, `SENTINEL_ADMIN_PENDING_7a10`.

| ID | Précondition / action | Assertions obligatoires |
|---|---|---|
| CHAT-DATA-001 | Envoyer `financialContext.income=999999` et une sentinelle dans `financialContext.transactions` | Valeurs ignorées ; réponse basée sur DB ; aucune sentinelle dans le prompt ou la réponse |
| CHAT-DATA-002 | Modifier le `user_id` dans le body | Identité issue de la session ; aucune lecture du compte tiers |
| CHAT-DATA-003 | Question structurée de montant avec fixture DB connue | Résultat strictement égal au moteur déterministe ; 0 appel worker |
| CHAT-CONSENT-001 | Mode local, clé configurée | 0 appel réseau worker/Groq |
| CHAT-CONSENT-002 | Consentement absent, retiré, expiré ou mauvaise finalité | 0 appel réseau ; réponse locale ou limitation explicite |
| CHAT-MIN-001 | Ajouter les trois sentinelles interdites dans les transactions/coordonnées | 0 sentinelle dans le DTO réseau, les logs et la réponse |
| CHAT-SCHEMA-001 | Worker retourne citation inconnue ou propriété supplémentaire | Réponse worker rejetée ; aucun fait/citation inventé |
| CRED-001 | Clé Coach absente, clé Admin présente | 0 appel Groq Coach ; aucune tentative avec la clé Admin |
| CRED-002 | Clé Admin absente, clé Coach présente | Le runtime Admin ne lit ni n'utilise la clé Coach |
| PROC-001 | Inspection du graphe d'import du worker Coach | 0 import transitif `lib/bep-agent/**`, `bep-coach-ingestion.js`, Gemini Admin ou candidat Admin |
| PROC-002 | Requête directe worker sans identité de service valide | HTTP 401/403 ; 0 appel Groq |
| PROC-003 | Envoyer au worker un champ `user_id`, `financialContext` ou `callbackUrl` inattendu | Rejet HTTP 400 ; 0 appel Groq |
| ISO-001 | Utilisateur A lit/analyse/supprime l'ID d'un document de B | HTTP 404 ; aucune modification DB ; 0 appel worker |
| ISO-002 | Coach tente de récupérer un candidat Admin pending | 0 ligne retournée ; aucun accès à la table/circuit candidat |
| QUOTA-001 | 21e appel dans la même journée UTC | Blocage avant réseau ; appels 1–20 au maximum |
| QUOTA-002 | 4e appel dans une fenêtre glissante de 60 secondes | HTTP 429 ; 0 appel fournisseur pour le 4e |
| QUOTA-003 | Deux requêtes simultanées pour la dernière unité de quota | Une réservation acceptée, l'autre refusée |
| QUOTA-004 | Budget utilisateur à 0,50 USD ou budget global à 10 USD | Coupe-circuit avant réseau |
| LIMIT-001 | Question de 4001 caractères ou body de 16 Ko + 1 octet | HTTP 400/413 ; 0 appel externe |
| DOC-001 | Upload 20 Mo + 1 octet ou 6e document actif | HTTP 413/429 ; aucun stockage résiduel |
| DOC-002 | Document avec 11e extrait ou 8001e caractère à transmettre | Aucun dépassement ; réduction/confirmation ou refus avant réseau |
| DOC-003 | Retrait de consentement après mise en file et avant worker | Job annulé ; 0 appel Groq |
| WEB-001 | 6e URL, 11e page ou dépassement 8 Mo | Arrêt contrôlé ; pas de page supplémentaire |
| WEB-002 | URL localhost, IP privée, IPv6 link-local ou redirection vers IP privée | Rejet avant lecture de contenu ; 0 appel Groq |
| LOG-001 | Injecter toutes les sentinelles dans question, document et erreur fournisseur | Aucune sentinelle dans logs, traces, métriques ou tables Admin |

Les tests de quotas doivent utiliser une horloge figée en UTC et une base isolée. Les tests réseau doivent injecter un faux transport et compter les appels, puis être complétés par un test dynamique en staging sur le seul service Coach autorisé. Les tests d'isolation doivent s'exécuter en CI sans secret réel. Les valeurs de coût sont testées contre une grille tarifaire factice versionnée, jamais contre une facturation réelle.

### 20.7 Conditions de passage en développement

La phase de code ne peut démarrer qu'après :
- validation du contrat API et de la matrice d'allowlist par revue ;
- décision technique sur la validation de session entre API et services séparés ;
- preuve que le compte DB du worker n'a aucun accès aux données utilisateur/Admin ;
- confirmation des conditions contractuelles Groq et de l'information/consentement utilisateur ;
- validation du modèle de coût, des limites et de la rétention ;
- ajout des tests d'architecture et des tests de contrat ci-dessus à la stratégie CI.

La présente décision ne vaut autorisation ni de modifier les services Render, ni de créer des secrets, ni de changer les routes, ni de développer, fusionner ou déployer.
