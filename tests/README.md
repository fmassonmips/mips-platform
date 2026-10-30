# Tests de bout en bout

Dix suites qui pilotent l'application par son API, comme le ferait un navigateur. Toutes les données sont fictives.

| Suite | Vérifie | Vérifications |
|---|---|---|
| `portal_test.py` | Portail marchand : inscription, confirmation d'email, double authentification, conditions d'utilisation versionnées, préqualification, acceptation par MIPS, personnes et pièces, isolement entre comptes marchands et vis-à-vis du back-office, envoi du dossier, double regard, antivirus, réinitialisation de mot de passe, désactivation de compte, journal d'audit | 113 |
| `staff_onboarding_test.py` | Dépôt et revue des pièces par le personnel (non-régression du stockage partagé), double regard, téléchargement, retour en collecte | 11 |
| `onboarding_approval_test.py` | Approbation des dossiers KYC : chacun des blocages (nom légal et BRN, pièces manquantes, refusées, en attente ou expirées, contrat signé, dirigeant, bénéficiaire effectif, seuil de 25 %, filtrage sanctions/PEP, note de risque, PEP et risque élevé), rôle d'approbateur, double regard sur la décision (ni le créateur, ni un analyste passé ou présent, ni celui qui a réassigné le dossier), double regard sur les pièces, note de décision, date de prochaine revue, états définitifs, revue périodique | 78 |
| `reporting_test.py` | Import Commission_Data : colonnes manquantes, fichier sans date, règles de nettoyage figées (SUCCESS seul, tests, remboursements seuls), rapport mensuel ligne par ligne (TPE, online, passerelles, rails, FX, segments, top marchands, alertes), tendance 12 mois, exports CSV et Excel, remplacement d'un mois réimporté, droits d'accès, journal d'audit | 65 |
| `billing_test.py` | Règles de commission (validation, priorité marchand > rail spécifique > type de rail > canal, dates de validité, désactivation), factures avec TVA 15 %, une par marchand et devise, cycle brouillon → émise → payée / annulée, numérotation sans trou, mois verrouillé contre la réimport, marchand non facturable, export comptable | 47 |
| `recon_test.py` | Rapprochement MCB / MIPS : correspondances de MID et liste de surveillance, ventilation de l'écart (vérifications de carte, décalage de fin de mois, surveillance, un seul côté, écart réel), règle de signe, avertissements de périmètre (extraction filtrée, marchand témoin, lignes hors mois), vue journalière, éléments à réclamer, exports, recalcul | 55 |
| `merchants_test.py` | Fiches marchands : validation du profil, responsable de compte, nom d'import verrouillé dès qu'il y a des transactions, historique des modifications (qui, quoi, avant, après), recherche, contacts (un seul principal), identifiants MID/TUI uniques, contrats (validation, PDF contrôlé sur son contenu, stockage hors web, empreinte, téléchargement exact, document remplacé conservé, suppression des brouillons seulement), alertes de préavis | 71 |
| `staff_2fa_required_test.py` | 2FA obligatoire pour admin et finance (règle activée le temps de la suite, comme en production) : mot de passe accepté puis tous les modules fermés, renvoi vers l'enrôlement, ouverture après enrôlement, désactivation refusée, second facteur exigé à la connexion suivante, remise à zéro par un administrateur, promotion d'un compte sans 2FA, rôle `user` non concerné | 23 |
| `admin_test.py` | Comptes du personnel : demande de compte et activation par un administrateur, rôles appliqués dès la requête suivante, un administrateur ne peut ni se rétrograder ni se désactiver, lien de réinitialisation à usage unique, mot de passe oublié sans révéler les comptes existants, changement de mot de passe qui ferme les autres sessions, 2FA (activation, rejeu refusé, codes de secours à usage unique, régénération, désactivation, remise à zéro par un administrateur), consultation du journal d'audit, limitation des tentatives de connexion par compte et par adresse | 93 |
| `bigquery_test.py` | Import direct depuis BigQuery via un émulateur local : jeton de compte de service signé, requête paramétrée avec plafond de coût, attente du job et pagination, bornes du mois à l'heure de Maurice, mois vide, clé refusée | 23 |

## Lancer

```bash
tests/run_tests.sh
```

Le script :
1. copie le code dans un dossier temporaire ;
2. y écrit une configuration de test (clé d'application aléatoire, emails vers un serveur SMTP local, 2FA non imposée au personnel de test) ;
3. **supprime puis recrée** la base `mips_test` à partir de `sql/schema.sql`, crée l'utilisateur MariaDB `mips_test` et deux comptes du personnel (`admin@example.com`, `fin@example.com`, mot de passe `Admin123!`) ;
   ainsi qu'un compte sans rôle métier (`viewer@example.com`) pour vérifier les refus d'accès ;
4. génère une clé de compte de service BigQuery jetable et active l'import BigQuery vers l'émulateur ;
5. démarre un serveur SMTP de test (`smtpsink.py`), l'émulateur BigQuery (`bigquery_emulator.py`) et le serveur web intégré de PHP (`router.php`) ;
6. lance les suites, puis arrête les serveurs et supprime le dossier temporaire.

Code de sortie 0 si tout passe. Durée : environ trois minutes (deux étapes attendent le pas TOTP suivant de 30 s).

Les suites s'enchaînent dans un ordre fixe : la facturation et BigQuery s'appuient sur les mois importés avant, et
`admin_test.py` reste en dernier car il bloque volontairement les connexions depuis 127.0.0.1 avant de les rouvrir.
Pour n'en lancer qu'une partie : `TESTS="reporting_test.py billing_test.py" tests/run_tests.sh`.

## Prérequis

- PHP 8.3 avec `pdo_mysql`, `sodium`, `fileinfo` ; MariaDB 10.11 en marche ;
- Python 3 avec `requests` et `cryptography` (émulateur BigQuery), `openssl` ;
- un client `mysql` avec les droits de créer une base et un utilisateur.

| Variable | Rôle | Défaut |
|---|---|---|
| `MYSQL` | commande du client mysql administrateur | `mysql` |
| `DB_NAME` | base de test, **supprimée à chaque lancement** | `mips_test` |
| `PORT`, `SMTP_PORT`, `BQ_PORT` | ports du serveur web, du SMTP de test et de l'émulateur BigQuery | `8099`, `2525`, `9050` |
| `TESTS` | suites à lancer, séparées par des espaces | toutes |
| `KEEP=1` | garder le dossier temporaire et les serveurs pour examen (ne pas rediriger la sortie dans un tube : les serveurs le gardent ouvert) | — |

Le script refuse de supprimer une base nommée `mips_platform` ou contenant `prod` / `production`.
**Ne jamais le pointer vers une base réelle.**

## Données

Uniquement fictives : `fixtures/specimen.pdf` et `fixtures/specimen-id.png` sont des spécimens marqués comme tels.
L'antivirus est simulé par `fakescan.sh` (écrit par le lanceur), qui signale le fichier de test EICAR.

| Fichier | Contenu |
|---|---|
| `commission_2026_08.csv`, `commission_2026_09.csv` | Deux mois au format Commission_Data, marchands « Alpha Test Shop », « Beta Test Hotel », « Gamma Test Kiosk ». Septembre contient un cas de chaque règle de nettoyage, une ligne USD, un rail inconnu et une date illisible. |
| `commission_2026_10.csv` | Octobre pour la facturation : une règle de marchand qui démarre le 15, un conflit rail / canal, une ligne USD. |
| `mcb_2026_09.csv`, `mips_2026_09.csv` | Rapprochement : un MID par catégorie d'écart (MID de test `91000000xx`, absents des correspondances réelles livrées dans `sql/schema.sql`). |
| `bigquery_rows.csv` | Lignes servies par l'émulateur, en heure de Maurice, dont deux à cheval sur les bornes de novembre. |

Les montants attendus sont calculés à la main à partir de ces fichiers ; le calcul figure en tête de chaque suite.
Ils ne proviennent d'aucun export réel. Les exports réels ne doivent jamais être versionnés.

## Ce que ces tests prouvent, et ce qu'ils ne prouvent pas

- Ils prouvent que le code applique les règles figées sur un jeu de données construit pour exercer chaque cas.
  Une modification volontaire d'une règle (classement d'un rail, règle de signe du rapprochement, priorité des
  commissions, fuseau horaire BigQuery) fait échouer au moins une vérification.
- Ils ne prouvent pas que ces règles sont les bonnes pour MIPS : l'unité de `somme_totale`, le sens de
  `refund_total_refunded` et l'assujettissement des commissions à la TVA restent à confirmer (voir les alertes du rapport).
- L'émulateur BigQuery reproduit le protocole (jeton, requête, pagination), pas le service réel : un premier import
  sur le vrai projet reste à faire avec un compte de service en lecture seule.
- La configuration de test n'impose pas la 2FA au personnel (`require_2fa_roles` vide), pour que les autres suites se
  connectent par mot de passe ; `staff_2fa_required_test.py` l'active le temps de ses vérifications puis la rétablit.
- La garde « au moins un administrateur actif » n'est pas atteignable par l'API (un administrateur ne peut déjà pas se
  retirer lui-même) ; elle protège contre deux retraits simultanés et n'est pas testée.
- Non couverts : les écrans (seule l'API est pilotée).

## Limitation des tentatives de connexion

- 5 échecs sur un compte en 15 minutes bloquent **ce compte**, depuis n'importe quelle adresse, même avec le bon mot de passe.
- Une adresse IP n'est bloquée qu'au-delà de 50 échecs en 15 minutes, tous comptes confondus (`rate_limit.max_attempts_per_ip`) :
  une tentative de mot de passe sur de nombreux comptes est arrêtée, mais les collègues derrière l'accès internet du bureau
  ne sont plus bloqués par les erreurs d'une seule personne.
- Se connecter à un compte ne remet à zéro que le compteur de ce compte.
- Les demandes de mot de passe oublié et les inscriptions sont des quotas séparés : elles ne bloquent jamais un compte.

`admin_test.py` vérifie chacun de ces points.
