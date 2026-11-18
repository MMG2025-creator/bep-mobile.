# BEP Coach — architecture locale et documentaire

## Décision fonctionnelle

L'espace utilisateur BEP Coach est un coach local. Il répond à partir des règles financières BEP, de la bibliothèque documentaire PostgreSQL et des données financières du compte authentifié.

**Aucun appel à Gemini, ni à un autre fournisseur externe, ne doit être effectué par le parcours conversationnel utilisateur.** La présence d'une clé API ou l'activation d'un agent administratif ne change pas cette règle.

Gemini reste cantonné au circuit administratif indépendant de recherche documentaire externe. Une recherche éventuelle produit des propositions en attente de validation humaine ; elle ne publie jamais automatiquement une fiche dans la bibliothèque active.

## Architecture des deux circuits

### 1. Espace utilisateur — BEP Coach local

Point d'entrée conversationnel : `POST /api/ai/chat`.

1. Authentifier la session BEP.
2. Valider la question (1 à 4 000 caractères).
3. Charger le contexte financier du compte avec `buildIntelligence()`.
4. Récupérer les connaissances documentaires actives et personnelles validées.
5. Si `routeStructuredQuestion()` reconnaît la question, retourner la réponse déterministe BEP.
6. Sinon, restituer les fiches documentaires pertinentes (au plus trois dans le texte, au plus six dans la trace).
7. Si aucune fiche n'est suffisamment pertinente, le dire explicitement et ne pas inventer de réponse.

Ce point d'entrée n'appelle ni `userAi()`, ni `invokeAi()`, ni `consumeBepAiQuota()`. Il ne transmet aucune donnée utilisateur à un fournisseur tiers.

### 2. Espace administrateur — revue locale des JSON

La revue Gemini documentaire utilise une allowlist de fichiers JSON versionnés dans le dépôt : le contrat `services/coach-library.json` et les deux référentiels `financialCoachSources.fr.json` et `financialCoachSources.additional.fr.json`. Le worker les lit en local, valide leur syntaxe JSON, applique une limite de taille et calcule leurs empreintes. Il les compare aux fiches actives de la bibliothèque PostgreSQL.

Cette revue ne déclenche aucune recherche Internet. Gemini peut proposer des corrections ou clarifications uniquement sur des fiches PostgreSQL existantes, en préservant leurs métadonnées de provenance. Les propositions restent dans la file de validation humaine. Aucun JSON du dépôt et aucune fiche active ne sont écrasés automatiquement. Les appels du worker restent désactivés tant que son activation explicite et sa clé Gemini dédiée ne sont pas configurées.

### 2. Espace administrateur — recherche documentaire externe

Le circuit `/api/admin/bep-coach/research` est distinct et protégé par authentification et contrôle administrateur.

La recherche Gemini utilise l’offre gratuite de Gemini confirmée pour le projet. Elle est autorisée lorsque les deux conditions techniques serveur sont réunies :
- `BEP_COACH_WEB_RESEARCH_ENABLED=true`
- `BEP_AGENT_GEMINI_API_KEY` est configurée.

Les propositions sont écrites dans `bep_knowledge_candidates`, avec source, URL, empreinte et statut de revue. Une approbation humaine est obligatoire avant toute publication dans `bep_financial_knowledge`. La publication automatique est interdite.

Le superviseur asynchrone Gemini est lui aussi indépendant du dialogue utilisateur. Il ne doit pas être utilisé comme moteur de réponse de BEP Coach.

## Sources de connaissance

Le moteur documentaire `lib/bep-financial-intelligence.js` assemble :
- `bep_financial_knowledge` : bibliothèque BEP active ;
- `bep_agent_approved_knowledge` : surcouches administratives approuvées et dont la version/empreinte correspond toujours à la source ;
- `bep_user_coach_knowledge` : connaissances personnelles explicitement acceptées et non expirées.

Le corpus seed versionné dans `lib/bep-financial-knowledge-seed.js` contient actuellement 14 fiches initiales réparties ainsi :

| Catégorie | Nombre |
| --- | ---: |
| Épargne | 6 |
| Budget | 2 |
| Dettes / crédits | 2 |
| Comportement financier | 2 |
| Revenus | 1 |
| Qualité des données | 1 |
| **Total seed** | **14** |

Ces 14 fiches sont le corpus initial du code, pas un décompte certifié de toutes les fiches actives en production. Le nombre réel des fiches actives, des propositions en attente et des surcouches approuvées doit être lu dans PostgreSQL via le tableau de bord administrateur. Une tentative de lecture directe de la base de production depuis l'environnement d'audit a été refusée par la liste IP ; aucun total de production n'est donc affirmé ici.

### Recherche documentaire

La sélection actuelle est lexicale et contextuelle : tokens français normalisés, mots-clés, titre, contenu, catégorie et certains signaux issus des données financières. Elle n'est pas vectorielle/sémantique.

- Jusqu'à 8 documents peuvent être retournés par le service bibliothèque selon sa limite.
- Le moteur d'intelligence utilisé dans le Coach en sélectionne au maximum 6.
- La réponse conversationnelle locale cite dans sa trace jusqu'à 6 documents et restitue au maximum 3 fiches dans son corps.

## Variantes de réponses utilisateur

| Variante | Déclencheur | Comportement |
| --- | --- | --- |
| Réponse structurée | Question reconnue par `routeStructuredQuestion` | Règle/calcul BEP déterministe, sans fournisseur externe |
| Réponse documentaire | Question non reconnue, fiches pertinentes trouvées | Restitution de jusqu'à trois fiches pertinentes avec leurs sources |
| Absence de couverture | Aucune fiche suffisamment pertinente | Signale le manque documentaire, sans fabriquer de réponse |

Les conseils contextuels des modules (Accueil, Budget, Épargne, Achats) restent des règles structurées BEP via `POST /api/ai/advice`. Ils ne doivent pas être confondus avec une génération par LLM.

## Transparence dans l'interface utilisateur

La page Coach doit indiquer :
- Coach BEP local / base documentaire ;
- absence d'appel Gemini ou d'autre fournisseur externe ;
- nombre de fiches récupérées et titres/sources ;
- volumes de contexte financier chargés et avertissements de qualité éventuels.

Aucune option de connexion à un fournisseur externe ne doit être présentée comme un mode du Coach utilisateur standard.

## Garde-fous

- Ne jamais faire de fallback silencieux vers Gemini ou un autre fournisseur.
- Ne jamais présenter une fiche non approuvée comme une connaissance administrative validée.
- Ne jamais inventer une source ni une métrique de couverture.
- Séparer les faits issus des données du compte, les règles BEP et les limites de couverture documentaire.
- Maintenir les fichiers frontend source et `dist/` synchronisés.
- Toute évolution du corpus actif reste soumise à validation administrative.

## Tests et critères d'acceptation

- Le test du routage conversationnel doit vérifier que `/api/ai/chat` appelle `buildIntelligence()` et `routeStructuredQuestion()`, mais jamais `userAi()`, `invokeAi()` ou `consumeBepAiQuota()`.
- Vérifier les trois variantes : réponse structurée, réponse documentaire, absence de couverture.
- Vérifier que les réponses exposent les titres et sources réellement récupérés.
- Vérifier qu'une question utilisateur ne déclenche aucun appel réseau à Gemini.
- Vérifier le parcours authentifié, l'isolation des données par compte et les erreurs de base documentaire.
- Vérifier la parité `app.js` / `dist/app.js` et `index.html` / `dist/index.html`.
- Ne déclarer le déploiement terminé qu'après statut Render `LIVE` et contrôle navigateur de l'espace utilisateur.

## Historique de cette correction

Cette fiche formalise la séparation demandée : le Coach de l'espace utilisateur est local et documentaire ; Gemini ne sert qu'aux opérations administratives distinctes de recherche et de supervision. Les chiffres du corpus seed (14) proviennent du fichier versionné ; les chiffres de la base PostgreSQL de production restent à mesurer avec un accès autorisé.



## Quotas et comptabilisation Gemini — mise à jour

Le circuit de recherche documentaire externe ne comporte plus de plafond applicatif quotidien fixe. Le nombre de jours travaillés ne doit donc pas réduire artificiellement le quota d'un autre jour. La protection repose sur les limites réellement appliquées par Google au projet AI Studio et sur ses réponses de quota ; BEP ne prétend pas pouvoir lever ces limites fournisseur.

Le modèle par défaut est `gemini-2.5-flash`. La documentation tarifaire Google indique pour Gemini 2.5 Flash Search Grounding gratuit jusqu'à 500 requêtes par jour (RPD), quota partagé avec Gemini 2.5 Flash-Lite. Cette valeur est une référence publique, pas une garantie du quota réellement attribué au projet ; elle doit être confirmée dans AI Studio. À titre indicatif seulement, 500 RPD sur 30 jours représentent 15 000 recherches mensuelles potentielles. Le compteur BEP mesure la consommation réelle du mois en cours et affiche séparément cette capacité théorique.

La table additive `bep_coach_provider_usage` comptabilise uniquement les appels Gemini de deux types : `google_search_grounding` et `json_library_consultation`. Pour la recherche Google, BEP sépare le nombre d'appels API du nombre de requêtes Google Search indiqué par `groundingMetadata.webSearchQueries`, car un appel Gemini peut déclencher plusieurs recherches. Les tokens, erreurs et dates sont agrégés sans enregistrer les questions, réponses ou données financières.

La lecture de la bibliothèque par `readCoachLibrary()` demeure locale et n'est pas un appel Gemini : elle n'est donc pas comptabilisée. Le type `json_library_consultation` est prévu pour un futur véritable appel Gemini analysant les JSON ; il restera à zéro tant qu'aucun tel appel n'est effectué.


## Second JSON — registre durable des propositions documentaires

Le circuit administratif expose un second document JSON distinct du corpus documentaire actif : `bep-coach-proposals.json`. Il rassemble les propositions produites par la revue documentaire Gemini et par la recherche Google Search, avec leur identifiant, leur source, leur empreinte, leur provenance, leur niveau de confiance et leur statut de revue.

Pour éviter toute perte lors d’un redémarrage ou d’un redéploiement Render, les propositions sont conservées durablement dans `bep_knowledge_candidates` (PostgreSQL). L’endpoint administratif protégé `GET /api/admin/bep-coach/proposals.json` les sérialise sous forme du document JSON téléchargeable. Le fichier n’est jamais écrit sur le système de fichiers éphémère du service.

Le document JSON est un registre de travail, pas une source de vérité métier. Les éléments `pending` restent invisibles au Coach utilisateur. Seule l’action d’approbation humaine existante peut intégrer une proposition dans `bep_financial_knowledge` ou `bep_agent_approved_knowledge`, après vérification de la version et de l’empreinte source dans la transaction. Un rejet ne publie aucune connaissance. Aucune publication automatique ni modification du corpus actif par Gemini n’est autorisée.


## Ingestion documentaire sans IA — V1

Le point d'entrée administratif `POST /api/admin/bep-coach/ingest` et son endpoint batch utilisent le service `lib/bep-document-ingestion.js`. La récupération repose sur l'extracteur HTTP natif et le nettoyeur HTML existant. Aucun appel Gemini, Claude, OpenAI ou autre modèle n'est effectué pour récupérer et enregistrer une URL.

Le document extrait est enregistré directement dans `bep_knowledge_candidates` avec un slug `web-{category}-{hash}`, une empreinte SHA-256 compatible avec le contrôle d'approbation web existant, une provenance HTTPS et le niveau `web_research_pending`. La proposition reste en attente ; l'approbation humaine existante est le seul chemin de publication vers `bep_financial_knowledge`.

Les garde-fous de collecte réutilisent la validation HTTPS, la résolution DNS publique épinglée, les limites de taille, la limite de pages et le refus des redirections non revalidées. Les pages qui exigent JavaScript ou PDF ne sont pas encore prises en charge par l'extracteur natif ; elles sont signalées comme échec de collecte, sans fallback IA.

Le statut d'ingestion manuelle est désormais indépendant de la clé Gemini et de l'activation de la recherche Internet. La recherche exploratoire Gemini reste un service distinct et facultatif.
