# Tests de bout en bout

Deux suites qui pilotent l'application par son API, comme le ferait un navigateur.

| Suite | Vérifie | Vérifications |
|---|---|---|
| `portal_test.py` | Portail marchand : inscription, confirmation d'email, double authentification, conditions d'utilisation versionnées, préqualification, acceptation par MIPS, personnes et pièces, isolement entre comptes marchands et vis-à-vis du back-office, envoi du dossier, double regard, antivirus, réinitialisation de mot de passe, désactivation de compte, journal d'audit | 113 |
| `staff_onboarding_test.py` | Dépôt et revue des pièces par le personnel (non-régression du stockage partagé), double regard, téléchargement, retour en collecte | 11 |

## Lancer

```bash
tests/run_tests.sh
```

Le script :
1. copie le code dans un dossier temporaire ;
2. y écrit une configuration de test (clé d'application aléatoire, emails vers un serveur SMTP local, 2FA non imposée au personnel de test) ;
3. **supprime puis recrée** la base `mips_test` à partir de `sql/schema.sql`, crée l'utilisateur MariaDB `mips_test` et deux comptes du personnel (`admin@example.com`, `fin@example.com`, mot de passe `Admin123!`) ;
4. démarre un serveur SMTP de test (`smtpsink.py`) et le serveur web intégré de PHP (`router.php`) ;
5. lance les deux suites, puis arrête les serveurs et supprime le dossier temporaire.

Code de sortie 0 si tout passe. Durée : environ une minute (une étape attend le pas TOTP suivant de 30 s).

## Prérequis

- PHP 8.3 avec `pdo_mysql`, `sodium`, `fileinfo` ; MariaDB 10.11 en marche ;
- Python 3 avec `requests` ;
- un client `mysql` avec les droits de créer une base et un utilisateur.

| Variable | Rôle | Défaut |
|---|---|---|
| `MYSQL` | commande du client mysql administrateur | `mysql` |
| `DB_NAME` | base de test, **supprimée à chaque lancement** | `mips_test` |
| `PORT`, `SMTP_PORT` | ports du serveur web et du SMTP de test | `8099`, `2525` |
| `KEEP=1` | garder le dossier temporaire et les serveurs pour examen | — |

Le script refuse de supprimer une base nommée `mips_platform` ou contenant `prod` / `production`.
**Ne jamais le pointer vers une base réelle.**

## Données

Uniquement fictives : `fixtures/specimen.pdf` et `fixtures/specimen-id.png` sont des spécimens marqués comme tels.
L'antivirus est simulé par `fakescan.sh` (écrit par le lanceur), qui signale le fichier de test EICAR.

## Non couvert par ces suites

Les modules reporting, facturation, rapprochement MCB, BigQuery et export Excel ont été vérifiés pendant le développement
(comparaison à `analyze.py`, émulateur BigQuery, ouverture des fichiers Excel), mais **sur des exports réels qui ne peuvent
pas être versionnés**. Leurs tests automatisés restent à écrire, sur un jeu de données fictif.
