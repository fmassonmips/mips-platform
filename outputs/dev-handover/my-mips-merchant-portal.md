# my.mips.mu — Portail marchand (onboarding, phase 2)

**Pour :** le développeur de my.mips.mu
**De :** Florent Masson (MIPS)
**Implémentation de référence :** dépôt `fmassonmips/mips-platform`, branche `ccr-a3522d3b-pyyp68` (PR #10, prototype non fusionné, commit `d91d250`)
— `public/portal/` (pages marchand), `src/Portal/` (règles), `src/Controllers/Portal/` (API),
`src/Onboarding/DocumentStore.php` (stockage des pièces, antivirus), `sql/schema.sql` (tables `portal_*`, `terms_*`, `prequalifications`),
`config/config.php` (rubrique `portal`). Captures : `outputs/screens/portal/` (P01 à P14).
**Prérequis :** le module back-office onboarding/KYC décrit dans `my-mips-onboarding-kyc.md` (dossiers, checklist, double regard, blocages).

> **Ce document décrit le comportement attendu, pas une technologie.** Je ne connais pas la stack de my.mips.mu :
> la référence est en PHP 8.3 / MariaDB, à transposer. Les règles de sécurité (§ 6) et les tests (§ 11) sont
> à respecter quelle que soit la stack.

> **[CONFORMITÉ] / [JURIDIQUE].** Le texte des conditions d'utilisation, la liste des secteurs sensibles, la tranche de
> volume signalée et la formulation de la question PEP sont des **valeurs provisoires**. Elles doivent être validées par
> écrit avant la mise en service, et lues dans la configuration, jamais codées en dur.

---

## 1. Objectif

Permettre à un **prospect** de faire lui-même son entrée en relation avec MIPS, sans échange de pièces par email :

1. créer un compte sécurisé (email confirmé, double authentification obligatoire) ;
2. accepter les **conditions d'utilisation**, dans leur version en vigueur, avec trace du consentement ;
3. remplir la **préqualification** (société, activité, paiements, volumes) ;
4. après acceptation par MIPS, **déclarer les personnes** (administrateurs, bénéficiaires effectifs, signataires) et **déposer les pièces KYB** ;
5. **suivre l'avancement** du dossier jusqu'à la décision.

Le portail ne couvre **pas** l'espace d'un marchand actif (transactions, relevés, règlements) : hors périmètre.

---

## 2. Principes d'architecture

| Principe | Règle |
|---|---|
| Comptes séparés | Les comptes marchands sont dans une **table distincte** des comptes du personnel. Un compte marchand ne peut jamais obtenir un rôle du personnel. |
| Session séparée | **Cookie de session distinct** (référence : `MIPSPORTAL`). Une session marchand ne contient aucun droit du personnel, et inversement. Testé dans les deux sens. |
| Accès à l'objet | Le dossier n'est **jamais pris dans la requête** : c'est toujours le dossier ouvert depuis la candidature du compte connecté. Tout identifiant reçu (personne, pièce) est vérifié comme appartenant à ce dossier. |
| Données exposées | Le marchand ne voit **jamais** : note de risque, résultat du filtrage sanctions/PEP, blocages internes, notes internes, signaux de la préqualification, noms des employés MIPS. |
| Décisions | Le portail **ne décide rien** : acceptation de la préqualification et approbation du dossier restent des actions MIPS (approbation en double regard, voir spec KYC). |
| Journal | Chaque action du marchand est tracée dans le journal d'audit, acteur `portal:<email>`, et apparaît dans l'historique du dossier côté MIPS. |

---

## 3. Modèle de données (nouveau)

| Table | Contenu clé |
|---|---|
| `portal_users` | email (unique), hash du mot de passe, date de changement du mot de passe, nom, téléphone, actif oui/non, **date de confirmation de l'email**, secret TOTP **chiffré**, date d'activation 2FA, dernier pas TOTP utilisé (anti-rejeu), dernière connexion |
| `portal_recovery_codes` | compte, **hash** du code de secours, date d'utilisation |
| `portal_tokens` | compte, usage (`verify` / `reset`), **sha256 du jeton** (jamais le jeton), expiration, date d'utilisation |
| `terms_versions` | n° de version (unique), titre, texte (brut), **sha256 du texte**, publié par, date. **Jamais modifié après publication.** |
| `terms_acceptances` | compte, version, sha256 du texte accepté, date, IP, navigateur. Unique (compte, version). |
| `prequalifications` | compte, statut (`submitted` / `accepted` / `declined`), champs du § 5.3, signaux (JSON, internes), décision (par, date, note interne), marchand et dossier créés |

Colonnes ajoutées aux tables du module KYC :

| Table | Colonne | Usage |
|---|---|---|
| `kyc_documents` | `uploaded_by_portal` | pièce déposée par le marchand (dans ce cas `uploaded_by` est vide) |
| `kyc_documents` | `scan_status` | `clean` (antivirus passé) ou `not_scanned` |
| `kyc_parties` | `declared_by_portal` | personne déclarée par le marchand |
| `onboarding_cases` | `merchant_submitted_at` | le marchand a envoyé son dossier ; **remis à vide** quand MIPS renvoie le dossier en collecte |

---

## 4. Parcours et gardes

```
inscription ─▶ email confirmé ─▶ connexion ─▶ 2FA activée ─▶ CGU acceptées ─▶ préqualification
                                                  (garde 1)      (garde 2)            │
                                        MIPS accepte ◀───────────────────────────────┘
                                             │                    MIPS refuse ─▶ fin (email neutre)
                                             ▼
                          personnes + pièces ─▶ « dossier complet » envoyé ─▶ revue MIPS ─▶ décision
```

**Gardes**, appliquées **par le serveur** sur toutes les pages et toutes les API du portail (sauf les pages de sécurité et de CGU elles-mêmes) :

1. pas de 2FA activée → refus (page : redirection vers Sécurité ; API : 403 avec l'adresse de redirection) ;
2. aucune version de CGU publiée → **portail fermé** ;
3. version courante non acceptée → redirection vers les CGU. Une **nouvelle version** bloque à nouveau tous les marchands jusqu'à acceptation.

---

## 5. Écrans marchand

### 5.1 Compte
- **Inscription** : nom, email, téléphone (facultatif), mot de passe (8 caractères minimum) et confirmation. Réponse **identique** que l'adresse existe ou non. Si elle existe déjà et est confirmée, le titulaire reçoit un email « vous avez déjà un compte ».
- **Confirmation** : lien valable 48 h, à usage unique. La page de confirmation demande **un clic** (POST) : les antivirus de messagerie qui ouvrent les liens ne doivent pas consommer le jeton.
- **Pré-détournement de compte** : une nouvelle inscription sur une adresse non confirmée **renvoie seulement un lien**, elle ne remplace jamais le mot de passe.
- **Connexion** : refusée tant que l'email n'est pas confirmé ; message générique en cas d'erreur ; limitation des tentatives par IP et par email.
- **Double authentification** : TOTP (QR code + clé), confirmation par un code, **10 codes de secours** affichés une fois. **Le marchand ne peut pas la désactiver.** Perte du téléphone et des codes : procédure manuelle MIPS (vérification d'identité), à définir.
- **Mot de passe oublié / changement** : lien valable 60 min ; tout changement **ferme les autres sessions** ; la 2FA reste en place.

### 5.2 Conditions d'utilisation
- Affiche titre, n° de version, date et **texte brut** (aucun HTML interprété).
- Case « J'ai lu et j'accepte au nom de l'entreprise que je représente » obligatoire.
- Le navigateur renvoie l'identifiant de version **et le sha256 du texte affiché** ; le serveur refuse si ce n'est plus la version courante (texte changé entre-temps).
- Si le marchand avait accepté une version antérieure : message « les conditions ont changé ».

### 5.3 Préqualification (une seule par compte, non modifiable après envoi)

| Bloc | Champs (* obligatoire) |
|---|---|
| Société | raison sociale*, nom commercial*, BRN* (lettres, chiffres, « / », « - »), n° TVA, pays d'immatriculation*, adresse du siège* |
| Activité | secteur* (liste configurable), produits et services*, site web (obligatoire si paiement en ligne), pays de vente* |
| Paiements | moyens souhaités* (carte, QR, push-to-phone, en ligne, TPE), volume mensuel attendu* (tranches configurables), ticket moyen en MUR* |
| Régulation | licence oui/non, régulateur (obligatoire si oui) |
| Contact | nom*, fonction, téléphone* |
| Déclaration | « informations exactes et complètes, je suis habilité » * |

**Signaux** calculés pour l'analyste, **jamais montrés au marchand** et **jamais décisionnels** [CONFORMITÉ] :
secteur sensible, immatriculation ou activité hors de Maurice, tranche de volume signalée, activité régulée (licence à vérifier).

### 5.4 Pièces et personnes (après acceptation de la préqualification)
- **Personnes** : nom (tel que sur la pièce), rôles (administrateur, bénéficiaire effectif, signataire, actionnaire ; cumulables), % de détention, nationalité*, date de naissance* (16 ans minimum), case PEP [CONFORMITÉ : formulation].
  - Le marchand ne modifie ou supprime **que les personnes qu'il a déclarées**.
  - Il peut **déclarer** une personne PEP mais **jamais retirer** un statut PEP (posé par lui ou par MIPS).
  - Modifier le nom, la nationalité ou la date de naissance **remet le filtrage sanctions/PEP à faire**.
  - Personne dont une pièce est déjà acceptée : **verrouillée** (contacter MIPS). Personne avec des pièces déposées : non supprimable.
- **Pièces** : même liste que le back-office (checklist configurable). Pour chaque ligne : statut lisible (« À déposer », « Reçue — en cours de vérification », « Acceptée », « Non acceptée » + **motif saisi par MIPS**, « Expirée »), nom du fichier **seulement si le marchand l'a déposé lui-même**, « Fournie à MIPS » sinon.
  - Dépôt possible si la pièce n'est pas acceptée, ou si elle expire (renouvellement). Date d'expiration obligatoire pour les pièces d'identité, et dans le futur.
  - Retrait possible **uniquement** d'un dépôt personnel encore non vérifié. Une pièce vérifiée reste au dossier.
  - Le **contrat MIPS signé** ne bloque pas l'envoi du dossier (MIPS l'émet) ; il reste exigé pour l'approbation.
- **Dépôts autorisés** quand le dossier est en collecte ou en attente ; **refusés pendant la revue** (« MIPS examine votre dossier »).
- **Envoi du dossier** : bouton actif seulement si rien ne manque (au moins un administrateur, au moins un bénéficiaire effectif, toutes les pièces obligatoires déposées ou acceptées). Un seul envoi ; l'analyste assigné reçoit un email.

### 5.5 Suivi
Sept étapes : compte sécurisé, CGU acceptées, préqualification envoyée, examinée par MIPS, pièces et personnes fournies, dossier vérifié par MIPS, décision.
Chaque étape : fait / en cours / à venir / arrêté, et un encadré « Que se passe-t-il maintenant ». Le texte doit **toujours distinguer « envoyé à MIPS » et « approuvé »**.

| Situation interne | Étape montrée au marchand |
|---|---|
| pas de préqualification | `application` |
| préqualification envoyée | `application_review` |
| préqualification refusée | `declined` |
| dossier en collecte, non envoyé / envoyé | `documents` / `submitted` |
| dossier en revue | `review` |
| dossier en attente | `on_hold` (« votre contact MIPS vous contactera ») |
| approuvé / refusé | `approved` / `not_approved` |

---

## 6. Sécurité (obligatoire)

| Sujet | Exigence |
|---|---|
| Transport | HTTPS uniquement, HSTS, cookie de session `Secure`, `HttpOnly`, `SameSite=Lax` minimum |
| Session | Régénérée à la connexion ; liée au navigateur ; expirée après 30 min d'inactivité ; invalidée si le mot de passe change ou si MIPS désactive le compte |
| CSRF | Jeton par session sur toute requête qui modifie quelque chose |
| CSP | `default-src 'self'`, pas de script ni de style en ligne |
| Mots de passe | Hachage adaptatif (bcrypt/argon2) ; vérification à temps constant même si l'email n'existe pas |
| 2FA | TOTP RFC 6238, tolérance ±1 pas, **un code ne sert qu'une fois** ; secret chiffré avec une clé hors base ; codes de secours hachés |
| Limitations | Connexion et 2FA : 5 échecs / 15 min par IP ou email ; inscriptions : 5 / h / IP ; mot de passe oublié : 5 / h / IP ; dépôts : 30 / h / compte ; 200 pièces max par dossier |
| Fichiers | PDF, JPEG, PNG **vérifiés sur le contenu** ; 20 Mo max ; nom aléatoire ; stockage **hors racine web** ; sha256 enregistré ; téléchargement réservé au personnel, journalisé |
| Antivirus | Analyse de chaque dépôt marchand (ClamAV ou équivalent), **sans shell**. Infecté → refus et trace dans le journal. Erreur du scanner → refus. Paramètre « antivirus obligatoire » : **activé en production**, les dépôts sont refusés tant qu'aucun scanner n'est configuré |
| Emails | Liens construits depuis l'URL configurée, **jamais** depuis l'en-tête Host ; aucun document joint ; aucune donnée d'identité dans les emails |
| Données personnelles | Data Protection Act 2017 : collecte minimale, accès limité, durée de conservation à fixer [CONFORMITÉ] |

---

## 7. Écrans et actions côté MIPS

| Écran | Rôle | Fonction |
|---|---|---|
| Onboarding → **Candidatures du portail** | admin, finance | Liste (à traiter / acceptées / refusées / toutes), signaux, date |
| **Candidature** | admin, finance | Détail déclaré ; signaux ; marchands existants avec le même BRN ou nom ; **Accepter** (crée le marchand en « onboarding », ou le **rattache** à une fiche existante, ajoute le contact principal, ouvre le dossier KYC assigné à l'analyste, envoie l'email « étape suivante ») ; **Refuser** (note interne obligatoire, email neutre sans motif) ; compte portail (email confirmé, 2FA, dernière connexion) avec bouton **désactiver / réactiver** ; journal des CGU acceptées (version, date, IP, empreinte) |
| Dossier KYC | admin, finance | En plus du back-office existant : compte portail, date d'envoi par le marchand, pièces « merchant (portal) », statut antivirus, personnes « declared by the merchant », actions du marchand dans l'historique |
| **Conditions du portail** | admin | Versions publiées, acceptations, empreinte ; publication d'une nouvelle version (n° unique, titre, texte), irréversible |

Règles :
- Rattacher à un marchand **déjà approuvé** est refusé (passer par la revue périodique). Rattacher à un marchand qui a un dossier ouvert est refusé.
- Le nom technique du marchand (clé d'import) n'est jamais dupliqué : suffixe « (2) », « (3) »… si besoin.
- La relance email d'un dossier issu du portail renvoie vers le portail et rappelle de **ne jamais envoyer de pièce d'identité par email**.

---

## 8. API de référence

Toutes en JSON, sauf le dépôt de fichier (multipart). Préfixe `/api/portal/` côté marchand.

| Méthode | Chemin | Rôle |
|---|---|---|
| POST | `register`, `verify`, `login`, `2fa`, `logout`, `forgot`, `reset` | compte et connexion |
| GET | `account`, `terms` | état du compte ; CGU courantes |
| POST | `terms-accept` `{version_id, sha256, agree}` | consentement |
| POST | `2fa-setup`, `2fa-enable {code}`, `recovery-codes {password}`, `password` | sécurité |
| GET / POST | `application` | lire / envoyer la préqualification |
| GET | `case` | étape, checklist filtrée, personnes, ce qui manque |
| POST | `party-save`, `party-delete`, `upload`, `document-delete`, `submit` | pièces, personnes, envoi |

Côté MIPS : `/api/applications/{list, get, accept, decline, account-status}`, `/api/terms/{list, publish}`.

---

## 9. Emails

| Déclencheur | Destinataire | Contenu |
|---|---|---|
| Inscription | prospect | lien de confirmation (48 h) |
| Inscription sur une adresse déjà confirmée | titulaire | « vous avez déjà un compte » + liens connexion et mot de passe oublié |
| Mot de passe oublié | titulaire | lien (60 min), « votre 2FA reste en place » |
| Préqualification acceptée | prospect | lien vers Documents, « ce n'est pas encore une approbation » |
| Préqualification refusée | prospect | message neutre, **sans motif** |
| Dossier envoyé par le marchand | analyste assigné | lien vers le dossier |
| Relance (manuelle ou planifiée) | contact principal | pièces manquantes et motifs de refus, lien vers le portail |

---

## 10. Configuration

`session_name`, `verify_link_hours` (48), `registrations_per_hour` (5), `max_uploads_per_hour` (30), `max_documents_per_case` (200),
`antivirus_command` (commande + arguments, chemin du fichier en dernier), `require_antivirus` (**true en production**),
`sectors`, `high_risk_sectors` [CONFORMITÉ], `volume_bands`, `flag_volume_bands` [CONFORMITÉ], `home_country` (Mauritius).
Dans la checklist KYC : `portal_optional` sur le contrat MIPS signé.

---

## 11. Recette (la référence passe ces tests : 113 vérifications automatiques)

| # | Test | Attendu |
|---|---|---|
| 1 | Inscription avec une adresse existante | Même réponse ; email « compte existant » au titulaire |
| 2 | Connexion avant confirmation de l'email | Refus |
| 3 | Seconde inscription sur une adresse non confirmée, autre mot de passe | Lien renvoyé ; l'autre mot de passe **ne fonctionne pas** |
| 4 | Lien de confirmation utilisé deux fois | Second usage refusé |
| 5 | Accès au dossier sans 2FA, puis sans CGU | 403 vers Sécurité, puis 403 vers CGU ; pages redirigées |
| 6 | Acceptation des CGU sans case cochée / avec un autre sha256 | Refus / refus |
| 7 | Acceptation | Ligne avec version, sha256, IP, navigateur |
| 8 | Cookie de session marchand présenté au back-office ; session du personnel sur l'API portail | 401 / 401 |
| 9 | Préqualification : paiement en ligne sans site web ; seconde préqualification | Refus / refus |
| 10 | Réponse API marchand | Ni signaux, ni note interne, ni note de risque, ni filtrage |
| 11 | Dépôt avant acceptation de la préqualification | Refus |
| 12 | Acceptation | Marchand « onboarding » avec BRN, contact principal, dossier assigné, email envoyé ; seconde acceptation refusée |
| 13 | Le marchand décoche PEP | Le statut PEP reste |
| 14 | Le marchand change le nom d'une personne déjà filtrée | Filtrage remis « à faire » |
| 15 | Fichier `.pdf` qui n'est pas un PDF ; pièce d'identité sans date ou expirée | Refus |
| 16 | Dépôt pour une personne d'un autre dossier | Refus |
| 17 | Accès direct au fichier par URL web | 404 |
| 18 | Un second compte marchand tente de supprimer une pièce / modifier une personne du premier | Refus ; rien n'est modifié |
| 19 | Envoi d'un dossier incomplet ; second envoi | Refus / refus |
| 20 | Pièce refusée par MIPS | Le marchand voit le motif et peut redéposer |
| 21 | Le marchand retire une pièce déjà vérifiée ; modifie une personne dont une pièce est acceptée | Refus / refus |
| 22 | Dépôt pendant la revue | Refus |
| 23 | MIPS renvoie le dossier en collecte | Le marchand peut renvoyer son dossier |
| 24 | Antivirus obligatoire mais non configuré ; fichier EICAR ; fichier sain | Refus ; refus + trace ; accepté `clean` |
| 25 | Publication d'une nouvelle version des CGU | Marchand bloqué jusqu'à nouvelle acceptation |
| 26 | Code TOTP rejoué ; code de secours | Refus ; accepté, un code de moins |
| 27 | Réinitialisation du mot de passe | Les autres sessions sont fermées ; 2FA conservée |
| 28 | MIPS désactive le compte | Session du marchand coupée immédiatement |
| 29 | Journal d'audit | Inscription, confirmation, connexion, 2FA, CGU, préqualification, personnes, dépôts, retraits, envoi |

---

## 12. Écarts assumés par rapport à la spec KYC (§ 10) — à confirmer

1. La préqualification est **acceptée par un analyste** : pas d'ouverture automatique du dossier (sinon n'importe qui crée des fiches marchands).
2. Le contrat MIPS signé ne bloque pas l'envoi du dossier par le marchand.
3. Le marchand **ne retélécharge pas** ses pièces après dépôt.
4. **Un compte et une préqualification** par entreprise ; pas d'invitation de collègues.
5. Les revues périodiques ne sont **pas** visibles sur le portail (seul le dossier issu de la candidature l'est).

## 13. Questions à trancher

1. **[JURIDIQUE]** Texte des conditions d'utilisation, et faut-il y joindre la politique de confidentialité ?
2. **[CONFORMITÉ]** Secteurs sensibles, tranche de volume signalée, formulation PEP, durée de conservation des comptes refusés.
3. Procédure de **perte du second facteur** : qui vérifie l'identité, comment réinitialiser.
4. Faut-il un **email au prospect** à chaque refus de pièce (aujourd'hui : visible sur le portail et dans la relance) ?
5. Faut-il ouvrir l'espace aux **marchands actifs** (transactions, relevés, règlements) ? C'est un projet distinct.
6. Hébergement du portail : sous-domaine dédié (ex. `portal.mips.mu`) ou chemin de my.mips.mu ? Un sous-domaine isole mieux les cookies.
