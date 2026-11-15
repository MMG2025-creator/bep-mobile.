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

Cette revue ne déclenche aucune recherche Internet. Gemini peut proposer des corrections ou clarifications uniquement sur des fiches PostgreSQL existantes, en préservant leurs métadonnées de provenance. Les propositions restent dans la file de validation humaine. Aucun JSON du dépôt et aucune fiche active ne sont écrasés automatiquement. Les appels du worker restent désactivés sans clé dédiée, autorisation explicite de facturation et budget mensuel.

### 2. Espace administrateur — recherche documentaire externe

Le circuit `/api/admin/bep-coach/research` est distinct et protégé par authentification et contrôle administrateur.

La recherche Gemini n'est autorisée que si les trois conditions serveur sont réunies :
- `BEP_COACH_WEB_RESEARCH_ENABLED=true`
- `BEP_COACH_RESEARCH_BILLING_APPROVED=true`
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

