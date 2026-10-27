# my.mips.mu — Rapprochement mensuel MCB vs MIPS (e-commerce)

**Pour :** le développeur de my.mips.mu
**De :** Florent Masson (MIPS)
**Source métier :** procédure interne « Rapprochement mensuel MCB vs MIPS » (règles ci-dessous)
**Implémentation de référence :** dépôt `fmassonmips/mips-platform`, branche `ccr-a3522d3b-pyyp68` (PR #10, prototype non fusionné)
— `src/Recon/Reconciler.php` (moteur), `src/Controllers/Recon/ReconController.php` (API, exports),
`sql/schema.sql` (tables `recon_*`), `config/config.php` (rubrique `recon`)

> **Limites de la référence.**
> - Elle a été testée sur des **fichiers synthétiques** construits pour couvrir chaque cas, pas sur de vrais fichiers MCB.
> - Les noms de colonnes viennent de la procédure. Celui de la **colonne de date MCB a été deviné**.
> - Avant toute réclamation à MCB, elle doit reproduire **un mois déjà rapproché à la main** (§ 11, test 1).

> **Ce que ce rapprochement n'est pas.** Il compare les **volumes déclarés par MCB** (acquéreur) aux
> **transactions enregistrées par MIPS**. Il ne rapproche **ni le compte trust, ni les fonds reçus sur un
> compte bancaire, ni les règlements aux marchands**. Ne pas le présenter comme tel, en particulier
> dans le dossier BoM.

---

## 1. Objectif

Chaque mois, rapprocher le fichier MCB e-commerce avec l'extraction MIPS du même mois, puis :

1. **Expliquer chaque écart** par marchand (MID) et par devise, avec une ventilation en catégories qui
   **se boucle à zéro au centime**.
2. Produire les **% d'écart** (4 vues), comparés au mois précédent.
3. Isoler les **vrais écarts** et la liste des transactions candidates à une **réclamation MCB**.
4. Garder les fichiers sources pour pouvoir **recalculer** après correction d'un paramètre (correspondances MID, liste de surveillance).

Aujourd'hui fait à la main dans Excel ; cible : un écran dans my.mips.mu, plus les exports.

---

## 2. Fichiers d'entrée

| | MCB | MIPS |
|---|---|---|
| Nom habituel | `PWC_ECOM_MMAAAA v2.xlsx` | `PWC_ECOM_MMAAAA - MIPS - ALL BUNDLE.xlsx` |
| Granularité | **Agrégé** par outlet / jour / devise | **Transaction par transaction** |
| Contenu | PURCHASE uniquement | Toutes les transactions du mois |
| Clé MID | `Outlet_Number` | `card_merchant_id` |
| Devise | `currency_code_Alpha` | `symbole_monnaie` |
| Montant | `trx_amt` | `somme_totale` |
| Date | **à confirmer** (supposée `Trx_Date` / `trx_date`) | `date_transaction` (ou équivalent) |
| Autres colonnes utilisées | type (`trx_type`) si présent ; nom d'outlet si présent | `order_is_bundled`, `last_merchant_mid`, `form_name`, `last_transaction_status`, `transaction_reference`, `last_card_brand` |

Les noms de colonnes doivent être **configurables**, pas codés en dur : une liste de noms candidats
par champ, sans tenir compte de la casse. Si une colonne obligatoire manque, refuser le fichier avec un message
qui dit **quelle colonne** et **quels noms ont été cherchés**.

Côté MIPS, my.mips.mu peut lire les transactions **directement** (base ou BigQuery, voir
`my-mips-bigquery-commission-data.md`) au lieu d'un fichier. Dans ce cas, il faut reproduire **exactement
le périmètre de l'extraction ALL BUNDLE** (§ 3.1), sinon le rapprochement est faux.

Normaliser les MID lus dans Excel : `1010030300.0` → `1010030300`, notation scientifique → entier.

---

## 3. Étape 1 — Contrôles de périmètre (avant tout calcul)

### 3.1 Extraction MIPS complète ou filtrée — **bloquant**

L'extraction complète contient tout ce que MCB règle. Une extraction filtrée sur
`order_is_bundled = 1` (dite « no_qr ») **exclut environ Rs 30 M/mois** de marchands en acquiring direct
(CEB, CWA, hôtels Constance/Sun, Caudan, Arcadia) que MCB règle bien. Elle crée des **faux écarts positifs massifs**.

| Contrôle | Règle |
|---|---|
| Toutes les lignes ont `order_is_bundled = 1` | **Alerte bloquante** : « extraction filtrée, utiliser l'extraction complète » |
| Marchand sentinelle absent (`CEB`, environ Rs 47 M/mois) | Alerte : extraction probablement incomplète. La liste des sentinelles est configurable |
| Colonne `order_is_bundled` absente | Alerte : la vue bundle (§ 7) ne peut pas être calculée |

### 3.2 Fenêtres de dates

- Ne comparer que les lignes **datées dans le mois** des deux côtés.
- **Lignes MCB datées du mois précédent** : c'est le report de clearing du mois d'avant (vérifié de mai à juin 2026 : le report
  apparaît dans le fichier MCB du mois suivant, **daté des jours d'origine**). Il faut les **exclure de la comparaison** et
  afficher leur total par devise.
- Fichier MCB qui s'arrête avant la fin du mois (extrait tôt) : le signaler (le § 6, catégorie 2 en dépend).

### 3.3 Hors périmètre e-commerce

- Lignes MIPS **sans `card_merchant_id`** (QR, rails non carte) : exclues, total affiché.
- Rails **BLINK** et **POP** : hors périmètre MCB.
- Lignes MIPS non `SUCCESS`, lignes de test, lignes MCB d'un type autre que PURCHASE : ignorées et comptées.

Toutes ces alertes s'affichent **en tête du résultat** et figurent dans l'export.

---

## 4. Étape 2 — Correspondances MID (même marchand, deux MID)

Appliquer une table de correspondance **aux deux fichiers** avant d'agréger (`from_mid` est compté comme `to_mid`).

Correspondances connues (2026), à charger au départ et **modifiables à l'écran** :

| De | Vers | Marchand |
|---|---|---|
| 1010033540 | 1010030300 | Summertimes |
| 1010021980 | 1010021981 | Arcadia |
| 1010013888 | 1010035580 | Automatic Systems |
| 11346 | 33273 | Vallée de Ferney |
| 1010021761 | 1010021760 | Bubble Lodge |
| 1010029891 | 1030001080 | Constance |
| 1010029900 | 1030001070 | Constance |

Règles :
- **Pas de chaîne** : un MID cible ne peut pas être lui-même une source, et inversement.
- Tracer chaque ajout ou suppression (qui, quand).
- **Suggestions automatiques** : deux lignes unilatérales (MCB seul / MIPS seul) dans la même devise dont les
  montants s'annulent à 0,5 % près (minimum Rs 1) sont **proposées** comme correspondance probable. Un humain valide,
  puis on recalcule. Jamais d'ajout automatique.

---

## 5. Étape 3 — Agrégation

Par couple **(MID après correspondance, devise)** :
- MCB : somme des montants du mois ;
- MIPS : somme, nombre de transactions, nombre de transactions **à 0**, présence d'au moins une ligne
  `order_is_bundled = 1`, montant des lignes dont `last_merchant_mid` est dans la liste de surveillance (§ 6) ;
- détail **par jour** des deux côtés (pour le décalage de fin de mois et le détail journalier) ;
- **écart = MCB − MIPS**.

**Calculer en centimes entiers**, jamais en flottants : c'est ce qui garantit le bouclage à zéro.

---

## 6. Étape 4 — Ventilation de chaque écart (ordre imposé)

Pour chaque ligne (MID, devise), on part de `reste = écart` et on applique les catégories **dans cet ordre**.
Chaque catégorie a un **montant candidat**. Elle prend la part qui tient dans le reste, **seulement si elle est de
même signe** que le reste :

```
pris = 0                                   si candidat = 0, reste = 0, ou signes opposés
pris = min(candidat, reste)                si reste > 0
pris = max(candidat, reste)                si reste < 0
reste = reste − pris
```

| # | Catégorie | Montant candidat | Explication |
|---|---|---|---|
| 1 | **Vérifications de carte** | nb de lignes MIPS à 0 × **Rs 10** (MUR) ou × **1** (EUR, USD) | MCB les compte en PURCHASE, MIPS à 0. Marchands typiques : MyFit 360, Club Med, Avis, Hertz, Summertimes |
| 2 | **Décalage de clearing fin de mois** | somme des écarts journaliers sur les **2 derniers jours** du mois, plus tous les jours **après la dernière date du fichier MCB** | Fichier MCB extrait tôt ; le report réapparaît le mois suivant (§ 3.2). Le nombre de jours est configurable |
| 3 | **Liste de surveillance** | − montant MIPS des lignes dont `last_merchant_mid` est dans la liste | Nouveaux MID Constance `1030001080` / `1030001070`, absents du fichier MCB. **Suivi en cumulé** (mars → juin 2026 : $577 837) |
| 4 | **Présent uniquement côté MIPS** | tout le reste, **si MCB = 0** | Récurrents : Scott Home Delivery, Caudan, AllSport, Ramtoola, Al Ameen, Omarjee… |
| 5 | **Présent uniquement côté MCB** | tout le reste, **si MIPS = 0** | Récurrents : Emtel, Fine & Country, Schindlers, Alicia |
| 6 | **Transactions manquantes côté MCB (vrais écarts)** | ce qui reste | À investiguer et à réclamer (§ 8). Suspect connu : AMEX de Sport Events (3 mois consécutifs, avril → juin) |

**Écart volontaire par rapport à la procédure.** La procédure place Constance après « MCB = 0 / MIPS = 0 ».
Comme les MID Constance sont **absents du fichier MCB**, ils tomberaient tous dans « présent uniquement côté MIPS »
et ne seraient jamais suivis à part. La référence les traite donc **avant**. **À valider par Florent.**

### Invariant de bouclage — à vérifier par le code

```
vérifs + clearing + surveillance + MIPS seul + MCB seul + vrais écarts = écart       (pour CHAQUE ligne)
somme des catégories par devise = écart total de la devise                           (au centime)
```

Si l'égalité n'est pas exacte, **lever une erreur et ne rien enregistrer** : on ne livre jamais un
rapprochement qui ne boucle pas. La ligne « Non expliqué » doit toujours afficher 0,00.

---

## 7. Étape 5 — % d'écart (par devise)

Écart rapporté au volume MIPS de la devise. 4 vues, mois précédent à côté :

| Vue | Calcul |
|---|---|
| Global | écart / MIPS |
| Hors liste de surveillance (hors Constance) | (écart − catégorie 3) / (MIPS − montant MIPS des MID surveillés) |
| **Bundle** | Uniquement les marchands ayant **au moins une** transaction `order_is_bundled = 1`, **gardés en entier**. Les marchands 100 % `order_is_bundled = 0` (acquiring direct) sont exclus de cette vue mais restent dans les vues globales. MCB n'a pas de marqueur bundle, d'où le filtrage au niveau marchand |
| Écart réel | catégorie 6 / MIPS |

Un **% toutes devises confondues** peut être affiché, mais **libellé comme indicatif** (devises additionnées sans conversion).

---

## 8. Étape 6 — Vrais écarts et réclamation MCB

- Pour chaque ligne avec un vrai écart **négatif** (MCB < MIPS) : identifier les **jours** où MCB est en dessous, puis
  lister les **transactions MIPS** de ce MID ces jours-là (date, référence, réseau carte, montant).
- **Ce sont des candidates, pas une preuve.** Ne jamais présenter une reconstitution par somme de sous-ensemble comme certaine
  quand plusieurs combinaisons sont possibles. L'écran et l'export doivent le dire.
- Vrai écart **positif** (MCB > MIPS) : aucune transaction MIPS à lister. L'afficher clairement.

---

## 9. Écrans et exports

**Écran d'une période** :
1. En-tête : fichiers, nombre de lignes et période couverte de chaque côté, alertes du § 3.
2. **Synthèse par devise** : total MCB, total MIPS, écart, les 6 catégories, « Non expliqué = 0 ».
3. **% d'écart** : 4 vues, mois courant et mois précédent.
4. Cumul de la liste de surveillance depuis le début.
5. Suggestions de correspondances MID.
6. **Écarts par marchand** : filtres par catégorie et par devise, lien vers la fiche marchand si le MID est connu.
7. **Détail journalier et transactions candidates** pour une ligne.
8. Bouton « Recalculer » (après modification des correspondances ou de la liste de surveillance).

**Exports** (livrables actuels de la procédure ; en Excel mis en forme, en Arial, avec des nombres et non du texte) :

| Fichier | Contenu |
|---|---|
| `Recon_MCB_vs_MIPS_MMAAAA.xlsx` | Synthèse (devises, causes, résiduel = 0), écarts par marchand, correspondances MID |
| `Synthese_pourcentage_ecart_MMAAAA.xlsx` | 4 vues % (global, hors Constance, bundle, écart réel), comparatif avec le mois précédent, **un onglet par devise** (bandeau totaux / écart / %, puis écarts par marchand avec la catégorie, et une ligne de contrôle à zéro) |
| `Reclamation_MCB_MMAAAA.xlsx` | Uniquement s'il y a des vrais écarts : détail par transaction (référence de commande, horodatage, réseau, MID) |

La référence produit aujourd'hui ces trois contenus en **CSV**. Le format Excel ci-dessus reste à faire.

---

## 10. Données, sécurité, traçabilité

- Conserver les **deux fichiers sources** avec leur empreinte sha256, hors de la racine web, pour pouvoir recalculer et auditer.
- Un rapprochement est rattaché à un mois. On peut en relancer plusieurs, et la comparaison avec le mois précédent prend
  **le dernier** rapprochement de ce mois.
- Tracer : lancement (qui, fichiers, sha256), recalcul, modification des correspondances et de la liste de surveillance, exports.
- Accès réservé aux rôles finance et admin. Fichiers volumineux : lecture en flux (streaming), pas de chargement complet en mémoire.

---

## 11. Recette

| # | Test | Attendu |
|---|---|---|
| 1 | **Un mois déjà rapproché à la main** (ex. juin 2026) | Mêmes totaux par devise, mêmes catégories, mêmes vrais écarts que le classeur de l'époque. **Bloquant** |
| 2 | Chaque ligne, chaque devise | Somme des catégories = écart, au centime ; « Non expliqué » = 0,00 |
| 3 | Extraction « no_qr » (toutes lignes bundle = 1) | Alerte bloquante affichée |
| 4 | CEB absent | Alerte sentinelle |
| 5 | Lignes MCB datées du mois précédent | Exclues, total affiché ; le mois suivant ne les compte pas deux fois |
| 6 | MID ancien côté MCB, nouveau côté MIPS, correspondance chargée | Écart nul sur ce marchand |
| 7 | Deux lignes unilatérales qui s'annulent | Suggestion de correspondance ; une fois ajoutée et recalculée, écart résolu |
| 8 | 3 lignes MIPS à 0 sur un MID en MUR, MCB +30 | Catégorie « vérifications de carte » = 30,00 |
| 9 | Transaction le dernier jour du mois absente de MCB | Catégorie « clearing » |
| 10 | Lignes Constance via `last_merchant_mid` | Catégorie « surveillance », cumul mis à jour |
| 11 | Transaction absente de MCB en milieu de mois | Vrai écart ; elle figure dans les candidates et dans l'export réclamation |
| 12 | Fichier sans colonne obligatoire | Refus avec le nom de la colonne attendue |

La référence passe les tests 2 à 12 sur des fichiers synthétiques. **Le test 1 n'a jamais été fait.**

---

## 12. Hors périmètre de cette version

- **Rapprochement QR** (Dynamic QR) : même logique, autres clés. Côté MCB `MERCHANT_TRADE_ID` (TUI), côté MIPS
  `dynamic_qr_03_info`. Au niveau transaction : `FT_REFERENCE` ↔ `transaction_reference` quand le fichier MCB est détaillé.
  **Toujours agréger par TUI** : un TUI peut porter plusieurs formes MIPS (ex. Bear Necessities + Kuumba sur TUI240180054155).
- **Bill Presentment, Pay+/PSMax PowerCard** : même méthode, clés propres à chaque fichier.
- **Trust, fonds reçus, règlements aux marchands** : non couverts (voir l'avertissement en tête).

---

## 13. Questions à trancher avec Florent

1. **Colonne de date** du fichier MCB, et présence éventuelle d'une colonne de **nombre de transactions**.
2. Ordre **Constance avant « MIPS seul »** (§ 6) : validé ?
3. **Nombre de jours** du décalage de fin de mois (2 par défaut).
4. Côté MIPS : **fichier ALL BUNDLE** ou **lecture directe** ? Si lecture directe, quel filtre reproduit exactement l'extraction ?
5. Qui **valide** une nouvelle correspondance MID, et qui envoie la **réclamation** à MCB ?
6. Priorité du **rapprochement QR** (phase 2).
