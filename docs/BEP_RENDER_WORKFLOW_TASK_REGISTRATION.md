# BEP — Render Workflow documentaire : définition et enregistrement des tâches

Date du relevé : 23 novembre 2026  
Dépôt : `MMG2025-creator/bep-mobile.`  
Branche de préparation : `docs/documentary-render-workflow-registration-20261123`  
Base de la branche : `b17822313e2115f2f71ecd6066625a695aba4e97`

## 1. Périmètre et distinction historique

La PR #346 (« feat(admin): run documentary optimization on demand ») décrivait initialement un déclenchement ponctuel par GitHub Actions `workflow_dispatch`, avec `agent-documentary-once.js`.

L'implémentation actuellement présente sur `main` utilise désormais **Render Workflows à la demande**. La référence d'exécution n'est donc plus le workflow GitHub Actions de la proposition initiale : le code effectif est `render-workflows/main.mjs`, le dispatch est réalisé par `lib/bep-agent/render-dispatch.js`, et la tâche métier est conservée dans PostgreSQL.

Cette documentation ne modifie ni le Workflow Render, ni ses variables, ni ses secrets, ni la base de données.

## 2. Configuration Render observée

Workflow : `bep-documentary-runner`

| Propriété | Valeur observée |
|---|---|
| Workflow ID | `wfl-dc1nalutlv9c73ciljt0` |
| Slug | `bep-documentary-runner` |
| Région | `frankfurt` |
| Dépôt | `https://github.com/MMG2025-creator/bep-mobile.` |
| Branche configurée | `main` |
| Répertoire racine | `.` |
| Runtime | `node` |
| Build | `npm install --no-fund` |
| Commande d'exécution | `npm run workflows:start` |
| Déclenchement automatique | `off` |

Le script npm `workflows:start` exécute `node render-workflows/main.mjs`. Le Workflow doit être déployé et sa version doit être prête pour que Render enregistre les tâches déclarées par le SDK.

## 3. Déclaration et enregistrement du Task

Fichier source : [`render-workflows/main.mjs`](../render-workflows/main.mjs)

Le module importe `task` depuis `@renderinc/sdk/workflows`, puis déclare :

- nom de tâche : `documentaryAnalyze` ;
- `retry.maxRetries = 0` ;
- `timeoutSeconds = 900` ;
- fonction exécutée : réception de l'identifiant PostgreSQL du job en second argument (`jobId`).

Le Task ID n'est pas codé en dur dans le dépôt. Render crée une inscription associée à une version du Workflow. Une nouvelle version peut donc produire un nouvel identifiant de tâche, même si le nom fonctionnel reste `documentaryAnalyze`.

### Inscriptions Render retrouvées le 23 novembre 2026

| Task ID | Workflow version ID | Nom/version affichée |
|---|---|---|
| `tsk-dc1nekk3d84000fcfo8g` | `wfv-dc1ne8pksfps739cpin0` | `1b7e05a` |
| `tsk-dc1nuvjtis60009qua3g` | `wfv-dc1numks728c73cusrug` | `401bf43` |
| `tsk-dc20ekjtis60009quab0` | `wfv-dc20e9ff3r2c73dvjlu0` | `86112ab` |

L'inscription la plus récente observée est donc `tsk-dc20ekjtis60009quab0`, attachée à la version Render `wfv-dc20e9ff3r2c73dvjlu0`.

## 4. Enregistrement du job métier et dispatch

Point d'entrée : `POST /api/admin/bep-agent/documentary-analyze` dans `server.js`.

La route est protégée par `auth` et `requireBepAgentAdmin`. Elle :

1. valide la requête documentaire (1 000 caractères maximum) ;
2. vérifie l'activation du pipeline et la disponibilité du schéma documentaire ;
3. vérifie la configuration du dispatch Render ;
4. insère un job `documentary_research` avec son payload `{ query }` dans `bep_agent_jobs` ;
5. transmet l'identifiant du job à `dispatchDocumentaryWorkflow({ jobId })` ;
6. renvoie HTTP 202 avec `jobId`, `taskRunId`, le statut du dispatch et `automaticPublication:false`.

En cas d'échec du dispatch, la route tente de marquer le job comme `failed` et ne le laisse pas silencieusement en attente.

Fichier de dispatch : [`lib/bep-agent/render-dispatch.js`](../lib/bep-agent/render-dispatch.js)

Le module utilise l'API Render `POST https://api.render.com/v1/task-runs` et envoie exactement les champs suivants :

```json
{
  "task": "bep-documentary-runner/documentaryAnalyze",
  "input": ["<jobId PostgreSQL>"],
  "idempotencyKey": "bep-documentary-<jobId>"
}
```

L'en-tête d'authentification utilise `RENDER_API_KEY`. Le slug de tâche est fourni par `BEP_AGENT_RENDER_TASK_SLUG`. Les deux valeurs restent des paramètres d'environnement et ne doivent jamais être inscrites dans Git.

Le dispatch n'est considéré confirmé que si Render répond HTTP 202 et renvoie un identifiant de Task Run au format `trn-...`.

## 5. Traitement ponctuel et persistance

Dans `render-workflows/main.mjs`, le Task :

- lit la configuration documentaire dédiée ;
- exige `BEP_AGENT_DATABASE_URL` (aucun fallback vers `DATABASE_URL`) ;
- valide l'identifiant numérique du job ;
- ouvre une connexion PostgreSQL dédiée ;
- contrôle `current_user = bep_agent_runner` et `current_database() = bep_v2_db` ;
- contrôle le schéma documentaire ;
- construit le client Groq ;
- appelle `processOne()` avec `jobTypes:["documentary_research"]`, `jobId:id`, `deferOnQuotaExhausted:false` et `retryOnFailure:false` ;
- vérifie que le job est en statut `completed`, puis ferme le pool.

La fonction `claim()` de `lib/bep-agent/repository.js` verrouille la file dans une transaction et sélectionne uniquement le job demandé, avec `FOR UPDATE SKIP LOCKED`. Elle marque le job `running` avant le traitement. Le worker marque ensuite le job `completed` ou `failed` et enregistre la trace dans `bep_agent_runs` et les métriques associées.

Le worker n'est pas un processus permanent dans ce parcours Render : un Task traite un seul job et se termine. Le type autorisé est limité à `documentary_research`.

Les propositions générées restent des candidats à validation humaine. La réponse du Task expose `automaticPublication:false`. Aucune publication automatique dans la bibliothèque active n'est prévue.

## 6. État opérationnel constaté

Le 23 novembre 2026 :

- Workflow Render : version la plus récente observée `86112ab`, statut `ready`, version ID `wfv-dc20e9ff3r2c73dvjlu0`.
- Le dépôt `main` a depuis avancé jusqu'au commit `b17822313e2115f2f71ecd6066625a695aba4e97` (fusion de la PR #350). Le Workflow Render ayant `autoDeployTrigger: off`, il ne faut pas supposer que cette version de code plus récente est déjà déployée dans le Workflow.
- Une exécution associée à `tsk-dc1nuvjtis60009qua3g` a échoué avec `BEP_DOCUMENTARY_WORKER_DISABLED:BEP_AGENT_ENABLED is not true`.
- Une exécution associée à `tsk-dc20ekjtis60009quab0` a échoué avec `DOCUMENTARY_DATABASE_ROLE_MISMATCH`.
- Ces erreurs démontrent que l'enregistrement du Task existe, mais ne valident pas le traitement documentaire de bout en bout. La cause du mismatch de rôle doit être diagnostiquée sans afficher ni transmettre les URL de connexion ou identifiants PostgreSQL.

Aucune clé API, URL de connexion PostgreSQL, valeur de secret ou donnée utilisateur n'est reproduite dans cette documentation.

## 7. Contrôles à conserver pour toute évolution

- Ne pas modifier le Workflow Render existant ni ses paramètres sans décision distincte.
- Ne pas fusionner ni déployer avant validation explicite.
- Ne pas déclencher de Task réel pendant les contrôles statiques.
- Vérifier séparément : déclaration SDK, version Render prête, inscription du Task, création du job PostgreSQL, dispatch HTTP 202, exécution du Task, transition du job, trace `bep_agent_runs`, création de candidats `pending` et absence de publication automatique.
- Toute évolution du mécanisme d'enregistrement ou de dispatch doit être développée sur une branche dédiée et couverte par des tests simulés ; les tests réels doivent utiliser un job de test non sensible et un rôle PostgreSQL dédié.
