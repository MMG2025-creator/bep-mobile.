# Projet de notice — mesure d'activité BEP

**Statut : BROUILLON INTERNE — NE PAS PUBLIER AVANT VALIDATION DU RESPONSABLE DE TRAITEMENT ET DU CONSEIL JURIDIQUE.**

Version de travail préparée pour documenter le traitement ajouté par la télémétrie DAU/WAU/MAU. Ce document ne constitue pas la notice complète de confidentialité de BEP : les traitements liés au compte, à la synchronisation des données financières, aux sauvegardes, au Coach et aux éventuels fournisseurs d'IA doivent faire l'objet d'une cartographie et d'une information distinctes ou être intégrés dans une notice générale vérifiée.

## 1. Responsable du traitement

- Entité déclarée : **TEM Formation SASU**.
- Adresse déclarée : **67 rue des Bourguignons, 92270 Bois-Colombes, France**.
- Contact : **Monel Mancel**.
- Adresse de contact pour les demandes relatives aux données personnelles : **mancelmonel@gmail.com**.

À vérifier avant publication : dénomination sociale exacte telle qu'immatriculée, adresse du siège au RNE/Kbis et qualité de la personne habilitée à représenter le responsable du traitement.

## 2. Finalité du traitement

Mesurer l'utilisation authentifiée de BEP au moyen d'indicateurs agrégés d'utilisateurs actifs :
- DAU : utilisateurs distincts actifs au cours du jour UTC courant ;
- WAU : utilisateurs distincts actifs au cours du jour UTC courant et des six jours UTC précédents ;
- MAU : utilisateurs distincts actifs au cours du jour UTC courant et des vingt-neuf jours UTC précédents.

Ces indicateurs servent au suivi statistique de l'utilisation du service. Ils ne mesurent pas chaque navigation ni chaque interaction.

## 3. Données traitées et événements déclencheurs

Le traitement enregistre :
- l'identifiant interne du compte BEP (pseudonyme, mais qui demeure une donnée personnelle lorsqu'il peut être relié à un compte) ;
- le jour d'activité en UTC ;
- l'horodatage de dernière activité pour ce jour.

Une activité est enregistrée après :
- un chargement authentifié réussi de `GET /api/data` ;
- une sauvegarde authentifiée réussie de `PUT /api/data`, après validation de la transaction en base.

La télémétrie décrite ici ne stocke pas l'adresse e-mail, l'adresse IP, le user-agent, le contenu financier, le corps de la requête ni un historique détaillé des événements. Les agrégats présentés à l'administration ne contiennent pas d'identifiant individuel.

## 4. Base légale — À DÉTERMINER

La base légale de ce traitement n'est pas encore formellement arrêtée. Le responsable du traitement doit déterminer et documenter la base appropriée au regard de la finalité réelle, des attentes raisonnables des utilisateurs et de la mise en balance des intérêts, le cas échéant.

**Ne pas publier cette notice comme définitive tant que cette décision n'a pas été prise et validée.** Si l'intérêt légitime est retenu, documenter le test de mise en balance et informer les personnes de leur droit d'opposition. Ne pas présenter le consentement comme base légale par défaut sans analyse.

## 5. Destinataires et sous-traitants — À CONFIRMER

- Les personnes habilitées à administrer BEP peuvent consulter les seuls indicateurs agrégés.
- L'application et sa base de données sont hébergées sur l'infrastructure Render, selon la configuration technique du service.

À compléter après vérification contractuelle : entité Render contractante, rôle de sous-traitant, liste des autres sous-traitants éventuels, lieux d'hébergement et éventuels transferts hors Espace économique européen, garanties applicables et accord de traitement des données (DPA).

## 6. Durée de conservation — MÉCANISME TECHNIQUE AJOUTÉ, VALIDATION PRODUCTION REQUISE

La branche de travail ajoute une purge planifiée : suppression des lignes dont `last_activity_at` dépasse 35 jours, lancement au démarrage puis toutes les six heures, verrou consultatif PostgreSQL pour éviter les exécutions concurrentes entre instances et index sur l'horodatage. Des tests unitaires couvrent le seuil, le verrou et le planificateur.

Cette durée ne pourra être annoncée comme durée effective qu'après fusion, déploiement autorisé et vérification de la purge réelle en base en production. La suppression du compte entraîne par ailleurs la suppression en cascade des lignes d'activité associées.

## 7. Droits des personnes et réclamation

Sous réserve des conditions et limites prévues par la réglementation applicable, les personnes peuvent exercer leurs droits auprès du responsable du traitement à l'adresse **mancelmonel@gmail.com** : accès, rectification, effacement, limitation, opposition et, lorsque les conditions sont réunies, portabilité.

La personne concernée peut également introduire une réclamation auprès de la CNIL (www.cnil.fr).

Le responsable doit définir une procédure permettant de retrouver les données de télémétrie à partir du compte concerné et de traiter les demandes dans les délais légaux.

## 8. Décisions automatisées

Cette télémétrie n'est pas utilisée pour prendre une décision individuelle automatisée produisant des effets juridiques ou des effets significatifs similaires.

## 9. Points bloquants avant publication / production

1. Vérifier l'identité légale et l'adresse du responsable de traitement.
2. Arrêter et documenter la base légale ; faire valider l'analyse par le conseil juridique ou le DPO s'il existe.
3. Vérifier les contrats, sous-traitants, lieux d'hébergement et transferts éventuels.
4. Corriger la purge afin que la durée annoncée soit réellement garantie.
5. Cartographier les autres traitements BEP (compte, données financières, synchronisation, sauvegardes, Coach, IA externe éventuelle) et rédiger une notice générale cohérente.
6. Faire relire et approuver la notice finale par le responsable de traitement avant publication et déploiement.

---
Document de travail interne. Il ne doit pas être exposé aux utilisateurs dans cet état.
