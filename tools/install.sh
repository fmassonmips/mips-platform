#!/usr/bin/env bash
# Sets up a fresh Ubuntu 24.04 server for my.mips.mu, as docs/deploiement.md
# describes: Nginx (+ Let's Encrypt), PHP-FPM 8.3, MariaDB with its two
# accounts, the scheduled jobs, the backup account, logrotate, firewall and
# automatic security updates. Run as root from the code checkout:
#
#   sudo MIPS_DOMAIN=my.mips.mu MIPS_ADMIN_EMAIL=ops@mips.mu MIPS_OFFICE_IPS="203.0.113.10" tools/install.sh
#
# Safe to run again (after an update, or to repair): it never overwrites
# config/config.local.php, the database content, the backup settings or a
# certificate; it regenerates only the files it owns (marked "managed").
#
# Settings (environment, or /etc/mips/install.env):
#   MIPS_DOMAIN        public host name (required), e.g. my.mips.mu
#   MIPS_ADMIN_EMAIL   receives alerts, cron mail and Let's Encrypt notices (required)
#   MIPS_OFFICE_IPS    addresses allowed to open the back-office, space-separated (empty: nobody)
#   MIPS_ENV           production (default) or demo
#   MIPS_CERTBOT=0     skip the Let's Encrypt certificate (DNS not pointing here yet, tests)
#   MIPS_FIREWALL=0    leave the firewall alone
# Exits non-zero on the first failed step; prints what is left to do by hand.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)." >&2; exit 1; }
APP=$(cd "$(dirname "$0")/.." && pwd)
[ -f /etc/mips/install.env ] && . /etc/mips/install.env
DOMAIN=${MIPS_DOMAIN:?MIPS_DOMAIN is required (e.g. my.mips.mu)}
ADMIN=${MIPS_ADMIN_EMAIL:?MIPS_ADMIN_EMAIL is required}
OFFICE=${MIPS_OFFICE_IPS:-}
ENVNAME=${MIPS_ENV:-production}
CERTBOT=${MIPS_CERTBOT:-1}
FIREWALL=${MIPS_FIREWALL:-1}
DB=mips_platform
PHPV=8.3
[[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || { echo "Invalid MIPS_DOMAIN: $DOMAIN" >&2; exit 1; }
[[ "$ENVNAME" =~ ^(production|demo)$ ]] || { echo "MIPS_ENV must be production or demo." >&2; exit 1; }
for ip in $OFFICE; do [[ "$ip" =~ ^[0-9a-fA-F.:/]+$ ]] || { echo "Invalid address in MIPS_OFFICE_IPS: $ip" >&2; exit 1; }; done

step() { printf '\n== %s\n' "$*"; }
todo=()
password() { php -r 'echo bin2hex(random_bytes(24));' 2>/dev/null || openssl rand -hex 24; }
managed="# Managed by tools/install.sh — changes here are overwritten on the next run."

step "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q nginx mariadb-server mariadb-client \
    "php$PHPV-fpm" "php$PHPV-cli" "php$PHPV-mysql" "php$PHPV-mbstring" "php$PHPV-curl" "php$PHPV-xml" "php$PHPV-zip" \
    certbot gnupg rsync rclone ufw unattended-upgrades logrotate cron curl
systemctl enable --now mariadb "php$PHPV-fpm" nginx cron
php -r 'foreach (["pdo_mysql","mbstring","openssl","sodium","curl","iconv"] as $e) if (!extension_loaded($e)) { fwrite(STDERR, "PHP extension missing: $e\n"); exit(1); }'

step "Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<EOF
$managed
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

step "MariaDB: local only, database and accounts"
cat > /etc/mysql/mariadb.conf.d/99-mips.cnf <<EOF
$managed
[mysqld]
bind-address = 127.0.0.1
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
EOF
systemctl restart mariadb
mysql -e "CREATE DATABASE IF NOT EXISTS \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
tables=$(mysql -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$DB'")
if [ "$tables" -eq 0 ]; then
    sed "1,12{/^CREATE DATABASE/,/;/d;/^USE /d}" "$APP/sql/schema.sql" | mysql "$DB"
    # schema.sql already contains every migration: record them, so tools/update.sh applies only later ones.
    for f in "$APP"/sql/migrations/*.sql; do
        mysql "$DB" -e "INSERT IGNORE INTO schema_migrations (version) VALUES ('$(basename "$f")')"
    done
    echo "Schema loaded (no seed: no test account in production)."
else
    echo "Database already has $tables tables: kept. New migrations (sql/migrations) are applied by hand, see docs/deploiement.md § 4."
fi

install -d -m 750 -o root -g www-data /etc/mips
local_cfg="$APP/config/config.local.php"
if [ ! -f "$local_cfg" ]; then
    app_pass=$(password)
    mysql -e "CREATE USER IF NOT EXISTS 'mips_app'@'localhost' IDENTIFIED BY '$app_pass'; ALTER USER 'mips_app'@'localhost' IDENTIFIED BY '$app_pass';"
    secret=$(php -r 'echo base64_encode(random_bytes(32));')
    umask 027
    cat > "$local_cfg" <<PHP
<?php
// Written by tools/install.sh on $(date +%F). Fill in what is marked TODO (docs/deploiement.md § 7).
// Keep a copy of app.secret_key in the password safe: without it the stored MRA passwords are lost.
return [
    'app'        => ['env' => '$ENVNAME', 'url' => 'https://$DOMAIN', 'secret_key' => '$secret'],
    'db'         => ['host' => '127.0.0.1', 'name' => '$DB', 'user' => 'mips_app', 'pass' => '$app_pass'],
    'mail'       => ['host' => '', 'port' => 587, 'encryption' => 'tls', 'username' => '', 'password' => '', 'from_address' => 'no-reply@mips.mu'],   // TODO SMTP
    'mra'        => ['auth_url' => '', 'transmit_url' => ''],   // TODO LIVE URLs after the MRA test drive
    'ops'        => ['alert_email' => '$ADMIN'],
    'billing'    => ['contact_email' => ''],                    // TODO
    'legal'      => ['draft' => true, 'company' => '', 'address' => '', 'brn' => '', 'contact_email' => '', 'privacy_email' => '', 'host' => '', 'mail_provider' => ''],   // TODO
    'backoffice' => ['staff' => []],                            // TODO MIPS team e-mails
];
PHP
    umask 022
    chown root:www-data "$local_cfg"; chmod 640 "$local_cfg"
    echo "config/config.local.php written (database password and secret_key generated)."
    todo+=("Copy app.secret_key from $local_cfg into the password safe.")
else
    echo "config/config.local.php exists: kept."
    mysql -N -e "SELECT 1 FROM mysql.user WHERE user = 'mips_app' AND host = 'localhost'" | grep -q 1 \
        || { echo "config.local.php exists but the MariaDB account mips_app does not: create it with the password from the file." >&2; exit 1; }
fi
mysql -e "GRANT SELECT, INSERT, UPDATE, DELETE ON \`$DB\`.* TO 'mips_app'@'localhost'"
grep -q "'secure' *=> *false" "$local_cfg" && todo+=("config.local.php sets session.secure = false: remove it on a public server.")

step "Backup account (mips-backup)"
id mips-backup >/dev/null 2>&1 || useradd --system --home-dir /var/backups/mips --shell /usr/sbin/nologin mips-backup
usermod -aG www-data mips-backup   # reads config.local.php to back it up
install -d -m 700 -o mips-backup -g mips-backup /var/backups/mips
if [ ! -f /etc/mips/backup.my.cnf ]; then
    bk_pass=$(password)
    mysql -e "CREATE USER IF NOT EXISTS 'mips_backup'@'localhost' IDENTIFIED BY '$bk_pass'; ALTER USER 'mips_backup'@'localhost' IDENTIFIED BY '$bk_pass';"
    printf '[client]\nuser=mips_backup\npassword=%s\n' "$bk_pass" > /etc/mips/backup.my.cnf
fi
mysql -e "GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT ON \`$DB\`.* TO 'mips_backup'@'localhost'"
[ -f /etc/mips/backup.env ] || printf '# Off-site copy (required): MIPS_BACKUP_RCLONE_REMOTE=b2:mips-backups or MIPS_BACKUP_RSYNC_TARGET=user@host:/path/\n' > /etc/mips/backup.env
chown mips-backup:mips-backup /etc/mips/backup.my.cnf /etc/mips/backup.env; chmod 600 /etc/mips/backup.my.cnf /etc/mips/backup.env
[ -f /etc/mips/backup-public-key.asc ] || todo+=("Put the backup PUBLIC key in /etc/mips/backup-public-key.asc (docs/deploiement.md § 3) — no backup runs without it.")
grep -q '^MIPS_BACKUP_\(RCLONE_REMOTE\|RSYNC_TARGET\)=' /etc/mips/backup.env || todo+=("Set the off-site copy in /etc/mips/backup.env, then: sudo -u mips-backup $APP/tools/cron.sh backup $APP/tools/backup.sh")

step "PHP"
cat > "/etc/php/$PHPV/fpm/conf.d/99-mips.ini" <<EOF
; $managed
display_errors = Off
log_errors = On
error_log = /var/log/mips/php.log
expose_php = Off
session.use_strict_mode = 1
memory_limit = 256M
post_max_size = 2M
upload_max_filesize = 2M
date.timezone = Indian/Mauritius
EOF
install -d -m 750 -o www-data -g adm /var/log/mips
touch /var/log/mips/php.log /var/log/mips/cron.log; chown www-data:adm /var/log/mips/*.log
systemctl restart "php$PHPV-fpm"

step "Nginx"
cert="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
office=""; for ip in $OFFICE; do office="$office        allow $ip;"$'\n'; done
[ -n "$OFFICE" ] || todo+=("Back-office closed to everyone: set MIPS_OFFICE_IPS (office or VPN address) and run this script again.")
write_site() {
    local tls=$1
    {
        echo "$managed"
        if [ "$tls" = 1 ]; then
            echo "server { listen 80; listen [::]:80; server_name $DOMAIN; location /.well-known/acme-challenge/ { root $APP/public; } location / { return 301 https://\$host\$request_uri; } }"
            echo "server {"
            echo "    listen 443 ssl http2; listen [::]:443 ssl http2;"
            echo "    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;"
            echo "    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;"
        else
            echo "server {"
            echo "    listen 80; listen [::]:80;   # no certificate yet: HTTPS added by tools/install.sh once it exists"
        fi
        cat <<NGINX
    server_name $DOMAIN;
    root $APP/public;
    index index.php;
    client_max_body_size 2m;
    server_tokens off;

    location /.well-known/acme-challenge/ { root $APP/public; }
    location /api/ {
        rewrite ^(/api/[a-z0-9_/-]+)\$ \$1.php last;
        return 404;
    }
    location ~ ^/(backoffice\.php|api/backoffice/.+\.php)\$ {
${office}        deny all;
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php$PHPV-fpm.sock;
    }
    location ~ \.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php$PHPV-fpm.sock;
    }
    location /assets/ { expires 7d; access_log off; }
    location ~ /\. { deny all; }
}
NGINX
    } > /etc/nginx/sites-available/mips
}
write_site "$([ -f "$cert" ] && echo 1 || echo 0)"
ln -sf /etc/nginx/sites-available/mips /etc/nginx/sites-enabled/mips
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
if [ ! -f "$cert" ] && [ "$CERTBOT" = 1 ]; then
    certbot certonly --webroot -w "$APP/public" -d "$DOMAIN" --email "$ADMIN" --agree-tos -n
    write_site 1; nginx -t; systemctl reload nginx
    printf '%s\n' '#!/bin/sh' 'systemctl reload nginx' > /etc/letsencrypt/renewal-hooks/deploy/mips-nginx; chmod 755 /etc/letsencrypt/renewal-hooks/deploy/mips-nginx
fi
[ -f "$cert" ] || todo+=("No HTTPS certificate yet (logins need HTTPS): point $DOMAIN to this server, then run this script again without MIPS_CERTBOT=0.")

step "Scheduled jobs"
C="$APP/tools/cron.sh"; L=/var/log/mips/cron.log
cat > /etc/cron.d/mips <<EOF
$managed
# Times in UTC (Mauritius = UTC + 4). Every job goes through tools/cron.sh (supervision).
MAILTO=$ADMIN
SHELL=/bin/bash
*/5 * * * *  www-data    $C mra_retry            php $APP/tools/mra_retry.php            >> $L 2>&1
15 2 * * *   www-data    $C clientbloom_expire   php $APP/tools/clientbloom_expire.php   >> $L 2>&1
0 * * * *    www-data    $C rendezvous_reminders php $APP/tools/rendezvous_reminders.php >> $L 2>&1
20 * * * *   www-data    $C bookora_ical_sync    php $APP/tools/bookora_ical_sync.php    >> $L 2>&1
5 5 * * *    www-data    $C reminders            php $APP/tools/reminders.php            >> $L 2>&1
45 22 * * *  www-data    $C purge_companies      php $APP/tools/purge_companies.php      >> $L 2>&1
*/10 * * * * www-data    $C watchdog             php $APP/tools/ops.php watchdog         >> $L 2>&1 || echo "Alert not sent by e-mail: see $L"
45 21 * * *  mips-backup $C backup               $APP/tools/backup.sh                    >> /var/backups/mips/backup.log 2>&1
EOF
chmod 644 /etc/cron.d/mips
command -v sendmail >/dev/null || todo+=("No local sendmail: cron's own mail to $ADMIN (the last-resort alert) cannot leave. Install msmtp-mta and point it at the SMTP service.")

step "Log rotation"
cat > /etc/logrotate.d/mips <<EOF
$managed
/var/log/mips/*.log {
    weekly
    rotate 12
    compress
    delaycompress
    missingok
    notifempty
    su www-data adm
    create 0640 www-data adm
}
/var/backups/mips/backup.log {
    monthly
    rotate 12
    compress
    missingok
    notifempty
    su mips-backup mips-backup
    create 0600 mips-backup mips-backup
}
EOF

if [ "$FIREWALL" = 1 ]; then
    step "Firewall: SSH, HTTP, HTTPS only"
    ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
    ufw --force enable >/dev/null
    ufw status | sed -n 1,12p
fi

step "Checks"
sudo -u www-data php -r "define('MIPS_NO_SESSION', true); \$_SERVER['HTTP_USER_AGENT'] = 'cli'; require '$APP/src/bootstrap.php'; App\Database::connection()->query('SELECT 1'); echo 'Application connects to the database as mips_app.', PHP_EOL;"
# A reload is asynchronous: give the new workers a few seconds before judging.
for _ in $(seq 20); do
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" http://127.0.0.1/login.php)
    { [ "$code" = 200 ] || [ "$code" = 301 ]; } && break
    sleep 0.5
done
if [ "$code" != 200 ] && [ "$code" != 301 ]; then
    echo "login.php answered HTTP $code" >&2
    tail -5 /var/log/nginx/error.log >&2 || true
    tail -5 /var/log/mips/php.log >&2 || true
    exit 1
fi
echo "login.php answers ($code)."
health=$(curl -s -H "Host: $DOMAIN" http://127.0.0.1/health.php || true)
echo "health.php: $health (\"degraded\" until every scheduled job has run once)."
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" http://127.0.0.1/config/config.local.php)
[ "$code" = 404 ] || [ "$code" = 301 ] || { echo "config/ is reachable from the web (HTTP $code)!" >&2; exit 1; }

printf '\nDone. Left to do by hand:\n'
todo+=("Fill in the TODO lines of $local_cfg (SMTP, MRA, legal, billing, back-office staff), then go through the checklist in docs/deploiement.md § 7.")
todo+=("Point an external uptime monitor at https://$DOMAIN/health.php.")
for t in "${todo[@]}"; do echo "  - $t"; done
