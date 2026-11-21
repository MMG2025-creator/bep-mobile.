# BEP Coach — fraîcheur du registre documentaire

## États de fraîcheur
- `unchecked` : aucune vérification réussie n'a encore été faite.
- `fresh` : dernier contrôle réussi il y a moins de 30 jours par défaut.
- `stale` : dernière vérification trop ancienne selon `stale_after_days`.
- `changed` : l'empreinte SHA-256 du contenu a changé depuis le contrôle précédent.
- `error` : dernier contrôle en échec ; le digest de la dernière version connue est conservé.

Un changement de contenu n'entraîne jamais une modification automatique de la base de connaissances. Il impose une revue humaine avant toute nouvelle proposition ou publication.

## API d'administration
Toutes les routes exigent la session authentifiée et le rôle administrateur BEP.

- `GET /api/admin/bep-coach/source-registry` : liste les sources, leur statut éditorial, leur fraîcheur, dates et empreintes, sans exposer de contenu utilisateur.
- `POST /api/admin/bep-coach/source-registry/refresh` avec `{"sourceIds":["mqa-01"]}` : vérifie de 1 à 10 sources connues du registre.
- `POST /api/admin/bep-coach/source-registry` : enregistre des références institutionnelles ; ne les télécharge pas et ne les publie pas.

Les contrôles réseau utilisent le collecteur HTTPS existant, qui bloque les destinations privées et les redirections. Le registre est limité aux hôtes officiels `mesquestionsdargent.fr` et `www.mesquestionsdargent.fr`.

## Migration
La migration additive et idempotente est `database/migrations/20261121_coach_source_registry_freshness.sql`.
Pour l'appliquer au démarrage Render, définir temporairement `BEP_COACH_SOURCE_REGISTRY_SCHEMA_MIGRATE=true` sur le service API, déployer, vérifier les logs de migration, puis remettre le flag à `false`. L'API effectue également une vérification de schéma idempotente lors des opérations du registre.

## Limites
- Le contrôle compare le texte extrait et son empreinte ; il ne certifie pas la qualité éditoriale ni la validité juridique de la page.
- Les PDF ne sont pas encore pris en charge par le collecteur.
- Aucun rafraîchissement planifié n'est créé dans ce lot : les contrôles sont déclenchés explicitement par un administrateur.
- Aucun appel Gemini n'est requis pour contrôler la fraîcheur.
