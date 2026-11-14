# Spécification technique — Gemini Superviseur V2

- Base : BEP V1.4, commit `5cae41acdafbc602041b34fb41a77cbcee61a8dd`
- Branche de travail : `audit/gemini-supervisor-v2-20261114`
- Statut : spécification proposée, non implémentée.
- Principe de sûreté : aucune activation automatique, aucune écriture métier par Gemini, validation humaine obligatoire.

## 1. Objectif produit

Faire évoluer l'agent actuel vers un superviseur qui :
1. recherche et actualise des informations financières depuis des sources officielles autorisées ;
2. contrôle la fraîcheur, la provenance et la cohérence des connaissances utilisées par BP Conseil ;
3. teste les réponses réellement produites par BP Conseil dans un environnement isolé ;
4. vérifie les calculs et chiffres avec des fonctions déterministes et des références fiables ;
5. propose des corrections traçables, testées et réversibles.

Le superviseur n'est pas un second Coach utilisateur. BP Conseil reste seul responsable de l'interaction métier.

## 2. Principes non négociables

- Aucun accès direct de Gemini à `bep_user_data`, aux sessions, aux identifiants, aux opérations ou aux montants personnels.
- Aucune écriture directe par Gemini dans les tables métier, les règles de calcul, les prompts de production, les variables Render ou la base active.
- Toute connaissance publiée passe par une validation humaine, des contrôles automatiques et une version immuable.
- Les données d'essai sont synthétiques ; aucun compte réel ni conversation personnelle n'est utilisé dans les tests.
- Les sources sont limitées à une allowlist explicite et aux domaines/API autorisés.
- Pas de scraping généraliste, pas de contournement de paywall, de robots ou de restrictions d'accès.
- Les citations affichées au Coach doivent pointer vers une source archivée, datée et consultable.
- En cas d'incertitude, de source absente ou de données périmées : le système signale la limite et s'abstient de produire une affirmation présentée comme actuelle.
- Clé Gemini dédiée au superviseur ; aucun fallback sur la clé du Coach.
- Budget, plafond de consommation, quotas, timeout et coupe-circuit configurés explicitement. Un flag de configuration ne doit jamais être présenté comme garantie de gratuité.

## 3. Architecture logique

### A. BP Conseil — plan métier
- Conserve l'interface, l'authentification et les données personnelles.
- Conserve les calculs financiers déterministes.
- Expose une interface de test interne, distincte de l'API utilisateur.
- Expose un contrat de réponse structuré pour faciliter l'évaluation : réponse, faits utilisés, calculs, documents référencés, avertissements et version moteur.
- N'expose au superviseur que des données synthétiques ou des résultats anonymisés et minimisés.

### B. Source Registry — plan documentaire
Composants :
- `source_registry` : sources autorisées, propriétaire, domaine, type, cadence, criticité, méthode d'accès, statut.
- `source_snapshots` : contenu brut ou extrait autorisé, URL canonique, date d'accès, date de publication, date d'effet, empreinte, statut HTTP, métadonnées.
- `knowledge_versions` : document normalisé, catégorie, période de validité, références de snapshots, version, empreinte, état.
- `source_change_events` : changement détecté, niveau de criticité, ancien/nouveau digest, décision.

Chaque source doit définir :
- autorité et domaine officiel ;
- sujets couverts ;
- fréquence attendue ;
- date de dernière collecte réussie ;
- fraîcheur maximale ;
- stratégie de reprise ;
- conditions d'archivage et de conservation.

### C. Gemini Supervisor — plan de contrôle
Modules :
1. `source_research` : résume uniquement les snapshots récupérés par les connecteurs autorisés.
2. `knowledge_audit` : détecte obsolescence, contradiction, manque de couverture et formulation ambiguë.
3. `coach_eval` : analyse les réponses réelles du banc de tests synthétiques.
4. `numeric_audit` : interprète les écarts remontés par les validateurs déterministes.
5. `candidate_manager` : crée des propositions versionnées, sans publication.
6. `reporting` : fournit rapports, alertes, métriques et preuves.

Gemini n'est pas autorisé à appeler directement SQL, à naviguer librement sur Internet ou à écrire dans les tables actives. Il reçoit des paquets de preuves préparés par le backend.

## 4. Registre des sources officielles

### Sources prioritaires à intégrer

| Domaine | Sources candidates | Périmètre |
|---|---|---|
| Banque et épargne | Banque de France, Mes questions d'argent | Budget, épargne, crédit, surendettement |
| Marchés et placements | AMF | Risques, produits, frais, alertes |
| Droit et démarches | Service-Public.fr, Légifrance | Droits, procédures, règles légales |
| Fiscalité | impots.gouv.fr, BOFiP | Impôts, prélèvements, échéances |
| Emploi et cotisations | URSSAF, France Travail | Cotisations, revenus professionnels, aides |
| Prestations | CAF | Prestations et conditions |
| Statistiques | INSEE | Inflation, revenus, indices et statistiques |
| Supervision financière | ACPR, Banque de France | Réglementation et alertes |
| Zone euro | BCE | Taux directeurs et statistiques monétaires |

L'intégration d'une source n'est autorisée qu'après validation de l'URL, du mode d'accès, des conditions d'utilisation et de la fréquence de mise à jour. Les APIs officielles sont préférées aux pages HTML lorsque disponibles.

### Métadonnées obligatoires

`source_id`, `canonical_url`, `publisher`, `topic`, `access_method`, `published_at`, `effective_from`, `effective_to`, `retrieved_at`, `content_digest`, `snapshot_id`, `freshness_sla`, `http_status`, `license_or_terms_ref`, `review_status`.

Une page sans date de publication peut être conservée avec `published_at=null`, mais ne doit pas être présentée comme récemment mise à jour.

## 5. Fréquences de collecte et supervision

| Type de contenu | Cadence cible | Déclencheur complémentaire |
|---|---|---|
| Taux, barèmes et paramètres volatils | Quotidienne ou selon publication | Événement de publication officielle |
| Fiscalité, prestations, droit | Quotidienne pour détecter les changements ; revue humaine à chaque changement critique | Nouvelle version ou date d'effet |
| Guides pédagogiques | Hebdomadaire | Changement détecté |
| Alertes AMF/ACPR et fraude | Quotidienne | Publication d'alerte |
| Qualité des réponses Coach | À chaque changement moteur/prompt/base + hebdomadaire | Déploiement candidat |
| Contrôle de calculs | À chaque modification du moteur et à chaque release | Échantillon quotidien de tests |
| Santé de la file et des sources | Toutes les 5 à 15 minutes | Seuil de retard ou échec |

La cadence doit être portée par un ordonnanceur durable et observable, pas uniquement par un `setInterval` dans un service susceptible d'être suspendu. Les exécutions manquées doivent être rattrapées, dédupliquées et visibles.

## 6. Banc de tests réel du Coach

### Environnement

Créer un mode `coach_eval` isolé :
- même version de moteur que celle candidate à la production ;
- mêmes règles déterministes et même base documentaire candidate ;
- données synthétiques versionnées ;
- fournisseur LLM simulable ou configuré sur environnement de test ;
- aucun identifiant ou compte réel ;
- aucune écriture dans les tables de production.

### Pipeline

1. Charger un scénario versionné.
2. Appeler le vrai point d'entrée du Coach via un adaptateur de test interne.
3. Capturer la réponse, les sources, les calculs et la version du moteur.
4. Exécuter les assertions déterministes.
5. Exécuter les contrôles de sécurité et de conformité.
6. Demander à Gemini une analyse des écarts, avec le scénario et les preuves uniquement.
7. Stocker un résultat reproductible et un rapport.
8. Bloquer la promotion si une assertion critique échoue.

### Couverture minimale

- Budget prévu vs réalisé et comparaison de périodes comparables.
- Données manquantes : abstention, question de clarification, aucun montant inventé.
- Revenus variables : hypothèse prudente, aucune extrapolation non justifiée.
- Dépenses annuelles : provision vs paiement réel.
- Épargne : objectif, versement, retrait et transfert interne sans double comptage.
- Dette : taux, coût total, pénalités et trésorerie minimale.
- Achat impulsif : réponse non culpabilisante, budget et pause.
- Fraude : aucun partage de code, contact banque par canal officiel.
- Fiscalité et prestations : date d'effet et source obligatoire.
- Contradiction documentaire : signalement, pas de choix arbitraire.
- Prompt injection dans une source : contenu traité comme donnée non fiable.
- Donnée obsolète : avertissement et abstention.
- Réponse sans preuve : aucune citation inventée.

Chaque scénario doit contenir question, données d'entrée synthétiques, réponse attendue ou assertions, éléments interdits, niveau de criticité, version et propriétaire.

## 7. Vérification des chiffres

La validation doit être indépendante du LLM.

### Contrôles déterministes
- Recalcul des totaux, soldes, écarts, ratios et projections.
- Vérification des unités, devises, périodes et arrondis.
- Réconciliation des mouvements : versement, retrait, transfert, annulation et doublon.
- Vérification des invariants métier et des périodes clôturées.
- Comparaison des résultats avec des fixtures de référence versionnées.

### Contrôles sur données publiques
- Chaque valeur externe doit avoir source, unité, date de référence, date de collecte et date d'effet.
- Une valeur expirée est marquée périmée et ne peut pas alimenter une recommandation présentée comme actuelle.
- Les différences entre API et pages officielles sont signalées, pas arbitrées automatiquement.
- Gemini peut expliquer une divergence, mais le statut final vient du validateur et de la revue humaine.

## 8. Modèle de données cible

Tables indicatives, à concevoir après revue du schéma existant :

- `bep_source_registry`
- `bep_source_snapshots`
- `bep_source_change_events`
- `bep_knowledge_versions`
- `bep_supervisor_jobs`
- `bep_supervisor_runs`
- `bep_coach_eval_scenarios`
- `bep_coach_eval_runs`
- `bep_numeric_validation_results`
- `bep_supervisor_candidates`
- `bep_supervisor_approvals`

Les nouvelles tables doivent être additives. Pas de migration destructive ni de modification des tables financières métier pour cette fonctionnalité.

Chaque job et chaque résultat doivent être idempotents, traçables, horodatés et versionnés. Les écritures liées à un résultat doivent être transactionnelles.

## 9. Sécurité, confidentialité et gouvernance

- Allowlist stricte de domaines et d'endpoints.
- Blocage des redirections, IP privées, URL fournies par le modèle et risques SSRF.
- Limites de taille, type MIME, temps de réponse et profondeur d'extraction.
- Protection contre prompt injection : documents externes toujours non fiables.
- Secrets dans variables dédiées, jamais dans logs ni sorties d'administration.
- Clé dédiée superviseur et quotas distincts du Coach.
- Autorisations admin séparées pour consulter, approuver, rejeter et publier.
- Journal d'audit append-only : acteur, date, candidate, digest source, décision, version publiée.
- Conservation minimale des snapshots et purge définie.
- Aucune donnée financière personnelle dans les prompts de supervision.
- Bouton de coupure et désactivation fail-closed.

## 10. Cycle de publication et rollback

1. Collecte et archivage d'un snapshot.
2. Analyse de changement et proposition Gemini.
3. Validation de la source et du niveau de preuve.
4. Revue humaine.
5. Mise à jour de la connaissance candidate.
6. Exécution du banc de tests complet.
7. Comparaison avec la version active.
8. Approbation finale.
9. Publication atomique d'une version.
10. Surveillance post-publication et rollback immédiat si régression.

Aucune proposition ne doit devenir active simplement parce que Gemini la qualifie de confiance élevée.

## 11. Indicateurs de pilotage

### Sources
- couverture des sources prioritaires ;
- taux de collecte réussie ;
- âge médian et maximum des snapshots ;
- sources périmées ;
- changements critiques non revus ;
- taux de provenance vérifiable.

### Coach
- taux de réussite des assertions ;
- erreurs numériques ;
- affirmations non sourcées ;
- abstentions correctes sur données manquantes ;
- citations valides ;
- régressions par version ;
- incidents de sécurité et de confidentialité.

### Agent
- jobs en retard, échecs et reprises ;
- coût et tokens par type de tâche ;
- quota consommé et plafond restant ;
- durée d'exécution ;
- candidates acceptées/rejetées ;
- taux de régression après publication.

La latence et les codes HTTP restent des métriques opérationnelles, jamais des preuves de qualité métier.

## 12. Plan de réalisation proposé

### Lot 0 — Fiabilisation V1
- supprimer le fallback vers la clé Coach ;
- clarifier budget, quota et garde-fous de coût ;
- corriger les tentatives et le report de quota ;
- rendre les métriques transactionnelles ;
- ajouter tests unitaires de concurrence, retry, reprise et coupure ;
- clarifier les états job/run et la timezone de quota.

### Lot 1 — Sources officielles
- registre et allowlist ;
- connecteur de collecte en lecture seule ;
- snapshots et empreintes ;
- fraîcheur et alertes ;
- première sélection de sources officielles prioritaires.

### Lot 2 — Tests réels BP Conseil
- adaptateur de test isolé ;
- scénarios synthétiques versionnés ;
- assertions déterministes ;
- rapport de régression ;
- aucune donnée réelle.

### Lot 3 — Audit chiffré
- bibliothèque de fonctions de référence ;
- jeux de données fixtures ;
- comparaisons de chiffres publics datés ;
- seuils bloquants et abstention.

### Lot 4 — Supervision Gemini
- analyse des snapshots et réponses du banc de test ;
- propositions structurées avec références aux preuves ;
- revue humaine et publication versionnée ;
- reporting et alertes.

### Lot 5 — Exploitation
- ordonnanceur durable ;
- monitoring, alertes, reprise et runbooks ;
- tests de charge et de panne ;
- revue de sécurité indépendante.

## 13. Critères d'acceptation avant activation

- Aucun chemin d'accès à `bep_user_data` depuis le worker superviseur.
- Aucun fallback de clé vers le Coach.
- Budget et plafond fournisseur vérifiables, coupure testée.
- Sources allowlistées, snapshots datés et empreintes vérifiées.
- Scénarios exécutés contre le vrai Coach de test.
- Assertions déterministes et tests de non-régression verts.
- Toutes les candidates restent en attente jusqu'à approbation humaine.
- Publication atomique, journal d'audit et rollback validés.
- Scheduler avec reprise après interruption démontrée.
- Aucun test ou appel sur la production avant autorisation explicite.

## 14. Décisions à prendre avant implémentation

1. Hébergement du collecteur et ordonnanceur : service permanent dédié ou planificateur externe.
2. Budget mensuel maximal du superviseur et limites par tâche.
3. Liste initiale des sources et ordre de priorité.
4. Politique de conservation des snapshots.
5. Niveau d'approbation requis pour les changements légaux/fiscaux.
6. Environnement de test Coach et stratégie fournisseur LLM.
7. Qui peut approuver une connaissance et qui peut publier une version.

## 15. Statut

Cette spécification ne modifie aucun code d'exécution, aucune migration, aucune variable d'environnement, aucune base de données ni aucun service Render. Elle constitue le cahier des charges de la V2 et la base d'une revue technique avant toute implémentation.
