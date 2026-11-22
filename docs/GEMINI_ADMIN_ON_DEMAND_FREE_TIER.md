# BEP Agent — exécution administrative ponctuelle avec Groq

## Objectif
Exécuter les revues BEP uniquement à la demande depuis l'espace d'administration, sans Worker Render permanent ni exécution périodique en arrière-plan.

## Configuration Render
Variables nécessaires sur le service API BEP :
- `BEP_AGENT_ENABLED=true`
- `BEP_AGENT_RUN_MODE=admin_on_demand`
- `BEP_AGENT_FREE_TIER_ACKNOWLEDGED=true`
- `BEP_AGENT_AI_PROVIDER=groq` (valeur par défaut dans le code)
- `BEP_AGENT_GROQ_API_KEY` : clé dédiée Groq, stockée comme secret
- `BEP_AGENT_GROQ_MODEL=openai/gpt-oss-20b` (modèle par défaut)
- `BEP_AGENT_MAX_CALLS_PER_DAY=8` (plafond applicatif strict : 8)

Gemini reste disponible en sélection explicite avec `BEP_AGENT_AI_PROVIDER=gemini` et `BEP_AGENT_GEMINI_API_KEY`. Le modèle utilisé est `gemini-3.8-flash`.

Les paramètres de l'ancien Worker (`BEP_AGENT_RUN_AS_WORKER`, `BEP_AGENT_BILLING_APPROVED`, `BEP_AGENT_MONTHLY_BUDGET_USD`) ne sont pas utilisés par ce mode.

## Quotas et gratuité
Le plafond BEP limite les appels à huit par jour côté application. Groq publie des limites de débit et de volume qui dépendent du modèle et du compte. Ce plafond applicatif ne garantit donc pas à lui seul la gratuité ni l'absence de dépassement des limites fournisseur. Vérifier les quotas affichés dans la console Groq avant activation. Une erreur ou un dépassement de quota Groq ne déclenche aucun basculement automatique vers Gemini ou un fournisseur payant.

## Exécution
- Le démarrage du serveur n'appelle aucun fournisseur IA et ne lance aucun ordonnanceur.
- Une action explicite depuis l'administration ajoute à la file PostgreSQL le type de tâche demandé : `documentary_json` lance uniquement la revue des fichiers JSON ; `quality` lance uniquement la revue qualité synthétique ; `all` lance les deux.
- Après la réponse HTTP 202, le serveur planifie un lot ponctuel de deux tâches maximum avec `setImmediate`.
- Une seule exécution locale est admise à la fois ; `FOR UPDATE SKIP LOCKED` protège la prise de tâches entre instances.
- La file PostgreSQL conserve les tâches si le processus s'arrête ; les baux expirés sont récupérables après dix minutes.
- Aucune tâche périodique n'est planifiée. Il faut une nouvelle action administrative pour lancer une nouvelle revue.

## Sécurité et périmètre
- Les routes restent protégées par la session authentifiée et le contrôle administrateur indépendant.
- Le fournisseur sélectionné reçoit les documents JSON autorisés, les fiches documentaires BEP et des métriques agrégées ; il ne reçoit pas les données personnelles du Coach.
- Les propositions restent en attente de validation humaine.
- Aucune publication automatique n'est autorisée.
- Le serveur API utilise son pool PostgreSQL existant ; ce mode ne prétend pas fournir l'isolation réseau ou le rôle SQL dédié du Worker autonome.

## Migration PostgreSQL
Les tables additives doivent exister avant activation. La migration reste explicitement opt-in :
- ajouter `BEP_AGENT_SCHEMA_MIGRATE=true au service API, avec la configuration admin-on-demand complète ci-dessus ;
- au démarrage suivant, le serveur exécute uniquement la migration SQL additive et idempotente, puis vérifie la présence des sept tables ;
- remettre ensuite `BEP_AGENT_SCHEMA_MIGRATE=false` ou retirer la variable pour les redémarrages suivants.

La migration est additive et idempotente ; elle ne modifie pas les tables métier BEP.

## Vérifications avant activation
- Tests unitaires de configuration, client Groq et routage.
- Migration additive validée sur une base de test.
- Diagnostic de connexion réel déclenché manuellement par l'administrateur.
- Vérification des journaux et des quotas dans la console fournisseur.
- Contrôle que le compteur PostgreSQL n'excède jamais huit appels par jour.

Aucune clé API ne doit être placée dans le dépôt ou dans les échanges de chat. Aucune variable Render n'est modifiée par cette PR.
