# BEP Gemini Agent — exploitation

## Démarrage
L'API crée les tables additives de l'agent après l'initialisation PostgreSQL, même si Gemini reste désactivé. Le worker et tout appel Gemini ne démarrent que si les trois conditions d'activation sont satisfaites. En l'absence de configuration, le serveur BEP et le Coach local continuent normalement.

## Cadence
Au démarrage, deux tâches sont mises en file : revue documentaire et revue qualité synthétique. Un cycle de programmation relance ces tâches toutes les six heures. Un worker traite une tâche à la fois et interroge la file persistante toutes les 15 secondes par défaut.

Un service Render Free peut être suspendu. Dans ce cas, la file PostgreSQL conserve les tâches ; le traitement reprend au redémarrage. Ce mode n'est pas une garantie d'exécution 24/7.

## Quotas
La limite est de 8 appels Gemini par jour par défaut (maximum configurable : 50). Si la limite est atteinte, les tâches restent en attente ou échouent sans fallback vers un fournisseur payant.

## Contrôles
Tables : `bep_agent_jobs`, `bep_agent_runs`, `bep_knowledge_candidates`, `bep_agent_daily_usage`, `bep_agent_metrics`.

Ne jamais activer l'agent en production avant d'avoir vérifié la clé Gemini dédiée, la configuration de facturation gratuite et le plan Render. Les propositions documentaires doivent être examinées avant toute publication.

## Validation humaine des propositions

Configurer `BEP_AGENT_ADMIN_USER_IDS` avec les identifiants BEP des administrateurs autorisés, séparés par des virgules. Sans cette allowlist, les routes d'administration renvoient 403.

- `GET /api/admin/bep-agent/overview` : exécutions et métriques agrégées.
- `GET /api/admin/bep-agent/candidates?status=pending` : propositions en attente.
- `POST /api/admin/bep-agent/candidates/:id/review` avec `{"decision":"approve"}` ou `{"decision":"reject"}`.

Une approbation publie une surcouche dans `bep_agent_approved_knowledge`, lue par le moteur RAG. Les données seed d'origine ne sont pas écrasées. Une révocation ultérieure peut être réalisée en rejetant les propositions suivantes ; toute décision d'approbation reste humaine.
