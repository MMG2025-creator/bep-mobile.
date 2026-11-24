# BEP — Spécification de refonte de l'administration

**Statut :** spécification validée pour réalisation sur branche isolée  
**Branche :** `feature/admin-console-redesign`  
**Référence de départ :** `main`  
**Contrainte absolue :** ne pas modifier, fusionner ou déployer la PR #373.

## 1. Objectifs

Refondre l'administration en une console métier lisible, cohérente et responsive, sans réécrire les traitements existants. Le style retenu est un SaaS moderne : fond clair, surfaces blanches, bleu nuit pour la navigation, bleu pour les actions principales, typographie et espacements homogènes.

La gestion documentaire est la priorité fonctionnelle. Les fonctionnalités existantes doivent être regroupées par mission, les actions redondantes masquées ou supprimées après inventaire, et les opérations sensibles clairement distinguées.

## 2. Navigation cible

1. **Vue d'ensemble** — indicateurs, tâches à traiter, activité récente et état des services.
2. **Documents** — liste, recherche, filtres, import, édition, classement, sources et versions.
3. **Bibliothèque BEP** — fiches publiées, catégories, statut, fraîcheur et historique.
4. **Intelligence documentaire** — recherche de sources (Exa), analyse et propositions Groq, workflows Render, résultats et exécutions.
5. **Validation & qualité** — file de propositions, dossier de preuves, contrôles qualité, cohérence contextuelle, décision humaine et historique.
6. **Utilisateurs & activité** — indicateurs agrégés et annuaire administrateur à accès restreint.
7. **Système & sécurité** — état API/base de données/workflows, journaux techniques, audit, rôles et configuration.

Les outils techniques ne doivent plus être mélangés aux actions métier. Les diagnostics fournisseurs et les journaux détaillés sont rangés dans « Système & sécurité ». Les opérations courantes doivent être accessibles en deux clics maximum depuis le menu principal.

## 3. Espace Documents — priorité P0

### Liste
- Recherche plein texte sur titre et métadonnées non sensibles.
- Filtres : catégorie, sous-catégorie, statut (brouillon / à vérifier / publié / archivé), source, date de vérification et fraîcheur.
- Colonnes : titre, catégorie, statut, source principale, dernière vérification, version, dernière modification.
- Actions contextuelles limitées : ouvrir, modifier, consulter l'historique, archiver.
- Import et création comme actions principales ; suppression uniquement dans une action secondaire confirmée, si la politique métier l'autorise.

### Fiche documentaire
- Contenu et aperçu Coach.
- Catégorie et taxonomie.
- Sources, URL de provenance et éléments probants.
- Date de vérification, date d'effet si pertinente, indicateur de fraîcheur.
- Version, auteur de modification et historique.
- Statut de validation/publication.
- Liens vers les propositions et contrôles qualité associés.

La page distingue strictement un document publié d'un candidat généré par l'IA. Aucun candidat n'est intégré à la bibliothèque active sans décision humaine explicite.

## 4. Intelligence documentaire et validation

Le centre documentaire expose le parcours métier, pas la plomberie technique :
1. Rechercher les sources avec Exa.
2. Exécuter une analyse documentaire avec Groq via le workflow Render.
3. Contrôler le contexte, les doublons, les contradictions, la fraîcheur, la pertinence et la qualité rédactionnelle.
4. Examiner les preuves et la correspondance entre chaque affirmation et ses sources.
5. Soumettre une proposition à une validation humaine.
6. Publier uniquement après approbation.

Groq reste exclusivement un moteur interne de recherche/analyse/optimisation documentaire. Il ne répond pas directement aux utilisateurs du Coach. Le Coach continue de s'appuyer sur la bibliothèque validée. Les erreurs fournisseurs doivent conserver le code, le message explicatif et le paramètre éventuellement rejeté.

## 5. Tableau de bord

### Cartes de synthèse
- Documents publiés.
- Documents à vérifier.
- Propositions en attente.
- Workflows en cours / échoués.
- Utilisateurs inscrits.
- Utilisateurs actifs sur 24 h et 30 jours.
- Sessions en ligne (si présence fiable instrumentée).

Chaque métrique affiche sa période, sa source, son horodatage de synchronisation et un état de fraîcheur. En cas d'échec API, afficher « Indisponible » ou la dernière valeur avec son horodatage, jamais zéro par défaut.

## 6. Espace Utilisateurs & activité

### Vue agrégée
- Total des comptes inscrits.
- Comptes vérifiés.
- Nouveaux comptes sur 24 h / 7 jours / 30 jours.
- Utilisateurs actifs sur 24 h / 7 jours / 30 jours, calculés à partir d'un signal d'activité explicite.
- Sessions en ligne, uniquement avec un mécanisme de présence fiable et une fenêtre définie.
- Taux de complétude des profils (présence/absence de champs, sans exposer leur contenu).

### Annuaire — accès SUPER_ADMIN uniquement
Champs autorisés à afficher, sous réserve de leur présence effective dans la base :
- identifiant interne pseudonymisé dans les vues courantes ;
- nom et prénom ;
- adresse e-mail ;
- date d'inscription ;
- dernière activité connue ;
- statut de vérification de l'adresse ;
- méthode d'authentification si connue (Google / e-mail) ;
- rôle et état du compte ;
- nombre de sessions actives si calcul fiable.

La consultation de l'identité et de l'e-mail est une action sensible : accès réservé au rôle SUPER_ADMIN, pagination, recherche exacte ou filtrage limité, journalisation de l'accès, réponses `Cache-Control: no-store`. Pas d'export en masse de l'annuaire. Les autres administrateurs ne voient que des données agrégées et pseudonymisées.

### Temps réel et synchronisation
Le schéma actuel permet de compter les comptes et de lire certaines métadonnées, mais il ne fournit pas à lui seul une présence « en ligne maintenant » fiable ni un historique complet de connexions. La table de sessions à durée longue ne doit pas être utilisée comme preuve qu'une personne est devant l'application.

Pour un indicateur temps réel fiable, ajouter une présence explicite côté serveur : activité authentifiée récente avec horodatage, fenêtre d'activité documentée (proposition initiale : 5 minutes), déduplication par utilisateur et rafraîchissement du tableau de bord toutes les 30 secondes. Le signal doit être mis à jour côté serveur sur activité authentifiée, avec limitation des écritures (par exemple une mise à jour au plus toutes les 2 minutes par utilisateur). L'interface affiche « dernière synchronisation » et dégrade proprement en cas d'indisponibilité.

Avant mise en production, documenter ce traitement dans la politique de confidentialité et vérifier la durée de conservation et la base légale applicables. Ne pas collecter d'empreinte appareil, géolocalisation précise ou historique détaillé de navigation pour fabriquer cette métrique.

## 7. Exclusion financière explicite

Aucune donnée financière ne doit être accessible depuis le tableau de bord ou l'annuaire :
- revenus, dépenses, soldes, budgets, montants, transactions et catégories de dépenses ;
- libellés libres, commerçants, reçus, justificatifs et pièces jointes ;
- données bancaires, IBAN, BIC ou identifiants de comptes ;
- payload JSON de `bep_user_data`, données de budgets ou journaux financiers ;
- clés IA personnelles, secrets, jetons et identifiants OAuth.

Les requêtes du nouvel espace utilisateurs doivent sélectionner uniquement les colonnes d'identité et d'activité explicitement autorisées. Ne jamais charger puis masquer côté navigateur un payload financier.

## 8. Sécurité et rôles

- Conserver l'authentification administrateur indépendante existante, la régénération de session, le rechargement de session avant action sensible, la liste d'autorisation, le rate limiting et les protections HTTP existantes.
- Vérifier les rôles côté serveur pour chaque route ; masquer un bouton dans l'interface ne constitue pas une autorisation.
- Annuaire nominatif et e-mail : SUPER_ADMIN uniquement.
- Actions de validation documentaire : administrateurs habilités, confirmation explicite, audit.
- Pas d'accès direct navigateur à PostgreSQL.
- Requêtes SQL paramétrées, pagination plafonnée, validation des filtres.
- `Cache-Control: no-store` pour toutes les réponses d'administration contenant des données utilisateurs.
- Journaliser les consultations nominatives, exports refusés et décisions d'administration sans recopier les données personnelles dans les logs.
- Ne jamais exposer de secrets, hashes de mots de passe, jetons, clés ou payloads personnels.

## 9. Architecture de réalisation

- Conserver les routes et identifiants DOM existants tant qu'un inventaire n'a pas confirmé qu'ils peuvent être retirés.
- Construire une nouvelle coque de navigation et un système de pages/panneaux autour des fonctionnalités existantes.
- Extraire progressivement les styles inline et le JavaScript d'administration vers des fichiers dédiés, sans modifier les traitements métier.
- Ajouter des endpoints de lecture spécialisés, chacun avec une réponse minimale et un rôle serveur explicite.
- Ajouter la présence utilisateur uniquement dans une migration additive séparée, après validation privacy/sécurité.
- Ne pas modifier les tables ou traitements documentaires couverts par la PR #373.

## 10. Plan de livraison

### Lot 1 — UX et structure
- Nouvelle coque, navigation latérale, en-tête, états vides, responsive.
- Regroupement des panneaux existants et suppression des doublons vérifiés.
- Documents en premier niveau.

### Lot 2 — Documents
- Liste, filtres, recherche, fiche, historique et actions.
- Aucun changement du workflow de publication.

### Lot 3 — Centre documentaire
- Vue unifiée Exa / Groq / Render.
- File de propositions et validation humaine.
- Diagnostics techniques déplacés dans la supervision.

### Lot 4 — Utilisateurs
- Agrégats inscrits/vérifiés/nouveaux.
- Présence et activité fiable avec horodatage.
- Annuaire nominatif SUPER_ADMIN avec audit, sans données financières.

### Lot 5 — Vérification
- Tests unitaires des permissions et agrégats.
- Tests d'intégration PostgreSQL.
- Tests d'accès par rôle (SUPER_ADMIN / CONTENT_ADMIN / non-admin).
- Tests de non-exposition des colonnes financières et secrets.
- Tests responsive, clavier, lecteurs d'écran et états API dégradés.
- Tests de non-régression des workflows documentaires.

## 11. Critères d'acceptation

- Un administrateur identifie immédiatement où créer, retrouver, modifier et classer un document.
- Les actions métier sont séparées des diagnostics techniques.
- Une proposition IA ne peut pas être publiée sans validation humaine.
- Le Coach ne dépend pas de Groq pour ses réponses utilisateur.
- Les indicateurs affichent leur définition, période et fraîcheur.
- Le nombre d'utilisateurs ne compte pas les sessions comme des personnes.
- Le statut « en ligne » repose sur une présence récente documentée, pas sur une session valable plusieurs jours.
- Les données nominatives sont réservées au SUPER_ADMIN et chaque consultation est auditée.
- Aucun champ, endpoint ou export de cette refonte ne renvoie de données financières, secrets ou payloads privés.
- La PR #373 reste ouverte et inchangée ; aucune fusion ni aucun déploiement n'est effectué dans ce lot.

## 12. État initial observé

L'administration actuelle est une page HTML monolithique avec navigation horizontale, panneaux documentaires et techniques, et une zone de comptes explicitement pseudonymisée en lecture seule. Le backend dispose déjà d'une authentification administrateur indépendante et de rôles `SUPER_ADMIN` / `CONTENT_ADMIN`. L'export administratif actuel est paginé et pseudonymisé ; il n'est pas une source de données nominatives pour le nouvel annuaire.

Le nouvel espace utilisateurs nécessite donc des routes dédiées et un signal d'activité fiable : il ne faut pas réinterpréter les snapshots pseudonymisés ou la durée de validité d'une session comme un décompte d'utilisateurs en temps réel.
