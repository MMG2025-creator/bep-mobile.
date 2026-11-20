# BEP — Dossier final d'audit des branches
Date : 20 novembre 2026
Dépôt : `MMG2025-creator/bep-mobile.`
Branche documentaire : `audit/pre-cleanup-inventory-20261120`

## Conclusion opérationnelle

L'inventaire courant contient **365 branches**. Les 265 branches qui ne sont ni des têtes de PR ouvertes, ni des dépendances Render, ni des références historiques/de contrôle ont toutes été comparées à `main`.

- **255 branches** ont au moins un commit en avance sur `main` : elles sont à conserver.
- **10 branches** sont strictement derrière `main` (ahead 0) : aucune ne contient de commit exclusif à la branche.
- Parmi ces 10, **8 sont proposées à la suppression manuelle** après dernier contrôle du SHA.
- **2 restent à conserver** malgré leur statut behind-only, pour raisons de traçabilité ou de référence historique.
- Aucune suppression n'a été exécutée.

L'inventaire machine complet (365 branches, SHA, PR ouvertes, dépendances Render, famille de conservation et classification) est publié dans [branch-cleanup-final-20261120.json](https://github.com/MMG2025-creator/bep-mobile./blob/audit/pre-cleanup-inventory-20261120/audit/branch-cleanup-final-20261120.json).

## Lot de suppression manuelle proposé

Toutes les branches ci-dessous ont été comparées à `main` et retournent ahead 0. Leurs commits sont donc déjà atteignables depuis `main`. Elles n'ont pas de PR ouverte ni de service Render rattaché.

| Branche | SHA vérifié | Comparaison | Preuve / remarque |
|---|---|---:|---|
| `fix/coach-only-on-coach-tab` | `1061c60b478d50c408484779df965e4d315dede2` | 0 / 2 | PR #316 fusionnée |
| `fix/pwa-cache-invalidation-v27` | `7c12fc34f492289b03945e6a57451d5490c74d0c` | 0 / 11 | PR #315 fusionnée |
| `fix/multi-device-session-sync` | `31dc21dee35eab95b0468a86bb2a2bc45ab16f33` | 0 / 45 | PR #290 fusionnée |
| `feature/coach-external-ai-exchange` | `86c0a650f46a2f63f8bba9cda8e29ced15f5f5ef` | 0 / 878 | PR #6 fusionnée |
| `fix/budget-purchases-separation-bulk-delete` | `8ae1e3fc145bb1fbfdaade3227690113c8609f04` | 0 / 891 | PR #5 fusionnée |
| `feature/overdraft-settings-popup` | `a545bc1507f534d17aba965d0feddfe13855063e` | 0 / 265 | Aucun PR exact ; branche distincte de `feature/overdraft-settings-popup-v2` (#124), qui doit rester conservée car elle a des commits en avance |
| `fix/connection-state-and-reload-guards` | `a019a7ddcf44e0e2e1b9057e1f28095d9834099a` | 0 / 217 | Aucun PR exact ; commits déjà dans main, à traiter comme ancien pointeur de travail |
| `feature/bep-coach-v1-release-20261115` | `b1efaf5c7c089b4f414611a96f83ffb751feebf6` | 0 / 156 | Aucun PR exact ; malgré le mot « release », le préfixe est `feature/`. Vérifier qu'il ne sert pas de jalon opérationnel avant suppression |

Ordre conseillé : supprimer les trois branches récentes (#316, #315, #290), vérifier les résultats, puis les cinq branches historiques restantes, une par une. Ce séquencement est une recommandation de prudence, pas une suppression déjà effectuée.

## Deux branches behind-only à garder

| Branche | SHA | Comparaison | Motif |
|---|---|---:|---|
| `implementation/gemini-supervisor-v2-20261114` | `e7f8102c2033be15c67cb6e4b170a72c2db28852` | 0 / 203 | PR #160 fermée sans fusion. Conserver pour revue humaine de l'historique Gemini Superviseur. |
| `perf/module-isolation-20261114` | `5b6beacd2dbfb4b3861553493dacb72e85f3b810` | 0 / 216 | SHA partagé avec plusieurs références backup/release V1.3. Conserver comme pointeur de jalon historique. |

## Références à ne pas supprimer

### PR ouvertes
40 PR ouvertes ont été relevées. Toutes leurs branches sources sont exclues du lot de suppression, même si leur nom paraît ancien ou redondant. Les numéros, noms de branches et SHA sont dans le JSON complet.

### Dépendances Render
19 services Render liés au dépôt BEP sont recensés sur **9 branches distinctes**. Toute branche utilisée par un service est exclue. Deux de ces branches sont également des têtes de PR ouvertes ; la liste service/branche/auto-deploy est dans le JSON.

### Familles historiques et opérationnelles
61 branches relèvent des familles `archive/`, `audit/`, `backup/`, `deploy/`, `deployment-test/`, `docs/`, `governance/`, `integration/`, `qa/`, `release/`, `research/`, `revert/`, `rollback/`, `security/`, `simulation/`, `stable/`, `test/` et `work/`. Elles sont conservées, sans exception automatique.

## Protection GitHub

- Les 365 branches remontent avec `protected=false`.
- L'API des rulesets renvoie une liste vide.
- La lecture des règles classiques de protection de branche n'a pas été autorisée par l'intégration connectée ; leur absence n'est donc pas certifiée.

Avant suppression, vérifier manuellement dans GitHub Settings → Branches que les règles de protection et règlesets n'ont pas évolué. En particulier, protéger `main` contre suppression et push direct.

## Sauvegardes

### Git
La sauvegarde `backup/pre-cleanup-main-20261120` existe et pointe sur le même SHA que `main` :
`ec4f073e8c00a8b820b270bf308109037ec42cb2`.

### PostgreSQL
La base Render `bep-v2-db` (`bep_v2_db`, PostgreSQL 18, Francfort) est disponible. **Aucun dump, snapshot manuel, export ni test de restauration n'a été réalisé.** Les actions Render connectées ne proposent pas de commande de backup/snapshot/export/restore et la fiche de la base ne confirme pas l'état d'une sauvegarde automatique. Le backup PostgreSQL reste donc un contrôle manuel séparé dans le dashboard Render. La suppression de branches Git ne modifie pas la base, mais ne pas confondre sauvegarde Git et sauvegarde de données.

## Production — contrôle final

- Frontend LIVE : déploiement `dep-dbvioaafngtc73cdh9d0`, SHA `ec4f073e8c00a8b820b270bf308109037ec42cb2`, identique à `main`.
- API LIVE : déploiement `dep-dbv567ek1f9s73bfuuog`, SHA `ca9279fb879e9f1631e125a60d66a032188d193b`, soit 40 commits derrière `main`.
- L'analyse des 40 commits d'écart montre uniquement des fichiers frontend/PWA et tests : `app.js`, `index.html`, `pwa.js`, `styles.css`, `sw.js`, leurs copies `dist/` et des tests. Aucun fichier serveur/API n'apparaît dans le diff. Aucun redéploiement API n'est requis pour le nettoyage des branches.
- Les services de production frontend et API ont l'auto-deploy désactivé.
- Aucun service, déploiement, secret, code de `main` ou donnée PostgreSQL n'a été modifié pendant cet audit.

## Procédure de suppression côté utilisateur

Pour chaque branche du lot :
1. Relire le SHA courant dans GitHub et le comparer au SHA du présent manifeste.
2. Vérifier une dernière fois qu'aucune PR ouverte ni aucun service Render n'utilise la branche.
3. Supprimer uniquement la branche exacte indiquée.
4. Vérifier que la référence a disparu et que `main` reste au SHA `ec4f073e8c00a8b820b270bf308109037ec42cb2`.
5. Ne pas supprimer les deux branches behind-only conservées, les familles historiques, les têtes de PR ouvertes, les références Render ou les références backup/release.

Ce dossier constitue le résultat de l'audit et le manifeste d'intervention manuelle. **Aucune suppression n'a été exécutée par l'assistant.**
