# BEP — Corpus Coach synthétique en JSON

## Principe
La simulation utilise un fichier JSON local comme magasin temporaire. Elle ne se connecte jamais à PostgreSQL, Render, à l'API BEP ou à un compte utilisateur. Aucune migration SQL n'est nécessaire et aucune donnée n'est écrite dans la base finale.

Le fichier `simulation/data/coach-corpus.json` reproduit une structure relationnelle simple :
- `tables.profiles.records` : profils et caractéristiques du foyer ;
- `tables.monthlySnapshots.records` : un budget par profil et par mois ;
- `tables.conversations.records` : dialogues Coach reliés au profil et au mois.

Les clés primaires et relations sont décrites dans le JSON. Chaque ligne est marquée `synthetic: true`.

## Génération
```bash
npm run simulation:generate
```

Le générateur JavaScript déterministe produit 10 profils fictifs, 30 snapshots mensuels (septembre à novembre 2026) et 120 conversations. Les revenus sont compris entre 1 500 et 8 000 €, les profils sont tous locataires et ont des enfants, et les taux d'atteinte de l'épargne sont compris entre 10 % et 90 %.

## Utilisation
Un script ou un outil d'analyse peut charger directement le fichier JSON avec `require('./simulation/data/coach-corpus.json')` ou `JSON.parse(fs.readFileSync(...))`. Les relations se font par `profileId` et `monthKey`. Le générateur vérifie les volumes, les contraintes et les clés étrangères logiques avant d'écrire le fichier.

## Limites
Les réponses Coach sont des exemples synthétiques écrits pour couvrir des intentions et comportements. Elles ne sont pas des réponses réellement émises par l'endpoint Coach. Le JSON est un jeu de test local, pas une base persistante multi-utilisateur ni une preuve de qualité en production. Il peut ensuite être transformé vers le schéma SQL final par un adaptateur dédié, sans changer le corpus source.
