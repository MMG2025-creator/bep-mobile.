# BEP — Agent Gemini V1

## Rôle
Agent interne asynchrone, distinct du Coach BEP. Il ne répond jamais aux utilisateurs et ne modifie jamais automatiquement les connaissances utilisées en production.

## Fonctions V1
- Audit périodique de la bibliothèque documentaire publique déjà présente dans `bep_financial_knowledge`.
- Création de propositions de correction dans `bep_knowledge_candidates`, toujours en attente de validation humaine.
- Revue périodique d'un corpus synthétique de scénarios de qualité du Coach.
- Conservation de métriques agrégées et de condensats SHA-256 ; aucune question, réponse ou donnée financière personnelle n'est collectée.

## Isolation
- Aucun accès SQL direct par Gemini : le backend charge les documents et valide les réponses.
- Aucune lecture de `bep_user_data`, des comptes utilisateurs ou des sessions.
- Le client Gemini ne reçoit que des documents généraux BEP et des scénarios fictifs.
- Les propositions ne sont jamais copiées automatiquement dans `bep_financial_knowledge`.
- Les règles financières, budgets, dépenses, épargne et authentification ne sont pas modifiés.

## Activation fail-closed
L'agent est inactif par défaut. Il exige simultanément :
- `BEP_AGENT_ENABLED=true`
- `BEP_AGENT_ZERO_BILLING_CONFIRMED=true`
- `BEP_AGENT_GEMINI_API_KEY` (clé dédiée, distincte de celle du Coach)
- `BEP_AGENT_GEMINI_MODEL` facultatif, défaut `gemini-3.8-flash`

Quota par défaut : 8 appels/jour, plafonné à 50. Les appels sont limités à un modèle Gemini configuré, timeout 30 secondes, redirections refusées.

## Limites V1
La revue documentaire ne fait pas de recherche web autonome : elle audite les sources et contenus déjà présents. La supervision qualité évalue un corpus synthétique, pas les conversations réelles des utilisateurs. Les propositions sont des candidates, pas des connaissances validées.
