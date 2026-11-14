# BEP V1.5 — Sauvegarde pré-prod V2

- Date du snapshot : 14 novembre 2026.
- Nature : snapshot Git du socle d'implémentation Gemini Superviseur V2, avant décision de mise en production.
- Dépôt : MMG2025-creator/bep-mobile.
- Commit source exact : `e7f8102c2033be15c67cb6e4b170a72c2db28852`.
- Référence précédente : BEP V1.4, commit `5cae41acdafbc602041b34fb41a77cbcee61a8dd`.
- PR de suivi : [#160 — Intégrer le socle d’isolation Gemini Superviseur V2](https://github.com/MMG2025-creator/bep-mobile./pull/160).
- Branche de sauvegarde : `backup/BEP-v1.5-pre-prod-v2-20261114`.
- Branche de référence stable : `release/BEP-v1.5-pre-prod-v2-20261114` (créée depuis le commit de snapshot après ajout de ce manifeste).

## Contenu figé

Le snapshot conserve le code et les documents de la branche `implementation/gemini-supervisor-v2-20261114` au commit source indiqué, notamment :

- clé Gemini dédiée obligatoire, sans fallback vers `BEP_AI_API_KEY` ;
- activation conditionnée à un worker dédié, à une approbation explicite de facturation et à un budget mensuel déclaré ;
- retrait du DDL automatique au démarrage du superviseur ;
- entrée `agent-worker.js` séparée, exigeant `BEP_AGENT_DATABASE_URL` et refusant le fallback sur `DATABASE_URL` ;
- plafond de tokens de sortie transmis aux appels Gemini ;
- tests de configuration adaptés ;
- audit V1.4, spécification V2 et rapport d'état d'implémentation.

## Qualification exacte

**Cette sauvegarde est un snapshot Git du code et de la documentation. Elle n'est pas une certification de stabilité fonctionnelle, ni une preuve de validation pré-production complète.**

Au moment de sa création :

- la PR #160 est ouverte et non fusionnée ;
- aucun workflow CI n'est remonté pour le commit source ; les statuts combinés GitHub consultés sont vides ;
- aucun test automatisé n'a été exécuté dans le cadre de cette opération ;
- aucun test d'intégration ou test dynamique n'a été exécuté ;
- aucun appel Gemini de validation n'a été exécuté ;
- aucun déploiement Render n'a été déclenché ;
- aucune migration ni écriture PostgreSQL n'a été exécutée ;
- l'accès SQL en lecture seule à la base Render n'a pas abouti (exigences TLS/allowlist de l'hôte d'exécution).

## Limites et composants V2 restant à construire

- contrôle réel des coûts et coupe-circuit financier ;
- rôle PostgreSQL dédié et privilèges minimaux démontrés ;
- scheduler durable ;
- Source Registry, collecte sécurisée SSRF, snapshots et provenance vérifiable ;
- banc de tests synthétiques contre le vrai service Coach ;
- validateurs déterministes des calculs et références ;
- workflow complet réviseur/approbateur, publication immuable, journal append-only et rollback ;
- alertes de fraîcheur et de retard de file.

## Données, secrets et infrastructure

- Aucun secret, mot de passe, jeton, cookie ou valeur de variable d'environnement n'est archivé.
- Aucun export `pg_dump`, snapshot PostgreSQL vérifié ou test de restauration n'a été réalisé. Les données de production ne sont donc pas couvertes par cette sauvegarde Git.
- Aucun service Render, variable d'environnement, paramètre réseau, base ou donnée de production n'a été modifié par cette sauvegarde.
- La présence de logs de démarrage Gemini dans l'API de production a été observée dans un contrôle séparé ; ce snapshot ne modifie pas cet état runtime.

## Conditions avant mise en production

1. Exécuter et obtenir les résultats de la suite automatisée complète.
2. Vérifier les tests de configuration, worker, API, authentification, persistance et synchronisation offline.
3. Confirmer le démarrage API sans superviseur Gemini embarqué et sans appel externe.
4. Vérifier healthcheck, logs, routes et comportement sur environnement de validation isolé.
5. Démontrer l'isolation DB et le contrôle réel des coûts avant toute activation du worker.
6. Préparer et vérifier une sauvegarde PostgreSQL restaurable, indépendante du snapshot Git.
7. Documenter le plan de déploiement, les critères d'arrêt et le rollback.

## Règle de restauration

Pour retrouver le code sauvegardé, utiliser la branche `backup/BEP-v1.5-pre-prod-v2-20261114` ou `release/BEP-v1.5-pre-prod-v2-20261114`. Ne pas déplacer ces pointeurs. Vérifier le SHA du HEAD avant toute restauration ou opération de production.
