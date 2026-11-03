# Manuel d'incident — my.mips.mu

Pour l'équipe MIPS qui fait le support des pilotes. Une fiche par panne probable : comment la reconnaître, quoi faire, quand passer la main. Les commandes se lancent sur le serveur, dans `/var/www/mips`, sauf mention contraire.

Les actions marquées **[dév]** demandent un développeur : elles touchent directement la base, sans écran prévu pour cela. Toujours faire une sauvegarde juste avant (`sudo -u mips-backup tools/cron.sh backup tools/backup.sh`).

## 0. Avant tout

### Qui prévenir

| Rôle | Qui | Quand |
|---|---|---|
| Support (niveau 1) | *à compléter* | Toute demande d'un client, toute alerte |
| Développeur (niveau 2) | *à compléter* | Fiches marquées [dév], panne non résolue en 1 h |
| Responsable | *à compléter* | Données perdues ou exposées, site arrêté plus d'1 h, MRA bloquée plus d'une journée |

Remplir ce tableau avant le premier pilote, avec les numéros de téléphone. La nuit et le week-end : qui est joignable ?

### Où regarder

1. **L'e-mail d'alerte** (`ops.alert_email`) : il dit ce qui ne va pas et depuis quand.
2. **`php tools/ops.php status`** : la liste des problèmes en cours, en clair. `OK` si tout va bien.
3. **Le journal des tâches planifiées** : `/var/log/mips/cron.log` (chaque ligne datée, avec le nom de la tâche entre crochets) ; sauvegardes : `/var/backups/mips/backup.log`.
4. **Le journal PHP** : messages préfixés `[Facturo mail]`, `[Bookora iCal]`, `[DB]`… Son emplacement dépend de la configuration de PHP-FPM (souvent `/var/log/php8.3-fpm.log`) : **le noter ici à l'installation** : `________`.
5. **Le back-office** (`/backoffice.php`) : l'état de chaque entreprise, ses apps, son journal.

### Répondre au client

Dire ce qu'on a vu, ce qu'on fait, quand on revient vers lui. Ne jamais promettre une date de correction qu'on ne maîtrise pas (MRA, hébergeur). Ne jamais demander un mot de passe : ni le sien, ni celui de son compte MRA.

## 1. Le site ne répond pas, ou `/health.php` répond 503

**Signes** : la sonde externe alerte ; les clients ne peuvent pas se connecter ; `curl -s https://my.mips.mu/health.php` affiche `degraded`, ou rien.

1. `php tools/ops.php status` :
   - **« La base de données ne répond pas »** → fiche 2.
   - Une tâche planifiée, le disque ou des factures MRA → la fiche correspondante. Le site lui-même marche : `/health.php` signale aussi les problèmes d'arrière-plan.
2. Rien ne répond du tout : `sudo systemctl status nginx php8.3-fpm mariadb`. Relancer le service arrêté (`sudo systemctl restart …`), puis regarder pourquoi il s'est arrêté (`sudo journalctl -u <service> -n 100`).
3. Le serveur lui-même est injoignable (pas de SSH) : console de l'hébergeur. Si la machine est perdue, reprise depuis la sauvegarde de la nuit sur un serveur neuf (`docs/deploiement.md` § 2 et § 3). **Prévenir le responsable** : jusqu'à une journée de saisies perdue.

## 2. La base de données ne répond pas

**Signes** : alerte « Base de données injoignable » (au plus une par heure), pages blanches ou erreurs.

1. `sudo systemctl status mariadb` ; si arrêtée : `sudo systemctl start mariadb`.
2. Elle ne redémarre pas : `sudo journalctl -u mariadb -n 200`. Cause fréquente : disque plein (fiche 13).
3. Tables abîmées (messages « crashed », « corrupt ») : **ne rien réparer à l'aveugle**. [dév] Restaurer la sauvegarde de la nuit dans une base à part pour comparer, puis décider (fiche 15).

## 3. Une facture reste « en attente de fiscalisation »

**Signes** : sur la facture, « MRA : en attente de fiscalisation (nouvel essai automatique) » ; après 2 heures, alerte « Factures non fiscalisées ».

C'est normal quelques minutes : la MRA est injoignable ou lente, la tâche `mra_retry` réessaie toutes les 5 minutes, dans l'ordre. La facture ne peut pas être envoyée par e-mail tant qu'elle n'a pas son QR code.

1. Lire le message sous l'état :
   - « Impossible de joindre la MRA » / « La MRA a répondu HTTP 5xx » : panne côté MRA ou réseau. Attendre ; vérifier que d'autres entreprises sont touchées (même message) ; si plus de 2 heures, prévenir les clients concernés.
   - « Échec de l'authentification MRA » → fiche 5.
   - « Configuration MRA incomplète » / « environnement … pas LIVE » / « clé publique » → [dév] configuration du serveur (`mra.*` dans `config.local.php`), pas l'entreprise.
2. Le propriétaire ou un administrateur peut cliquer **« Envoyer à la MRA maintenant »** une fois la cause réglée.

## 4. Une facture affiche « envoyé sans réponse de la MRA »

**Signes** : état « envoyé sans réponse de la MRA. Vérifiez sur le portail MRA… » ; alerte « Factures non fiscalisées ».

La facture est partie, mais la réponse n'est pas revenue (délai dépassé, connexion coupée). La MRA l'a **peut-être** fiscalisée. Elle n'est jamais renvoyée automatiquement : la renvoyer alors qu'elle est déjà fiscalisée crée un doublon ou un rejet.

1. Avec le client (c'est **son** compte MRA, il se connecte lui-même ; ne jamais lui demander son mot de passe), chercher la facture par son numéro (`FAC-2026-0123`) sur le portail MRA.
2. **Absente du portail** : le propriétaire clique « Envoyer à la MRA maintenant ». Elle repart avec le même numéro et le même compteur.
3. **Présente sur le portail** : ne pas renvoyer. Le propriétaire recopie l'IRN affiché par le portail dans le champ **« Fiscalisé d'après le portail MRA ? IRN »** du document, puis **« Enregistrer l'IRN »**. Le document passe en fiscalisé (« saisi à la main d'après le portail MRA »), ne repart plus jamais à la MRA, et l'e-mail au client est débloqué. Un IRN déjà porté par un autre document est refusé.
   Le QR code ne peut pas être récupéré pour l'instant (l'appel MRA qui le permet n'est pas branché) : la facture s'imprime avec l'IRN, sans QR. Le signaler au client.
4. Plusieurs factures dans cet état le même jour : prévenir le développeur (lenteur MRA à remonter, délai `mra.timeout` à revoir).

## 5. « Échec de l'authentification MRA »

**Signes** : toutes les factures de l'entreprise restent en attente avec ce message ; elles ne sont **pas** rejetées et ne consomment pas d'essais.

Causes : mot de passe changé sur le portail MRA, compte EBS désactivé, identifiant EBS faux.

1. Le propriétaire va sur **Facturo → Entreprise → Facturation électronique MRA**, ressaisit le mot de passe, clique **« Tester la connexion »**.
2. Le test passe : les factures partent au prochain passage (5 minutes) ou avec « Envoyer à la MRA maintenant », dans l'ordre.
3. Le test échoue avec « Invalid User » alors que le client est sûr de ses identifiants : le client vérifie sur le portail MRA que son compte EBS est actif. Sinon, il appelle la MRA.

## 6. Une facture est « rejetée » par la MRA

**Signes** : état « rejeté » et un message MRA (code `LV_ERR…`, `ERR…`, « VAL… »).

Le contenu ou les réglages ne conviennent pas à la MRA. Rien ne repart tant que ce n'est pas corrigé.

1. Lire le code :
   - `LV_ERR002` « TAN … does not match » : le **TAN** de la page Entreprise n'est pas celui du compte MRA. Le corriger (8 chiffres), puis « Envoyer à la MRA maintenant ».
   - Un champ « mandatory » ou un format refusé (`ERR0600` « JSON Schema ») : défaut du logiciel, pas du client. **[dév] immédiatement** : toutes les entreprises sont probablement touchées (voir `docs/relecture.md` § 5, point 1).
2. Une facture rejetée reste émise (numéro attribué) mais sans valeur fiscale. Tant qu'elle n'est pas fiscalisée, elle ne peut être ni envoyée par e-mail ni créditée. Ne pas en émettre une seconde pour la remplacer avant d'avoir vu le développeur.

## 7. « Essais automatiques arrêtés après 50 échecs »

La MRA a été injoignable plus de 4 heures pour cette facture. Une fois la MRA revenue, le propriétaire clique « Envoyer à la MRA maintenant » (le compteur d'essais repart à zéro).

## 8. Un client ne reçoit pas les e-mails

**Signes** : « je n'ai pas reçu le lien d'inscription / la facture / le rappel ».

1. Vérifier les **indésirables** du destinataire.
2. Journal PHP : chercher `[… mail]` à l'heure de l'envoi.
   - Erreur SMTP (connexion, authentification) : le service d'e-mail est en panne ou le mot de passe SMTP a changé. [dév] `mail.*` dans `config.local.php`. Tous les e-mails sont touchés.
   - `[RateLimiter] public mail cap reached` : plafond atteint (5 e-mails par destinataire et 200 par entreprise sur 24 heures, depuis les pages publiques). Protection contre l'abus : attendre, ou chercher pourquoi l'entreprise envoie autant.
3. Rien dans le journal mais rien de reçu : le message est parti et a été bloqué en route. Tester `mail-tester.com` (9/10 minimum) ; SPF, DKIM, DMARC (`docs/deploiement.md` § 7).
4. Factures : l'historique d'envoi est sur la facture (« Envoyée à … le … »).

## 9. Un utilisateur ne peut plus se connecter

1. **« Trop de tentatives »** : 5 échecs en 15 minutes depuis la même adresse ou sur le même compte. Attendre 15 minutes, ou passer par **« Mot de passe oublié »** : un mot de passe changé efface les échecs.
   [dév] Débloquer à la main : `DELETE FROM login_attempts WHERE email = '<adresse>' AND success = 0;`
2. **Mot de passe oublié** : lien valable 1 heure, une seule fois. Pas reçu → fiche 8.
3. **« Compte suspendu »** ou **« fermeture du compte demandée »** : l'entreprise est suspendue ou en fermeture (fiches 11, 12). Seul le propriétaire peut encore se connecter pendant une fermeture.
4. Le compte n'a jamais été confirmé : renvoyer l'inscription, ou l'inviter depuis l'équipe d'une entreprise.

## 10. « Votre essai est terminé » / apps en lecture seule

Normal à la fin de l'essai : les données restent visibles, imprimables et exportables ; rien ne peut être créé ; les pages publiques ferment. Back-office → l'entreprise → **Abonner** (l'app redevient pleinement utilisable) ou **Prolonger l'essai** (nombre de jours et motif, journalisés).

## 11. Suspendre une entreprise (impayé, abus, demande légale)

Back-office → **Suspendre l'accès** avec le motif. Effet immédiat : plus personne ne se connecte, toutes les pages et tous les liens publics de l'entreprise répondent « introuvable », aucun e-mail automatique ne part. Les factures déjà émises restent transmises à la MRA (obligation légale). **Réactiver l'accès** remet tout en marche. Le motif est visible par l'entreprise.

## 12. Une entreprise veut annuler la fermeture de son compte

- **Moins de 30 jours** après la demande : le propriétaire se connecte et clique « Annuler la fermeture » sur la page « Vos données », ou back-office → **Annuler la fermeture**.
- **Plus de 30 jours** : les données sont supprimées définitivement. La seule voie est la restauration d'une sauvegarde de moins de 30 jours. Elle ramène toute la base à cette date et fait perdre les saisies des autres entreprises depuis : **non**, sauf décision du responsable et avec l'accord écrit du client. [dév] Sinon, restaurer dans une base à part et en extraire cette seule entreprise.

## 13. Disque presque plein

**Signes** : alerte « Disque presque plein (<chemin>) ».

1. `df -h` ; `sudo du -sh /var/log/* /var/backups/mips /var/lib/mysql 2>/dev/null | sort -h`.
2. Journaux trop gros : vérifier `logrotate` (`/etc/logrotate.d/`) ; compresser ou supprimer les anciens journaux.
3. Sauvegardes : elles sont gardées `MIPS_BACKUP_KEEP_DAYS` jours (30 par défaut) ; ne jamais effacer la plus récente ; vérifier que la copie hors serveur existe avant d'effacer quoi que ce soit en local.
4. La base grossit : normal avec les photos des boutiques et logements. Agrandir le disque chez l'hébergeur.

## 14. La sauvegarde a échoué

**Signes** : alerte « Sauvegarde de la nuit (backup) », ou « aucune exécution réussie depuis… ».

1. `tail -50 /var/backups/mips/backup.log` :
   - « Backup public key not found » : `/etc/mips/backup-public-key.asc` absent.
   - « No off-site copy configured » : la sauvegarde existe sur le serveur mais n'a pas été copiée ailleurs : régler `MIPS_BACKUP_RCLONE_REMOTE` ou `MIPS_BACKUP_RSYNC_TARGET` dans `/etc/mips/backup.env`.
   - Erreur `rclone` / `rsync` : identifiants ou quota chez le fournisseur hors serveur.
   - Erreur `mariadb-dump` : compte `mips_backup` (droits, mot de passe dans `/etc/mips/backup.my.cnf`).
   - « Another backup is running » : une sauvegarde précédente est bloquée (`ps aux | grep backup.sh`).
2. Relancer à la main : `sudo -u mips-backup tools/cron.sh backup tools/backup.sh`.
3. Deux nuits de suite sans sauvegarde : **prévenir le responsable**.

## 15. Restaurer des données

Toujours **dans une base à part d'abord** (`docs/deploiement.md` § 3) :
```bash
tools/restore.sh /var/backups/mips/mips-<date>.sql.gz.gpg mips_restore      # sur une machine qui a la clé privée
```
- **Tout le serveur est perdu** : restaurer en `--replace` sur le nouveau serveur, remettre `config.local.php` (copie chiffrée à côté de la sauvegarde), puis relancer aussitôt `php tools/purge_companies.php` (les entreprises supprimées depuis la sauvegarde reviennent sinon). Le journal des fermetures était sur le serveur perdu : vérifier à la main les demandes de fermeture et suppressions des dernières 24 h (e-mails « Fermeture de votre compte » / « Votre compte MIPS est supprimé » envoyés depuis la sauvegarde).
- **Base remplacée sur le même serveur** (`--replace`, base abîmée, migration ratée) : juste après, `sudo -u www-data php tools/replay_closures.php --dry-run` puis sans `--dry-run`. Il relit le journal des fermetures, tenu hors de la base (`/var/lib/mips/closures.jsonl`), et remet chaque entreprise dans l'état demandé depuis la sauvegarde : fermetures demandées ou annulées, suppressions refaites (sans nouvel e-mail au propriétaire).
- **Un client a supprimé ou modifié quelque chose par erreur** : [dév] retrouver les lignes dans `mips_restore` et ne recopier que celles-là dans la base en production. Ne jamais remplacer toute la base pour une seule entreprise.
- Une fois fini : `DROP DATABASE mips_restore;` (et `mips_platform_before_restore` après un `--replace` vérifié).

## 16. Une tâche planifiée ne tourne plus

**Signes** : alerte « … : aucune exécution réussie depuis … » ou « n'a jamais tourné ».

1. `sudo crontab -u www-data -l` (et `sudo crontab -u mips-backup -l` pour la sauvegarde) : la ligne existe ? `sudo systemctl status cron`.
2. `grep '\[<tâche>\]' /var/log/mips/cron.log | tail` : erreurs de la dernière exécution.
3. Lancer à la main pour voir l'erreur : `sudo -u www-data tools/cron.sh <tâche> php tools/<tâche>.php`.
4. Une tâche qui échoue pour une seule entreprise continue pour les autres ; le nom de l'entreprise est dans le journal.

## 17. Bookora : les réservations Airbnb / Booking.com ne remontent plus

1. Sur le logement, le message de synchronisation indique l'erreur (adresse refusée, délai, calendrier vide).
2. Le lien iCal a changé côté plateforme (le propriétaire l'a régénéré) : recopier le nouveau lien. Les adresses internes et `http://` sont refusées par sécurité.
3. Une synchronisation manuelle est limitée à une par minute.
4. Rappeler au propriétaire qu'une double réservation reste possible entre deux synchronisations (toutes les heures) : bloquer les dates à la main pour les arrivées le jour même.

## 18. Suspicion de piratage ou de fuite de données

1. **Ne rien effacer** (journaux, sessions) : ce sont les preuves.
2. Compte d'un utilisateur compromis : « Mot de passe oublié » pour lui (déconnecte ses autres sessions), et le propriétaire le retire de l'équipe si besoin. Toute une entreprise : **Suspendre l'accès** (fiche 11).
3. Serveur compromis : couper l'accès public (Nginx), prévenir le responsable et le développeur, ne pas restaurer par-dessus avant d'avoir compris.
4. **Prévenir le responsable tout de suite.** Le Data Protection Act 2017 de Maurice impose de notifier le Data Protection Commissioner et, selon les cas, les personnes concernées, dans un délai court (72 heures dans la mesure du possible, à faire confirmer par le juriste). Les entreprises clientes sont responsables de traitement pour les données de leurs propres clients : elles doivent être prévenues pour pouvoir notifier à leur tour.

## 19. Une mise à jour casse quelque chose

1. `tools/update.sh` remet déjà le code précédent quand ses vérifications échouent. Sinon, revenir à la main : `git log --oneline -5`, puis `git reset --hard <commit précédent>` et `sudo systemctl reload php8.3-fpm`.
2. La mise à jour contenait une migration (`sql/migrations/…`) : revenir au code précédent ne suffit pas toujours. [dév] Restaurer la sauvegarde faite juste avant la mise à jour (`docs/deploiement.md` § 4), dans une base à part d'abord.
3. Noter ce qui a cassé : un test manquait. Le développeur l'ajoute avant de réessayer.

## Après chaque incident

Une ligne dans le journal du back-office de l'entreprise concernée (« Note ») : quoi, quand, ce qui a été fait. Et une question : qu'est-ce qui l'aurait évité, ou fait voir plus tôt ?
