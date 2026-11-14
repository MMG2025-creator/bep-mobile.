# BEP Gemini Agent — sécurité

- Agent désactivé par défaut ; activation explicite et confirmation de facturation nulle obligatoires. Une clé dédiée est prioritaire ; la réutilisation de `BEP_AI_API_KEY` est possible uniquement après autorisation explicite et partage alors les quotas et la facturation du même projet Google.
- Tant que l'agent est désactivé : aucune table agent, aucune écriture agent, aucun appel Gemini et aucune télémétrie agent.
- Aucun secret Gemini côté navigateur.
- Aucune donnée financière individuelle, donnée d'identité ou conversation utilisateur envoyée à Gemini.
- La supervision du Coach ne conserve que des agrégats quotidiens (mode, statut HTTP, latence, tokens), sans identifiant utilisateur ni texte.
- Gemini ne reçoit que le corpus public BEP et des cas synthétiques.
- Les documents sont des données non fiables ; toute instruction incorporée est ignorée.
- Validation stricte du type de proposition, du slug et de la provenance source.
- Chaque proposition et chaque surcouche approuvée sont liées à la version et à l'empreinte SHA-256 de leur document source.
- Une surcouche devenue obsolète est ignorée par le moteur RAG si le document seed change ; une ancienne désactivation ne peut donc pas masquer une source actualisée.
- Pas d'écriture directe de Gemini dans la bibliothèque active : toute proposition reste en attente humaine.
- Pas de changement automatique de code, de configuration, de règle métier ou de déploiement.
- Quota applicatif quotidien de l'agent (8 appels par défaut), timeout, redirections interdites et absence de fournisseur de remplacement. Si la clé BEP existante est réutilisée, les quotas fournisseur Google et la facturation sont partagés.
- Migration additive uniquement ; aucune suppression ou modification des tables métier.
- L'accès aux routes de revue est limité aux identifiants configurés dans `BEP_AGENT_ADMIN_USER_IDS`.
- Une approbation crée une surcouche documentaire additive ; le seed financier d'origine n'est jamais écrasé.
