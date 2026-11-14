# BEP — Homepage visuelle de référence (canonique)

**Statut : VALIDÉE — SOURCE DE VÉRITÉ VISUELLE**  
**Décision produit : 12 novembre 2026**

> La homepage pastel « Ton espace pour avancer » est l'unique direction visuelle de référence de BEP. Aucune autre proposition de homepage, variante graphique ou retour à l'ancienne bannière vert forêt ne doit être créée ou appliquée sans demande explicite du propriétaire du produit.

## Visuel de référence

La référence est la homepage claire et chaleureuse montrée et validée par le propriétaire le 12 novembre 2026 :
- fond pastel lumineux avec dégradé vert menthe, bleu très clair et crème ;
- carte hero arrondie, bordure douce et ombre discrète ;
- accroche « TON ESPACE POUR AVANCER » avec étoile dorée ;
- titre « La maîtrise précède la croissance. », deuxième ligne verte et soulignement doré ;
- sous-titre « Chaque petit pas compte. Avance à ton rythme. » ;
- trois pastilles pastel : « Planifier », « Épargner », « Progresser » ;
- mascotte robot BEP souriante, verte et blanche, à droite, avec animation de flottement douce ;
- ambiance générale positive, adulte, accessible et motivante — jamais enfantine.


## Mascotte BEP officielle — SVG unique et verrouillé

**Décision explicite du propriétaire : 12 novembre 2026.** Le dessin SVG du robot visible sur la Home et repris dans « Conseil BEP » est l'unique mascotte autorisée dans toute l'application BEP. Cette décision est ferme et permanente jusqu'à demande explicite contraire du propriétaire.

- Fichier maître immuable : [docs/assets/bep-robot-conseil-officiel.svg](https://github.com/MMG2025-creator/bep-mobile./blob/main/docs/assets/bep-robot-conseil-officiel.svg).
- Source actuellement intégrée : `dist/index.html`, SVG inline avec `viewBox="0 0 160 170"`.
- Le même dessin doit être réutilisé à l'identique dans Accueil, Conseil BEP, Dépenses et tous les autres écrans ou composants.
- Interdiction de créer, substituer ou réintroduire un autre robot, une variante, un pictogramme robot alternatif ou un style concurrent.
- Les changements de taille, placement ou adaptation responsive peuvent être faits par CSS uniquement ; ne pas altérer les tracés, proportions, couleurs ou détails du SVG maître.
- Toute évolution graphique du robot exige une demande et une validation explicites du propriétaire.

## Règles de conservation

1. Ce visuel est l'unique référence de la homepage BEP.
2. Ne pas créer de nouvelle direction artistique, de deuxième concept, de variante sombre ou d'alternative de bannière.
3. Toute évolution future doit améliorer la lisibilité, l'accessibilité, le responsive ou les interactions **à l'intérieur de cette identité**.
4. Conserver la mascotte robot, les couleurs pastel, les trois pastilles et la hiérarchie de l'accroche.
5. Respecter `prefers-reduced-motion` ; l'animation ne doit jamais être indispensable à la compréhension.
6. Ne pas toucher à cette identité lors des travaux sur les dashboards, Budget, Épargne ou Dépenses sans demande explicite.
7. Production et préproduction doivent rester cohérentes avec cette référence.

## Source technique canonique

Dépôt : [MMG2025-creator/bep-mobile.](https://github.com/MMG2025-creator/bep-mobile.)  
Branche : `main`  
Commit de référence : [9fee256ab443128e1f93f82999a8890cd6ef80d8](https://github.com/MMG2025-creator/bep-mobile./commit/9fee256ab443128e1f93f82999a8890cd6ef80d8)

Fichiers publiés :
- `dist/index.html` — structure du hero pastel et SVG inline de la mascotte ;
- `dist/ui-polish.css` — mise en forme de référence du hero, responsive et animation de la mascotte ;
- `dist/styles.css` — styles généraux et animations complémentaires de la homepage.

La version de `ui-polish.css` appelée par la homepage est `v=3`.

### Snapshot de référence validé en production — 12 novembre 2026

Le propriétaire confirme que cette homepage est la référence fixe de BEP. Le snapshot de production validé inclut également le masquage du bloc « Ma situation mensuelle » sur l'accueil, tout en conservant la section « Analyse financière » et ses graphiques.

- Commit de restauration du hero canonique et de l'état homepage : [ff5d5ee601eaa4a38cd9379d9bf2b477da147e9d](https://github.com/MMG2025-creator/bep-mobile./commit/ff5d5ee601eaa4a38cd9379d9bf2b477da147e9d).
- Déploiement Render : `dep-dbr2ad17lnhs73a50qq0` — statut `live`.
- URL de production : https://bep-mobile.onrender.com.

Toute modification future de la homepage doit partir de ce snapshot et préserver cette direction visuelle, sauf demande explicite contraire.

## Validation

Le propriétaire a explicitement confirmé : « C'est bon, la home est fixée » et demandé d'enregistrer cette home et ce visuel comme référence BEP, sans en vouloir d'autre.

Cette fiche constitue la règle de référence pour toute intervention future sur la homepage. En cas de conflit avec une ancienne maquette, capture, branche ou proposition, cette décision et les fichiers de la branche `main` au commit indiqué prévalent.
