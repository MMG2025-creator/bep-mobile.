# BEP — règle de propriété des écrans et validation du DOM final

## Règle obligatoire

Un écran peut être construit ou modifié par plusieurs couches successives : HTML initial, modules JavaScript, scripts de présentation qui déplacent ou remplacent des nœuds, puis CSS. La présence d'un élément ou d'une règle dans un fichier source ne prouve pas qu'il existe dans le DOM final de production.

**Toute modification d'interface doit être contrôlée après exécution de tous les scripts qui transforment le même écran.** Identifier explicitement le script propriétaire du DOM final et modifier cette couche si elle reconstruit l'écran.

## Cas concret — page Dépenses (14 novembre 2026)

- `spend-experience.js` construit le workspace et ses actions initiales.
- `spend-clean-ui.js` reconstruit ensuite `#purchases` avec `replaceChildren()`. Il est donc propriétaire de la structure finale visible de la page.
- Les actions ajoutées uniquement dans `spend-experience.js` peuvent être supprimées lors de cette reconstruction.
- Les styles de `spend-experience.css` ciblant l'ancienne structure ne garantissent pas le rendu final.
- La grille des actions Dépenses doit être portée par la structure finale émise par `spend-clean-ui.js` et stylée dans `spend-clean-ui.css`.

## Contrôles avant merge et déploiement

1. Cartographier les scripts qui ciblent le même écran et leur ordre de chargement.
2. Rechercher les opérations destructives ou de remplacement : `replaceChildren`, `innerHTML`, `outerHTML`, suppression/recréation de sections.
3. Vérifier que les actions, identifiants, écouteurs et fonctions appelées survivent à la dernière reconstruction.
4. Synchroniser chaque fichier modifié avec son équivalent dans `dist/` ; comparer les contenus (ou SHA) et les versions de cache.
5. Vérifier les références de chargement dans `index.html` et `dist/index.html`.
6. Exécuter les contrôles de syntaxe et tests automatisés pertinents.
7. Contrôler en navigateur le DOM final, les classes, les styles calculés et les interactions, à desktop et mobile.
8. Après déploiement, vérifier les ressources et le DOM réellement servis par Render. Ne jamais assimiler un contrôle de fichier à une recette fonctionnelle.

## Principe de prévention

**Ne jamais considérer une modification CSS/HTML comme livrée tant que la couche finale qui reconstruit le composant n'a pas été vérifiée.** Les sources et `dist/` doivent être traitées comme un ensemble de publication synchronisé.

## Évolution de la page Dépenses — actions et historique interactif (14 novembre 2026)

- Le DOM final reste construit par `spend-clean-ui.js` ; toute modification de l'ordre visuel ou des cartes d'action doit être faite dans ce constructeur, puis répliquée dans `dist/`.
- L'ordre cible est : synthèse et indicateurs, actions d'ajout/import côte à côte, puis historique des achats. La carte « Ajouter une dépense » porte trois billets stylisés animés en flottement léger ; l'animation respecte prefers-reduced-motion.
- Les indicateurs sont des commandes accessibles au clavier : « Dépenses du mois » filtre le mois courant, « Achats enregistrés » affiche toute la liste et « Sous impulsion » filtre les achats impulsifs ou sous pression. Ils ouvrent tous l'accordéon de l'historique.
- Les deux actions principales sont « Ajouter une dépense » et « Importer une photo ou une preuve d'achat ». Le bouton d'ajout conserve son écouteur d'ouverture de saisie rapide ; l'import conserve le déclenchement du champ de fichier `#receiptFile`.
- Ne pas réintroduire « Me guider sur mes dépenses » dans cette zone : ce n'est pas une action de la page Dépenses.
- Après chaque changement, contrôler l'ouverture des filtres, les trois états de liste, les actions d'ajout/import, le responsive mobile, le chargement CSS v10 et JS v8, ainsi que l'identité des fichiers source et `dist/`.
