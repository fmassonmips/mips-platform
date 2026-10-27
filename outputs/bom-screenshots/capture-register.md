# Registre des captures — dossier SPIN DIGITAL / BoM (B01 p. 55–62, G01 p. 2–5 et 8)

## Avertissement général (à lire avant toute insertion)

- **Système capturé** : prototype de back-office interne `mips-platform`, branche `ccr-a3522d3b-pyyp68`,
  commit `590d8d8`, PR GitHub #10 **non fusionnée, jamais déployée**. Ce n'est **pas** la plateforme MIPS
  de production, ni le « back-office V3 » de la capture 1 déjà partagée.
- **Environnement** : instance de démonstration locale (PHP 8.3, MariaDB 10.11, base `mips_demo`),
  configuration `env = demo`, emails écrits dans un journal (aucun envoi), 2FA activée comme en production.
- **Données** : entièrement fictives, créées le 2026-10-27 par script **via l'API de l'application**
  (mêmes contrôles qu'un utilisateur). Marchands, personnes, BRN, MID, emails (`example.com`) et documents
  (PDF « SPECIMEN ») sont inventés. Les montants n'ont aucun lien avec une activité réelle.
  Les horodatages identiques à la seconde trahissent cette création scriptée.
- **Bandeau** : chaque capture porte un bandeau rouge « DEMONSTRATION ENVIRONMENT — fictitious data —
  development prototype build 590d8d8 (not the production MIPS platform) », ajouté au moment de la capture
  (l'application n'a pas été modifiée).
- **Public des écrans** : tous les écrans sont destinés au **personnel MIPS** (back-office). Le dépôt ne
  contient **aucun portail marchand** ; aucune capture ne montre ce qu'un marchand ou un prospect voit.
- **Marque** : l'interface affiche « MIPS Dashboard » et « Signed MIPS merchant agreement ». Rien ne mentionne
  SPIN DIGITAL. Aucune capture ne doit être présentée comme un service SPIN autorisé ou opérationnel.
- **Écarts d'environnement de démonstration** : liste de remaps MID et liste de surveillance remplacées par des
  valeurs fictives ; marchand « sentinelle » du rapprochement réglé sur un marchand fictif (en production :
  un marchand réel). Les libellés de banques (MCB, SBM, ABSA) désignent des types de fichiers / acquéreurs ;
  les chiffres affichés ne proviennent d'aucune banque.
- **Défaut d'interface connu** : en session administrateur, l'en-tête passe sur deux lignes à 1360 px
  (9 entrées de menu) — visible sur C01–C04. Non corrigé pour ne pas modifier l'application.
- Résolution : 1360 px de large, densité ×2 (fichiers ≈ 2720 px), lisibles à l'impression.
- **Date de capture** pour toutes les images : 2026-10-27.

---

## S01 — Connexion et acceptation des T&Cs — **PARTIEL**

| Fichier | `S01a-login.png`, `S01b-second-factor.png` |
|---|---|
| Écran / parcours | `/login.php` (non connecté) ; puis saisie email + mot de passe → étape de second facteur |
| Rôle | Aucun (non connecté) ; S01b : compte `demo.analyst@example.com` (finance) avant validation du code |
| Fonction démontrée | Authentification par mot de passe, puis second facteur TOTP (application d'authentification ou code de secours), lien « mot de passe oublié » |
| Limites | **Aucune étape d'acceptation des T&Cs n'existe** : pas de version de conditions, pas de trace de consentement. Écran réservé au personnel, pas aux marchands. Le lien « Create one » mène à une inscription de personnel soumise à activation par un administrateur, pas à un parcours marchand. |
| Légende | *Merchant access and acceptance of platform terms* → **ne pas utiliser telle quelle**. Légende exacte : *Staff sign-in with two-factor authentication (development prototype, demonstration data)* |

## S02 — Parcours d'onboarding

| Fichier | `S02a-onboarding-cases-and-status.png`, `S02b-onboarding-case-stages-and-blockers.png` |
|---|---|
| Écran / parcours | Menu Onboarding → liste des dossiers ; puis dossier « Prospect Demo Ltd » |
| Rôle | `demo.analyst@example.com` (finance, analyste) |
| Fonction démontrée | Statuts réels du dossier : *collecting* (collecte), *under review* (soumis), *on hold*, *approved*, *rejected* ; progression des pièces (« x / y accepted ») ; liste détaillée de ce qui bloque l'approbation ; distinction entre dossier soumis (*under review*) et marchand approuvé (*approved*, voir C03) |
| Limites | Vue **interne**, pas de « roadmap » côté marchand. Le marchand ne voit pas ce statut ; il reçoit seulement des emails de relance listant les pièces manquantes. |
| Légende | *Merchant onboarding stages and application status (internal back-office view)* |

## S03 — Formulaire de préqualification — **ABSENT**

Aucune capture produite : l'écran n'existe pas (voir `missing-evidence.md`). La fiche marchand contient raison
sociale, BRN, n° TVA, adresse, secteur, mais **ni** description d'activité/produits, **ni** pays d'activité,
**ni** volumes attendus, **ni** moyens de paiement demandés, et elle est remplie par le personnel, pas par le prospect.

## S04 — Collecte des documents KYB

| Fichier | `S04a-kyb-documents-checklist.png`, `S04b-kyb-ownership-and-signatories.png` |
|---|---|
| Écran / parcours | Onboarding → dossier « Prospect Demo Ltd » → sections *Documents* et *Directors, beneficial owners and signatories* |
| Rôle | `demo.analyst@example.com` (finance, analyste) |
| Fonction démontrée | Liste des pièces société et par personne ; statut de chaque pièce (*missing / pending / accepted / rejected / expired*) ; acceptation ou refus par une **personne différente** de celle qui a déposé (« Awaiting a second person ») ; motif de refus ; administrateurs, bénéficiaires effectifs (avec %), signataires ; indicateur PEP ; résultat et référence du contrôle sanctions/PEP |
| Limites | Dépôt fait **par le personnel** (le marchand envoie par email) : pas d'écran d'upload côté marchand. Liste de pièces et seuil de 25 % = configuration par défaut **non validée par la conformité**. Contrôle sanctions/PEP **saisi manuellement**, sans outil de filtrage connecté. Documents = PDF « SPECIMEN » ; aucun document d'identité réel ; numéros d'identité absents (stockés chiffrés, jamais affichés). |
| Légende | *KYB document collection and verification workflow (internal back-office view)* |

## S05 — Interface générale du portail — **PARTIEL**

| Fichier | `S05-backoffice-navigation-finance-role.png` |
|---|---|
| Écran / parcours | Accueil après connexion (`/dashboard.php`) |
| Rôle | `demo.analyst@example.com` (finance) — menu : Dashboard, Merchants, Onboarding, Reports, Billing, Recon (Users et Audit log réservés aux administrateurs, voir C01/C02) |
| Fonction démontrée | Navigation du back-office et filtrage du menu selon le rôle ; utilisateur et rôle affichés |
| Limites | **Ce n'est pas un portail marchand** : aucun « contexte marchand ». La page d'accueil n'affiche que l'identité de l'utilisateur. Le menu ne signifie pas que ces fonctions sont autorisées ou disponibles pour SPIN. |
| Légende | *Merchant portal navigation and permitted functions* → **ne pas utiliser**. Légende exacte : *Back-office navigation filtered by staff role (development prototype)* |

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
| `C03-approved-case-four-eyes-decision.png` | Dossier approuvé : décision par un administrateur différent de l'analyste, note de décision, date de prochaine revue fixée selon le risque | admin | Mêmes réserves que S02 ; horodatages scriptés. | *KYB case approved under four-eyes control, with next review date* |
| `C04-case-under-review-approver-view.png` | Dossier soumis vu par un approbateur : contrôles passés, boutons Approve / Reject | admin | Vue interne. | *Case under review: approver view* |

## Contrôle MIPS INTERNATIONAL / FSC

Je n'ai pas accès à B01 ni à G01 : je ne peux pas relever leurs références à MIPS INTERNATIONAL / FSC.
Côté captures, l'interface porte la marque « MIPS » (« MIPS Dashboard », « Signed MIPS merchant agreement »),
sans aucune référence à SPIN, à la FSC ni à la BoM. À vérifier dans les documents avant insertion.
