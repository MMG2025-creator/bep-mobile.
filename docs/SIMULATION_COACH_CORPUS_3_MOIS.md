# BEP — Corpus de simulation Coach sur trois mois

## Périmètre
Jeu de données 100 % synthétique, réservé à la base Render `bep_test_db`. Aucun compte utilisateur réel n'est créé et aucune donnée de production n'est lue ou modifiée.

- 10 profils fictifs, revenus mensuels de 1 500 à 8 000 €.
- Tous locataires, avec au moins un enfant et des charges fixes.
- 3 périodes budgétaires : septembre, octobre et novembre 2026.
- 30 snapshots mensuels.
- Taux d'atteinte de l'épargne générés entre 10 % et 90 %.
- 4 échanges Coach simulés par profil et par mois, soit 120 échanges.
- Signaux comportementaux : imprévus, achats impulsifs, culpabilité, anticipation, dépassements, inquiétude financière, motivation et arbitrages.
- Les conversations contiennent le contexte financier du mois correspondant.
- Un job `coach_quality_review` est placé en file après le seed.

## Tables dédiées
- `bep_simulation_profiles`
- `bep_simulation_months`
- `bep_simulation_conversations`

Ces tables sont distinctes des tables des comptes et données financières utilisateurs. Les lignes de conversation portent obligatoirement `synthetic=TRUE`.

## Exécution contrôlée
Depuis un environnement d'exécution connecté uniquement à la base de test :

```bash
BEP_SIMULATION_ENABLED=true npm run simulation:seed
```

Le script refuse de démarrer sans `BEP_SIMULATION_ENABLED=true`, sans `DATABASE_URL`, ou si le nom de base n'est pas exactement `bep_test_db`. Il refuse également un hostname qui ressemble à une base de production. Le seed est transactionnel et idempotent pour le préfixe réservé `SIM-%`.

Le script applique d'abord la migration du superviseur Gemini, puis celle du corpus, insère les profils/mois/conversations et met en file un contrôle qualité Gemini. Il ne lance pas lui-même d'appel Gemini.

## Analyse Gemini
`runQualityReview` lit les conversations synthétiques, les snapshots mensuels et les métriques agrégées, puis demande au modèle de relever :
- incohérences entre réponse Coach et situation budgétaire ;
- oublis du loyer, des charges fixes ou des dépenses enfants ;
- conseils imprudents ou culpabilisants ;
- signaux comportementaux et opportunités de coaching ;
- lacunes de couverture du corpus.

Les résultats restent des constats/propositions. Aucune modification automatique de la base métier ou des connaissances validées n'est autorisée.

## Limites et validation
Les réponses Coach sont des dialogues simulés rédigés pour couvrir des intentions et comportements variés. Elles ne sont pas des sorties réellement générées par l'endpoint Coach V1.6. Le superviseur ne doit pas les présenter comme des résultats de production.

L'exécution effective du seed et du job Gemini exige un accès d'exécution à la base de test et une configuration Gemini dédiée autorisée. Tant que ces deux opérations ne sont pas exécutées, le corpus n'est pas considéré comme chargé et le contrôle Gemini n'est pas considéré comme réalisé.
