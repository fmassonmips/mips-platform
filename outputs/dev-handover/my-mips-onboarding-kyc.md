# my.mips.mu — Onboarding marchand et KYC/KYB

**Pour :** le développeur de my.mips.mu
**De :** Florent Masson (MIPS)
**Implémentation de référence (back-office uniquement) :** dépôt `fmassonmips/mips-platform`, branche `ccr-a3522d3b-pyyp68` (PR #10, prototype non fusionné)
— `src/Onboarding/Kyc.php` (règles), `src/Controllers/Onboarding/OnboardingController.php` (API),
`tools/kyc_reminders.php` (relances planifiées), `sql/schema.sql` (tables `onboarding_cases`, `kyc_*`),
`config/config.php` (rubrique `kyc`)

> **À valider par le responsable conformité avant de coder les seuils.** La liste des pièces, le seuil
> de bénéficiaire effectif (25 %), les durées de revue (1, 2 et 3 ans), la règle « PEP ⇒ risque élevé » et les durées de
> conservation sont des **valeurs par défaut raisonnables**, pas une transcription des obligations AML/CFT
> applicables à MIPS ni de sa procédure interne. Tout ce qui est marqué **[CONFORMITÉ]** doit être confirmé
> par écrit. Le code doit lire ces valeurs dans la configuration, jamais les coder en dur.

> **Dossier BoM.** Les écrans **côté marchand** demandés pour le dossier SPIN/BoM (acceptation des
> conditions générales, préqualification, upload des pièces, suivi du dossier) **n'existent pas dans la référence**.
> Ils sont spécifiés en § 10 (phase 2). Ne pas présenter la phase 1 comme un portail marchand.

---

## 1. Objectif

Remplacer le suivi par email et tableur par un **dossier d'onboarding par marchand**, dans lequel :

1. on collecte et on vérifie les **pièces de la société (KYB)** et des **personnes** (administrateurs, bénéficiaires effectifs, signataires) ;
2. on enregistre le **contrôle sanctions/PEP** et la **note de risque** ;
3. la décision suit un **circuit à deux personnes** (« 4 yeux ») et ne peut pas être prise tant que le dossier est incomplet ;
4. le marchand est **relancé** automatiquement pour les pièces manquantes ;
5. une **revue périodique** est programmée selon le risque ;
6. **tout est tracé** (qui, quoi, quand), et les pièces sont conservées avec leur empreinte.

**Phase 1 (référence existante)** : back-office, utilisé par le personnel MIPS. Le marchand envoie ses pièces par email.
**Phase 2 (§ 10)** : portail marchand. Le prospect remplit la préqualification, accepte les conditions et dépose lui-même ses pièces.

---

## 2. Rôles et séparation des tâches

| Rôle | Peut |
|---|---|
| **Analyste** (rôle `finance` ou équivalent) | Ouvrir un dossier, déposer des pièces, saisir les personnes et le contrôle sanctions/PEP, noter le risque, soumettre en revue, relancer le marchand |
| **Relecteur de pièce** | Accepter ou refuser une pièce, **à condition de ne pas être celui qui l'a déposée** |
| **Approbateur** (rôle `admin`, configurable [CONFORMITÉ]) | Approuver ou refuser un dossier, **à condition de ne pas être l'analyste assigné** (ni son créateur s'il n'est pas assigné) |

Ces règles sont **appliquées par le serveur**, pas seulement par l'interface. Toute tentative refusée est tracée.

---

## 3. Modèle de données

| Table | Contenu clé |
|---|---|
| `onboarding_cases` | marchand, `kind` (`initial` / `periodic_review`), `status`, `risk_rating` (`low`/`medium`/`high`), analyste assigné, échéance, notes, dates de soumission et de décision, approbateur, note de décision, **date de prochaine revue** |
| `kyc_parties` | dossier, nom, **rôles multiples** (administrateur, bénéficiaire effectif, signataire, actionnaire : une même personne peut cumuler), % de détention, nationalité, date de naissance, **n° de pièce d'identité chiffré**, indicateur PEP, résultat du contrôle (`pending` / `clear` / `match`), référence du contrôle, date |
| `kyc_documents` | dossier, type de pièce, personne (si pièce personnelle), chemin du fichier, nom d'origine, type MIME, taille, **sha256**, date d'expiration, statut (`pending` / `accepted` / `rejected`), déposant, relecteur, motif de refus |
| `kyc_reminders` | dossier, destinataire, liste des éléments relancés, auteur (ou « scheduler »), envoi réussi ou non |

**Une seule** affaire ouverte par marchand à la fois.

---

## 4. Liste des pièces (configurable) [CONFORMITÉ]

Pièces **par dossier** (société) :

| Code | Pièce | Obligatoire |
|---|---|---|
| `incorporation` | Certificat d'incorporation | oui |
| `brn` | Certificat BRN | oui |
| `constitution` | Statuts (constitution) | non |
| `registers` | Registres des administrateurs et des actionnaires | oui |
| `bank_proof` | Preuve de compte bancaire (lettre ou relevé) | oui |
| `business_address` | Justificatif d'adresse de l'entreprise | oui |
| `vat` | Certificat TVA (si assujetti) | non |
| `website` | CGV, politique de remboursement et de confidentialité (e-commerce) | non |
| `contract` | Contrat marchand MIPS signé | oui. **Satisfait automatiquement** si un contrat signé avec son PDF figure sur la fiche marchand |

Pièces **par personne** (pour chaque administrateur, bénéficiaire effectif et signataire) :

| Code | Pièce | Obligatoire | Expiration |
|---|---|---|---|
| `id` | Pièce d'identité (passeport ou carte nationale) | oui | **date obligatoire au dépôt** ; une pièce expirée compte comme manquante |
| `address_proof` | Justificatif de domicile (moins de 3 mois) | oui | — |

Statut d'une pièce dans la liste = statut de son **dernier dépôt** : `missing`, `pending`, `accepted`, `rejected` ou `expired`.
Les dépôts précédents restent visibles (historique).

---

## 5. Statuts du dossier et transitions

```
collecting ──▶ under_review ──▶ approved
    │   ▲           │   │
    │   └───────────┘   └──▶ rejected
    ▼                │
 on_hold ◀───────────┘   (on_hold ─▶ collecting | under_review | rejected)
```

| Transition | Qui | Conditions |
|---|---|---|
| `collecting → under_review` (soumettre) | Analyste | — |
| `under_review → collecting` (renvoyer) | Analyste | — |
| `* → on_hold` | Analyste | — |
| `under_review → approved` | Approbateur ≠ analyste | **aucun blocage** (§ 6) ; note de décision obligatoire |
| `under_review / on_hold → rejected` | Approbateur ≠ analyste | note de décision obligatoire |

`approved` et `rejected` sont **définitifs** : le dossier n'est plus modifiable. La suite passe par un nouveau dossier.

À l'**approbation** :
- le marchand passe de « prospect » ou « en onboarding » à **actif** ;
- la **date de prochaine revue** est fixée selon le risque : faible 3 ans, moyen 2 ans, élevé 1 an [CONFORMITÉ].

Au **refus** : le statut du marchand n'est pas modifié automatiquement. Décision à prendre (§ 12, question 4).

---

## 6. Blocages d'approbation (calculés et affichés en permanence)

L'approbation est **refusée par le serveur** tant que l'un de ces points subsiste, et l'écran les liste tous :

1. Raison sociale et BRN non renseignés sur la fiche marchand.
2. Une pièce obligatoire n'est pas `accepted` (manquante, en attente, refusée ou expirée), au niveau de la société ou d'une personne.
3. Aucun administrateur enregistré.
4. Aucun bénéficiaire effectif enregistré.
5. Une personne détient **au moins le seuil** (25 % par défaut [CONFORMITÉ]) sans être déclarée bénéficiaire effectif.
6. Une personne soumise aux pièces n'a pas de contrôle sanctions/PEP `clear` : non fait, ou **`match` à résoudre**.
7. Risque non noté.
8. Une personne est **PEP** et le risque n'est pas **élevé** [CONFORMITÉ].

---

## 7. Pièces : stockage et sécurité

- Formats acceptés : **PDF, JPEG, PNG**, vérifiés **sur le contenu** (type MIME détecté), pas sur l'extension. Taille max 20 Mo (configurable).
- Fichiers stockés **hors de la racine web**, sous un nom aléatoire. Téléchargement **uniquement par une route authentifiée**,
  avec contrôle du rôle, en pièce jointe, **chaque téléchargement étant tracé**.
- **sha256** enregistré au dépôt et écrit dans le journal d'audit : preuve que la pièce n'a pas été modifiée.
- **Une pièce relue (acceptée ou refusée) n'est jamais supprimée.** Seul son déposant peut retirer une pièce encore
  en attente. Lors d'une revue périodique, les fichiers sont partagés entre dossiers : ne supprimer le fichier physique
  que si plus aucun dossier ne le référence.
- Refus d'une pièce : **motif obligatoire**, repris dans l'email de relance au marchand.

### Données personnelles (Data Protection Act 2017, Maurice) [CONFORMITÉ]

- **N° de pièce d'identité chiffré** au repos (clé applicative hors base de données). Jamais affiché en clair dans les listes, jamais écrit dans le journal d'audit ni dans les logs.
- Ne collecter que le nécessaire. Pas de copie de pièce d'identité dans un email sortant.
- **Durée de conservation** des dossiers et des pièces après la fin de la relation : **à fixer par la conformité**. La règle de purge n'est pas implémentée dans la référence.
- Accès limité aux rôles du § 2.

---

## 8. Contrôle sanctions / PEP

**Phase 1 (référence)** : résultat **saisi à la main** par personne (`pending` / `clear` / `match`), avec la référence
de l'outil utilisé et la date. Si le résultat change, la date est remise à jour.

**Limites à corriger (recommandé) :**
- **pas d'adverse media** ;
- **aucun outil de filtrage connecté** ;
- **pas de contrôle continu** : pas de re-screening automatique des personnes déjà approuvées.

Recommandation pour la suite : intégrer un fournisseur de screening (sanctions, PEP, adverse media) avec une API, et stocker :
- la date du contrôle et le fournisseur ;
- l'identifiant de recherche ;
- le résultat ;
- la décision de l'analyste sur chaque correspondance (faux positif ou correspondance confirmée), avec justification.

Prévoir un re-screening périodique et à chaque mise à jour des listes.

---

## 9. Relances, revues périodiques, alertes

**Relance manuelle** : un bouton envoie au contact du marchand la liste de ce qui manque, est refusé ou a expiré, avec les motifs de refus et l'échéance du dossier.
Destinataire : contact principal, à défaut contact facturation, à défaut l'email de facturation de la fiche.

**Relance automatique** (tâche planifiée quotidienne, avec une option « simulation » qui n'envoie rien) :
- dossiers en `collecting` ayant des pièces obligatoires à fournir ;
- au plus **1 relance tous les 7 jours** et **5 au total** (configurable) ;
- tracée comme « scheduler ».

**Revue périodique** : depuis la fiche marchand, « Démarrer une revue » ouvre un dossier `periodic_review` qui **reprend** :
- les personnes, avec le **contrôle sanctions/PEP remis à « non fait »** ;
- les pièces acceptées **encore valides**, remises **en attente** pour reconfirmation, et non redemandées au marchand.

**Alertes** sur la liste des dossiers :
- dossiers en retard ;
- revues périodiques dues dans les 60 jours ;
- pièces d'identité qui expirent dans les 60 jours.

---

## 10. Phase 2 — Portail marchand (non implémenté, à spécifier en détail)

Requis pour démontrer le parcours côté marchand (dossier BoM, emplacements S01, S03 et S04).

1. **Acceptation des conditions générales**
   - versionnement des conditions ;
   - acceptation obligatoire à la première connexion et à chaque nouvelle version ;
   - journal du consentement : utilisateur, version, date et heure, adresse IP, texte présenté (ou son empreinte).
2. **Préqualification** (pre-check prospect), avant l'ouverture du dossier :
   - identité de l'entreprise : raison sociale, BRN, pays d'immatriculation ;
   - activité, produits et services, site web ;
   - pays d'activité ;
   - volumes mensuels et panier moyen attendus ;
   - moyens de paiement demandés (carte, QR, push-to-phone, e-commerce, TPE).

   Règles d'éligibilité et risque initial à définir [CONFORMITÉ]. Le résultat crée le marchand en « prospect » et ouvre le dossier.
3. **Dépôt des pièces par le marchand** : la même liste que le § 4, avec le statut de chaque pièce et le motif de refus visibles. Les mêmes contrôles de fichier qu'au § 7, plus un antivirus.
4. **Suivi du dossier** : étapes (préqualification, pièces, revue, décision), éléments restants, et distinction claire entre « dossier soumis » et « marchand approuvé ».
5. **Sécurité du portail** :
   - comptes marchands séparés des comptes du personnel ;
   - double authentification ;
   - un marchand ne voit **que** son dossier (contrôle d'accès au niveau de l'objet) ;
   - limitation du débit des dépôts.

---

## 11. Recette

| # | Test | Attendu |
|---|---|---|
| 1 | Type de pièce inconnu, mauvais format (fichier renommé en `.pdf`) | Refus |
| 2 | Pièce d'identité sans date d'expiration, ou déjà expirée | Refus |
| 3 | Le déposant tente d'accepter sa propre pièce | Refus (4 yeux) |
| 4 | Refus d'une pièce sans motif | Refus |
| 5 | Approbation par un analyste (rôle non approbateur) | Refus 403 |
| 6 | Approbation par l'analyste assigné, même s'il est admin | Refus (4 yeux) |
| 7 | Approbation sans note | Refus |
| 8 | Actionnaire à 30 % non déclaré bénéficiaire effectif | Blocage affiché, approbation refusée |
| 9 | Personne PEP avec un risque « moyen » | Blocage |
| 10 | Contrôle sanctions `match` | Blocage |
| 11 | Contrat signé avec PDF sur la fiche marchand | La pièce « contrat » passe en `accepted` |
| 12 | Approbation complète, risque élevé | Marchand actif, prochaine revue à +1 an |
| 13 | Modification d'un dossier approuvé | Refus |
| 14 | Revue périodique | Personnes reprises avec contrôle « non fait » ; pièces valides reprises en attente ; suppression d'une copie sans perte du fichier d'origine |
| 15 | Relance automatique lancée deux fois le même jour | Un seul envoi |
| 16 | Email de relance | Liste exacte des pièces manquantes, motifs de refus inclus |
| 17 | N° de pièce d'identité | Chiffré en base ; absent des logs et du journal d'audit |
| 18 | Téléchargement d'une pièce | Tracé ; impossible sans être connecté avec le bon rôle |

La référence passe ces 18 tests (phase 1) sur des données fictives.

---

## 12. Questions à trancher

1. **[CONFORMITÉ]** Liste des pièces, seuil de bénéficiaire effectif, durées de revue, règle PEP, mesures renforcées pour les risques élevés.
2. **[CONFORMITÉ]** Durée de conservation et règle de purge des dossiers et des pièces.
3. **Fournisseur de screening** (sanctions, PEP, adverse media) et budget.
4. Effet d'un **refus de dossier** sur le statut du marchand (« résilié » ? nouveau statut « refusé » ?).
5. Qui est **approbateur** (rôle admin seulement, ou responsable conformité nommé) ?
6. **Phase 2 (portail marchand)** : priorité et calendrier, compte tenu du dossier BoM.
