# BEP — Cartographie technique des traitements de données

**Statut : inventaire technique de travail — à compléter et valider par le responsable de traitement.**
Périmètre observé : code applicatif et documents du dépôt au 24 novembre 2026. Ce document décrit les traitements visibles dans le code ; il ne remplace ni une analyse juridique, ni la vérification des contrats, ni un audit des configurations réelles.

## 1. Comptes et authentification
- **Compte BEP :** identifiant interne, e-mail, nom affiché, prénom, nom, téléphone, avatar, dates de création/mise à jour, hash de mot de passe, statut de vérification et identifiant Google.
- **Google OAuth :** états et jetons OAuth hachés avec expiration ; scopes de connexion visibles : `openid email profile`.
- **Sessions :** sessions serveur PostgreSQL via express-session/connect-pg-simple ; cookie `connect.sid` HTTP-only, Secure, SameSite=None, durée configurée à 7 jours.
- **Vérification e-mail :** e-mail, identifiant utilisateur, hash de code, expiration et tentatives.
- **Réinitialisation :** hash SHA-256 du jeton, identifiant utilisateur et expiration ; documentation/code indiquent un jeton de 30 minutes à usage unique.
- **Administration :** comptes administrateur indépendants, e-mail, hash de mot de passe, challenges e-mail hachés, finalité, expiration et tentatives.
- **Anti-abus :** cookie `bep_device` signé et HttpOnly prévu pour un an ; clé de limitation hachée, compteur, fenêtre et expiration. Purge des buckets à vérifier.

## 2. Données financières et fonctionnalités
- **Données principales :** document JSONB `bep_user_data.payload` rattaché au compte. Les structures et fonctions du produit couvrent notamment revenus, budgets, dépenses, objectifs, transactions et opérations d'épargne.
- **Budgets mensuels :** mois, statut, devise, totaux, version, éléments, libellés, catégories, nature, montants, métadonnées et identifiants de source.
- **Audit budgétaire :** événements et instantanés avant/après selon les fonctions de budget ; contenu exact et conservation à vérifier.
- **Bibliothèque Coach personnelle :** recommandations et connaissances importées par compte, avec catégorie, titre, détail, priorité, confiance, preuves, action, validité, fournisseur et statut de revue.
- **Connaissance financière partagée :** sources et contenus documentaires ; vérifier qu'aucune donnée personnelle utilisateur n'y est publiée.
- **Suppression de compte :** la route supprime le compte et les données liées par clés étrangères en cascade, les sessions et certains jetons OAuth. Les tables sans FK, journaux, sauvegardes et données chez les prestataires restent à vérifier.

## 3. Coach, IA et échanges externes
- **Coach local :** requête utilisateur et contexte financier transmis au backend pour le moteur déterministe, les calculs et la consultation de la bibliothèque.
- **Connexion IA avancée :** table par utilisateur avec fournisseur, modèle, endpoint, clé chiffrée, IV, tag et date de mise à jour. Vérifier les appels effectivement activés, les données envoyées et les fournisseurs en production.
- **Métriques fournisseurs Coach :** type de requête, modèle, statut, recherches, tokens, statut HTTP, code d'erreur et horodatage ; durée et accès à confirmer.
- **Export manuel IA :** spécification BEP décrit un export agrégé/anonymisé, sans identifiants directs ni lignes de transactions, que l'utilisateur téléverse lui-même vers un fournisseur externe. Le fichier peut contenir des montants et n'est pas une sauvegarde chiffrée.
- **Import de retour IA :** recommandations et connaissances conservées dans la bibliothèque privée de l'utilisateur, en attente de validation ; pas de promotion automatique vers les règles globales selon la spécification.
- **Pipeline documentaire interne :** l'architecture projet sépare la recherche/optimisation documentaire (Exa/Groq et workflows) du Coach utilisateur. Groq n'est pas défini comme fournisseur répondant directement aux utilisateurs. Vérifier les fournisseurs et champs réellement utilisés en production.

## 4. E-mails transactionnels
Le backend appelle une URL Google Apps Script configurée par `GMAIL_APPS_SCRIPT_URL`, avec un secret partagé `BEP_MAIL_SECRET`. Les messages documentés sont la vérification d'adresse, la réinitialisation du mot de passe et les codes d'administration. Le flux transmet notamment adresse e-mail, code ou lien de réinitialisation et type de message. Confirmer le compte Google exploitant le script, les journaux, la conservation, les lieux de traitement et les accords contractuels.

## 5. Télémétrie DAU / WAU / MAU
Une ligne par identifiant interne et jour UTC est enregistrée après chargement authentifié réussi de `GET /api/data` ou sauvegarde validée de `PUT /api/data`. Elle contient identifiant interne, date et dernier horodatage. L'admin ne reçoit que des agrégats. L'identifiant interne est pseudonymisé, pas anonyme. La purge planifiée doit être vérifiée après déploiement.

## 6. Administration et pipeline documentaire
La console admin et le pipeline documentaire traitent des comptes admin, sources, candidats, tâches, exécutions d'ingestion/recherche, propositions, validations, métriques et journaux techniques. Il faut compléter l'inventaire des schémas et routes admin, vérifier les données personnelles éventuellement présentes dans les documents importés, les accès opérateurs, les exports et les durées. Le projet impose une validation humaine avant publication de la bibliothèque.

## 7. Hébergement et prestataires repérés
- **Render :** hébergement frontend et API. La configuration consultée indique Frankfurt pour le service API ; région PostgreSQL, sauvegardes, entité contractante, DPA et transferts éventuels restent à confirmer.
- **Google :** OAuth et Gmail/Apps Script transactionnel ; projets, scopes, compte exploitant, contrats, lieux et rétention à confirmer.
- **Fournisseurs IA configurables :** fournisseurs réellement activés, régions, sous-traitants et champs transmis à vérifier.
- **Exa / Groq :** recherche et optimisation documentaires internes ; contrats, régions et contenus réellement transmis à vérifier.
- **CDN et polices :** CSP autorise notamment jsDelivr, cdnjs et Google Fonts ; vérifier les ressources réellement chargées et les données de connexion correspondantes.

## 8. Cookies et stockage navigateur
Cookies visibles : `connect.sid` (7 jours configurés) et `bep_device` (un an configuré), tous deux HTTP-only, Secure et SameSite=None. Le projet utilise aussi stockage local/offline et service worker. Il reste à inventorier les clés localStorage/IndexedDB/cache, leurs finalités, durées, synchronisation et purge à la déconnexion/suppression du compte, puis à qualifier les traceurs.

## 9. Droits, effacement et sauvegardes
Définir une procédure permettant de retrouver les données par compte, de traiter accès, rectification, effacement, limitation, opposition et portabilité lorsque les conditions sont réunies. Vérifier les données sans FK, les journaux, les exports locaux, les sauvegardes et les copies détenues par les prestataires : la suppression applicative ne garantit pas l'effacement immédiat des sauvegardes externes.

## 10. Points bloquants avant notice complète et validation
1. Vérifier sur pièce officielle la dénomination, le siège et les coordonnées du responsable.
2. Déterminer finalités, personnes concernées, bases légales et durées pour chaque traitement.
3. Obtenir DPA, sous-traitants ultérieurs, régions, sauvegardes et transferts de Render, Google, Gmail/Apps Script et de chaque IA réellement activée.
4. Vérifier si les appels Coach externes sont effectivement déclenchés, sous quelles conditions et avec quels champs financiers.
5. Achever l'inventaire localStorage, IndexedDB, cache, service worker, cookies et ressources tierces.
6. Examiner logs, erreurs, journaux d'audit, tables agent/admin et données importées pour les durées et accès.
7. Définir les procédures de demandes RGPD, suppression complète, export, violation et gestion des prestataires.
8. Faire valider bases légales, information, cookies/traceurs, transferts et nécessité éventuelle d'une AIPD par le responsable et son conseil/DPO.

**Conclusion :** cette cartographie est une base technique, pas une notice générale prête à publier. Les éléments « à vérifier » doivent être établis à partir des configurations et contrats réels, pas déduits du seul code source.
