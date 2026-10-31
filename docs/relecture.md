# Guide de relecture — PR #9

La PR ajoute environ 28 600 lignes (315 fichiers, 40 commits) sur la branche `claude/api-login-system-pahfz`. Personne ne l'a relue ; elle a été écrite par un assistant de code et testée par des tests de bout en bout (navigateur réel), pas par des tests unitaires. Ce guide découpe la relecture en lots indépendants, dit où le risque se concentre et comment relancer les tests.

## 1. Avant de commencer

- **Pile** : PHP 8.3 sans framework ni Composer (autoload `App\` dans `src/bootstrap.php`), MariaDB via PDO (requêtes préparées natives), JavaScript sans framework ni étape de build, CSP stricte (aucun script en ligne).
- **Conventions à vérifier partout** : chaque requête sur des données d'entreprise filtre `organization_id` ; chaque écriture d'API passe par `Suite\ModuleApi::context()` (POST, session, CSRF, app active) ; les montants sont des entiers en cents ; l'heure est celle de Maurice (PHP et session MariaDB, voir `src/bootstrap.php` et `src/Database.php`).
- **Documentation à lire d'abord** : `docs/suite-architecture.md` (règles métier de chaque app, une table par app), `docs/revue-securite.md` (ce qui a déjà été audité), `docs/deploiement.md`.

## 2. Relancer les tests

```bash
tests/e2e/run.sh              # les 28 suites, ~30 min
tests/e2e/run.sh e2e22 e2e25  # quelques suites
```

Prérequis (en tête de `tests/e2e/run.sh`) : PHP 8.3 avec pdo_mysql, mbstring, curl, sodium, zip ; MariaDB démarrée et accessible par la commande `mysql` en administrateur ; Node avec Playwright et Chromium ; Python 3 avec `cryptography` ; rsync et openssl ; ports 8099, 8098, 8097 et 2525 libres. Le script utilise sa propre base `mips_e2e`, recréée avant chaque suite (il refuse `mips_platform`), une copie du code dans `tests/.work/`, un faux serveur SMTP, un faux serveur de l'API MRA et un faux calendrier Airbnb. Captures d'écran et e-mails reçus restent dans `tests/.work/` pour inspection.

**Sur GitHub** (`.github/workflows/tests.yml`) : à chaque pull request, contrôle de syntaxe PHP, JavaScript et shell, puis les 28 suites réparties sur quatre machines en parallèle (moins de 2 minutes), contre MariaDB 10.11. Si une suite échoue, ses captures d'écran et e-mails sont téléchargeables 7 jours depuis la page de l'exécution (« Artifacts »).

Ce que les tests ne couvrent pas : la vraie API MRA (jamais appelée), un vrai serveur SMTP, Nginx en production (testé une fois à la main, voir `docs/deploiement.md`), la charge, les navigateurs autres que Chromium.

## 3. Lots de relecture

Chaque lot se relit seul, dans cet ordre (les suivants s'appuient sur le socle). Volumes approximatifs en lignes ajoutées.

| # | Lot | Fichiers principaux | ~Lignes | Commits | Tests |
|---|---|---|---|---|---|
| 1 | Socle multi-entreprise, catalogue, lecture seule, démo | `src/Suite/{Tenant,Catalog,Modules,ModuleApi}.php`, `public/app.php`, `public/dashboard.php`, `tools/demo_seed.php` | 900 | 1874d68, 7db2f99, 784643f, 7853473 | e2e, e2e17, e2e18 |
| 2 | Comptes, connexion, équipe, CGU | `src/{Accounts,Auth,RateLimiter,Legal,Session}.php`, `src/Suite/Team.php`, contrôleurs `Register/Login/Account/Invite/Team/Terms` | 1 600 | 7d5e45f, a9c2af9, c08feda, 0a8ece4 | e2e14, e2e19, e2e20, e2e26 |
| 3 | Facturo et MRA | `src/Facturo/*`, `src/Mra/*`, `src/Secrets.php`, `public/facturo/*` | 3 200 | 89c2e6c → f019db5, dc8b56f | e2e, e2e2, e2e3, e2e6, e2e7, e2e21 |
| 4 | ClientBloom (fidélité, cashback) | `src/ClientBloom/*` | 1 600 | 678b03b → 5b96abd | e2e5 |
| 5 | RendezVous + Formelio | `src/RendezVous/*`, `src/Formelio/*` | 2 700 | 980212a, 7178391 | e2e8, e2e9 |
| 6 | FlowDesk + TeamNest | `src/FlowDesk/*`, `src/TeamNest/*` | 2 000 | b4bc5af, 17db56e | e2e10, e2e12 |
| 7 | ShopLokal | `src/ShopLokal/*`, `public/shoplokal/*` | 1 400 | 3f7dded | e2e13 |
| 8 | StaffZen | `src/StaffZen/*` | 1 200 | 0752174 | e2e15 |
| 9 | Bookora (dont synchro iCal) | `src/Bookora/*`, `public/bookora/*`, `tools/bookora_ical_sync.php` | 2 300 | 7af685d | e2e16 |
| 10 | BizPilot + résumé du lundi | `src/BizPilot/*` | 750 | 41ed4b4, daedf93 | e2e11, e2e28 |
| 11 | Back-office MIPS + historique d'usage | `src/Backoffice/*`, `public/backoffice.php`, `public/export.php` | 850 | 5903699, b8dc80e | e2e22, e2e27 |
| 12 | Premiers pas, import, e-mails, export, fermeture | `src/Suite/{Onboarding,Import,Notifications,DataExport,Closure}.php`, `src/Facturo/Reminders.php`, `tools/*` | 1 900 | 08cc84d, f0feba2, ea5a3d9 | e2e23, e2e24, e2e25 |
| 12 bis | Sauvegardes et surveillance | `tools/{backup,restore,cron}.sh`, `tools/ops.php`, `src/Ops/*`, `public/health.php` | 500 | (ce commit) | e2e29 |
| 13 | Schéma et migrations | `sql/schema.sql`, `sql/migrations/001` → `027` | 1 900 | tous | contrôle § 5 |
| 14 | JavaScript et gabarits | `public/assets/js/*`, `templates/**` | 5 000 | tous | toutes |

Les gabarits et le JavaScript (lot 14) sont volumineux mais peu risqués : la revue de sécurité a vérifié l'échappement de chaque sortie et l'absence d'`innerHTML`. On peut les parcourir plus vite.

## 4. Où le risque se concentre

Par ordre de gravité si c'est faux. Pour chaque point : quoi vérifier, où.

1. **Argent et numérotation (lot 3, 4, 7, 9).** Numéros de facture sans trou sous verrou (`Facturo\Documents::issue`, table `facturo_sequences`, `FOR UPDATE`) ; arrondi de la TVA par ligne (`Facturo\Money`) ; un avoir ne dépasse jamais le reste à créditer (`Documents::creditableCents`, revérifié sous verrou à l'émission) ; ShopLokal ne vend pas plus que le stock et sa facture est identique au centime à la commande (`ShopLokal\Orders::place`) ; le solde de cashback ne devient jamais négatif et une annulation ne se fait qu'une fois (`ClientBloom\Ledger`) ; prix par saison et par nuit (`Bookora\Bookings`).
2. **Facturation électronique MRA (lot 3).** Chiffrement (RSA puis AES-256-ECB, `Mra\Client`), contenu du JSON envoyé (`Facturo\Fiscalisation::payload`, à comparer aux *MRA Technical Guidelines 2023*), chaînage des empreintes et reprise après panne (`tools/mra_retry.php`). **Jamais testé contre la vraie MRA** : seulement contre un faux serveur écrit d'après la documentation. Garde-fou : en `app.env = production`, les URL de sandbox ou de simulation sont refusées.
3. **Cloisonnement entre entreprises (tous lots).** Aucun accès croisé trouvé par la revue de sécurité ; à revérifier sur chaque requête ajoutée : `organization_id` dans le `WHERE`, et identifiants étrangers (client, service, logement…) contrôlés comme appartenant à l'entreprise.
4. **Suppression définitive (lot 12).** `Suite\Closure::purge` efface une entreprise entière et les comptes de son équipe. Vérifier l'ordre de `DELETE_ORDER` (liens `RESTRICT`), que les comptes membres d'une autre entreprise sont conservés, et que la condition de date (`deletion_scheduled_at <= NOW()`) ne peut pas être contournée. Le test `e2e25` contient un garde-fou : il échoue si une table d'entreprise manque à l'export.
5. **Authentification (lot 2).** Limitation des tentatives (`RateLimiter`), liens à usage unique dont seule l'empreinte SHA-256 est stockée, confirmation d'inscription qui redemande le mot de passe (prise de compte avant inscription), invitation d'un compte existant, sessions (durée absolue 12 h, jeton CSRF renouvelé).
6. **Tâches planifiées (lot 12).** Idempotence : chaque e-mail est réservé dans `notification_log` (`INSERT IGNORE`) avant l'envoi et libéré en cas d'échec ; verrous `GET_LOCK` pour éviter deux exécutions en parallèle ; une entreprise en erreur n'arrête pas les autres ; code de sortie 1 en cas d'échec.
7. **Pages publiques (lots 5, 7, 9).** Réservation, boutique, formulaires, tickets : jetons aléatoires, pot de miel, limites par IP (IPv6 par /64) et par destinataire d'e-mail, transactions sous verrou contre les doubles réservations.
8. **Sauvegardes (lot 12 bis).** Une sauvegarde illisible ou incomplète ne se voit que le jour où on en a besoin. Vérifier que `backup.sh` échoue (code ≠ 0) dès qu'une étape échoue (`set -o pipefail`), qu'aucun fichier en clair ne touche le disque, que la clé privée n'est jamais requise sur le serveur, et que `restore.sh` ne peut pas écraser une base sans `--replace`. Le test `e2e29` restaure et compare chaque table.
9. **Back-office (lot 11).** Accès par liste d'adresses (`backoffice.staff`) et 404 pour tout autre visiteur ; la restriction par IP se fait dans Nginx. Chaque action est journalisée.

## 5. Contrôles mécaniques

- **Lint** : `find src public templates tools -name '*.php' -print0 | xargs -0 -n1 php -l | grep -v '^No syntax'` ne doit rien afficher.
- **Migrations = schéma** : sur une base vide, charger le `schema.sql` d'un commit, appliquer la migration suivante, et comparer `mysqldump --no-data` avec le `schema.sql` du commit d'après. Fait à chaque migration pendant le développement (001 → 027), à refaire au moins une fois de 001 à 027.
- **Requêtes SQL construites par concaténation** : la revue de sécurité les a listées (`docs/revue-securite.md`) ; aucune n'utilise une donnée de la requête HTTP. À garder ainsi.

## 6. Limites connues, décidées

- Pas de tests unitaires, seulement des tests de bout en bout (lents mais proches de l'usage réel).
- Les tests tournent contre MariaDB 10.11 et Chromium seulement.
- Pas de paiement en ligne (abonnements gérés depuis le back-office ; ShopLokal et Bookora encaissent hors ligne).
- Un compte utilisateur appartient à une seule entreprise.
- L'historique d'usage ne garde que la date de passage, pas la fréquence ni le détail.
- Les textes des CGU et de la politique de confidentialité sont des versions provisoires à faire valider par un juriste.

## 7. Questions à remonter

Notez chaque problème avec le fichier et la ligne, le scénario qui le déclenche, et sa gravité (bloquant avant pilote / à corriger / remarque). Les bloquants passent avant tout nouveau développement.
