# Guide de relecture — PR #9

La PR ajoute environ 28 600 lignes (315 fichiers, 40 commits) sur la branche `claude/api-login-system-pahfz`. Personne ne l'a relue ; elle a été écrite par un assistant de code et testée par des tests de bout en bout (navigateur réel), pas par des tests unitaires. Ce guide découpe la relecture en lots indépendants, dit où le risque se concentre et comment relancer les tests.

## 1. Avant de commencer

- **Pile** : PHP 8.3 sans framework ni Composer (autoload `App\` dans `src/bootstrap.php`), MariaDB via PDO (requêtes préparées natives), JavaScript sans framework ni étape de build, CSP stricte (aucun script en ligne).
- **Conventions à vérifier partout** : chaque requête sur des données d'entreprise filtre `organization_id` ; chaque écriture d'API passe par `Suite\ModuleApi::context()` (POST, session, CSRF, app active) ; les montants sont des entiers en cents ; l'heure est celle de Maurice (PHP et session MariaDB, voir `src/bootstrap.php` et `src/Database.php`).
- **Documentation à lire d'abord** : `docs/suite-architecture.md` (règles métier de chaque app, une table par app), `docs/revue-securite.md` (ce qui a déjà été audité), `docs/deploiement.md`.

## 2. Relancer les tests

```bash
tests/e2e/run.sh              # les 34 suites, ~40 min
tests/e2e/run.sh e2e22 e2e25  # quelques suites
```

Prérequis (en tête de `tests/e2e/run.sh`) : PHP 8.3 avec pdo_mysql, mbstring, curl, sodium, zip ; MariaDB démarrée et accessible par la commande `mysql` en administrateur ; Node avec Playwright et Chromium ; Python 3 avec `cryptography` ; rsync et openssl ; ports 8099, 8098, 8097 et 2525 libres. Le script utilise sa propre base `mips_e2e`, recréée avant chaque suite (il refuse `mips_platform`), une copie du code dans `tests/.work/`, un faux serveur SMTP, un faux serveur de l'API MRA et un faux calendrier Airbnb. Captures d'écran et e-mails reçus restent dans `tests/.work/` pour inspection.

**Sur GitHub** (`.github/workflows/tests.yml`) : à chaque pull request, contrôle de syntaxe PHP, JavaScript et shell, puis les 34 suites réparties sur quatre machines en parallèle (moins de 2 minutes), contre MariaDB 10.11. Si une suite échoue, ses captures d'écran et e-mails sont téléchargeables 7 jours depuis la page de l'exécution (« Artifacts »).

Ce que les tests ne couvrent pas : la vraie API MRA (jamais appelée), un vrai serveur SMTP, Nginx en production (testé une fois à la main, voir `docs/deploiement.md`), la charge, les navigateurs autres que Chromium.

## 3. Lots de relecture

### Pile de pull requests

La PR est découpée en sept PR empilées. Chacune vise la branche de la précédente et ne montre que ses propres commits, inchangés (aucune réécriture d'historique). Relire et fusionner dans l'ordre.

| PR | Contenu | Commits | ~Lignes |
|---|---|---|---|
| #11 [1/7] | Socle, Facturo + MRA, ClientBloom, interface en français | 1–15 | 7 000 |
| #12 [2/7] | RendezVous, Formelio, FlowDesk | 16–18 | 5 600 |
| #13 [3/7] | BizPilot, TeamNest, ShopLokal | 19–21 | 4 000 |
| #14 [4/7] | Invitations d'équipe, StaffZen, Bookora | 22–24 | 5 800 |
| #15 [5/7] | Démo, fin d'essai, inscription, déploiement, sécurité, rôles Facturo | 25–32 | 2 000 |
| #16 [6/7] | Back-office, premiers pas, e-mails, export et fermeture, CGU, usage, résumé du lundi | 33–39 | 4 300 |
| #9 [7/7] | Heure de Maurice, tests dans le dépôt, CI, guide de relecture, sauvegardes et surveillance | 40 et suivants | 5 000 |

Les tests et la CI n'arrivent que dans #9 : les PR 1 à 6 n'ont pas de vérification automatique. À chaque point de coupe, la syntaxe PHP est propre et `schema.sql` + `seed.sql` se chargent ; les suites de bout en bout, elles, ne valent que pour l'état final (#9). Un défaut trouvé dans une tranche se corrige en haut de la pile (#9), pas en réécrivant la tranche.

### Lots par thème

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
| 13 | Schéma et migrations | `sql/schema.sql`, `sql/migrations/001` → `032` | 1 900 | tous | contrôle § 5 |
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

## 5. Contre-relecture automatique (1er novembre 2026)

Quatre relectures indépendantes (agents qui ne voyaient pas les conclusions de l'auteur), une par zone à risque. Chaque constat a été vérifié dans le code avant correction ; chaque correction a son test (`e2e30`, `e2e31`, `e2e29`). Ce n'est pas une relecture humaine : elle la prépare.

**Cloisonnement entre entreprises** : aucun accès croisé trouvé (chaque requête par identifiant tracée jusqu'à ses appelants, chaque identifiant reçu vérifié, pages publiques et exports). Durcissement facultatif : quelques fonctions internes (`Tasks::time`, `Tickets::messages`, `Units::seasons`…) font confiance à l'appelant pour la vérification.

**Corrigé :**

| Zone | Défaut | Correction |
|---|---|---|
| MRA | Délai dépassé après envoi : la facture était renvoyée automatiquement alors que la MRA l'avait peut-être fiscalisée (double IRN ou rejet « déjà reçue ») | Nouvel état `unknown` (« envoyé sans réponse ») : jamais renvoyé automatiquement ; vérification sur le portail MRA puis renvoi manuel ; signalé par la surveillance |
| MRA | Identifiants refusés, clé publique ou configuration fausses : toutes les factures en attente passaient en « rejeté », une authentification par facture | Erreur de compte : les factures restent en attente sans consommer d'essai, un seul appel par passage |
| MRA | Après 50 échecs, plus aucun essai, sans le dire | Le document l'indique ; la surveillance signale toute facture non fiscalisée depuis 2 h |
| MRA | `refreshToken` toujours `false` (guide MRA § 5.1.4) | `true` dans les 10 dernières minutes du jeton |
| MRA | Garde-fou production contournable (`app.env` ≠ « production » exactement, URL de test sans « sandbox ») | Tout sauf `demo`/`development` est production ; réponse `environment` ≠ `LIVE` refusée en production |
| MRA | Toute erreur contenant « token » traitée comme jeton expiré | Seul `ERR0050` |
| Facturo | « Payée » cliqué deux fois en même temps : cashback crédité deux fois | Le second changement de statut est refusé |
| Facturo | Un devis converti deux fois en même temps : deux factures | Verrou par devis |
| Facturo | Facture émise avec une date future ou antérieure à la dernière émise (numéros hors ordre chronologique) | Refusé à l'émission |
| Facturo | Avoir avec un traitement TVA absent de la facture (ex. TVA 15 % sur une facture exonérée) | Refusé |
| ShopLokal | Modifier une fiche produit remettait le stock à la valeur du formulaire (ventes faites entre-temps perdues, survente) | Seule la différence saisie est appliquée au stock réel |
| Bookora | Changer le traitement TVA d'un logement changeait le prix TTC des saisons | Prix TTC des saisons conservé |
| Suppression | Le compte d'un ancien employé était supprimé avec l'entreprise qu'il avait rejointe, effaçant son historique de congés chez l'ancien employeur | Compte anonymisé au lieu d'être supprimé quand une autre entreprise a un historique |
| Suppression | Fermeture annulée au dernier moment : entreprise supprimée quand même | Condition revérifiée sous verrou dans la transaction |
| Suppression | Entreprise suspendue ou en fermeture : pages publiques (factures, réservations, cartes, tickets, invitations…), rappels de rendez-vous et synchro iCal continuaient | Fermés tant que l'entreprise n'est pas rouverte |
| Sauvegardes | `restore.sh --replace` supprimait la base avant de savoir si la sauvegarde était lisible | Chargement dans une base à part, puis échange atomique ; anciennes tables gardées |
| Sauvegardes | Copie « avant mise à jour » en clair et jamais effacée ; sauvegardes possédées par l'utilisateur web | Sauvegarde chiffrée avant mise à jour ; compte système `mips-backup` ; clé hors serveur sans droit d'effacement |
| Surveillance | Alerte à chaque échec passager (jusqu'à ~144 e-mails/jour) ; repli `MAILTO` qui ne pouvait jamais partir ; disques des sauvegardes et de la base non surveillés | Alerte après 15 min ; ligne de crontab qui écrit sur échec ; `ops.disk_paths` |
| Divers | Fichier trop petit gardé sous son nom définitif ; deux sauvegardes simultanées ; dernière ligne de journal perdue | Corrigés |

**Ouvert, à trancher ou à valider (pas corrigé) :**

1. **Format du JSON MRA non vérifié** (bloquant). Les noms de champs et les codes du code (`totalAmtWoVatCur`, `buyerType: "VATR"`, `taxCode: "TC01"`…) diffèrent de l'exemple du guide public MRA 2023 (`totalAmtWoVat`, `"01"`…). Le fichier de structure officiel (Excel « Data Structure of an e-Invoice ») est sur le portail développeur MRA, non public. Le faux serveur des tests a été écrit d'après le code : les tests verts ne prouvent rien sur ce point. À valider en SANDBOX puis CONFORMANCE avec ce fichier.
2. **Chaînage `previousNoteHash`** : formule et portée (par type de document) non confirmées par le guide public. Une facture rejetée laisse passer les suivantes, qui la référencent.
3. ~~TAN du vendeur pris dans le n° TVA ; vendeurs non assujettis bloqués~~ : corrigé (migration 028, champ TAN distinct, `personType` NVTR, lignes « Exonéré / sans TVA » imposées sans n° TVA ; `e2e30`). Le TAN de l'acheteur a aussi son champ (migration 029, fiche client et import). À valider avec le comptable : un vendeur non assujetti ne doit facturer ni TVA ni taux zéro.
4. **Paiement** : `totalAmtPaid` = total et `salesTransactions` = `CREDIT` toujours ; `paymentMethods` jamais envoyé. Règle MRA à confirmer.
5. **Prix saisis TTC** (ShopLokal, Bookora) : le prix est stocké HT et la TVA arrondie par ligne, donc environ 13 % des prix ronds à 15 % ressortent à ±1 centime (Rs 10.00 → Rs 10.01 ; 3 × Rs 10.00 → Rs 30.02). Aucun prix HT au centime ne donne exactement certains TTC : il faut décider (avec le comptable) de calculer ces lignes à partir du TTC. Décision de règle de calcul, pas un correctif.
6. ~~ClientBloom : achat issu d'une facture annulable à la main (cashback retiré deux fois) ; double annulation simultanée en erreur 500 ; passage en caisse soumis deux fois~~ : corrigés (`e2e32`, migration 030 : clé par vente).
7. ~~ShopLokal : annuler une commande déjà facturée~~ : corrigé (facture brouillon supprimée avec la commande ; facture émise : annulation refusée tant qu'un avoir ne la couvre pas ; `e2e32`). Reste : la TVA de la livraison est recalculée au moment de la facture (écart possible si le n° TVA de l'entreprise change entre la commande et la facture).
8. **Envoi MRA dans la requête web** à l'émission : jusqu'à ~60 s d'attente si la MRA est lente.
9. ~~Le jeton MRA stocké en clair~~ : corrigé (migration 032, chiffré comme la clé de session ; cache illisible = nouvelle authentification ; `e2e30`).
10. ~~Une restauration ramène les entreprises supprimées depuis la sauvegarde~~ : corrigé pour une restauration sur le même serveur (journal des fermetures hors de la base, `tools/replay_closures.php`, `e2e25`). Reste : serveur entièrement perdu, vérification manuelle des dernières 24 h.
11. **Facture « envoyé sans réponse » en fait fiscalisée** : l'IRN relevé sur le portail MRA se saisit maintenant sur le document (propriétaire et administrateurs ; migration 032 ; `e2e30` ; `docs/incidents.md` fiche 4). Reste : le QR code ne peut pas être récupéré (appel MRA de consultation non branché faute de spec) ; la facture s'imprime avec l'IRN, sans QR.

## 6. Contrôles mécaniques

- **Lint** : `find src public templates tools -name '*.php' -print0 | xargs -0 -n1 php -l | grep -v '^No syntax'` ne doit rien afficher.
- **Migrations = schéma** : sur une base vide, charger le `schema.sql` d'un commit, appliquer la migration suivante, et comparer `mysqldump --no-data` avec le `schema.sql` du commit d'après. Fait à chaque migration pendant le développement (001 → 032), à refaire au moins une fois de 001 à 032.
- **Requêtes SQL construites par concaténation** : la revue de sécurité les a listées (`docs/revue-securite.md`) ; aucune n'utilise une donnée de la requête HTTP. À garder ainsi.

## 7. Limites connues, décidées

- Pas de tests unitaires, seulement des tests de bout en bout (lents mais proches de l'usage réel).
- Les tests tournent contre MariaDB 10.11 et Chromium seulement.
- Pas de paiement en ligne (abonnements gérés depuis le back-office ; ShopLokal et Bookora encaissent hors ligne).
- Un compte utilisateur appartient à une seule entreprise.
- L'historique d'usage ne garde que la date de passage, pas la fréquence ni le détail.
- Les textes des CGU et de la politique de confidentialité sont des versions provisoires à faire valider par un juriste.

## 8. Questions à remonter

Notez chaque problème avec le fichier et la ligne, le scénario qui le déclenche, et sa gravité (bloquant avant pilote / à corriger / remarque). Les bloquants passent avant tout nouveau développement.
