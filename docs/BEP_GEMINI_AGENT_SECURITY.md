# BEP Gemini Agent — sécurité

- Agent désactivé par défaut ; activation explicite et clé dédiée obligatoires.
- Aucun secret Gemini côté navigateur.
- Aucune donnée financière individuelle, donnée d'identité ou conversation utilisateur envoyée à Gemini.
- La supervision du Coach ne conserve que des agrégats quotidiens (mode, statut HTTP, latence, tokens), sans identifiant utilisateur ni texte.
- Gemini ne reçoit que le corpus public BEP et des cas synthétiques.
- Les documents sont des données non fiables ; toute instruction incorporée est ignorée.
- Validation stricte du type de proposition, du slug et de la provenance source.
- Pas d'écriture directe de Gemini dans la bibliothèque active : toute proposition reste en attente humaine.
- Pas de changement automatique de code, de configuration, de règle métier ou de déploiement.
- Quota quotidien indépendant, timeout, redirections interdites et absence de fournisseur de remplacement.
- Migration additive uniquement ; aucune suppression ou modification des tables métier.

- L'accès aux routes de revue est limité aux identifiants configurés dans `BEP_AGENT_ADMIN_USER_IDS`.
- Une approbation crée une surcouche documentaire additive ; le seed financier d'origine n'est pas écrasé.
- Les métriques de supervision sont agrégées par jour, mode et statut HTTP, sans compte utilisateur.
