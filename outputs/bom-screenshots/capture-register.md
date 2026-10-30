# Registre des captures — dossier SPIN DIGITAL / BoM (B01 p. 55–62, G01 p. 2–5 et 8)

## Avertissement général (à lire avant toute insertion)

- **Système capturé** : prototype `mips-platform`, branche `ccr-a3522d3b-pyyp68`, PR GitHub #10
  **non fusionnée, jamais déployée**. Ce n'est **pas** la plateforme MIPS de production, ni le
  « back-office V3 » de la capture 1 déjà partagée, ni my.mips.mu. Deux versions du prototype :
  - build `590d8d8`, capturée le **2026-10-27** : back-office interne (S01a–b, S02a–b, S04a–b, S05, S06, S07, C01–C04) ;
  - build `d91d250`, capturée le **2026-10-28** : **portail marchand** ajouté (S01c–f, S02c–d, S03a–b, S04c, S05b, C05) ;
  - build `94a0e87`, capturée le **2026-10-30** : **S04d refaite avec l'antivirus ClamAV actif** (voir S04 ci-dessous).
    Chaque image porte le numéro de build de sa version dans le bandeau.
- **Environnement** : instance de démonstration locale (PHP 8.3, MariaDB 10.11, base `mips_demo`),
  configuration `env = demo`, emails écrits dans un journal (aucun envoi), 2FA activée comme en production.
- **Données** : entièrement fictives, créées par script **via l'API de l'application** (2026-10-27) et,
  pour le portail, **par un navigateur automatisé remplissant les écrans** (2026-10-28) : mêmes contrôles
  qu'un utilisateur. Marchands, personnes, BRN, MID, emails (`example.com`) et documents
  (PDF « SPECIMEN ») sont inventés. Les montants n'ont aucun lien avec une activité réelle.
  Les horodatages identiques à la seconde trahissent cette création scriptée.
- **Bandeau** : chaque capture porte un bandeau rouge « DEMONSTRATION ENVIRONMENT — fictitious data —
  development prototype build … (not the production MIPS platform) », ajouté au moment de la capture
  (l'application n'a pas été modifiée pour l'afficher).
- **Conditions d'utilisation** : le texte affiché sur S01f et C05 est un **texte de remplissage**
  (« DEMONSTRATION PLACEHOLDER — these are NOT the MIPS terms of use »). Les vraies conditions doivent venir
  du juridique MIPS. Les captures montrent le **mécanisme** (version, acceptation, journal), pas le contenu.
- **Secrets masqués** : sur S01e, le QR code et la clé de double authentification sont **floutés**.
- **Public des écrans** : les captures de la build `590d8d8` sont des écrans du **personnel MIPS**.
  Celles du portail (build `d91d250`) montrent **ce que voit le prospect / marchand** (en-tête « MIPS merchant
  portal »), sauf S03b, S04d et C05, qui montrent le traitement côté MIPS. Le portail couvre **l'entrée en
  relation** (compte, conditions, préqualification, pièces, suivi) ; il **n'offre aucun dashboard de
  transactions ni de règlement** au marchand.
- **Marque** : l'interface affiche « MIPS Dashboard » et « Signed MIPS merchant agreement ». Rien ne mentionne
  SPIN DIGITAL. Aucune capture ne doit être présentée comme un service SPIN autorisé ou opérationnel.
- **Écarts d'environnement de démonstration** : liste de remaps MID et liste de surveillance remplacées par des
  valeurs fictives ; marchand « sentinelle » du rapprochement réglé sur un marchand fictif (en production :
  un marchand réel). Les libellés de banques (MCB, SBM, ABSA) désignent des types de fichiers / acquéreurs ;
  les chiffres affichés ne proviennent d'aucune banque.
- **Défaut d'interface connu** : en session administrateur, l'en-tête passe sur deux lignes à 1360 px
  (9 à 10 entrées de menu) — visible sur C01–C05. Non corrigé.
- Résolution : 1360 px de large, densité ×2 (fichiers ≈ 2720 px), lisibles à l'impression.
- **Dates de capture** : 2026-10-27 (build `590d8d8`) et 2026-10-28 (build `d91d250`), voir ci-dessus.
- **Mise à jour du 2026-10-30 — aucune nouvelle capture.** Depuis la build `d91d250`, le code a changé
  **côté serveur uniquement** (aucun écran, gabarit, script ni style modifié) :
  - blocage des connexions **par compte** après 5 échecs ; une adresse IP n'est bloquée qu'au-delà de 50 échecs,
    tous comptes confondus. Avant, 5 échecs depuis une adresse IP bloquaient tous les comptes derrière elle ;
  - fermeture des autres sessions au changement de mot de passe, désormais garantie même pour deux changements
    dans la même seconde ;
  - double regard sur la décision renforcé : un analyste qui réassigne le dossier à un collègue ne peut plus le
    trancher lui-même (contournement trouvé par les tests) ;
  - ajout de suites de tests automatiques (`tests/`), voir la section en fin de registre.

  Aucune capture ne montre ces comportements : les images restent fidèles à l'interface actuelle. Elles portent
  toutefois le numéro de leur build (`590d8d8` ou `d91d250`), **pas** celui de la version courante de la branche, sauf S04d
  (build `94a0e87`, recapturée le 2026-10-30).

---

## S01 — Connexion et acceptation des T&Cs — **PRÉSENT (prototype)**

### Côté marchand (build `d91d250`)

| Fichier | `S01c-merchant-registration.png`, `S01d-merchant-sign-in.png`, `S01e-merchant-two-factor-enrolment.png`, `S01f-merchant-terms-acceptance.png` |
|---|---|
| Écran / parcours | `/portal/register.php` → lien de confirmation par email → `/portal/login.php` → mise en place obligatoire de la double authentification (`/portal/security.php`) → `/portal/terms.php` |
| Rôle | Prospect fictif `demo.merchant@example.com` (compte marchand, distinct des comptes du personnel) |
| Fonction démontrée | Création de compte avec confirmation de l'adresse email ; double authentification **obligatoire** dès la première connexion ; acceptation des conditions d'utilisation **dans leur version courante** (n° de version affiché), case à cocher obligatoire ; rien n'est accessible avant ces deux étapes ; à chaque nouvelle version, nouvelle acceptation exigée. Le journal du consentement (compte, version, date, IP, navigateur, empreinte sha256 du texte) est visible côté MIPS sur S03b et C05. |
| Limites | **Texte des conditions = texte de remplissage**, pas les conditions MIPS. QR code et clé floutés. Prototype non déployé. |
| Légende | *Merchant access and acceptance of platform terms (development prototype, demonstration data, placeholder terms text)* |

### Côté personnel (build `590d8d8`)

| Fichier | `S01a-login.png`, `S01b-second-factor.png` |
|---|---|
| Écran / parcours | `/login.php` (non connecté) ; puis saisie email + mot de passe → étape de second facteur |
| Rôle | Aucun (non connecté) ; S01b : compte `demo.analyst@example.com` (finance) avant validation du code |
| Fonction démontrée | Authentification par mot de passe, puis second facteur TOTP (application d'authentification ou code de secours), lien « mot de passe oublié » |
| Limites | Connexion **du personnel**, pas des marchands ; pas d'acceptation de conditions pour le personnel. Le lien « Create one » mène à une inscription de personnel soumise à activation par un administrateur. |
| Légende | *Staff sign-in with two-factor authentication (development prototype, demonstration data)* |

## S02 — Parcours d'onboarding

| Fichier | `S02a-onboarding-cases-and-status.png`, `S02b-onboarding-case-stages-and-blockers.png` |
|---|---|
| Écran / parcours | Menu Onboarding → liste des dossiers ; puis dossier « Prospect Demo Ltd » |
| Rôle | `demo.analyst@example.com` (finance, analyste) |
| Fonction démontrée | Statuts réels du dossier : *collecting* (collecte), *under review* (soumis), *on hold*, *approved*, *rejected* ; progression des pièces (« x / y accepted ») ; liste détaillée de ce qui bloque l'approbation ; distinction entre dossier soumis (*under review*) et marchand approuvé (*approved*, voir C03) |
| Limites | Vue **interne** (build `590d8d8`). La vue côté marchand est S02c–d. |
| Légende | *Merchant onboarding stages and application status (internal back-office view)* |

| Fichier | `S02c-merchant-progress-prequalification.png`, `S02d-merchant-progress-file-sent.png` (build `d91d250`) |
|---|---|
| Écran / parcours | Portail marchand → Progress, à deux moments : préqualification en cours d'examen par MIPS ; puis dossier complet envoyé à MIPS |
| Rôle | Prospect fictif `demo.merchant@example.com` |
| Fonction démontrée | Feuille de route en 7 étapes (compte sécurisé, conditions acceptées, préqualification envoyée, examinée par MIPS, pièces et personnes fournies, dossier vérifié par MIPS, décision) avec l'état de chaque étape ; encadré « What happens now ». Le texte distingue **explicitement** « envoyé à MIPS » et « approuvé » (« It is not approved yet »). |
| Limites | La décision finale n'est pas montrée (aucun dossier fictif n'a été approuvé via le portail). Le marchand ne voit ni la note de risque, ni le résultat du filtrage, ni les blocages internes : c'est voulu. |
| Légende | *Merchant onboarding roadmap and application status, as seen by the applicant (development prototype, demonstration data)* |

## S03 — Formulaire de préqualification — **PRÉSENT (prototype)**

| Fichier | `S03a-prequalification-form.png`, `S03b-prequalification-staff-review.png` (build `d91d250`) |
|---|---|
| Écran / parcours | Portail marchand → Application (formulaire rempli, avant envoi) ; puis côté MIPS : Onboarding → candidature |
| Rôle | S03a : prospect fictif ; S03b : `demo.analyst@example.com` (finance, analyste) |
| Fonction démontrée | Pré-check rempli **par le prospect** : identité de la société (raison sociale, nom commercial, BRN, TVA, pays d'immatriculation, adresse), activité (secteur, produits et services, site web, pays de vente), moyens de paiement souhaités, volume mensuel attendu (tranche) et ticket moyen en MUR, régulation (licence, régulateur), contact, déclaration sur l'honneur. Côté MIPS : relecture, signaux pour l'analyste (secteur sensible, hors de Maurice, volume élevé, activité régulée — aucun sur ce cas fictif), acceptation qui ouvre le dossier KYC, ou refus avec note interne ; compte du prospect et journal d'acceptation des conditions. |
| Limites | Les signaux **ne sont pas** une notation de risque ni une décision automatique. Liste des secteurs sensibles et tranche de volume signalée = valeurs par défaut **non validées par la conformité**. Aucune vérification externe (registre des sociétés) à ce stade. |
| Légende | *Merchant pre-qualification form and MIPS review (development prototype, demonstration data)* |

## S04 — Collecte des documents KYB

| Fichier | `S04a-kyb-documents-checklist.png`, `S04b-kyb-ownership-and-signatories.png` |
|---|---|
| Écran / parcours | Onboarding → dossier « Prospect Demo Ltd » → sections *Documents* et *Directors, beneficial owners and signatories* |
| Rôle | `demo.analyst@example.com` (finance, analyste) |
| Fonction démontrée | Liste des pièces société et par personne ; statut de chaque pièce (*missing / pending / accepted / rejected / expired*) ; acceptation ou refus par une **personne différente** de celle qui a déposé (« Awaiting a second person ») ; motif de refus ; administrateurs, bénéficiaires effectifs (avec %), signataires ; indicateur PEP ; résultat et référence du contrôle sanctions/PEP |
| Limites | Vue interne (build `590d8d8`) ; dépôt fait par le personnel sur ce cas. Le dépôt côté marchand est S04c–d. Liste de pièces et seuil de 25 % = configuration par défaut **non validée par la conformité**. Contrôle sanctions/PEP **saisi manuellement**, sans outil de filtrage connecté. Documents = PDF « SPECIMEN » ; aucun document d'identité réel ; numéros d'identité absents (stockés chiffrés, jamais affichés). |
| Légende | *KYB document collection and verification workflow (internal back-office view)* |

| Fichier | `S04c-merchant-document-upload.png` (build `d91d250`, 2026-10-28), `S04d-merchant-uploads-staff-view.png` (build `94a0e87`, **recapturée le 2026-10-30 avec ClamAV**) |
|---|---|
| Écran / parcours | Portail marchand → Documents ; puis côté MIPS : dossier KYC ouvert depuis la candidature |
| Rôle | S04c : prospect fictif ; S04d : `demo.analyst@example.com` (finance, analyste) |
| Fonction démontrée | Le prospect déclare ses administrateurs, bénéficiaires effectifs (avec %) et signataires, et **dépose lui-même** les pièces société et par personne (PDF, JPEG, PNG ; date d'expiration obligatoire pour les pièces d'identité) ; statut de chaque pièce ; **motif de refus** donné par MIPS (ici : relevé bancaire trop ancien) et nouveau dépôt possible ; liste de ce qui manque avant l'envoi. Côté MIPS : pièces marquées « merchant (portal) », acceptation ou refus par l'analyste (le déposant étant le marchand, le double regard est respecté), compte portail et historique horodaté des actions du marchand. |
| Limites | Pièces = **spécimens fictifs** (PDF « SPECIMEN », image « SPECIMEN — FICTITIOUS IDENTITY DOCUMENT »). **Antivirus (S04d)** : chaque pièce affiche « antivirus OK ». Elle a été analysée au dépôt par ClamAV 1.5.4 (démon `clamd`, `clamdscan --fdpass`), antivirus rendu obligatoire (`require_antivirus`), avec les **signatures officielles** vérifiées par `sigtool` (main v63, daily v28169 du 2026-10-30, bytecode v339), téléchargées depuis le miroir ClamAV de Microsoft (`packages.microsoft.com/clamav`) car le serveur officiel refuse l'environnement. « antivirus OK » veut dire « aucune signature connue détectée », pas « fichier garanti sain ». Pour obtenir S04d, le parcours du portail a été **rejoué à l'identique** sur une copie de la base de démonstration : dates du 2026-10-30, application #3 ; S04c (2026-10-28) montre le même parcours fictif, pas la même exécution. Filtrage sanctions/PEP toujours **saisi à la main** par MIPS. |
| Légende | *KYB document collection by the applicant, with MIPS review (development prototype, demonstration data)* |

## S05 — Interface générale du portail — **PARTIEL (onboarding seulement)**

| Fichier | `S05-backoffice-navigation-finance-role.png` (build `590d8d8`) |
|---|---|
| Écran / parcours | Accueil après connexion (`/dashboard.php`) |
| Rôle | `demo.analyst@example.com` (finance) — menu : Dashboard, Merchants, Onboarding, Reports, Billing, Recon (Users et Audit log réservés aux administrateurs, voir C01/C02) |
| Fonction démontrée | Navigation du back-office et filtrage du menu selon le rôle ; utilisateur et rôle affichés |
| Limites | **Vue du personnel**, pas du marchand (voir S05b). La page d'accueil n'affiche que l'identité de l'utilisateur. Le menu ne signifie pas que ces fonctions sont autorisées ou disponibles pour SPIN. |
| Légende | *Back-office navigation filtered by staff role (development prototype)* |

| Fichier | `S05b-merchant-portal-navigation.png` (build `d91d250`) |
|---|---|
| Écran / parcours | Portail marchand après connexion → Progress |
| Rôle | Prospect fictif `demo.merchant@example.com` |
| Fonction démontrée | Navigation de l'espace marchand (Progress, Application, Documents, Security), utilisateur connecté affiché, déconnexion ; le marchand n'accède qu'à son propre dossier |
| Limites | Fonctions limitées à **l'entrée en relation**. **Pas** de dashboard de transactions, de relevés, de règlements ni de remboursements pour un marchand actif. Un seul compte par entreprise (pas de gestion d'utilisateurs côté marchand). |
| Légende | *Merchant portal navigation for onboarding (development prototype, demonstration data)* → ne pas utiliser la légende générique *Merchant portal navigation and permitted functions*, qui laisserait croire à un espace marchand complet. |

## S06 — Dashboard marchand — **PARTIEL / SUBSTITUT INTERNE**

| Fichier | `S06-transaction-overview-internal-report.png` |
|---|---|
| Écran / parcours | Menu Reports → tendance 12 mois (période sélectionnée : 2026-10) |
| Rôle | `demo.analyst@example.com` (finance) |
| Fonction démontrée | Volume traité en MUR et nombre de transactions, toutes merchants confondus, par mois, par canal (TPE / en ligne) et par type de rail ; seules les transactions au statut SUCCESS sont comptées ; mois non importés affichés comme des trous |
| Limites | Rapport **interne agrégé**, pas un dashboard par marchand. Source : fichiers d'export `Commission_Data` importés manuellement, pas un flux temps réel. Indique un **volume traité**, **pas** des fonds encaissés, reçus ni réglés, et **aucun solde bancaire**. Aucune donnée de règlement. Seuls 3 mois fictifs importés, d'où un graphique en grande partie vide. La capture 1 (back-office V3) reste la référence pour un dashboard réel. |
| Légende | *Merchant transaction overview* → **ne pas utiliser**. Légende exacte : *Internal processed-volume report from imported transaction exports (not settlement or funds received)* |

## S07 — Réconciliation ou suivi du règlement — **PARTIEL**

| Fichier | `S07-reconciliation-acquirer-vs-platform.png` |
|---|---|
| Écran / parcours | Menu Recon → rapprochement 2026-09 → ligne « Specimen Cafe Ltd » → détail journalier |
| Rôle | `demo.analyst@example.com` (finance) |
| Fonction démontrée | Rapprochement d'un **fichier acquéreur** (format MCB e-commerce) avec l'**extraction transactionnelle de la plateforme**, par MID et devise ; écarts ventilés par catégorie (vérifications de carte, décalage de clearing, présent d'un seul côté, écart réel) et bouclés à zéro ; % d'écart ; détail journalier ; liste de transactions candidates à réclamer avec références ; exports CSV ; avertissements de périmètre |
| Limites | **Pas de rapprochement du compte trust** ni des fonds sur un compte bancaire : il s'agit de **volumes déclarés** par l'acquéreur, comparés aux transactions de la plateforme. **Aucune étape de validation ni d'approbation du règlement**, aucun suivi de paiement aux marchands. Fichiers d'entrée synthétiques. Le libellé « MCB » désigne le format de fichier ; les chiffres ne proviennent pas de la MCB. |
| Légende | *Payment reconciliation and settlement tracking* → **ne pas utiliser**. Légende exacte : *Acquirer-to-platform transaction reconciliation with exception analysis (not trust or settlement reconciliation)* |

---

## Captures complémentaires (contrôles demandés)

| Fichier | Démontre | Rôle | Limites | Légende proposée |
|---|---|---|---|---|
| `C01-users-roles-and-2fa.png` | Comptes, statuts (en attente / actif / désactivé), rôles (user / finance / admin), état de la 2FA, actions d'activation | admin | Rôles grossiers (3 rôles). Pas de matrice de permissions fine. | *User administration: roles, activation and two-factor status* |
| `C02-audit-log.png` | Journal d'audit en ajout seul, filtré sur l'onboarding : qui, quand, quoi, empreinte sha256 des documents, motif de refus | admin | Inaltérabilité garantie par les droits de la base de données (à configurer en production), pas par un mécanisme cryptographique. | *Append-only audit trail of onboarding actions* |
| `C03-approved-case-four-eyes-decision.png` | Dossier approuvé : décision par un administrateur différent de l'analyste, note de décision, date de prochaine revue fixée selon le risque | admin | Mêmes réserves que S02 ; horodatages scriptés. Capture du 2026-10-27 : depuis le 2026-10-30, la règle est plus stricte (aucune personne ayant créé le dossier, en ayant été l'analyste ou l'ayant réassigné ne peut le trancher) ; l'écran est inchangé. | *KYB case approved under four-eyes control, with next review date* |
| `C04-case-under-review-approver-view.png` | Dossier soumis vu par un approbateur : contrôles passés, boutons Approve / Reject | admin | Vue interne. Depuis le 2026-10-30, les boutons ne s'affichent qu'à un approbateur qui n'a jamais eu la main sur le dossier ; ils sont visibles ici car l'administrateur capturé n'a ni créé, ni instruit, ni réassigné ce dossier. | *Case under review: approver view* |
| `C05-terms-versions-consent-count.png` | Versions des conditions d'utilisation du portail (non modifiables une fois publiées), nombre d'acceptations, empreinte sha256 du texte, publication d'une nouvelle version réservée aux administrateurs (build `d91d250`) | admin | **Texte de remplissage**, pas les conditions MIPS. Une seule version publiée. | *Versioned terms of use and acceptance record* |

## Vérification automatique des fonctions montrées (2026-10-30)

Onze suites de tests (`tests/run_tests.sh`, 590 vérifications) pilotent l'application par son API, sur une base
jetable et des données **uniquement fictives**. Elles vérifient le **code du prototype**, pas un système en
production. Le tableau indique, pour chaque capture, si le comportement montré est vérifié automatiquement.

| Capture | Suite | Ce qui est vérifié | Non couvert |
|---|---|---|---|
| S01a–b | `admin_test.py`, `staff_2fa_required_test.py` | Connexion avec second facteur TOTP, refus d'un code déjà utilisé, codes de secours à usage unique, blocage d'un compte après 5 échecs ; 2FA obligatoire pour admin et finance : modules fermés sans 2FA, désactivation refusée, nouvel enrôlement après remise à zéro ou promotion | — |
| S01c–f | `portal_test.py` | Confirmation de l'email, même réponse si l'adresse existe, 2FA obligatoire avant tout accès, acceptation de la version courante des conditions, journal (empreinte, IP, navigateur), nouvelle acceptation exigée à chaque nouvelle version | — |
| S02a | `staff_onboarding_test.py` | Ouverture d'un dossier, retour en collecte | Liste et filtres de l'écran |
| S02b, C03, C04 | `onboarding_approval_test.py` | Chacun des blocages d'approbation, rôle d'approbateur, décision par une personne qui n'a jamais eu la main sur le dossier (ni créateur, ni analyste passé ou présent, ni auteur d'une réassignation), note de décision obligatoire, prochaine revue selon le risque, marchand activé, décision définitive | — |
| S02c–d | `portal_test.py` | Étape « submitted », jamais présentée comme « approved » ; aucun champ interne (note de risque, blocages) exposé au marchand | Décision finale côté marchand (non capturée non plus) |
| S03a–b | `portal_test.py` | Validation du formulaire, une préqualification par compte, signaux réservés à l'analyste, acceptation qui ouvre le dossier, refus | — |
| S04a–b | `staff_onboarding_test.py` | Format vérifié sur le contenu, pièce d'identité rattachée à une personne du dossier, double regard (le déposant ne peut pas valider sa pièce), téléchargement exact | Seuil de 25 % pour les bénéficiaires effectifs |
| S04c–d | `portal_test.py`, `antivirus_clamav_test.py` | Dépôt par le marchand, PEP déclarable mais jamais retirable, motif de refus visible, isolement entre marchands, antivirus bloquant quand il est requis ; avec le vrai moteur ClamAV (`clamscan` et démon `clamd`) : pièce infectée refusée, refus si les signatures manquent ou si l'antivirus est arrêté | La suite utilise une signature de test ; S04d a été produite avec les signatures officielles (voir S04). La chaîne EICAR placée à la fin d'un PDF n'est **pas** détectée par les signatures officielles (EICAR doit être en début de fichier) : le cas « pièce infectée » n'a donc pas pu être montré à l'écran avec la base officielle |
| S05, S05b | toutes | Refus d'accès selon le rôle (compte sans rôle métier refusé sur chaque module), sessions personnel et marchand séparées | — |
| S06 | `reporting_test.py` | Règles de nettoyage, séries de tendance, mois non importés affichés comme des trous | Données réelles |
| S07 | `recon_test.py` | Six catégories d'écart bouclées au centime, remaps MID, alertes de périmètre, éléments à réclamer, détail journalier, exports | Fichier MCB réel |
| C01 | `admin_test.py` | Activation, rôles appliqués dès la requête suivante, un administrateur ne peut ni se rétrograder ni se désactiver, remise à zéro de la 2FA | — |
| C02 | `admin_test.py` | Filtres du journal, aucune trace de mot de passe dans le journal | Inaltérabilité (droits de la base, à configurer en production) |
| C05 | `portal_test.py` | Publication réservée aux administrateurs, numéro de version unique, nouvelle acceptation exigée | — |

**À ne pas écrire dans le dossier** : que ces tests prouvent le fonctionnement d'un service en production, ou
que la plateforme a été « auditée ». Ce sont des tests de développement sur données fictives.

## Contrôle MIPS INTERNATIONAL / FSC

Je n'ai pas accès à B01 ni à G01 : je ne peux pas relever leurs références à MIPS INTERNATIONAL / FSC.
Côté captures, l'interface porte la marque « MIPS » (« MIPS Dashboard », « MIPS merchant portal »,
« Signed MIPS merchant agreement »), sans aucune référence à SPIN, à la FSC ni à la BoM. À vérifier dans les documents avant insertion.
