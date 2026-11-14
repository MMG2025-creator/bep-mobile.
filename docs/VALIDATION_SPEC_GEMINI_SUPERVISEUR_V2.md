# Rapport de validation — Spécification Gemini Superviseur V2

- Date : 14 novembre 2026
- Référence code : BEP V1.4, `5cae41acdafbc602041b34fb41a77cbcee61a8dd`
- Branche : `audit/gemini-supervisor-v2-20261114`
- Documents examinés : spécification V2, audit V1.4, configuration, worker, repository, routes serveur, migration SQL et tests.
- Nature : revue statique de cohérence et de préparation à l'implémentation. Aucun test dynamique, appel Gemini, accès DB/Render ou déploiement.

## 1. Décision

**Avis : validation conditionnelle de l'architecture, refus de considérer le document comme un ticket d'implémentation prêt à coder.**

La direction générale est validée :
- BP Conseil reste le moteur métier ;
- les sources officielles sont collectées et versionnées dans un plan séparé ;
- Gemini reçoit des paquets de preuves et propose des améliorations ;
- les calculs sont contrôlés par des fonctions déterministes ;
- toute publication est humaine, traçable et réversible.

La spécification a été renforcée par un addendum obligatoire. Les exigences de cet addendum doivent être traitées comme faisant partie du périmètre V2, pas comme des options.

## 2. Contrôle de cohérence avec la V1.4

| Sujet | Résultat | Observation |
|---|---|---|
| Séparation Coach / superviseur | Conforme en intention | Le worker ne construit pas de contexte utilisateur et n'interroge pas `bep_user_data`, mais il partage actuellement le processus et le pool DB du serveur |
| Clé Gemini dédiée | Écart V1 confirmé | `config.js` accepte aussi `BEP_AI_API_KEY` |
| Tests qualité réels | Écart V1 confirmé | `runQualityReview` n'appelle pas le Coach ; il analyse six scénarios et des métriques agrégées |
| Sources externes | Écart V1 confirmé | `runKnowledgeReview` interdit la recherche externe et travaille sur les documents déjà stockés |
| Validation humaine | Conforme partiellement | Les candidates nécessitent une revue ; la V1 n'a pas de workflow complet distinct réviseur/approbateur/publicateur |
| Version et empreinte | Conforme partiellement | Bonne protection contre une source modifiée ; elle ne prouve pas la vérité du contenu proposé |
| Planification | À renforcer | `setInterval` toutes les six heures dans le processus API ; disponibilité non garantie |
| Journalisation atomique | Écart V1 confirmé | `recordRun` exécute plusieurs requêtes successives sans transaction |
| Quota reporté | À clarifier/corriger | Un job reporté au lendemain a son compteur `attempts` incrémenté lors du claim, puis aucun run n'est journalisé pour ce report |
| Limite de tentatives | Pas de défaut off-by-one confirmé | `claim` retourne la valeur d'`attempts` avant son incrément SQL ; `fail` ajoute 1 à cette valeur. Le calcul nominal respecte donc `max_attempts`. Les reports de quota et leases expirés restent à couvrir séparément |

### Correction apportée à l'audit initial

La première version de l'audit qualifiait le calcul de tentatives de défaut off-by-one. La relecture du flux complet montre que cette conclusion était erronée : le job retourné par `claim` porte l'ancienne valeur avant incrément. L'audit a été corrigé. Il ne faut pas implémenter un changement de retry sur la base de cette fausse alerte.

## 3. Réserves bloquantes avant développement

### B1 — Isolation réelle du superviseur

La V1 démarre le worker depuis `server.js` et lui transmet le même `pool` PostgreSQL que l'API. Le worker n'interroge pas aujourd'hui les tables personnelles, mais le privilège technique est plus large que nécessaire.

Exigence : service distinct, rôle DB dédié avec privilèges minimaux, réseau séparé et base/schema de test isolé. Une vérification statique des appels SQL ne suffit pas.

### B2 — Contrat de test du Coach

La spécification demande le vrai chemin du Coach, mais ne doit pas conduire à appeler l'API publique en production ni à réutiliser des sessions. Il faut extraire un service métier commun à la route et à l'adaptateur de test, puis exécuter celui-ci avec des données synthétiques sur une base isolée.

### B3 — Sources et SSRF

La collecte externe exige une sécurité réseau réelle : allowlist exacte, résolution DNS contrôlée, blocage IP privées/locales, redirections désactivées ou revalidées, limites de taille et temps, extraction isolée, protection contre prompt injection et validation des droits de conservation. Le filtrage de l'URL côté application seul n'est pas suffisant.

### B4 — Preuve et citations

Une URL ou un nom de source ne suffit pas. Chaque citation du Coach doit être reliée à un snapshot daté et à un passage précis qui soutient l'affirmation, avec juridiction et date d'effet lorsqu'elles sont pertinentes.

### B5 — Publication et responsabilité

Le document mentionne revue humaine, approbation finale et rollback, mais doit fixer les rôles, les états et les transitions. Pour les contenus légaux, fiscaux, sociaux et crédit, prévoir une séparation réviseur/approbateur ou une double validation explicite.

### B6 — Budget réel

Un quota de huit appels n'est pas un plafond financier. Il faut des limites tokens/appel, un budget estimé, une surveillance des tarifs fournisseur, des alertes et un coupe-circuit testé. Aucune activation ne doit être déduite d'un simple flag « zéro facturation ».

### B7 — Compatibilité V1/V2

Le registre et les tables V2 sont proposés sans plan de migration documentaire précis. Il faut cartographier les tables V1, importer sans perte les seeds et overlays approuvés, garder la compatibilité Coach pendant la transition et démontrer le rollback.

## 4. Points à préciser avant les tickets techniques

1. Environnement : service Render séparé ou autre hébergement ; base de test dédiée ; séparation des secrets.
2. Données de test : inventaire de scénarios, valeurs synthétiques, propriétaires et règles de conservation.
3. Contrat Coach : schéma JSON versionné et source de vérité pour calculs, documents et avertissements.
4. Source Registry : liste initiale validée, accès API/HTML, conditions d'utilisation, hiérarchie de preuve et SLA de fraîcheur.
5. Publication : rôles, niveaux d'approbation, états de workflow, rollback et journal append-only.
6. Coûts : budget mensuel maximum, limite tokens, seuils d'alerte et comportement à dépassement.
7. Scheduler : garantie d'exécution, fuseau, reprise, déduplication et surveillance.
8. Critères qualité : seuils bloquants par criticité, stabilité des évaluations LLM et comparaison avant/après.

## 5. Ordre de mise en œuvre validé

1. **Lot 0 — sécurisation V1** : clé dédiée, coût, quota, états des jobs, transactions de journalisation, tests de reprise.
2. **Fondation d'isolation** : service superviseur distinct, rôle DB limité et environnement de test synthétique.
3. **Registre des sources** : allowlist, collecte, snapshots, provenance, fraîcheur et droits.
4. **Contrat Coach et banc de test** : service métier commun, adaptateur, scénarios et assertions déterministes.
5. **Audit numérique** : fonctions de référence, unités, périodes, rapprochements et seuils.
6. **Gemini superviseur** : analyse des preuves et résultats, candidates uniquement.
7. **Workflow humain et exploitation** : double validation si nécessaire, publication versionnée, rollback, scheduler et alertes.

Ne pas commencer par connecter Gemini à des sources ou à la production. Les fondations d'isolation, de preuve et de coûts précèdent les appels LLM.

## 6. Vérifications non réalisées

- Aucun test automatisé n'a été exécuté.
- Aucun appel Gemini n'a été lancé.
- Aucune variable Render ou clé fournisseur n'a été consultée.
- Aucune base de données, donnée utilisateur, file réelle ou télémétrie de production n'a été lue.
- Aucun service n'a été activé ou déployé.

## 7. Conclusion opérationnelle

La spécification est validée comme **architecture cible sous conditions**. Elle n'est pas encore suffisamment déterminée pour commencer à coder tous les lots sans arbitrages. L'addendum ajouté à `SPEC_GEMINI_SUPERVISEUR_V2.md` fixe les garde-fous manquants.

La prochaine étape recommandée est de transformer le Lot 0 et la fondation d'isolation en tickets techniques précis, chacun avec fichiers concernés, tests, risques, critères d'acceptation et rollback. Toute modification de code ou de configuration de production devra être autorisée séparément.
