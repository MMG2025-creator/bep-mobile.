# BEP — Contrat e-mail de réinitialisation du mot de passe

## Contexte

Le backend BEP utilise déjà un Google Apps Script comme passerelle d'envoi d'e-mails (`GMAIL_APPS_SCRIPT_URL`) avec un secret partagé (`BEP_MAIL_SECRET`). Le parcours d'inscription transmet actuellement `{ secret, email, code }`.

La nouvelle route de réinitialisation transmet les champs suivants :

```json
{
  "secret": "<secret partagé>",
  "email": "utilisateur@example.com",
  "code": "https://bep-mobile.onrender.com/?reset=<jeton>",
  "type": "password_reset",
  "resetUrl": "https://bep-mobile.onrender.com/?reset=<jeton>",
  "subject": "Réinitialisation du mot de passe BEP"
}
```

## Modification nécessaire dans le Google Apps Script

Le script doit reconnaître `type === "password_reset"` et envoyer un message spécifique :
- Objet : « Réinitialisation du mot de passe BEP ».
- Texte : une demande de réinitialisation a été faite ; si elle n'est pas à l'origine du destinataire, ignorer l'e-mail.
- Bouton/lien HTML : « Choisir un nouveau mot de passe » pointant vers `resetUrl`.
- Version texte brut : inclure l'URL complète.
- Continuer à traiter les messages d'inscription existants comme auparavant lorsque `type` vaut `email_verification` ou est absent.
- Vérifier le secret partagé et ne jamais journaliser le jeton ou le secret.
- Répondre en JSON `{ "ok": true }` uniquement si l'envoi a été accepté.

Le lien pointe vers le frontend BEP, puis le frontend transmet le jeton au backend. Le jeton n'est stocké en base que sous forme SHA-256, expire après 30 minutes, est à usage unique et les anciens jetons de réinitialisation du compte sont invalidés lors d'une nouvelle demande.

## Recette

1. Déployer la nouvelle version du Google Apps Script en conservant l'URL configurée dans Render.
2. Demander une réinitialisation pour un compte de test.
3. Vérifier la réception, le sujet, le lien et l'absence de fuite du jeton dans les journaux.
4. Réinitialiser le mot de passe via le lien.
5. Vérifier qu'un second usage du même lien est refusé.
6. Vérifier qu'un lien de plus de 30 minutes est refusé.
7. Vérifier que les sessions déjà ouvertes sont invalidées et que le nouveau mot de passe permet une connexion.
8. Vérifier que la réponse publique ne révèle jamais si l'adresse possède un compte.

**Statut :** contrat transmis par le backend dans la branche de travail ; la compatibilité du Google Apps Script et l'envoi réel doivent être validés avant fusion et publication.