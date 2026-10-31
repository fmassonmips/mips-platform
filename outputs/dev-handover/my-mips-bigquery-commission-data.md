# my.mips.mu — Lecture directe des transactions dans BigQuery

**Pour :** le développeur de my.mips.mu
**De :** Florent Masson (MIPS)
**Complète :** `my-mips-monthly-report-excel-export.md` (règles métier du rapport mensuel, § 2 de ce document-là)
**Implémentation de référence :** dépôt `fmassonmips/mips-platform`, branche `ccr-a3522d3b-pyyp68` (PR #10, prototype non fusionné)
— `src/Reporting/BigQuery.php`, `src/Reporting/BigQueryImport.php`, `tools/bigquery_import.php`

> **Limite de la référence.** Le code de référence n'a été testé que contre un **émulateur local** de
> l'API BigQuery et du jeton OAuth : signature JWT, requête paramétrée, job en attente, 5 pages de
> résultats, types `TIMESTAMP` et `BOOLEAN`. **Il n'a jamais tourné sur la vraie table MIPS.** Les noms
> de table et de colonnes, ainsi que le type de la colonne de date, sont **à confirmer** de ton côté (§ 3).

---

## 1. Objectif

Aujourd'hui, le rapport mensuel part d'un fichier `Commission_Data_<Mon>_<YY>.xlsx`, exporté et déposé
à la main. Objectif : **lire le mois directement dans BigQuery**, avec exactement les mêmes règles de
nettoyage et de classement, de deux façons :

1. Un bouton « Import from BigQuery » sur la page du rapport (choix du mois).
2. Un import automatique planifié du mois précédent (par ex. le 2 du mois à 06:10, heure de Maurice).

Critère de réussite : **le même mois importé par fichier et par BigQuery donne un rapport identique au
centime** (§ 9, test 1).

---

## 2. Accès (à mettre en place par l'administrateur GCP)

| Élément | Valeur |
|---|---|
| Identité | Un **compte de service dédié**, par ex. `mips-reporting-reader@<projet>.iam.gserviceaccount.com` |
| Rôle sur la table (ou le dataset) | `roles/bigquery.dataViewer` (lecture seule) |
| Rôle sur le projet qui paie les requêtes | `roles/bigquery.jobUser` |
| Scope OAuth demandé | `https://www.googleapis.com/auth/bigquery.readonly` |
| Clé | Fichier JSON du compte de service, **hors de la racine web**, lisible par l'utilisateur PHP uniquement (`chmod 400`) |

**Interdits :**
- Pas de rôle Owner/Editor, pas de droit d'écriture.
- La clé ne va jamais dans le dépôt Git, ni dans un log, ni dans un message d'erreur.
- Si l'hébergement le permet (my.mips.mu sur GCP, ou Workload Identity Federation), préférer une
  **identité sans clé** au fichier JSON.

Rotation : clé renouvelée au moins une fois par an et révoquée dès le départ d'un administrateur.

---

## 3. Contrat de la table (à confirmer avant de coder)

La table doit exposer **les mêmes colonnes que l'export `Commission_Data`**. La procédure d'analyse
MIPS indique que l'export BigQuery utilise ces noms ; **à vérifier sur le schéma réel**.

| Colonne | Type attendu | Usage |
|---|---|---|
| `date_transaction` | `TIMESTAMP` (ou `DATETIME` / `DATE`, voir § 4) | Choix du mois |
| `form_name` | `STRING` | Marchand |
| `form_nickname` | `STRING` | Marchand si `form_name` est vide |
| `sof_proc_nickname` | `STRING` | Rail |
| `somme_totale` | `NUMERIC` / `FLOAT64` | Montant (unité : **voir § 10, question 1**) |
| `symbole_monnaie` | `STRING` | Devise |
| `is_for_till_id` | `STRING` / `INT64`, NULL si en ligne | Canal TPE / Online |
| `fi_name` | `STRING` | Banque / passerelle |
| `last_transaction_status` | `STRING` | Seul `SUCCESS` est gardé |
| `est_test`, `is_test_order` | `BOOL` / `INT64` | Exclusion des tests |
| `refund_total_refunded` | `NUMERIC` / `FLOAT64` | Remboursements (comptés, jamais déduits) |

À me renvoyer :
1. Le nom complet `projet.dataset.table`.
2. La région du dataset (`EU`, `US`, `asia-south1`…).
3. Le schéma (`bq show --schema --format=prettyjson projet:dataset.table`).
4. Si la table est **partitionnée ou clusterisée**, et sur quelle colonne.

---

## 4. Le piège n° 1 : le fuseau horaire

Le mois se calcule **à l'heure de Maurice** (`Indian/Mauritius`, UTC+4, sans heure d'été).
Si `date_transaction` est un `TIMESTAMP` (stocké en UTC), un filtre en UTC range **toutes les
transactions passées entre 00:00 et 04:00 le 1er du mois dans le mois précédent**, et le rapport ne
correspondra plus à l'export.

Filtre à utiliser selon le type de la colonne (bornes = premier et dernier jour du mois, en paramètres) :

| Type | Clause `WHERE` |
|---|---|
| `TIMESTAMP` | `date_transaction >= TIMESTAMP(@start, @tz) AND date_transaction < TIMESTAMP(DATE_ADD(@end, INTERVAL 1 DAY), @tz)` |
| `DATETIME` (déjà en heure locale) | `date_transaction >= DATETIME(@start) AND date_transaction < DATETIME(DATE_ADD(@end, INTERVAL 1 DAY))` |
| `DATE` | `date_transaction BETWEEN @start AND @end` |

**Ne pas écrire `DATE(date_transaction, @tz) BETWEEN @start AND @end`.** Le résultat est juste, mais
cette forme **empêche BigQuery de ne lire que les partitions du mois** sur une table partitionnée :
chaque import relit toute la table, et elle est facturée en conséquence.

Côté application, convertir aussi la valeur lue dans le même fuseau avant de déterminer le mois de
chaque ligne. L'API REST renvoie un `TIMESTAMP` en **secondes epoch sous forme de texte**
(ex. `"1.7923068E9"`), pas en date lisible.

**À vérifier aussi :** l'export Excel actuel est-il en heure de Maurice ou en UTC ? S'il est en UTC,
les deux sources différeront de quelques transactions en début et fin de mois. Il faut alors choisir
une convention unique, et Florent tranche.

---

## 5. Requête

```sql
SELECT date_transaction, form_name, form_nickname, sof_proc_nickname, somme_totale, symbole_monnaie,
       is_for_till_id, fi_name, last_transaction_status, est_test, is_test_order, refund_total_refunded
FROM `projet.dataset.table`
WHERE date_transaction >= TIMESTAMP(@start, @tz)
  AND date_transaction <  TIMESTAMP(DATE_ADD(@end, INTERVAL 1 DAY), @tz)
```

Paramètres nommés : `@start` (DATE, 1er du mois), `@end` (DATE, dernier jour du mois), `@tz` (STRING, `Indian/Mauritius`).

Règles :
- **SQL standard** (`useLegacySql: false`) et **paramètres nommés** pour toutes les valeurs.
  Le nom de table et les noms de colonnes ne peuvent pas être paramétrés : ils viennent de la
  configuration et sont **validés par expression régulière** (`^[A-Za-z0-9_-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_$]+$`
  pour la table, `^[A-Za-z_][A-Za-z0-9_]*$` pour les colonnes). Jamais de saisie utilisateur dans le SQL.
- **Ne sélectionner que ces colonnes** (pas de `SELECT *`) : BigQuery facture les colonnes lues.
- **Plafond de coût obligatoire** : `maximumBytesBilled` (10 Go par défaut, à ajuster quand on connaît la
  taille d'un mois). Au-delà, la requête échoue au lieu de facturer.
- Si la table n'est pas partitionnée par date, demander à l'administrateur GCP de la partitionner
  (par jour sur `date_transaction`) avant de planifier l'import.

---

## 6. Appel de l'API

Avec une bibliothèque officielle (`google/cloud-bigquery` en PHP, `google-cloud-bigquery` en Python,
`@google-cloud/bigquery` en Node), la plupart de ce qui suit est géré pour toi. Sans bibliothèque, comme
dans la référence :

1. **Jeton** : construire un JWT `RS256` signé avec la clé du compte de service
   (`iss` = email du compte, `scope` = bigquery.readonly, `aud` = `token_uri`, durée ≤ 1 h), puis l'échanger sur
   `https://oauth2.googleapis.com/token` (`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`).
   Mettre le jeton en cache jusqu'à expiration.
2. **Requête** : `POST https://bigquery.googleapis.com/bigquery/v2/projects/{projet}/queries`
   avec `query`, `useLegacySql: false`, `parameterMode: NAMED`, `queryParameters`, `maximumBytesBilled`,
   `location`, `timeoutMs`, `maxResults`.
3. **Attente** : si `jobComplete` vaut `false`, interroger
   `GET .../queries/{jobId}?location=…` jusqu'à `true`, avec un délai maximal (5 min dans la référence).
4. **Pagination** : tant que la réponse contient `pageToken`, redemander la page suivante.
   Ne pas charger tout le mois en mémoire : traiter page par page.
5. **Types** (l'API REST renvoie tout en texte) :
   - `TIMESTAMP` en secondes epoch, à convertir en heure de Maurice ;
   - `BOOL` en `"true"` / `"false"` ;
   - `NULL` en `null` ;
   - les nombres en chaînes.

---

## 7. Après la lecture : mêmes règles que l'import de fichier

Les lignes lues passent par **exactement le même code** que l'import du fichier Excel :
- même nettoyage, même classement, même rapport (voir § 2 de `my-mips-monthly-report-excel-export.md`) ;
- **remplacement du mois** : un mois réimporté remplace entièrement l'import précédent de ce mois ;
- **verrou** : si des factures de commission du mois sont déjà émises, l'import est refusé ;
- **traçabilité** : enregistrer la source (`bigquery:projet.dataset.table YYYY-MM`), l'empreinte sha256 des
  lignes lues, le nombre de lignes, l'utilisateur, ou « scheduler » pour l'import planifié.

Ne pas dupliquer les règles dans du SQL : un seul endroit, partagé avec l'import de fichier, sinon les deux
sources divergeront dès la première modification.

---

## 8. Import planifié et erreurs

- Planifier le 2 du mois (`10 6 2 * *`) pour le mois précédent, avec un rejeu manuel possible pour n'importe quel mois.
- **En cas d'échec, ne rien écrire** (transaction annulée), tracer l'erreur et prévenir un responsable par email.

| Cas | Comportement attendu |
|---|---|
| Clé invalide ou révoquée | Échec, message « authentication failed », **sans la clé ni le JWT dans le log** |
| Table ou colonne introuvable | Échec avec le message BigQuery |
| Plafond de coût dépassé | Échec, pas d'import partiel |
| Mois sans aucune ligne | Échec explicite (« no row for YYYY-MM »), pas un mois vide importé |
| Lignes hors du mois demandé | Avertissement (signe d'un problème de fuseau ou de colonne) |
| Mois verrouillé par des factures émises | Refus |

---

## 9. Recette

| # | Test | Attendu |
|---|---|---|
| 1 | Un mois connu (ex. juin 2026) importé par fichier, puis par BigQuery | Rapport **identique au centime** : lignes, nettoyage, segments, devises, top marchands, alertes |
| 2 | Transaction à 01:00 heure de Maurice le 1er du mois | Comptée dans ce mois |
| 3 | Transaction à 02:00 heure de Maurice le 1er du mois suivant | Exclue |
| 4 | `--dry-run` ou équivalent | Affiche la requête et les paramètres sans rien lire |
| 5 | Estimation du coût (`dryRun: true` dans l'API, ou la console) | Octets lus ≈ un mois de données, pas toute la table |
| 6 | Clé d'un autre compte | Refus, rien d'importé, rien de secret dans les logs |
| 7 | Mois vide, table inexistante | Refus explicite |
| 8 | Mois avec facture émise | Refus |
| 9 | Import planifié | Entrée d'audit au nom « scheduler » avec l'empreinte des lignes |

Le test 1 est **bloquant** : tant qu'il échoue, on garde l'import par fichier.

---

## 10. Questions à trancher avec Florent

1. **Unité de `somme_totale`** dans BigQuery : roupies ou cents ? Est-ce la même que dans l'export Excel ?
2. **Fuseau** de l'export Excel actuel, et convention retenue (§ 4).
3. **Mêmes lignes** : la table BigQuery contient-elle exactement ce que contient l'export
   (même périmètre, mêmes filtres, transactions en cours incluses ou non) ?
4. **Projet facturé** pour les requêtes, et budget mensuel acceptable.
5. **Qui reçoit l'alerte** si l'import planifié échoue.
