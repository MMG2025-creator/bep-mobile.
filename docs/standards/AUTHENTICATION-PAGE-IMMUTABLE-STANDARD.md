# BEP — Standard immuable de la page d’authentification

**Statut : GELÉE — aucune modification sans autorisation explicite de Monel.**  
**Date de validation : 13 novembre 2026**  
**Production :** https://bep-mobile.onrender.com/

## Référence visuelle approuvée
La page d’authentification validée le 13/11/2026 constitue la référence visuelle. Toute évolution future doit préserver exactement son rendu et son comportement, sauf demande explicite de dégel.

## Périmètre protégé
- `index.html` : uniquement le bloc `#authGate` pour toute intervention explicitement autorisée.
- `dist/index.html` : copie de production du bloc d’authentification.
- `auth-recovery.css` et `dist/auth-recovery.css` : styles de l’écran d’authentification.
- Le JavaScript d’authentification, les flux de connexion, création de compte, Google Login, vérification e-mail et récupération/réinitialisation de mot de passe ne doivent pas être modifiés dans le cadre d’une simple évolution visuelle.

## Éléments visuels immuables
1. Bandeau logo vert uni `#145b46`.
2. Symbole graphique doré à gauche.
3. Séparateur vertical clair entre symbole et marque.
4. Marque BEP à droite, avec « BUILD · EARN · PRESERVE » sous BEP.
5. Carte blanche centrée, angles arrondis, fond général vert très pâle.
6. Onglets « Connexion » et « Créer un compte ».
7. Bouton « Continuer avec Google ».
8. Séparateur e-mail, champs et bouton principal.
9. Lien « Mot de passe oublié ? » centré et visible en mode connexion et création de compte.
10. Robot Conseil BEP masqué pendant l’authentification et conservé dans l’application après connexion.
11. Espacements aérés et cohérents, sans texte de présentation superflu.

## Règles de changement
- Ne jamais modifier ces éléments de sa propre initiative.
- Toute demande touchant à l’écran d’authentification doit être considérée comme bloquée tant que Monel n’a pas explicitement autorisé le dégel.
- Avant tout changement autorisé : récupérer la dernière version de `main`, examiner les diffs, ne toucher qu’aux fichiers/blocs d’authentification, préserver les Paramètres et les autres modules.
- Ne jamais remplacer `index.html`, `dist/index.html`, `app.js`, `styles.css` ou leurs versions `dist` par une copie ancienne.
- Après changement autorisé : vérifier les diffs, les flux de connexion/inscription/récupération, le rendu desktop/mobile et le déploiement live.
- Si un changement non autorisé est détecté, notifier Monel et ne pas tenter de le corriger automatiquement.

## Empreintes de référence au moment du gel
- `settings.css` et `dist/settings.css` étaient identiques au contrôle préalable à la mise à jour.
- Aucun fichier Paramètres n’a été modifié pour la mise à jour visuelle d’authentification du 13/11/2026.
- Les identifiants des commits de la mise à jour sont conservés dans l’historique GitHub.
