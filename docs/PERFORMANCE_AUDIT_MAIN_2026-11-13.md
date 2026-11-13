# BEP — Audit de performance du code main
Date : 2026-11-13
Branche de référence : `main`
Branche isolée : `perf/bep-startup-optimization-2026-11-13`

## Périmètre et sécurité
- Audit statique en lecture seule du dépôt GitHub.
- Aucun fichier applicatif de `main` modifié.
- Aucune modification, variable d'environnement ou commande de déploiement sur Render.
- La production Render `bep-mobile` publie le répertoire `dist/`. L'API de production reste `bep-v2-api`.
- Les services de staging observés sont suspendus. Ne pas les réactiver sans autorisation explicite.
- Cette branche est créée depuis `main` pour isoler le travail. Elle n'est pas configurée comme branche de déploiement de la production.

## Synthèse
Les principaux leviers identifiés sont le poids du shell initial, l'exécution JavaScript au démarrage, les appels d'authentification séquentiels et la politique de cache des ressources statiques.

## Constats vérifiés

### 1. Ressources initiales volumineuses
Tailles GitHub des sources (octets, non compressés) :
- `index.html` : 69 863
- `styles.css` : 103 735
- `app.js` : 142 183
- `spend-experience.css` : 41 016
- `spend-experience.js` : 27 850
- `monthly-budget-ui.js` : 27 656
- `receipt-ocr.js` : 7 064

Le HTML publié dans `dist/index.html` fait 74 240 octets. Les fichiers publiés ne sont pas strictement identiques aux sources racine : `dist/styles.css` fait 111 346 octets contre 103 735 à la racine ; `dist/ui-polish.css` fait 21 730 octets contre 10 219 à la racine. Les références de version CSS divergent également entre les deux index.

**Conséquence :** toute optimisation doit identifier la source de vérité et synchroniser explicitement la sortie `dist/`. Modifier uniquement un fichier racine pourrait ne rien changer à l'interface publiée.

### 2. CSS bloquant le premier rendu
L'index publié référence plusieurs feuilles de style dans le `<head>`, dont `styles.css`, `ui-polish.css`, `spend-experience.css`, `spend-clean-ui.css` et `auth-page.css`.

**Piste :** mesurer le CSS critique réellement nécessaire à l'écran initial, puis différer les styles propres aux rubriques qui ne sont pas visibles au démarrage. Ne pas déplacer de CSS avant d'avoir vérifié les dépendances et les flashs de mise en page.

### 3. JavaScript chargé au démarrage
L'index publié charge immédiatement plusieurs scripts classiques, notamment `app.js`, `receipt-ocr.js`, `monthly-budget-ui.js`, `spend-experience.js` et `spend-clean-ui.js`.

`app.js` contient notamment les fonctions d'import PDF et d'OCR image. Les bibliothèques externes PDF.js et Tesseract sont déjà chargées à la demande par des fonctions dédiées ; il faut préserver ce comportement.

**Piste :** séparer progressivement les fonctions réellement différables en modules chargés à la demande, sans casser l'ordre des dépendances globales, les événements BEP, l'offline-first ou les formulaires.

### 4. Authentification initiale avec appels réseau en chaîne
Au démarrage, le code de `app.js` effectue successivement :
1. `GET /api/auth/status`
2. si connecté, `GET /api/me`
3. puis `GET /api/data`

La récupération du profil ne semble utilisée ici que pour renseigner le prénom du coach. Cette chaîne augmente le temps d'attente perçu lorsque la session est active.

**Piste :** supprimer les appels redondants ou paralléliser uniquement les lectures indépendantes, après vérification des dépendances de session et du rendu. Ne pas modifier le contrat d'authentification sans tests dédiés.

### 5. Politique de cache statique trop restrictive
Le fichier `_headers` applique globalement :
`Cache-Control: no-cache, no-store, must-revalidate`.
Quelques exceptions existent pour `app.js`, `styles.css`, `pwa.js` et `auth-recovery.js`, mais les autres ressources restent soumises à la règle générale.

**Piste :** avec des URL versionnées par contenu, définir une politique de cache longue pour les assets immuables et conserver une revalidation stricte pour `index.html` et `sw.js`. Vérifier auparavant le mécanisme de versionnement et le service worker ; le code actuel indique que l'enregistrement du service worker est désactivé dans `app.js`.

### 6. Rendu initial potentiellement coûteux
La fonction `render()` reconstruit plusieurs listes et panneaux, dont les achats (jusqu'à 3 000 éléments), les revenus, les charges, les objectifs et les graphiques. Elle est appelée au démarrage.

**Piste :** mesurer le coût réel sur des jeux de données de taille représentative. Ensuite, éviter de recalculer ou reconstruire les rubriques non visibles et préférer des mises à jour ciblées. Ne pas réduire arbitrairement la limite fonctionnelle des achats.

## Ordre recommandé des travaux
1. Établir un vrai profil navigateur (mobile + desktop) : LCP, INP, CLS, TBT, poids transféré, nombre de requêtes, temps d'exécution JS et waterfall réseau.
2. Clarifier la chaîne de publication racine → `dist/` et ajouter un contrôle de cohérence des fichiers publiés.
3. Optimiser la séquence d'authentification et le rendu initial, avec tests de non-régression.
4. Différer les modules et CSS de rubriques, un par un.
5. Corriger la politique de cache après vérification du versionnement des assets.
6. Rejouer les tests fonctionnels et comparer les mesures avant/après.

## Critères d'acceptation
- Aucun changement de production ni déploiement depuis cette branche.
- Pas de régression connexion/inscription, session, mode hors ligne, budget, épargne, dépenses, OCR/PDF ou coach.
- Les ressources différées se chargent correctement à la première ouverture de leur rubrique.
- Le temps de démarrage et le LCP s'améliorent sur un profil réseau mobile reproductible.
- Les données et les contrats API restent inchangés sauf décision séparée documentée.

## Limites de cet audit
Il s'agit d'un audit statique du code et des métadonnées GitHub. Les tailles indiquées sont les tailles des fichiers dans Git, pas les tailles compressées réellement transférées. Les mesures de navigateur, les tests de parcours authentifiés et le profilage CPU du navigateur restent à effectuer dans un environnement de développement actif.


## Phase 1 — premier chargement différé (branche de développement uniquement)

Date : 2026-11-13

### Changement réalisé
- Retrait du chargement initial de `receipt-ocr.js` dans `index.html` et `dist/index.html`.
- Ajout d'un chargeur à la demande dans `app.js` et `dist/app.js` : le fichier est téléchargé uniquement au premier import d'une photo de justificatif.
- La promesse de chargement est partagée pour éviter plusieurs téléchargements simultanés ; en cas d'échec, elle est réinitialisée pour permettre une nouvelle tentative.
- Le chargement de Tesseract reste lui aussi déclenché uniquement pendant l'import OCR. Le traitement PDF existant n'a pas été modifié.
- Incrément de version de l'URL de `app.js` à `v=97` dans les deux index pour éviter de réutiliser l'ancien script en cache.
- Les modifications sont limitées aux fichiers racine et `dist/` de cette branche.

### Vérifications effectuées
- Vérification syntaxique JavaScript par compilation V8 de `app.js`, `dist/app.js` et `receipt-ocr.js` : OK.
- Vérification des deux index : aucune balise script ne charge directement `receipt-ocr.js` au démarrage.
- Vérification des deux versions de `app.js` : le chargement différé est appelé dans le parcours d'import photo.
- Comparaison GitHub `main...perf/bep-startup-optimization-2026-11-13` : branche en avance de 5 commits, sans retard ; les seuls fichiers applicatifs modifiés sont les deux index et les deux fichiers `app.js`.
- Aucun changement sur `main`, aucun merge ou pull request, aucun déploiement Render, aucune action sur la base de données.

### Résultat attendu et limites
Le fichier local `receipt-ocr.js` (7 041 octets dans Git avant modification) n'est plus demandé lors de l'ouverture initiale. Il sera demandé lors du premier import de photo de justificatif. Le gain réel sur le temps de démarrage doit encore être mesuré dans le navigateur ; il ne faut pas assimiler la taille Git à la taille transférée compressée.

Les tests dynamiques de connexion, import photo, OCR, PDF et parcours complet restent à effectuer. Le staging étant suspendu, aucune validation navigateur ou API n'a été prétendue. Réactivation du staging à demander avant ces tests.

### État
- Code isolé sur la branche de développement : réalisé.
- Contrôle syntaxique et statique : réalisé.
- Tests fonctionnels navigateur/staging : en attente.
- Production : inchangée.


## Phase 2 — chargement différé du module Budgets mensuels

Date : 2026-11-13

### Changement réalisé
- Le fichier `monthly-budget-ui.js` n'est plus demandé pendant le chargement initial.
- Il est chargé lors de la première ouverture de l'onglet « Mes budgets mensuels ».
- Le module expose un point d'initialisation explicite pour démarrer le chargement des données si l'utilisateur est déjà connecté au moment de son chargement.
- Les écouteurs `bep:auth-ready`, `bep:state-rendered`, `bep:offline-synced` et la logique métier/API du module restent en place.
- La promesse de chargement est mutualisée ; en cas d'échec réseau, elle est réinitialisée pour permettre une nouvelle tentative.
- Le changement est répliqué dans les deux index (racine et `dist/`) et l'URL du module est versionnée.
 
### Analyse des autres modules
- `spend-experience.js` n'est pas différé : il installe les dialogues partagés utilisés aussi par les parcours Revenus, Charges, Épargne et Profil, et définit notamment `BEP_OPEN_ENTRY_DIALOG` et `BEP_CONFIRM_ACTION`. Le charger uniquement à l'ouverture de Dépenses casserait des parcours hors Dépenses.
- `spend-clean-ui.js` est désormais chargé à la demande lors de la première ouverture de Dépenses. Un observateur de classe active couvre aussi le cas où Dépenses est restauré comme onglet initial. Le module reste dépendant de `spend-experience.js`, conservé en chargement initial ; le chargeur mutualise les demandes et permet une nouvelle tentative après échec.
- Le Coach et les calculs principaux d'Épargne sont intégrés à `app.js`, qui contient aussi l'authentification, le rendu et les formulaires de base. Les extraire en bloc serait risqué sans refactorisation des dépendances et tests de non-régression. Aucune extraction hasardeuse n'a été faite.

### Vérifications statiques effectuées / limites
- Compilation syntaxique V8 des fichiers `monthly-budget-ui.js`, `dist/monthly-budget-ui.js`, `spend-clean-ui.js`, `dist/spend-clean-ui.js`, `app.js`, `dist/app.js` et `receipt-ocr.js` : OK.
- Compilation syntaxique V8 des scripts inline des deux index : OK.
- Les deux fichiers du module sont identiques et exposent `BEP_MONTHLY_UI_READY`.
- Les deux index contiennent le déclencheur de chargement différé et ne contiennent plus de balise script qui charge directement `monthly-budget-ui.js`.
- Les scripts de base (`runtime-config.js`, `financial-engine.js`, `offline-storage.js`, `auth-page.js`, `app.js`, `pwa.js`, `spend-experience.js`) restent chargés dans leur ordre actuel.
- Les tests navigateur, authentification, changement d'onglet, création/modification/clôture de mois et mode hors ligne restent nécessaires dans le staging actif. Le staging est suspendu : aucun test dynamique n'est prétendu.

### État de la branche par rapport à `main`
- La branche a divergé depuis le début des travaux : elle contient 10 commits propres et se trouve 6 commits derrière `main`.
- Les 6 commits apparus sur `main` concernent des ajustements récents de l'interface d'authentification (`index.html`, `dist/index.html`, `auth-page.css` et `dist/auth-page.css`).
- Les changements de performance restent isolés. Ne pas fusionner cette branche avant d'avoir réintégré ces 6 commits récents et contrôlé les deux index pour éviter d'écraser les ajustements d'authentification.


### Phase 3 — interface Dépenses différée
- Retrait du chargement initial de `spend-clean-ui.js` dans les deux index.
- Chargement à la première ouverture de Dépenses, avec détection de l'onglet actif restauré au démarrage.
- Le module `spend-experience.js` reste chargé initialement car il gère les dialogues partagés pour les autres rubriques.
- Version d'URL du module différé : `v=6`.
- Cette optimisation ne déplace ni le formulaire d'achat, ni les événements métier, ni le code OCR ; elle retarde uniquement la construction de la couche de présentation Dépenses.

- Contrôle statique Phase 3 : les deux index ne chargent plus directement `spend-clean-ui.js`, conservent les scripts de base dans leur ordre actuel et contiennent le déclencheur sur l'onglet Dépenses.


### Phase 4 — CSS Dépenses différée
- La feuille `spend-clean-ui.css` (environ 6 Ko source) est retirée du chargement initial et ajoutée avant le JavaScript de présentation, uniquement lors de la première ouverture de Dépenses.
- Le chargement de l'onglet est temporairement suspendu pendant la récupération des ressources afin d'éviter l'affichage d'une page non stylée ; l'action est rejouée après chargement.
- Le cas d'un onglet Dépenses restauré depuis la session précédente est anticipé par lecture de la préférence locale et par surveillance de l'onglet actif.
- La feuille `spend-experience.css` reste initiale : elle contient des styles partagés avec les dialogues et les formulaires des rubriques Budget, Revenus, Charges, Épargne et Profil. La différer globalement risquerait de dégrader ces parcours.
