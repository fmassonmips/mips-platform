# Mise en ligne de my.mips.mu

Guide pour installer la suite sur un serveur de production (ou de démonstration), puis la liste à cocher avant d'y mettre les données d'un client. Avant la première mise en production, le code doit avoir été relu : voir `docs/relecture.md` et `tests/e2e/run.sh`.

## 1. Ce qu'il faut

| Élément | Version / remarque |
|---|---|
| Serveur | Linux (Ubuntu 22.04/24.04 LTS ou Debian 12), 2 vCPU, 4 Go de RAM suffisent pour les pilotes |
| PHP | 8.3, en PHP-FPM, avec les extensions `pdo_mysql`, `mbstring`, `openssl`, `sodium`, `curl`, `iconv` |
| Base de données | MariaDB 10.6+ (ou MySQL 8), `utf8mb4` |
| Serveur web | Nginx (exemple ci-dessous) ou Apache, **racine web = `public/`** |
| HTTPS | Certificat valide (Let's Encrypt) ; les cookies de session sont `Secure` |
| E-mail | Un service d'envoi SMTP (Brevo, Postmark, Amazon SES…) avec SPF, DKIM et DMARC sur le domaine d'envoi |
| Horloge | Fuseau du serveur indifférent : l'application se met à l'heure de Maurice (PHP et chaque connexion à la base). Garder l'horloge synchronisée (NTP) ; les sauvegardes et requêtes SQL lancées à la main avec `mysql` sont en heure du serveur, sauf `SET time_zone = '+04:00'` |

Seul `public/` est exposé au web. `src/`, `config/`, `templates/`, `sql/` et `tools/` restent hors de la racine web.

## 2. Installation

```bash
# 1. Code
sudo mkdir -p /var/www/mips && sudo chown deploy:deploy /var/www/mips
git clone <dépôt> /var/www/mips && cd /var/www/mips

# 2. Base de données et utilisateur applicatif (droits limités, pas root)
sudo mysql <<'SQL'
CREATE DATABASE mips_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mips_app'@'localhost' IDENTIFIED BY '<mot de passe long et aléatoire>';
GRANT SELECT, INSERT, UPDATE, DELETE ON mips_platform.* TO 'mips_app'@'localhost';
SQL
sudo mysql mips_platform < sql/schema.sql      # base neuve : schéma complet
# NE PAS charger sql/seed.sql en production (compte de test admin@example.com / Admin123!).

# 3. Réglages du serveur (jamais dans git)
cp config/config.local.example.php config/config.local.php
php -r 'echo base64_encode(random_bytes(32)), PHP_EOL;'   # → app.secret_key, à garder aussi dans le coffre-fort
nano config/config.local.php
sudo chown deploy:www-data config/config.local.php && sudo chmod 640 config/config.local.php
```

Les migrations (`sql/migrations/001` → `027`) servent à mettre à jour une base existante ; une base neuve se crée avec `schema.sql`, qui les contient toutes. Les migrations modifient la structure : les passer avec un compte administrateur MariaDB, pas avec `mips_app`.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name my.mips.mu;
    root /var/www/mips/public;
    index index.php;

    ssl_certificate     /etc/letsencrypt/live/my.mips.mu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/my.mips.mu/privkey.pem;

    client_max_body_size 2m;            # photos réduites dans le navigateur (≤ 400 Ko)

    # Les API sont appelées sans « .php » (/api/facturo/documents → documents.php)
    location /api/ {
        rewrite ^(/api/[a-z0-9_/-]+)$ $1.php last;
        return 404;
    }
    # Back-office : réseau du bureau ou VPN seulement (avant le bloc .php général)
    location ~ ^/(backoffice\.php|api/backoffice/.+\.php)$ {
        allow <IP du bureau ou du VPN>;
        deny all;
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }
    location /assets/ { expires 7d; access_log off; }
    location ~ /\. { deny all; }
}
server { listen 80; server_name my.mips.mu; return 301 https://$host$request_uri; }
```

**Derrière un proxy ou un CDN (Cloudflare, répartiteur de charge)** : l'application lit l'adresse du client dans `REMOTE_ADDR`, sur laquelle reposent toutes les limites (connexion, inscription, formulaires publics). Sans réglage, tous les visiteurs auraient l'adresse du proxy et se bloqueraient entre eux. Configurer le serveur web pour réécrire `REMOTE_ADDR` avec la vraie adresse, **uniquement depuis les adresses du proxy** (Nginx : `set_real_ip_from <plages du proxy>; real_ip_header X-Forwarded-For;` — Apache : `mod_remoteip`). Ne jamais faire confiance à `X-Forwarded-For` venant d'Internet.

Ce bloc a été testé avec Nginx 1.24 et PHP-FPM 8.3 (`nginx -t`, puis les parcours inscription, équipe, Facturo et back-office dans un navigateur). `snippets/fastcgi-php.conf` contient déjà son propre `try_files` : ne pas en ajouter un second dans les blocs `.php` (Nginx refuse de démarrer).

Vérifier après installation : `curl -I https://my.mips.mu/login.php` doit renvoyer les en-têtes `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` (posés par l'application).

### PHP (php.ini de FPM)

```
display_errors = Off
log_errors = On
expose_php = Off
session.use_strict_mode = 1
memory_limit = 256M
post_max_size = 2M
```

### Tâches planifiées (crontab de l'utilisateur PHP)

Chaque tâche passe par `tools/cron.sh <nom> <commande>`, qui date chaque ligne du journal et enregistre le résultat pour la surveillance (§ 3 bis). Heures en UTC (Maurice = UTC + 4).

```
MAILTO=ops@mips.mu
C=/var/www/mips/tools/cron.sh
L=/var/log/mips/cron.log
*/5 * * * *  $C mra_retry            php /var/www/mips/tools/mra_retry.php            >> $L 2>&1
15 2 * * *   $C clientbloom_expire   php /var/www/mips/tools/clientbloom_expire.php   >> $L 2>&1
0 * * * *    $C rendezvous_reminders php /var/www/mips/tools/rendezvous_reminders.php >> $L 2>&1
20 * * * *   $C bookora_ical_sync    php /var/www/mips/tools/bookora_ical_sync.php    >> $L 2>&1
5 5 * * *    $C reminders            php /var/www/mips/tools/reminders.php            >> $L 2>&1   # 9 h 05 à Maurice : fins d'essai, factures en retard, résumé du lundi
45 22 * * *  $C purge_companies      php /var/www/mips/tools/purge_companies.php      >> $L 2>&1   # comptes fermés depuis 30 jours ; historique d'usage de plus de 13 mois
45 21 * * *  $C backup               /var/www/mips/tools/backup.sh                    >> $L 2>&1   # 1 h 45 à Maurice
*/10 * * * * $C watchdog             php /var/www/mips/tools/ops.php watchdog         >> $L 2>&1
```

Chaque script refuse de tourner hors ligne de commande et prend un verrou : deux exécutions simultanées ne se gênent pas. Une entreprise en erreur n'arrête pas les autres ; le script sort alors avec le code 1, que la surveillance signale.

### Réseau sortant

Le serveur n'a besoin de joindre que : le service SMTP, les URL MRA et les calendriers iCal des plateformes (https, port 443). Le code refuse déjà les adresses internes pour les calendriers ; un pare-feu sortant (`ufw default deny outgoing` + autorisations 443, port SMTP, DNS, NTP, dépôts de mises à jour) ajoute une seconde barrière, et bloque l'adresse de métadonnées du fournisseur cloud (`169.254.169.254`).

### Valeurs de `app.env`

| Valeur | Usage | Effet |
|---|---|---|
| `production` | serveur réel | erreurs masquées ; **URL MRA sandbox/simulation refusées** ; `demo_seed.php` refusé |
| `demo` | instance de démonstration | erreurs masquées ; sandbox MRA autorisée ; `demo_seed.php` autorisé |
| `development` | poste du développeur | erreurs affichées — jamais sur un serveur accessible |

## 3. Sauvegardes

`tools/backup.sh` sauvegarde chaque nuit **toute la base** (les images des boutiques et logements y sont aussi) et `config/config.local.php`, chiffrées avec la **clé publique** de sauvegarde de MIPS. La clé privée ne va jamais sur le serveur : qui vole le serveur ou une copie de sauvegarde ne peut rien lire. Le script garde 30 jours sur le serveur et copie chaque sauvegarde **hors du serveur** ; sans copie hors serveur configurée, il sort en erreur (une sauvegarde sur le même disque disparaît avec lui), sauf `MIPS_BACKUP_LOCAL_ONLY=1`.

**Une fois, sur le poste d'un responsable (pas le serveur)** :

```bash
gpg --quick-gen-key "MIPS sauvegardes <ops@mips.mu>" default default never   # phrase de passe longue, dans le coffre-fort
gpg --armor --export ops@mips.mu > backup-public-key.asc                      # à copier sur le serveur
gpg --armor --export-secret-keys ops@mips.mu > backup-private-key.asc         # coffre-fort + une copie hors ligne (clé USB au coffre)
```

Perdre la clé privée ou sa phrase de passe = perdre toutes les sauvegardes. La garder à deux endroits, connue d'au moins deux personnes.

**Sur le serveur** :

```bash
sudo mkdir -p /etc/mips /var/backups/mips && sudo chown www-data /var/backups/mips && sudo chmod 700 /var/backups/mips
sudo cp backup-public-key.asc /etc/mips/
sudo mysql -e "CREATE USER 'mips_backup'@'localhost' IDENTIFIED BY '<mot de passe>';
  GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT ON mips_platform.* TO 'mips_backup'@'localhost';"
printf '[client]\nuser=mips_backup\npassword=<mot de passe>\n' | sudo tee /etc/mips/backup.my.cnf >/dev/null
printf 'MIPS_BACKUP_RCLONE_REMOTE=b2:mips-backups\n' | sudo tee /etc/mips/backup.env >/dev/null   # ou MIPS_BACKUP_RSYNC_TARGET=…
sudo chown www-data /etc/mips/backup.my.cnf /etc/mips/backup.env && sudo chmod 600 /etc/mips/backup.my.cnf /etc/mips/backup.env
sudo -u www-data /var/www/mips/tools/cron.sh backup /var/www/mips/tools/backup.sh   # premier essai à la main
```

Copie hors serveur : `rclone` (Backblaze B2, S3, Google Drive… configuré avec `rclone config` par l'utilisateur www-data) ou `rsync` vers une autre machine. Chez un autre fournisseur ou dans une autre région que le serveur. La durée de conservation hors serveur se règle chez ce fournisseur (règle de cycle de vie, par ex. 90 jours) ; un compte qui ne peut qu'**ajouter** des fichiers protège aussi contre un pirate qui voudrait effacer les sauvegardes depuis le serveur.

**Restaurer** (sur une machine qui a la clé privée) :

```bash
tools/restore.sh mips-2026-11-02-214500.sql.gz.gpg mips_restore             # dans une base à part, pour vérifier
tools/restore.sh mips-2026-11-02-214500.sql.gz.gpg mips_platform --replace   # reprise après sinistre
gpg --decrypt mips-2026-11-02-214500-config.php.gpg > config/config.local.php
```

Le script vérifie l'empreinte (`.sha256`), refuse une base qui contient déjà des tables sans `--replace`, puis affiche le nombre de tables et quelques comptages. La CI restaure une sauvegarde à chaque pull request et compare chaque table à l'original (`tests/e2e/e2e29.js`).

**Tester une restauration** sur une machine vierge avant le premier pilote, puis chaque trimestre : restaurer, faire pointer une copie de l'application dessus, se connecter, ouvrir une facture. Une sauvegarde jamais restaurée ne compte pas.

## 3 bis. Surveillance

- **E-mail d'alerte** : `tools/ops.php watchdog` (toutes les 10 minutes) écrit à `ops.alert_email` quand une tâche planifiée échoue, ne tourne plus (par exemple aucune transmission MRA réussie depuis 30 minutes, aucune sauvegarde depuis 26 heures) ou que le disque est plein à plus de 90 %. Un e-mail quand le problème apparaît, un rappel par jour tant qu'il dure, un « Résolu » quand il disparaît. Si l'e-mail ne part pas, la tâche sort en erreur et cron écrit à `MAILTO`.
- **Sonde externe** : `https://my.mips.mu/health.php` répond `200 ok`, ou `503 degraded` si la base ne répond pas ou qu'un problème ci-dessus est en cours. Une sonde gratuite (UptimeRobot, Healthchecks.io…) qui l'appelle toutes les 5 minutes alerte aussi quand le serveur entier est arrêté, ce que le serveur ne peut pas signaler lui-même. La page ne dit rien de plus.
- **Détail** : `php tools/ops.php status` sur le serveur.
- Une instance qui ne fait pas tourner une tâche (la démonstration sans sauvegarde, par exemple) la déclare dans `ops.skip_jobs`.

## 4. Mise à jour

```bash
cd /var/www/mips
mysqldump --single-transaction mips_platform | gzip > /backup/avant-maj-$(date +%F-%H%M).sql.gz
git pull
sudo mysql mips_platform < sql/migrations/0XX_….sql     # seulement les nouvelles, dans l'ordre
sudo systemctl reload php8.3-fpm
```

## 5. Démonstration

Sur une instance **séparée** (ex. `demo.my.mips.mu`, base à part, `app.env = demo`) :
`php tools/demo_seed.php --yes --reset --password='…'` chaque matin de démo (voir `suite-architecture.md`). Jamais sur la base de production.

## 6. Back-office et abonnements

En attendant le paiement en ligne, l'équipe MIPS suit les entreprises et gère les abonnements dans `https://my.mips.mu/backoffice.php` : abonner, mettre fin, prolonger un essai, suspendre, noter un appel. Accès : adresses listées dans `backoffice.staff` de `config.local.php`, chacune avec son propre compte MIPS (jamais un compte partagé).

Le back-office agit sur toutes les entreprises : le bloc Nginx ci-dessus le limite au réseau du bureau ou au VPN (403 pour toute autre adresse, en plus du 404 pour qui n'est pas dans `backoffice.staff`).

En ligne de commande, `php tools/subscribe.php --org=<id> [--app=<slug>|all [--end]]` fait la même chose sans journal.

## 7. Liste à cocher avant le premier pilote

**Serveur**
- [ ] HTTPS valide, redirection http → https, en-têtes de sécurité présents (`curl -I`)
- [ ] Racine web = `public/` ; `https://my.mips.mu/../config/config.php` et `/src/` inaccessibles
- [ ] `display_errors = Off` ; journaux PHP et cron écrits et tournés (logrotate)
- [ ] Pare-feu : 22 (clé SSH uniquement), 80, 443 ; MariaDB écoute sur 127.0.0.1 seulement
- [ ] Mises à jour de sécurité automatiques (unattended-upgrades)

**Application**
- [ ] `config/config.local.php` rempli, droits 640, absent de git
- [ ] `app.secret_key` générée et copiée dans le coffre-fort
- [ ] `app.env = production`, `app.url` = l'adresse publique exacte (liens des e-mails)
- [ ] Base créée avec `schema.sql` **sans** `seed.sql` ; utilisateur `mips_app` sans droits de structure
- [ ] `bookora.ical_allow_private = false`
- [ ] Derrière un proxy/CDN : vraie adresse client restaurée (`real_ip`), testée en se trompant 6 fois de mot de passe depuis un téléphone : seul ce téléphone est bloqué
- [ ] Pare-feu sortant en place
- [ ] `ops.alert_email` renseigné ; `php tools/ops.php status` affiche `OK` ; sonde externe sur `/health.php` ; alerte reçue en arrêtant une tâche (test)
- [ ] `billing.contact_email` renseigné
- [ ] `backoffice.staff` rempli (comptes nominatifs de l'équipe) ; back-office limité à l'IP du bureau ou au VPN
- [ ] Cron installés ; première exécution manuelle de chaque script sans erreur

**E-mail**
- [ ] SMTP configuré ; SPF, DKIM, DMARC valides (tester avec mail-tester.com : 9/10 minimum)
- [ ] Parcours testé de bout en bout : inscription → e-mail de confirmation reçu (pas en indésirables) → connexion ; mot de passe oublié ; invitation d'un collègue

**MRA**
- [ ] Sandbox validée avec le compte développeur, puis test drive passé
- [ ] URL LIVE et clé publique MRA en place avant la première facture réelle

**Données et légal**
- [ ] Sauvegarde nocturne en place, copiée hors serveur, **et restauration testée** sur une machine vierge (§ 3)
- [ ] Clé privée de sauvegarde et sa phrase de passe à deux endroits, connues de deux personnes
- [ ] Bloc `legal` de `config.local.php` rempli (raison sociale, adresse, BRN, e-mails, hébergeur, service d'e-mail) : plus aucun « [… à compléter] » sur /cgu.php et /confidentialite.php ; `draft => false` une fois les textes validés par le juriste
- [ ] CGU / politique de confidentialité publiées (Data Protection Act 2017 de Maurice : finalités, durée de conservation, sous-traitants — hébergeur, service e-mail) — à valider par un juriste
- [ ] Enregistrement comme « controller / processor » auprès du Data Protection Office si requis — à vérifier
- [ ] Règle de conservation des données d'un client qui ne s'abonne pas, écrite dans les CGU
