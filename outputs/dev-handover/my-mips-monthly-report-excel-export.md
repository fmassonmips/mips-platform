# my.mips.mu — Export Excel du rapport mensuel et tendance 12 mois

**Pour :** le développeur de my.mips.mu
**De :** Florent Masson (MIPS)
**Page concernée :** https://my.mips.mu/?p=ZWJCVVhTSWdvT2QzZG05OHJMQkRTUT09
**Implémentation de référence :** dépôt `fmassonmips/mips-platform`, branche `ccr-a3522d3b-pyyp68` (PR #10, prototype non fusionné)

> **Note.** Cette spécification a été rédigée **sans avoir vu la page ci-dessus** : le site renvoie
> `denied-by-security.php` aux accès extérieurs. Elle décrit le résultat attendu et les règles métier,
> pas l'intégration dans votre code. À toi d'adapter les points d'accroche (routes, permissions, source
> des données) à l'architecture de my.mips.mu, et de signaler tout écart avec ce document.

---

## 1. Objectif

Remplacer le classeur Excel produit chaque mois à la main (script `analyze.py` sur l'export
`Commission_Data_<Mon>_<YY>.xlsx`) par :

1. **Un bouton « Export Excel »** sur la page du rapport mensuel, qui télécharge un classeur
   prêt à l'emploi pour le mois sélectionné (§ 4).
2. **Une section « Tendance 12 mois »** sur la même page : graphiques + chiffre clé (§ 5).
   Optionnelle si le temps manque ; l'export Excel est prioritaire.

Les chiffres doivent être **identiques au centime** à ceux de `analyze.py` sur les mêmes données (§ 6).

---

## 2. Règles métier figées (ne pas réinterpréter)

Ces règles sont celles du reporting MIPS. Les changer modifie la comparaison d'un mois sur l'autre :
**aucune modification sans accord écrit de Florent**.

### 2.1 Nettoyage, par mois

| Règle | Détail |
|---|---|
| Statut | Ne garder que `last_transaction_status = SUCCESS` |
| Tests | Exclure si `est_test` ou `is_test_order` est vrai (`1`, `true`, `yes`, `y`, `oui`, `1.0`) |
| Remboursements purs | Exclure si `somme_totale = 0` **et** `refund_total_refunded > 0` ; les **compter** et afficher le total remboursé déclaré |
| Remboursements | **Jamais déduits** du volume (la sémantique de `refund_total_refunded` n'est pas confirmée) |
| Mois | Déterminé par la colonne de date de la transaction, pas par le nom du fichier |

### 2.2 Classification

| Élément | Règle |
|---|---|
| Canal | **TPE** si `is_for_till_id` est renseigné, sinon **Online** |
| Rail CARD | `MPGS`, `MPGS_SBM`, `Cybersource`, `PowerCard`, `PowerCardCIM`, `CIM`, `ApplePay` |
| Rail QR | `IDP_API_JUICE`, `IDP_API_BLINK`, `blink`, `MyT_money_v2`, `IDP_API_POP` |
| Rail PUSH | `JUICE_auto`, `POP` — **toujours séparé du QR**. La vue « QR incl. push » existe en ligne à part |
| Rail OTHER | Tout le reste. Lister les `sof_proc_nickname` inconnus dans les alertes |
| Classement | Par `sof_proc_nickname` (le rail), **jamais** par `last_card_brand` |
| Passerelles e-com (stricte) | `MPGS`, `MPGS_SBM`, `Cybersource` sur les lignes Online, ventilées par `fi_name` (MCB, SBM, ABSA, BNI) |
| Devise | Volumes en MUR uniquement (`symbole_monnaie = MUR`). Les autres devises sont comptées et sommées **par devise, sans conversion** |
| BNI | Identifié par `fi_name = BNI` sur MPGS ; présenté dans sa devise, jamais dans les totaux MUR |
| Marchand | `form_name`, à défaut `form_nickname`, à défaut `(blank)` |
| Unité | `somme_totale` est supposé être en **roupies** (pas en cents). **Non confirmé** : afficher l'alerte à chaque rapport tant que ce n'est pas confirmé |

### 2.3 Lignes du rapport (dans cet ordre)

```
TPE total
TPE / <chaque sof_proc_nickname TPE, ordre alphabétique>
Online total (all rails)
Ecom gateways (strict)
Ecom / <passerelle> / <fi_name>        (passerelles et fi_name en ordre alphabétique)
CARD all, CARD TPE, CARD online
QR all, QR TPE, QR online
PUSH all, PUSH TPE, PUSH online
OTHER all, OTHER TPE, OTHER online
QR incl. push (alt convention)
```

Pour chaque ligne : `txn` (toutes devises), `mur_txn`, `mur_vol`, `avg_ticket` (= mur_vol / mur_txn),
`fx_txn` (= txn − mur_txn).

### 2.4 Alertes « Verify before use » (toutes, toujours, jamais filtrées)

1. `sof_proc_nickname` classés OTHER (liste).
2. **Pic d'un marchand** : pour chaque rail, si un marchand explique plus de 40 % de la variation mensuelle
   en MUR **et** que cette variation dépasse 10 % → « `<rail>` MoM change `+x%` is `y%` explained by one merchant: `<nom>` ».
3. Tendance TPE / PowerCardCIM (variation mensuelle).
4. BNI : nombre de transactions par devise, hors totaux MUR.
5. Marchands actifs à la fois TPE et Online (historiquement proche de zéro).
6. « Amount unit of somme_totale assumed MUR units (not cents). Unconfirmed. »
7. « refund_total_refunded semantics (within-period vs cumulative) unconfirmed; refunds not netted. »

---

## 3. Source des données — à décider avec Florent

my.mips.mu a probablement accès direct aux transactions (base ou BigQuery). Dans ce cas,
**appliquer les règles du § 2 sur la source directe**, au lieu d'importer l'export Excel.
Les colonnes utilisées sont celles de l'export `Commission_Data` :

`date_transaction` (ou une autre colonne de date), `form_name`, `form_nickname`, `sof_proc_nickname`,
`somme_totale`, `symbole_monnaie`, `is_for_till_id`, `fi_name`, `last_transaction_status`, `est_test`,
`is_test_order`, `refund_total_refunded`.

**Implémentation de référence pour BigQuery** : `src/Reporting/BigQuery.php` (compte de service,
requête SQL standard paramétrée, plafond de coût `maximumBytesBilled`, pagination) et
`src/Reporting/BigQueryImport.php`. Point d'attention : **le mois se calcule à l'heure de Maurice**
(`DATE(date_transaction, 'Indian/Mauritius')` si la colonne est un TIMESTAMP). Calculé en UTC, une transaction
passée entre 00:00 et 04:00 le 1er du mois serait rattachée au mois précédent.

**Question bloquante :** la source directe donne-t-elle exactement les mêmes lignes que l'export ?
Si non (filtres différents, transactions en cours), les chiffres ne seront pas comparables
à l'historique. Il faut le vérifier sur un mois connu **avant** de mettre en production (§ 6).

---

## 4. Export Excel

### 4.1 Déclenchement

- Bouton « Export Excel » à côté du sélecteur de mois du rapport.
- Téléchargement de `MIPS_report_<YYYY-MM>.xlsx`, content-type
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Réservé aux rôles qui voient déjà le rapport. **Tracer chaque export** (utilisateur, mois, date).

### 4.2 Onglets

Fenêtre de référence : les mois **disponibles** parmi les 12 mois qui finissent au mois sélectionné.

| # | Onglet | Lignes | Colonnes |
|---|---|---|---|
| 1 | `Summary_MUR_volume` | Lignes du § 2.3 | `Line`, un mois par colonne (du plus ancien au plus récent), `MoM vol <M-1> → <M>` |
| 2 | `Summary_txn` | Idem | Idem, en nombre de transactions, `MoM txn <M-1> → <M>` |
| 3 | `Cleaning` | Un mois par ligne | `Month`, `Raw rows`, `Not SUCCESS`, `Test`, `Refund-only`, `Refunds reported`, `Clean rows`, `Source` |
| 4 | `Detail_<YYYY-MM>` | Lignes du § 2.3, mois sélectionné | `Line`, `Txn`, `MUR txn`, `MUR volume`, `Avg ticket`, `Non-MUR txn`, `MUR volume prev`, `MoM vol`, `Txn prev`, `MoM txn` |
| 5 | `Merchant_segments` | Un mois par ligne | `Month`, `Active forms`, `TPE only`, `Online only`, `Both` |
| 6 | `FX` | Mois × devise | `Month`, `Currency`, `Txn`, `Volume (own currency)` |
| 7 | `Top_merchants` | 15 premiers marchands en MUR, mois sélectionné | `Merchant`, `Txn`, `MUR volume`, `Previous month`, `MoM` |
| 8 | `Flags` | Une alerte par ligne | `Flag` |

Variation mensuelle : `M / (M-1) − 1`, **vide** si M-1 est absent ou vaut 0 (jamais 0 % ni une erreur).
Un mois non importé est **absent** des colonnes, pas affiché à 0.

### 4.3 Mise en forme (impératif)

- **Les chiffres sont des cellules numériques**, jamais du texte : le fichier doit pouvoir alimenter
  un tableau croisé dynamique.
- Formats : entiers `#,##0`, montants `#,##0.00`, pourcentages `0.0%` (stocker 0.123, pas 12.3).
- Ligne de titre au-dessus de l'en-tête : « MIPS monthly report — `<YYYY-MM>` (MUR volumes only; non-MUR never converted) ».
- En-tête en gras, **figé**, avec **filtre automatique**. Lignes `total`, `strict`, `… all` en gras.
- Police Arial, largeurs de colonnes lisibles.
- **Sécurité** : écrire les textes (noms de marchands) comme chaînes, jamais comme formules.
  Un nom commençant par `=` doit rester du texte.

### 4.4 Bibliothèque

- PHP avec Composer : **PhpSpreadsheet** (ou `openspout/openspout` pour les gros volumes).
- Sans dépendance : l'implémentation de référence `src/Reporting/XlsxWriter.php` (≈ 250 lignes,
  ZipArchive) peut être reprise telle quelle, et `src/Reporting/ReportWorkbook.php` construit le classeur.
- Autre langage : toute bibliothèque `.xlsx` qui gère les formats numériques, le volet figé et le filtre automatique.

---

## 5. Tendance 12 mois (optionnel)

Sur la page du rapport, au-dessus du détail mensuel :

- **Chiffre clé** : volume MUR du mois sélectionné, avec la variation par rapport au mois précédent
  et au même mois de l'année précédente (« pas de comparaison » si le mois manque).
  La direction est indiquée par une flèche ▲/▼ et un signe, pas seulement par la couleur.
- **5 graphiques en courbes**, un seul axe Y partant de 0 par graphique :
  1. Volume MUR total.
  2. Volume MUR par canal : TPE et Online.
  3. Volume MUR par rail : Card, QR, Push, Other.
  4. Nombre de transactions (toutes devises).
  5. Marchands actifs.
- **Mois manquant = trou dans la courbe, jamais un zéro** (un zéro ferait croire à un effondrement).
- Couleurs dans cet ordre fixe : `#2a78d6`, `#eb6834`, `#1baf7a`, `#eda100`. Une légende dès 2 séries,
  libellés en fin de courbe s'ils ne se chevauchent pas, infobulle au survol, et **une vue tableau**
  pour chaque graphique (le jaune et le vert d'eau sont sous 3:1 de contraste sur fond blanc).
- Référence : `public/assets/js/charts.js` (SVG, sans bibliothèque) et la méthode `trend()` de
  `src/Reporting/MonthlyReport.php`.

---

## 6. Recette (critères d'acceptation)

| # | Test | Attendu |
|---|---|---|
| 1 | Même fichier `Commission_Data` passé à `analyze.py` et à my.mips.mu, sur 2 mois | Chaque ligne du § 2.3, le nettoyage, les segments et les alertes sont **identiques au centime** |
| 2 | Mois déjà rapporté à la main (ex. juin 2026) | Mêmes totaux que le classeur envoyé à l'époque |
| 3 | Ouvrir l'export dans Excel **et** dans LibreOffice | Aucun message de réparation ; volet figé, filtres et formats présents |
| 4 | Somme d'une colonne de montant dans Excel | Fonctionne (preuve que ce sont des nombres) |
| 5 | Marchand nommé `=1+1` dans les données | Affiché `=1+1` en texte, pas `2` |
| 6 | Mois sélectionné sans mois précédent | Colonnes MoM vides, pas d'erreur |
| 7 | Fenêtre avec un mois manquant | Absent des colonnes Excel ; trou dans les graphiques |
| 8 | Lignes non-MUR (EUR, USD) | Absentes des volumes MUR ; présentes dans `FX` dans leur devise |
| 9 | Utilisateur sans accès au rapport | Export refusé (403) |
| 10 | Export effectué | Une entrée dans le journal d'audit (qui, quel mois, quand) |

---

## 7. Questions à trancher avec Florent avant de livrer

1. **Unité de `somme_totale`** : roupies ou cents ? (une erreur ici multiplie tous les montants par 100)
2. **`refund_total_refunded`** : montant du mois ou cumul ? (aujourd'hui : non déduit, juste affiché)
3. **Source des données** : export `Commission_Data` ou accès direct ? Si accès direct, mêmes lignes ?
4. **Rôles** autorisés à voir et à exporter le rapport sur my.mips.mu.
5. **Nouveaux `sof_proc_nickname`** (ex. un nouveau rail QR) : qui met à jour la liste du § 2.2, et où ?
