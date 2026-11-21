# Registre documentaire du Coach — fraîcheur et validation

## Objectif

Le registre conserve les références documentaires officielles utilisées pour cadrer le Coach. Il distingue la validation éditoriale de la fraîcheur technique : une source peut être validée mais devenue ancienne, ou fraîche mais encore en attente de validation humaine.

## États

- `pending_validation` : référence enregistrée, pas encore approuvée pour servir de fondement au Coach.
- `validated` : validation éditoriale humaine.
- `rejected` : référence refusée.
- `unchecked` : aucune vérification de fraîcheur réussie.
- `fresh` : contenu récupéré et empreinte SHA-256 calculée.
- `stale` : dernière vérification dépasse le délai configuré (30 jours par défaut).
- `changed` : empreinte du contenu différente de la vérification précédente ; revue humaine requise.
- `error` : contrôle impossible ; l'ancienne empreinte est conservée.

## Contrôles disponibles

- `GET /api/admin/bep-coach/source-registry` : liste les sources, leurs statuts et les compteurs de fraîcheur.
- `POST /api/admin/bep-coach/source-registry/refresh` avec `{"sourceIds":["mqa-01"]}` : contrôle un lot de 1 à 10 sources.
- `POST /api/admin/bep-coach/source-registry` : enregistre des références en attente de validation.

Les trois routes sont protégées par l'authentification et le contrôle administrateur BEP. Les URL sont limitées à HTTPS et aux hôtes officiels `mesquestionsdargent.fr` et `www.mesquestionsdargent.fr`. La récupération réutilise le fetcher HTTPS existant, qui vérifie la résolution DNS publique, épingle l'adresse IP et ne suit pas les redirections.

## Règles de sûreté

- Aucun appel Gemini n'est effectué par les opérations du registre.
- Aucun contenu modifié n'est automatiquement publié dans la base de connaissances.
- Une empreinte différente passe à `changed` et impose une revue humaine.
- Une erreur de récupération est visible et ne remplace pas la dernière empreinte valide.
- Le registre ne constitue pas une preuve de validation éditoriale : `fresh` ne signifie pas `validated`.

## Limites

Le rafraîchissement est déclenché manuellement par un administrateur. Il n'y a pas encore de planification automatique. Les références déjà enregistrées doivent être contrôlées après déploiement ; leur présence ne prouve pas leur fraîcheur. La liste des domaines autorisés est volontairement restrictive et doit être revue avant d'ajouter un nouveau fournisseur documentaire.

## Test de connectivité Gemini (administrateur)

- `POST /api/admin/bep-agent/gemini-smoke-test` : réalise un appel réel unique au modèle configuré avec un prompt de diagnostic fixe et synthétique.
- La route exige la session et les droits administrateur BEP, ainsi que la configuration `BEP_AGENT_ENABLED=true`, `BEP_AGENT_RUN_MODE=admin_on_demand`, `BEP_AGENT_FREE_TIER_ACKNOWLEDGED=true` et une clé API disponible.
- Réponse : `ok`, modèle, source de clé (jamais la clé), latence, usage de tokens et code d'erreur normalisé.
- Aucun contenu utilisateur n'est lu, aucune tâche n'est mise en file, aucune connaissance n'est publiée.
- Codes utiles : `GEMINI_AUTH_OR_PERMISSION` (401/403), `GEMINI_MODEL_NOT_FOUND` (404), `GEMINI_QUOTA_OR_RATE_LIMIT` (429), `GEMINI_CONNECTION_OR_RESPONSE_ERROR` (réseau/format).
