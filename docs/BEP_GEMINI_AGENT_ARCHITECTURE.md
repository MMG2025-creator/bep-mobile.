# BEP — Agent Gemini V1

## Rôle
Agent interne asynchrone, distinct du Coach BEP. Il ne répond jamais aux utilisateurs et ne modifie jamais automatiquement les connaissances utilisées par le Coach.

## Fonctions V1
- Audit périodique de la bibliothèque documentaire publique déjà présente dans `bep_financial_knowledge`.
- Création de propositions de correction dans `bep_knowledge_candidates`, toujours en attente de validation humaine.
- Revue du protocole de test synthétique et des métriques opérationnelles agrégées (mode, statut HTTP, latence, tokens).
- Conservation de métriques agrégées et de condensats SHA-256 ; aucune question, réponse ou donnée financière personnelle n'est collectée.

## Isolation
- Aucun accès SQL direct par Gemini : le backend charge les documents et valide les réponses.
- Aucune lecture de `bep_user_data`, des comptes utilisateurs ou des sessions.
- Le client Gemini ne reçoit que des documents généraux BEP, des scénarios fictifs et des métriques agrégées.
- Les propositions ne sont jamais copiées automatiquement dans `bep_financial_knowledge`.
- Les règles financières, budgets, dépenses, épargne et authentification ne sont pas modifiés.
- Le démarrage désactivé n'effectue aucune écriture et n'active pas la collecte de télémétrie.

## Activation fail-closed
L'agent est inactif par défaut. Il exige simultanément :
- `BEP_AGENT_ENABLED=true`
- `BEP_AGENT_ZERO_BILLING_CONFIRMED=true`
- `BEP_AGENT_GEMINI_API_KEY` (clé dédiée, distincte de celle du Coach)
- `BEP_AGENT_GEMINI_MODEL` facultatif, défaut `gemini-3.8-flash`

Quota par défaut : 8 appels/jour, plafonné à 50. Les appels sont limités à un modèle Gemini configuré, timeout 30 secondes, redirections refusées.

## Validation des connaissances
Chaque candidate conserve la version et l'empreinte SHA-256 du document source. L'approbation est refusée si le document source ou sa provenance ont changé depuis la génération de la proposition. L'approbation humaine crée une surcouche RAG additive ; le document seed n'est jamais modifié.

## Limites V1
La revue documentaire ne fait pas de recherche web autonome : elle audite les sources et contenus déjà présents. La revue qualité V1 examine le protocole synthétique et les métriques ; elle **n'exécute pas encore les questions contre le Coach et ne prétend pas analyser ses réponses réelles**. Les propositions sont des candidates, pas des connaissances validées.
