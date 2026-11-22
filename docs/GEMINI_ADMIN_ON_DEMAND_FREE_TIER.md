# BEP Agent — exécution administrative ponctuelle avec Groq

## Objectif
Exécuter les revues Gemini uniquement à la demande depuis l'espace d'administration BEP, sans Worker Render permanent et sans exécution périodique en arrière-plan.

## Configuration Render
Variables nécessaires sur le service API BEP :
- `BEP_AGENT_ENABLED=true`
- `BEP_AGENT_RUN_MODE=admin_on_demand`
- `BEP_AGENT_FREE_TIER_ACKNOWLEDGED=true`
- `BEP_AGENT_GEMINI_API_KEY` : clé dédiée Google AI Studio, stockée comme secret
- `BEP_AGENT_MAX_CALLS_PER_DAY=8` (plafond applicatif strict : 8)
- Modèle fixé dans le code : `gemini-3.8-flash` (pas de surcharge par variable d’environnement)

Les paramètres de l'ancien Worker (`BEP_AGENT_RUN_AS_WORKER`, `BEP_AGENT_BILLING_APPROVED`, `BEP_AGENT_MONTHLY_BUDGET_USD`) ne sont pas utilisés par ce mode.

## Gratuité : limite de garantie
Le mode admin limite les appels à huit par jour côté application. Groq publie des limites de débit et de volume qui dépendent du modèle et du compte ; le plafond BEP ne garantit donc pas à lui seul la gratuité ni l'absence de dépassement des limites fournisseur. Il faut vérifier les quotas affichés dans la console Groq avant activation. Une erreur ou un dépassement de quota Groq ne déclenche aucun basculement automatique vers Gemini ou un fournisseur payant.

## Exécution
- Le démarrage du serveur n'appelle pas Gemini et ne lance aucun ordonnanceur.
- Une action explicite depuis l'administration ajoute à la file PostgreSQL le type de tâche demandé : `documentary_json` lance uniquement la revue des fichiers JSON ; `quality` lance uniquement la revue qualité synthétique ; `all` lance les deux. Le bouton d'audit documentaire utilise `documentary_json` et consomme donc un seul appel Gemini.
- Après la réponse HTTP 202, le serveur planifie un lot ponctuel de deux tâches maximum avec `setImmediate`.
- Une seule exécution locale est admise à la fois ; `FOR UPDATE SKIP LOCKED` protège la prise de tâches entre instances.
- La file PostgreSQL conserve les tâches si le processus s'arrête ; les baux expirés sont récupérables après dix minutes.
- Aucune tâche périodique n'est planifiée. Il faut une nouvelle action administrative pour lancer une nouvelle revue.

## Sécurité et périmètre
- Les routes restent protégées par la session authentifiée et `BEP_AGENT_ADMIN_USER_IDS`.
- Le fournisseur sélectionné reçoit les documents JSON autorisés, les fiches documentaires BEP et des métriques agrégées ; il ne reçoit pas les données personnelles du Coach.
- Les propositions restent en attente de validation humaine.
- Aucune publication automatique n'est autorisée.
- Le serveur API utilise son pool PostgreSQL existant ; ce mode ne prétend pas fournir l'isolation réseau ou le rôle SQL dédié du Worker autonome. Les requêtes agent restent limitées aux fonctions et tables dédiées, mais l'identité PostgreSQL sous-jacente est celle de l'API.

## Migration PostgreSQL
Les tables additives doivent exister avant activation. La migration reste explicitement opt-in :
- ajouter `BEP_AGENT_SCHEMA_MIGRATE=true` au service API, avec la configuration admin-on-demand complète ci-dessus ;
- au démarrage suivant, le serveur exécute uniquement la migration SQL additive et idempotente, puis vérifie la présence des sept tables ;
- remettre ensuite `BEP_AGENT_SCHEMA_MIGRATE=false` ou retirer la variable pour les redémarrages suivants.

Le script `node scripts/migrate-bep-agent.js` reste disponible pour une exécution manuelle avec `DATABASE_URL` et les mêmes variables d’activation.

La migration est additive et idempotente ; elle ne modifie pas les tables métier BEP. Le serveur vérifie la présence des sept tables avant d'autoriser les exécutions.

## Vérifications obligatoires
- Tests unitaires de configuration et de routage.
- Migration additive validée sur une base de test.
- Vérification des journaux de production après déploiement.
- Premier appel réel Groq déclenché manuellement par l'administrateur.
- Contrôle que le compteur PostgreSQL n'excède jamais huit appels par jour.
\n## Secours Gemini\n\nGemini reste disponible comme fournisseur de secours sélectionnable explicitement en configurant `BEP_AGENT_AI_PROVIDER=gemini` et `BEP_AGENT_GEMINI_API_KEY`. Le modèle de secours est `gemini-3.8-flash`. Le changement de fournisseur nécessite une modification volontaire de configuration et un redémarrage du service ; aucun fallback automatique n'est activé, afin d'éviter une consommation ou une facturation inattendue.\n