# État d'implémentation — Gemini Superviseur V2

Date : 14 novembre 2026

- Référence stable : BEP V1.4, commit `5cae41acdafbc602041b34fb41a77cbcee61a8dd`
- Branche d'implémentation : `implementation/gemini-supervisor-v2-20261114`
- Branche de spécification : `audit/gemini-supervisor-v2-20261114`
- Statut : fondation d'isolation commencée ; V2 non complète ; aucune activation ni migration exécutée.

## Changements réalisés

1. `lib/bep-agent/config.js`
   - suppression du fallback vers `BEP_AI_API_KEY` ;
   - clé dédiée `BEP_AGENT_GEMINI_API_KEY` obligatoire ;
   - activation conditionnée à `BEP_AGENT_RUN_AS_WORKER=true` ;
   - approbation explicite de facturation via `BEP_AGENT_BILLING_APPROVED=true` ;
   - budget mensuel USD explicite obligatoire ;
   - bornes de configuration conservées pour les appels et la fréquence de polling.

2. `lib/bep-agent/index.js`
   - suppression de l'exécution automatique du DDL au démarrage du superviseur ;
   - le worker exige désormais un pool explicitement fourni ;
   - aucune migration de schéma n'est lancée par le runtime.

3. `agent-worker.js`
   - nouveau point d'entrée autonome ;
   - exige `BEP_AGENT_DATABASE_URL` et refuse volontairement de reprendre `DATABASE_URL` ;
   - arrêt propre sur SIGTERM/SIGINT.

4. `package.json`
   - commande `npm run agent:worker`.

5. `tests/bep-agent.test.js`
   - adaptation des tests de configuration à la clé dédiée, au processus dédié et au budget déclaré.

## Limites connues — ne pas considérer comme terminées

- Le serveur API V1.4 appelle encore le point d'entrée, mais la configuration exige le mode worker dédié : le superviseur reste donc désactivé dans le processus API.
- Le budget mensuel est actuellement un verrou de configuration, pas encore un compteur financier de coûts réels/estimés. Ne pas activer le worker avant l'implémentation du contrôle de dépense, de la tarification versionnée, des réservations de budget et du coupe-circuit.
- Le rôle PostgreSQL dédié doit être créé et testé avec uniquement les privilèges nécessaires. Aucun rôle ni privilège n'a été modifié.
- Le schéma doit être migré séparément par une identité d'administration contrôlée. Aucune migration n'a été exécutée.
- L'ordonnanceur est encore fondé sur des intervalles en mémoire ; il n'est pas durable et ne satisfait pas la cible V2.
- Le registre des sources, la collecte SSRF-safe, les snapshots, la provenance détaillée et la vérification des droits ne sont pas encore implémentés.
- Le contrat de test partagé du Coach, les scénarios synthétiques exécutés contre le vrai service métier et les validateurs numériques ne sont pas encore implémentés.
- Le workflow réviseur/approbateur, la publication immuable, l'audit append-only et le rollback ne sont pas encore implémentés.
- Les évaluations Gemini ne doivent pas être considérées comme une preuve de qualité tant que les tests déterministes et le banc de tests du Coach ne sont pas disponibles.

## Vérifications

- Changements enregistrés sur une branche dédiée ; comparaison avec la branche d'audit : 5 commits en avance, 0 en retard au moment du contrôle.
- Les tests automatisés n'ont pas été exécutés dans cet environnement.
- Aucun test d'intégration, appel Gemini, accès DB/Render, migration, déploiement ou test de production n'a été effectué.
- Aucune modification de `main`, aucune PR et aucune fusion.

## Critères avant toute activation

1. implémenter et tester le contrôle budgétaire réel ;
2. créer le rôle DB dédié et vérifier ses privilèges effectifs ;
3. déplacer le scheduler vers un mécanisme durable ;
4. ajouter les tests unitaires, intégration et sécurité SSRF ;
5. construire le Source Registry et les snapshots ;
6. extraire le contrat métier du Coach et le banc synthétique ;
7. implémenter les contrôles déterministes et le workflow humain ;
8. exécuter la suite complète et documenter les résultats ;
9. obtenir une autorisation explicite avant toute opération Render, DB ou production.
