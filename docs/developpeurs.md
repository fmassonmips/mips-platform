# Guide des développeurs — my.mips.mu

Pour les programmeurs de MIPS qui reprennent, corrigent ou étendent la suite. Le visuel de l'architecture et de l'écosystème est dans `docs/architecture.html`. À lire ensuite selon le besoin : `docs/suite-architecture.md` (règles métier de chaque app), `docs/deploiement.md` (serveur), `docs/incidents.md` (support), `docs/relecture.md` (zones à risque, défauts connus), `docs/revue-securite.md`.

## 1. En une page

- **Un produit, dix apps** : Facturo, ClientBloom, RendezVous, Formelio, FlowDesk, BizPilot, TeamNest, ShopLokal, StaffZen, Bookora. Toutes sous `my.mips.mu`, un seul compte ; une entreprise active les apps dont elle a besoin (essai 30 jours, puis abonnement ou lecture seule).
- **Pile** : PHP 8.3 sans framework ni Composer, MariaDB 10.11 (MySQL 8 possible), JavaScript sans framework ni étape de build, Nginx + PHP-FPM sur Ubuntu 24.04.
- **Volume** : environ 23 000 lignes de PHP et de gabarits, 32 migrations, 34 suites de tests de bout en bout.
- **Langue** : interface et messages en français ; code, commentaires et noms en anglais ; documents clients en français ou en anglais (`App\Facturo\DocText`, `App\Bookora\Text`…).

## 2. Démarrer en local

```bash
git clone <dépôt> mips-platform && cd mips-platform
sudo mysql -e "CREATE DATABASE mips_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
sudo mysql mips_platform < sql/schema.sql
sudo mysql mips_platform < sql/seed.sql          # compte de test admin@example.com / Admin123! (jamais en production)
```

`config/config.local.php` (hors git) ne liste que ce qui change par rapport à `config/config.php` :

```php
<?php
return [
    'app'     => ['env' => 'development', 'url' => 'http://127.0.0.1:8080', 'secret_key' => '<php -r "echo base64_encode(random_bytes(32));">'],
    'db'      => ['user' => '<compte local>', 'pass' => '<mot de passe>'],
    'session' => ['secure' => false],                 // HTTP en local
];
```

```bash
php -S 127.0.0.1:8080 -t public tests/e2e/support/router.php
```

Le routeur remplace la règle Nginx qui sert `/api/facturo/documents` depuis `public/api/facturo/documents.php`. `app.env = development` affiche les erreurs ; `demo` autorise `tools/demo_seed.php` (entreprise « Le Lagon Bleu ») et les URL MRA de test ; tout le reste est traité comme de la production.

Sans serveur SMTP configuré (`mail.host` vide), aucun e-mail ne part : l'inscription s'active sans lien de confirmation. Pour voir les e-mails, lancer le faux serveur des tests : `python3 tests/e2e/support/fake_smtp.py /tmp/mails` et `'mail' => ['host' => '127.0.0.1', 'port' => 2525, 'encryption' => 'none']`.

## 3. Où est quoi

```
public/                 seul dossier exposé au web
  *.php                 pages (login, dashboard, app.php?m=<app>, pages publiques…)
  api/<app>/<x>.php     points d'entrée JSON : deux lignes, require bootstrap + contrôleur
  assets/js, css        un fichier JS par app, pas de build, pas de script en ligne (CSP)
src/
  bootstrap.php         config, autoload App\, en-têtes de sécurité, heure de Maurice, session
  Controllers/          lit la requête, vérifie les droits, appelle le métier, répond en JSON
  <App>/                classes métier de chaque app (Facturo/Documents.php…)
  Suite/                socle : Tenant (entreprise, profil), Modules, Catalog, ModuleApi, Team,
                        Closure (fermeture), DataExport, Import, Notifications, Onboarding
  Auth, Session, Csrf, RateLimiter, Database, Request, Response, Format, Secrets, Legal
  Mra/                  client de l'API MRA (chiffrement, jeton)
  Ops/                  Health (/health.php), Alerts (e-mails de surveillance)
  Backoffice/           back-office de l'équipe MIPS
templates/              gabarits PHP ; templates/modules/<app>.view.php = routeur de pages de l'app
sql/schema.sql          schéma complet d'une base neuve
sql/migrations/         NNN_nom.sql, une par évolution de structure
tools/                  tâches planifiées (*.php), install.sh, update.sh, backup.sh, restore.sh + replay_closures.php, cron.sh, ops.php
tests/e2e/              suites de bout en bout, faux serveurs, run.sh
```

## 4. Les règles qui ne se négocient pas

Chacune a déjà évité, ou causé, un vrai défaut. Une pull request qui en viole une n'est pas fusionnée.

1. **Cloisonnement.** Chaque table métier a `organization_id`, et **chaque** requête la filtre, même quand l'identifiant « vient forcément » de la bonne entreprise. Un identifiant reçu du navigateur (client, service, logement, produit…) se vérifie comme appartenant à l'entreprise *avant* d'être utilisé ou lié. Un `find($orgId, $id)` qui renvoie `null` répond 404, jamais 403 (ne pas révéler qu'il existe ailleurs).
2. **Argent en cents.** Entiers seulement (`*_cents`), jamais de `float`. Saisie et affichage par `App\Facturo\Money` (`parseCents`, `line`, `format`). TVA arrondie par ligne, de la même façon en PHP et en JavaScript.
3. **Concurrence.** Tout ce qui compte ou numérote (numéros de facture, stock, solde de cashback, réservation de dates) se fait dans une transaction, avec la ligne verrouillée (`SELECT … FOR UPDATE`) et la condition revérifiée sous le verrou. Un `UPDATE … WHERE status = :ancien` dont `rowCount()` vaut 0 est une course perdue : renvoyer une erreur, pas un succès.
4. **Heure de Maurice.** PHP et chaque connexion MariaDB sont à `+04:00` (`src/bootstrap.php`, `src/Database.php`). Utiliser `App\RendezVous\Booking::now()` en PHP, `NOW()`/`CURDATE()` en SQL ; ne jamais supposer l'heure du serveur.
5. **API d'écriture.** Toute action passe par `App\Suite\ModuleApi::context('<app>')` (POST, session, CSRF, app active et non en lecture seule), puis vérifie le rôle quand l'action est réservée (`Tenant::canManage($org)`). Les droits se vérifient côté serveur ; cacher un bouton ne protège rien.
6. **Sorties échappées.** Dans les gabarits, tout passe par `$e(...)` (`htmlspecialchars`). En JavaScript, `textContent`, jamais `innerHTML` avec une donnée. Aucun script en ligne : la CSP le bloque.
7. **SQL.** Requêtes préparées avec paramètres nommés ; pas deux fois le même nom de paramètre dans une requête (préparation native PDO) ; jamais une donnée de la requête HTTP concaténée dans du SQL.
8. **E-mails automatiques une seule fois.** Réserver avant d'envoyer, libérer si l'envoi échoue : `Notifications::claim($orgId, $kind, $ref)` puis `release(...)`. Une entreprise suspendue ou en fermeture (`Tenant::isOpen`) ne reçoit et n'envoie rien.
9. **Secrets.** Jamais dans git ni dans les journaux. Les secrets stockés en base sont chiffrés (`App\Secrets`, clé `app.secret_key`). Les liens envoyés par e-mail ne stockent que l'empreinte SHA-256 du jeton.
10. **Pages publiques** (réservation, boutique, formulaire, ticket, carte) : jetons aléatoires longs, limites par IP et par destinataire (`RateLimiter`), pot de miel, et elles ferment quand l'entreprise n'est pas ouverte (les `findByToken` vérifient `Tenant::isOpen`).

## 5. Ajouter quelque chose

### Une action dans une app existante

1. **Métier** : une méthode statique dans `src/<App>/<Classe>.php`, qui prend `$orgId` en premier argument et renvoie une erreur lisible (`?string`, ou `[$résultat, ?string]`) au lieu de lever une exception pour un cas prévu.
2. **Contrôleur** : un `case` dans `src/Controllers/<App>/<X>Controller.php`, documenté dans le commentaire d'en-tête (entrée JSON, réponses). Codes : 200 succès, 403 droits, 404 introuvable, 409 état incompatible, 422 saisie invalide.
3. **Interface** : le gabarit dans `templates/modules/<app>/`, le comportement dans `public/assets/js/<app>.js` (envoi JSON avec l'en-tête `X-CSRF-Token` lu dans `<meta name="csrf-token">`).
4. **Test** : une étape dans la suite e2e de l'app (`tests/e2e/README.md` dit laquelle couvre quoi), ou une nouvelle suite.
5. **Règle métier** : une ligne dans le tableau de l'app dans `docs/suite-architecture.md`.

### Une table ou une colonne

1. Une migration `sql/migrations/NNN_nom.sql` (numéro suivant), avec en tête ce qu'elle fait et après quelle migration elle s'applique. Elle n'ajoute que : nouvelles tables, nouvelles colonnes `NULL` ou avec défaut, index. Une colonne qu'on supprime l'est dans une migration ultérieure, une fois le code qui la lit déployé.
2. La même structure dans `sql/schema.sql` (une base neuve se crée avec lui seul).
3. Vérifier que les deux donnent la même base :
   ```bash
   # base A = schema.sql du commit précédent + la migration ; base B = schema.sql actuel
   diff <(mysqldump --no-data --skip-comments A | sed 's/AUTO_INCREMENT=[0-9]* //') \
        <(mysqldump --no-data --skip-comments B | sed 's/AUTO_INCREMENT=[0-9]* //')
   ```
4. Une table qui contient des données d'entreprise : l'ajouter à `App\Suite\DataExport::TABLES` (export complet du client) ; une table liée par une clé `RESTRICT` : à `App\Suite\Closure::DELETE_ORDER` (suppression définitive). Le test `e2e25` échoue si une table d'entreprise manque à l'export. Une table de la plateforme (journal, surveillance) : l'ajouter à la liste `internal` de `e2e25`.
5. En production, `tools/update.sh` applique les migrations pas encore reçues (table `schema_migrations`).

### Une nouvelle app

1. Une entrée dans `App\Suite\Catalog::MODULES` (slug, nom, domaine, accroche, `available`).
2. `src/<App>/`, `src/Controllers/<App>/`, `public/api/<slug>/`, `templates/modules/<slug>.view.php` (+ `templates/modules/<slug>/`), `public/assets/js/<slug>.js`.
3. Tables avec `organization_id` + migration + `schema.sql` + `DataExport` + `Closure`.
4. Si elle a des pages publiques : jetons, limites, `Tenant::isOpen`, fermeture en lecture seule (`Modules::isEnabled`).
5. Si elle produit des chiffres utiles au dirigeant : une ligne dans `App\BizPilot\Dashboard` et éventuellement le résumé du lundi (`Digest`).
6. Une suite e2e et une section dans `docs/suite-architecture.md`.

### Une tâche planifiée

Un script `tools/<tâche>.php` sur le modèle de `tools/reminders.php` : refuse de tourner hors ligne de commande, prend un verrou `GET_LOCK('<tâche>', 0)`, traite chaque entreprise dans un `try` (une entreprise en erreur n'arrête pas les autres), sort avec le code 1 en cas d'échec. Puis : une ligne dans `/etc/cron.d/mips` via `tools/install.sh` (toujours à travers `tools/cron.sh <tâche>`), le délai maximal normal dans `App\Ops\Health::JOBS` (sinon la surveillance ne la voit pas), et la ligne dans `docs/deploiement.md`.

## 6. Tests

- **Lancer** : `tests/e2e/run.sh` (toutes les suites, ~40 min) ou `tests/e2e/run.sh e2e3 e2e30`. Prérequis en tête du script : PHP 8.3, MariaDB accessible en administrateur par `mysql`, Node + Playwright + Chromium, Python 3 + `cryptography`. Le script recrée sa propre base `mips_e2e` avant chaque suite (il refuse `mips_platform`), copie le code dans `tests/.work/` et démarre un faux SMTP (port 2525), une fausse API MRA (8098) et un faux calendrier iCal (8097). Captures et e-mails reçus restent dans `tests/.work/`.
- **Écrire une suite** : `tests/e2e/e2eN.js` reçoit le dossier de travail en argument, affiche une ligne `✓` par étape vérifiée (phrase complète, lisible par un non-développeur) et finit par `ALL GREEN`. Elle peut piloter le navigateur, appeler l'API avec le jeton CSRF de la page, lire la base avec `mysql`, ou appeler une classe directement (`php -r` avec `define('MIPS_NO_SESSION', true)` et le bootstrap de la copie). Voir `e2e31.js` et `e2e32.js` pour ce dernier style.
- **Dates** : jamais de date fixe qui deviendra passée. Calculer à partir d'aujourd'hui (heure de Maurice), avec les règles de l'app (jours ouvrés, fériés). `e2e15.js` montre comment.
- **CI** (`.github/workflows/tests.yml`), à chaque pull request : syntaxe PHP/JS/shell, les suites réparties sur quatre machines, et `tools/install.sh` deux fois sur un Ubuntu neuf suivi d'une sauvegarde, d'une restauration et d'une mise à jour avec retour arrière. Une suite en échec laisse ses captures en « Artifacts ».
- **Le faux serveur MRA** a été écrit d'après le code, pas d'après la spécification officielle : un test MRA vert ne prouve rien sur le format attendu par la MRA (`docs/relecture.md` § 5).

## 7. Faire une modification

1. Une branche par sujet, une pull request par sujet ; la description dit ce qui change pour l'utilisateur, ce qui a été testé et ce qui ne l'a pas été.
2. Avant de pousser : `find src public templates tools config -name '*.php' -print0 | xargs -0 -n1 php -l | grep -v '^No syntax'` (rien ne doit s'afficher), les suites concernées, et la vérification migrations = schéma si la structure change.
3. Un défaut corrigé vient avec le test qui l'aurait attrapé.
4. Relecture humaine obligatoire pour : argent et numérotation, MRA, cloisonnement, suppression, authentification, sauvegardes.
5. Mise en production : `sudo /var/www/mips/tools/update.sh` sur le serveur (sauvegarde, migrations, vérification, retour arrière automatique si la vérification échoue).

## 8. MRA : ce qu'il faut savoir avant d'y toucher

- Code : `src/Mra/Client.php` (authentification RSA + AES-256-ECB, transmission), `src/Facturo/Fiscalisation.php` (contenu du JSON, compteur, chaînage, reprise), `tools/mra_retry.php` (toutes les 5 minutes).
- États d'un document : `pending` (à envoyer ou en reprise), `fiscalised` (IRN + QR), `rejected` (refusé par la MRA, corrigé puis renvoyé à la main), `unknown` (envoyé sans réponse : **jamais renvoyé automatiquement**, vérifier sur le portail MRA ; s'il y est, le propriétaire saisit l'IRN sur le document, `Fiscalisation::enterIrn`, sans QR). Jeton et clé de session MRA chiffrés en base (`Secrets`).
- Une erreur de compte (identifiants, clé, configuration) laisse tous les documents en attente sans consommer d'essai ; une erreur d'un document le rejette seul.
- En production (`app.env` ni `demo` ni `development`), les URL de test et toute réponse dont l'environnement n'est pas `LIVE` sont refusées.
- **Non vérifié** contre la spécification officielle : noms des champs, codes, chaînage `previousNoteHash`, champs de paiement. À valider en SANDBOX puis CONFORMANCE avec le fichier de structure du portail développeur MRA avant toute facture réelle.

## 9. Glossaire

| Terme | Sens |
|---|---|
| Entreprise / organisation | Le client de MIPS (`organizations`) ; ses membres sont dans `organization_users` (owner, admin, member). |
| App / module | Une des dix apps du catalogue, activée par entreprise (`organization_modules`). |
| Lecture seule | Essai terminé sans abonnement : tout se consulte et s'exporte, rien ne s'écrit, les pages publiques ferment. |
| BRN | Business Registration Number (registre des sociétés). |
| TAN | Tax Account Number, numéro fiscal MRA (8 chiffres), distinct du n° TVA. |
| EBS | E-invoicing Billing System : le logiciel déclaré à la MRA (ici, Facturo). |
| IRN | Identifiant renvoyé par la MRA pour une facture fiscalisée, avec un QR code. |
| TC01 / TC02 / TC03 | TVA 15 %, taux zéro, exonéré. |
