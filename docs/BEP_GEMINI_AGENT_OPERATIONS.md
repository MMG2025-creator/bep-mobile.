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

## Revue des fichiers JSON documentaires

La revue de connaissances charge en lecture seule une liste fermée de fichiers du dépôt :
- `services/coach-library.json` : contrat et périmètre du service documentaire ;
- `src/coach/knowledge/financialCoachSources.fr.json` ;
- `src/coach/knowledge/financialCoachSources.additional.fr.json` : référentiels de sources et sujets.

Chaque fichier est parsé comme JSON, limité en taille et accompagné de son empreinte SHA-256 dans le résumé d'exécution. Gemini reçoit ces contenus avec les fiches actives de `bep_financial_knowledge` pour relever incohérences, lacunes et besoins de clarification. Aucune recherche Internet n'est lancée par cette revue. Les contenus JSON sont traités comme des données non fiables, jamais comme des instructions.

Les propositions ne peuvent viser que des fiches PostgreSQL existantes et doivent conserver exactement leurs métadonnées de provenance. Elles sont enregistrées comme candidates, soumises à validation humaine et ne modifient ni les fichiers JSON du dépôt ni la base active avant approbation. Les fichiers sources sont explicitement allowlistés ; aucun parcours arbitraire du dépôt n'est effectué.

L'outil est accessible depuis l'espace administrateur « Base documentaire du Coach ». Le bouton déclenche le circuit agent existant ; si l'agent est désactivé, l'API refuse la demande. Les appels Gemini restent soumis à la clé dédiée, à l'accord explicite de facturation et au budget mensuel configuré. Le Coach utilisateur reste local et ne contacte jamais Gemini.

## Validation humaine des propositions

Configurer `BEP_AGENT_ADMIN_USER_IDS` avec les identifiants BEP des administrateurs autorisés, séparés par des virgules. Sans cette allowlist, les routes d'administration renvoient 403.

- `POST /api/admin/bep-agent/run` : déclenche une revue documentaire et une revue du protocole qualité.
- `GET /api/admin/bep-agent/overview` : exécutions et métriques agrégées.
- `GET /api/admin/bep-agent/candidates?status=pending` : propositions en attente.
- `POST /api/admin/bep-agent/candidates/:id/review` avec `{"decision":"approve"}` ou `{"decision":"reject"}`.

Une approbation publie une surcouche dans `bep_agent_approved_knowledge`, lue par le moteur RAG. Chaque candidate est liée à la version et à l'empreinte du document source ; si celui-ci a changé, l'approbation est bloquée et une nouvelle revue est nécessaire. Les données seed d'origine ne sont pas écrasées.

## Limite du contrôle qualité
La V1 analyse un corpus de tests fictifs et des métriques agrégées. Elle n'envoie pas les questions fictives au véritable endpoint Coach et n'évalue donc pas encore les réponses effectivement produites. Ce test d'exécution devra être développé séparément avant de qualifier la supervision de test de bout en bout.


## Mode alternatif : admin-on-demand sur quota gratuit

Le mode `admin_on_demand` est conçu pour éviter un Worker Render permanent. Il ne démarre aucun polling ni ordonnanceur au lancement du serveur. L'action authentifiée `/api/admin/bep-agent/run` met les tâches en file PostgreSQL puis déclenche un lot ponctuel de deux tâches maximum dans le processus API, après l'envoi de la réponse HTTP. Le traitement utilise le pool PostgreSQL de l'API et n'offre donc pas la même isolation de processus ni le rôle SQL dédié du Worker autonome. La prise de tâches conserve `FOR UPDATE SKIP LOCKED` et les baux récupérables.

Configuration : `BEP_AGENT_ENABLED=true`, `BEP_AGENT_RUN_MODE=admin_on_demand`, `BEP_AGENT_FREE_TIER_ACKNOWLEDGED=true`, `BEP_AGENT_GEMINI_API_KEY` et `BEP_AGENT_MAX_CALLS_PER_DAY=8`. Le modèle est fixé à `gemini-3.8-flash`. Ce mode n'utilise pas le verrou de budget mensuel de l'ancien Worker. Le quota applicatif est plafonné à huit appels par jour. Ce plafond ne peut pas vérifier ni garantir le statut gratuit du projet Google : le projet AI Studio doit rester sans facturation activée et respecter les quotas Google. Aucun fallback payant n'est prévu.

Les sept tables additives doivent être migrées explicitement avant activation. Le serveur vérifie leur présence et refuse les exécutions si elles manquent. Voir `docs/GEMINI_ADMIN_ON_DEMAND_FREE_TIER.md` pour la procédure.


## Document JSON des propositions

Les deux robots administratifs (revue du corpus JSON et recherche Google Search) déposent leurs propositions dans `bep_knowledge_candidates`, avec le statut `pending`, la provenance et l’empreinte de la source. Le contrat de sortie est défini dans `services/coach-proposals.json` et référencé par `services/coach-research.json`.

La recherche Google Search du Coach utilise l’API Gemini Interactions (`POST /v1beta/interactions`), le modèle `gemini-3.8-flash` et l’outil `google_search`. La réponse structurée JSON est extraite des étapes `model_output`; les URL sources sont exclusivement récupérées depuis les annotations `url_citation` HTTPS. Les interactions sont envoyées avec `store=false`. Les propositions restent en attente de validation humaine. Le moteur local du Coach et le robot de revue des fichiers JSON ne sont pas modifiés par ce circuit.

L’administration peut télécharger le document `bep-coach-proposals.json` via `GET /api/admin/bep-coach/proposals.json`. L’endpoint est protégé par la session administrateur indépendante, renvoie `Cache-Control: no-store` et expose par défaut uniquement les propositions en attente. Le JSON est reconstitué depuis le stockage PostgreSQL durable ; aucun fichier temporaire sur le disque Render n’est utilisé.

L’approbation reste réalisée individuellement via `POST /api/admin/bep-agent/candidates/:id/review`. La vérification d’empreinte et de version source précède toute intégration. Le document JSON de propositions n’est jamais lu par le Coach utilisateur et ne déclenche aucune publication automatique.
