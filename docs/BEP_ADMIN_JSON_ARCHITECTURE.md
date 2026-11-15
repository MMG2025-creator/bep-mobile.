# BEP Admin — architecture JSON

## Périmètre
Console administrative minimale intégrée à BEP, sans service d'hébergement ni base de données séparés. Les documents JSON administratifs sont stockés dans des tables dédiées du PostgreSQL principal existant.

## Séparation
- PostgreSQL BEP reste la source de vérité.
- L'administration utilise la session BEP existante et une autorisation serveur par allowlist.
- Les références de comptes exportées sont pseudonymisées par HMAC.
- Les champs d'identification directs sont supprimés et emails/téléphones détectés dans les chaînes sont masqués.
- Les exports sont versionnés et signés par HMAC.
- Les snapshots importés et annotations sont conservés comme documents JSON dans PostgreSQL.
- Le journal d'audit forme une chaîne de hashes détectant les altérations.
- Aucun endpoint d'administration ne modifie les données clients.

## Contrôles désactivés
- Synchronisation production et commandes d'écriture : INACTIVE.
- Corrections financières : DISABLED.
- Suppression de compte : DISABLED.
- Toute commande future devra comparer l'empreinte attendue à l'empreinte recalculée sous verrou dans la même transaction PostgreSQL que l'écriture. Un timestamp seul est insuffisant.

## Configuration
- BEP_ADMIN_EXCHANGE_SECRET recommandé pour signer les exports ; à défaut, le serveur utilise SESSION_SECRET.
- BEP_AGENT_ADMIN_USER_IDS contient les identifiants BEP autorisés. Les routes utilisent la session existante et cette allowlist.
- BEP_ENVIRONMENT identifie l'environnement source dans les exports.

## Limites
Cette version est une console de consultation/export/import/annotation. Elle ne constitue pas une certification de sécurité indépendante et ne doit pas être connectée à un mécanisme de mutation production avant audit séparé.


## Production activation gate
The production API mounts the console only when both `BEP_ADMIN_ENABLED=true` and `BEP_ADMIN_INDEPENDENT_AUTH_READY=true`. Both are unset/false by default. The current independent-admin session marker is intentionally not issued by the existing BEP login flow; until a separate administrator login, email verification, and password-reset flow is implemented and audited, the console cannot authorize requests. Schema creation is also skipped while the gate is closed.
\n\n## Independent administrator authentication\nThe administrator identity is allowlisted to `mmsignenoir@gmail.com` by default (overridable only through `BEP_ADMIN_EMAILS`). First enrollment requires an existing verified BEP account with that address and a one-time six-digit code sent by the configured BEP email service. The administrator sets a separate password (minimum 12 characters); hashes use bcrypt cost 12. Login regenerates the session and stores a distinct `bepAdminAuth` marker. Password recovery uses a separate expiring code, with five-attempt maximum and generic responses. Admin auth schema/routes are mounted only when `BEP_ADMIN_AUTH_ENABLED=true`. The JSON console additionally requires `BEP_ADMIN_ENABLED=true` and `BEP_ADMIN_INDEPENDENT_AUTH_READY=true`; all flags default to false.\n