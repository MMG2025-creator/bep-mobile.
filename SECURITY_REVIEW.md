# BEP — Revue de sécurité applicative

- Date de revue : 11 novembre 2026
- Périmètre : code versionné sur `main`, principalement `server.js` et `package.json`
- Méthode : revue statique ciblée. Aucun test d'intrusion, audit externe, scan dynamique authentifié, audit de dépendances en ligne ou contrôle des secrets Render n'a été exécuté.
- Conclusion : **socle de sécurité présent, conformité globale non démontrée**. Les contrôles ci-dessous sont des constats de code, pas une certification OWASP/ANSSI/RGPD.

## Contrôles présents

- Mots de passe hachés avec bcrypt, facteur de coût 12.
- Sessions serveur persistées dans PostgreSQL ; cookies `HttpOnly`, `Secure`, `SameSite=None`.
- Régénération de session après connexion par mot de passe, vérification e-mail et connexion Google.
- État OAuth généré aléatoirement, stocké sous forme de hash, à usage unique et avec expiration de 10 minutes.
- Vérification du profil Google et de l'adresse e-mail vérifiée.
- Clés API IA personnelles chiffrées avec AES-256-GCM ; clé de chiffrement attendue en variable d'environnement.
- Requêtes SQL paramétrées sur les routes examinées.
- Helmet activé ; CORS configuré pour l'origine frontend connue ; taille du JSON limitée à 1 Mo.
- Vérification e-mail avec code à durée limitée et compteur de tentatives.

## Écarts et risques à traiter

### Élevé — absence de limitation de débit applicative
Aucun rate limiter visible sur inscription, connexion, vérification e-mail, renvoi de code, démarrage OAuth et endpoints IA. Le compteur de cinq essais protège un code de vérification donné, mais ne limite pas suffisamment les demandes répétées de nouveaux codes ni les attaques distribuées sur les autres routes.
**Action recommandée :** limiter par IP et par compte, avec stockage partagé entre instances, temporisation progressive et alertes ; plafonner particulièrement le renvoi d'e-mail et les appels IA.

### Élevé — endpoint IA personnalisé et risque SSRF
La validation de l'endpoint personnalisé impose HTTPS et filtre quelques formes de noms/IP privés, mais ne résout pas le DNS et ne contrôle pas les IP obtenues ni les redirections HTTP. Des formes IPv6, des plages spéciales, des résolutions DNS privées ou des redirections peuvent contourner un filtrage basé sur le nom d'hôte.
**Action recommandée :** supprimer les endpoints arbitraires ou mettre en place une liste d'hôtes autorisés ; sinon résoudre et valider toutes les IP (IPv4/IPv6) à chaque connexion, refuser les plages privées, loopback, link-local et métadonnées, désactiver les redirections et appliquer une politique de sortie réseau.

### Moyen/élevé — politique CSP désactivée
Helmet est appelé avec `contentSecurityPolicy:false`. La politique CSP ne protège donc pas contre l'exécution de scripts injectés.
**Action recommandée :** définir une CSP adaptée aux scripts/styles réellement utilisés, idéalement avec nonce ou hash, puis tester les flux Google OAuth, polices et ressources externes.

### Moyen — absence de protection CSRF explicite
Les cookies sont en `SameSite=None`. Le CORS limité à l'origine frontend réduit l'exposition des lectures cross-origin, mais ne constitue pas à lui seul une défense CSRF complète.
**Action recommandée :** valider strictement `Origin`/Fetch Metadata sur toutes les routes mutantes et ajouter un jeton CSRF lié à la session si les flux navigateur le nécessitent. Vérifier également les méthodes et types de contenu acceptés.

### Moyen — exposition inutile de fichiers par le serveur statique
`express.static(process.cwd())` expose la racine du dépôt comme racine web. Les fichiers dotfiles sont ignorés par défaut, mais des fichiers de code et de configuration non cachés (par exemple `server.js` et `package.json`) peuvent être servis publiquement.
**Action recommandée :** servir un répertoire public dédié et refuser explicitement les fichiers source, fichiers de build, sauvegardes et métadonnées du dépôt.

### Moyen — validation TLS PostgreSQL désactivée
Le pool PostgreSQL utilise `ssl: { rejectUnauthorized: false }`, ce qui désactive la validation du certificat serveur.
**Action recommandée :** utiliser la chaîne CA fournie par l'hébergeur et réactiver la validation du certificat lorsque l'environnement le permet.

### Moyen — absence de manifeste de dépendances verrouillé identifié
Le dépôt ne contient pas de `package-lock.json` dans le périmètre vérifié ; les dépendances utilisent des plages semver. Aucun `npm audit` n'a pu être confirmé dans cette revue.
**Action recommandée :** versionner un lockfile, exécuter `npm ci` et `npm audit` en CI, traiter les vulnérabilités selon leur criticité et automatiser les mises à jour.

## Vérifications non réalisées

- Vérification des variables et secrets dans Render (valeurs non consultées et non copiées).
- Test réel des protections de session, CSRF, CORS et des limites de débit.
- Scan DAST / pentest, fuzzing et revue des permissions PostgreSQL.
- Vérification des sauvegardes, restauration et chiffrement au repos de la base chez l'hébergeur.
- Vérification des en-têtes HTTP réellement servis par le frontend et l'API.
- Audit des dépendances transitives et de leur CVE à la date de revue.

## Décision

Ne pas déclarer BEP « conforme » ou « certifié » sur la seule base de cette revue. Prioriser : (1) rate limiting, (2) suppression/encadrement SSRF des endpoints IA personnalisés, (3) CSP, (4) durcissement CSRF et origine, (5) racine statique dédiée, (6) validation TLS PostgreSQL, (7) lockfile et audit de dépendances.

Cette revue est une sauvegarde documentaire des constats ; elle ne signifie pas que les écarts ont déjà été corrigés.
