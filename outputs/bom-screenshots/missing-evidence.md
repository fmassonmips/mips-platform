# Preuves manquantes — dossier SPIN DIGITAL / BoM

Constat établi le 2026-10-27 sur le dépôt `mips-platform` (commit `590d8d8`, prototype non déployé).
Une absence dans ce dépôt **ne prouve pas** l'absence dans la plateforme MIPS de production. Ces écrans doivent
être recherchés dans le système réel (back-office V3, portail marchand) avant de conclure qu'ils n'existent pas.

## 1. Les 7 vues demandées

| Vue | État dans le prototype | À fournir |
|---|---|---|
| S01 Connexion + T&Cs | Connexion et 2FA présentes (personnel). **Acceptation des T&Cs absente** : pas de version de conditions, pas de trace de consentement. | Captures du portail marchand réel avec l'étape d'acceptation, la version des conditions et la trace horodatée du consentement. |
| S02 Parcours d'onboarding | Présent, **vue interne seulement**. | Vue côté marchand (feuille de route / étapes), si elle existe. |
| S03 Préqualification | **Absent.** Fiche marchand interne sans activité, pays, volumes attendus ni moyens de paiement. | Formulaire de pré-check vu par le prospect, dans le système réel. |
| S04 Collecte KYB | Présent, **vue interne seulement** ; dépôt fait par le personnel. | Écran d'upload côté marchand avec la liste des pièces, si elle existe. |
| S05 Portail général | **Pas de portail marchand** ; seule la navigation du back-office existe. | Espace marchand réel (navigation, contexte marchand, rôle). |
| S06 Dashboard marchand | **Absent** ; seul un rapport interne agrégé existe. | Capture 1 (back-office V3) ou dashboard marchand réel, en distinguant volume traité, fonds encaissés, fonds reçus et montants réglés. |
| S07 Règlement | Rapprochement acquéreur ↔ plateforme présent ; **pas de rapprochement trust, pas de validation de règlement**. | Rapprochement du compte trust (fonds reçus vs droits des marchands) et circuit de validation des règlements. |

## 2. Contrôles complémentaires (attendus par la BoM, sections 10, 11 et 13 du formulaire)

| Contrôle | État dans le prototype |
|---|---|
| Screening AML (sanctions, PEP, adverse media) | **Partiel** : résultat et référence de contrôle sanctions/PEP **saisis à la main** par personne (S04b). Aucun outil de filtrage connecté, **pas d'adverse media**, aucun filtrage continu ni re-screening automatique. |
| Surveillance des transactions / antifraude | **Absent** : aucune règle, aucune alerte, aucun score. Le reporting signale seulement des anomalies de volume (« spike » d'un marchand), ce qui n'est pas un dispositif AML. |
| Trust, droits des marchands, contrôle des règlements | **Absent** : pas de grand livre des droits des marchands, pas de rapprochement du compte trust, pas de circuit de validation des paiements aux marchands. |
| Remboursements et chargebacks | **Absent** : les remboursements sont seulement comptés dans le reporting. Aucun traitement, aucune gestion de litige. |
| Réclamations et suivi des échéances | **Absent** : pas de registre de réclamations ni de délais de traitement. Le seul suivi d'échéances existant porte sur les dossiers KYC et les préavis de contrats. |
| Rôles, permissions, séparation préparateur/approbateur | **Présent** (C01, C03, C04) : 3 rôles ; accès par module ; double regard sur l'acceptation des pièces KYC et sur l'approbation des dossiers. Pas de séparation préparateur/approbateur sur la facturation ni sur le rapprochement. |
| Journal d'audit | **Présent** (C02) : en ajout seul, avec filtres. Inaltérabilité dépendant des droits de la base de données. |

## 3. Spécifications à rédiger séparément (non implémentées ici)

Proposées pour décision, **sans implémentation dans le cadre de cette demande** :

1. **Acceptation des T&Cs** : versionnement des conditions, acceptation obligatoire à la première connexion et à chaque nouvelle version, journal du consentement (utilisateur, version, horodatage, IP).
2. **Portail marchand** : espace sécurisé pour le prospect et le marchand, avec pré-check, suivi des étapes, upload des pièces KYB et dashboard.
3. **Formulaire de préqualification** : identité, activité et produits, pays, volumes attendus, moyens de paiement, avec règles d'éligibilité et de risque initial.
4. **Trust et règlement** : grand livre des droits des marchands, rapprochement quotidien du compte trust, circuit de validation des règlements en double regard.
5. **Surveillance des transactions** : règles et seuils, file d'alertes, investigation, déclaration de soupçon.
6. **Remboursements, chargebacks, réclamations** : registres, statuts, délais, escalade.
7. **Screening AML** : intégration d'un fournisseur (sanctions, PEP, adverse media), avec re-screening périodique.

## 4. Points à vérifier avant insertion dans B01 / G01

- Légendes : utiliser les **légendes exactes** du registre, pas les légendes génériques demandées, partout où elles surestiment la fonction (S01, S05, S06, S07).
- Bandeau DEMO : il doit rester visible sur toute image insérée.
- Références MIPS INTERNATIONAL / FSC dans B01 et G01 : **non vérifiées**, je n'ai pas eu ces documents.
- Toute capture d'un système réel doit masquer les données personnelles et bancaires, les clés API, les tokens et les certificats.
