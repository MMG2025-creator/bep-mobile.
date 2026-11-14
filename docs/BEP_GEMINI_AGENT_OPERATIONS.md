# BEP Gemini Agent — exploitation

## Démarrage
L'agent est désactivé par défaut. Tant que les trois conditions d'activation ne sont pas réunies, le démarrage ne crée aucune table, n'écrit rien en base, n'effectue aucun appel Gemini et n'active pas la collecte de télémétrie. Lorsque l'agent est explicitement activé, il crée uniquement ses tables additives avant de démarrer le worker. Le serveur BEP et le Coach local restent indépendants de Gemini.

## Cadence
Au démarrage, deux tâches sont mises en file : revue documentaire et revue du protocole qualité synthétique. Un cycle de programmation relance ces tâches toutes les six heures. Un worker traite une tâche à la fois et interroge la file persistante toutes les 15 secondes par défaut.

Un service Render Free peut être suspendu. Dans ce cas, la file PostgreSQL conserve les tâches ; le traitement reprend au redémarrage. Ce mode n'est pas une garantie d'exécution 24/7.

## Quotas
La limite est de 8 appels Gemini par jour par défaut (maximum configurable : 50). Si la limite est atteinte, les tâches sont reportées au jour suivant sans fallback vers un fournisseur payant.

## Contrôles
Tables additives : `bep_agent_jobs`, `bep_agent_runs`, `bep_knowledge_candidates`, `bep_agent_daily_usage`, `bep_agent_metrics`, `bep_agent_approved_knowledge`, `bep_agent_coach_metrics`.

En production, l'agent peut utiliser `BEP_AGENT_GEMINI_API_KEY` (prioritaire) ou, si explicitement autorisé, réutiliser `BEP_AI_API_KEY`. Dans ce second cas, les appels partagent le même projet Google, ses quotas fournisseur et sa facturation. La limite applicative de l'agent reste de 8 appels par jour par défaut. La confirmation de facturation nulle doit être explicite. Les propositions documentaires doivent être examinées avant toute publication.

## Validation humaine des propositions

Configurer `BEP_AGENT_ADMIN_USER_IDS` avec les identifiants BEP des administrateurs autorisés, séparés par des virgules. Sans cette allowlist, les routes d'administration renvoient 403.

- `POST /api/admin/bep-agent/run` : déclenche une revue documentaire et une revue du protocole qualité.
- `GET /api/admin/bep-agent/overview` : exécutions et métriques agrégées.
- `GET /api/admin/bep-agent/candidates?status=pending` : propositions en attente.
- `POST /api/admin/bep-agent/candidates/:id/review` avec `{"decision":"approve"}` ou `{"decision":"reject"}`.

Une approbation publie une surcouche dans `bep_agent_approved_knowledge`, lue par le moteur RAG. Chaque candidate est liée à la version et à l'empreinte du document source ; si celui-ci a changé, l'approbation est bloquée et une nouvelle revue est nécessaire. Les données seed d'origine ne sont pas écrasées.

## Limite du contrôle qualité
La V1 analyse un corpus de tests fictifs et des métriques agrégées. Elle n'envoie pas les questions fictives au véritable endpoint Coach et n'évalue donc pas encore les réponses effectivement produites. Ce test d'exécution devra être développé séparément avant de qualifier la supervision de test de bout en bout.
