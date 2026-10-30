# Mise en ligne de my.mips.mu

Guide pour installer la suite sur un serveur de production (ou de démonstration), puis la liste à cocher avant d'y mettre les données d'un client.

## 1. Ce qu'il faut

| Élément | Version / remarque |
|---|---|
| Serveur | Linux (Ubuntu 22.04/24.04 LTS ou Debian 12), 2 vCPU, 4 Go de RAM suffisent pour les pilotes |
| PHP | 8.3, en PHP-FPM, avec les extensions `pdo_mysql`, `mbstring`, `openssl`, `sodium`, `curl`, `iconv` |
| Base de données | MariaDB 10.6+ (ou MySQL 8), `utf8mb4` |
| Serveur web | Nginx (exemple ci-dessous) ou Apache, **racine web = `public/`** |
| HTTPS | Certificat valide (Let's Encrypt) ; les cookies de session sont `Secure` |
| E-mail | Un service d'envoi SMTP (Brevo, Postmark, Amazon SES…) avec SPF, DKIM et DMARC sur le domaine d'envoi |
| Horloge | Fuseau du serveur indifférent : l'application écrit l'heure de Maurice elle-même |

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

Les migrations (`sql/migrations/001` → `021`) servent à mettre à jour une base existante ; une base neuve se crée avec `schema.sql`, qui les contient toutes. Les migrations modifient la structure : les passer avec un compte administrateur MariaDB, pas avec `mips_app`.

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

```
*/5 * * * * php /var/www/mips/tools/mra_retry.php            >> /var/log/mips/cron.log 2>&1
15 2 * * *  php /var/www/mips/tools/clientbloom_expire.php   >> /var/log/mips/cron.log 2>&1
0 * * * *   php /var/www/mips/tools/rendezvous_reminders.php >> /var/log/mips/cron.log 2>&1
20 * * * *  php /var/www/mips/tools/bookora_ical_sync.php    >> /var/log/mips/cron.log 2>&1
```

Chaque script refuse de tourner hors ligne de commande et prend un verrou : deux exécutions simultanées ne se gênent pas. Une entreprise en erreur n'arrête pas les autres ; le script sort alors avec le code 1. **Alerter sur ce code** (par exemple `MAILTO=ops@mips.mu` en tête de crontab avec `|| echo "échec"`, ou une sonde type Healthchecks.io) : une transmission MRA bloquée ne doit pas passer inaperçue.

### Réseau sortant

Le serveur n'a besoin de joindre que : le service SMTP, les URL MRA et les calendriers iCal des plateformes (https, port 443). Le code refuse déjà les adresses internes pour les calendriers ; un pare-feu sortant (`ufw default deny outgoing` + autorisations 443, port SMTP, DNS, NTP, dépôts de mises à jour) ajoute une seconde barrière, et bloque l'adresse de métadonnées du fournisseur cloud (`169.254.169.254`).

### Valeurs de `app.env`

| Valeur | Usage | Effet |
|---|---|---|
| `production` | serveur réel | erreurs masquées ; **URL MRA sandbox/simulation refusées** ; `demo_seed.php` refusé |
| `demo` | instance de démonstration | erreurs masquées ; sandbox MRA autorisée ; `demo_seed.php` autorisé |
| `development` | poste du développeur | erreurs affichées — jamais sur un serveur accessible |

## 3. Sauvegardes

- Base complète chaque nuit, chiffrée, copiée hors du serveur (autre région / autre fournisseur), 30 jours de rétention :
  `mysqldump --single-transaction --routines mips_platform | gzip | gpg -e -r <clé> > mips-$(date +%F).sql.gz.gpg`
- `config/config.local.php` et `app.secret_key` : dans le coffre-fort de l'équipe. Sans la clé, les mots de passe MRA enregistrés sont perdus.
- **Tester une restauration** sur un serveur vierge avant le premier pilote, puis chaque trimestre. Une sauvegarde jamais restaurée ne compte pas.

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
- [ ] Pare-feu sortant en place ; alerte sur l'échec des cron
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
- [ ] Sauvegarde nocturne en place **et restauration testée**
- [ ] CGU / politique de confidentialité publiées (Data Protection Act 2017 de Maurice : finalités, durée de conservation, sous-traitants — hébergeur, service e-mail) — à valider par un juriste
- [ ] Enregistrement comme « controller / processor » auprès du Data Protection Office si requis — à vérifier
- [ ] Règle de conservation des données d'un client qui ne s'abonne pas, écrite dans les CGU
