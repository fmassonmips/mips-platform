# Suite SaaS sur my.mips.mu — architecture

## Principe

Un seul produit technique (`my.mips.mu`), dix apps vendues séparément.
Le client crée **un** compte, son entreprise active les apps dont elle a besoin.

```
my.mips.mu
├── /login.php, /register.php     compte unique pour toute la suite
├── /dashboard.php                lanceur d'apps de l'entreprise
├── /app.php?m=<slug>             coquille commune, chaque app y injecte sa vue
└── /api/suite/modules            catalogue + activation (owner/admin)
```

## Décisions

| Sujet | Choix | Pourquoi |
|---|---|---|
| Hébergement des apps | Toutes sous `my.mips.mu` | Une seule session, pas de SSO inter-domaines à construire, un seul déploiement. |
| Domaines de marque (`facturo.mu`, …) | Pages marketing qui renvoient vers `my.mips.mu` | Les domaines servent à l'acquisition, pas à héberger le produit. |
| Multi-entreprise | Table `organizations` + `organization_users` (owner / admin / member) | Facturer et partager les données par entreprise, pas par utilisateur. |
| Catalogue des apps | En code (`src/Suite/Catalog.php`) | Versionné avec le code qui l'implémente. |
| Activation | Table `organization_modules`, essai gratuit de 30 jours | Point d'accroche pour la facturation plus tard. |
| Isolation des données | Chaque table métier porte `organization_id`, chaque requête filtre dessus | Règle non négociable pour chaque nouvelle app. |

## État actuel

- **Facturo**, **ClientBloom**, **RendezVous**, **Formelio**, **FlowDesk**, **BizPilot**, **TeamNest** et **ShopLokal** sont disponibles. StaffZen et Bookora sont listées en **coming_soon**.
- Une entreprise est créée automatiquement au premier accès d'un utilisateur, qui en devient owner.
- Activer une app la passe en `trial` pour 30 jours. Désactiver puis réactiver ne relance jamais l'essai ;
  une fois l'essai terminé, l'app est bloquée (« Free trial ended ») jusqu'à ce que la facturation existe.
- Le profil entreprise (raison sociale, BRN, n° TVA, adresse) est partagé par toutes les apps (`/api/suite/organization`).
- Interface en français, formats mauriciens à l'affichage : montants en roupies « Rs 1,234.50 » (autres devises : code ISO, « EUR 1,234.50 »), dates « 26/10/2026 », heures sur 24 h (`App\Format`, `Money::format`). Stockage, champs de saisie, flux MRA et exports CSV restent en ISO (`2026-10-26`, `1234.50`).

## Équipe (invitations)

Page `/team.php`, liée depuis le lanceur. Code : `src/Suite/Team.php`.

| Élément | Règle |
|---|---|
| Rôles | Propriétaire : tout. Administrateur : réglages, catalogue, facturation, invitation de membres. Membre : travail courant. Le propriétaire invite et nomme les administrateurs ; les administrateurs invitent et retirent les membres. |
| Invitation | Par e-mail, lien personnel valable 7 jours, à usage unique ; le lien est aussi affiché pour l'envoyer par WhatsApp. Seule l'empreinte SHA-256 du jeton est stockée. Renvoyer remplace l'ancien lien (pas avant 10 minutes) ; 20 invitations par jour et par entreprise. |
| Acceptation | La personne choisit son nom et son mot de passe ; son compte est créé actif (pas de validation manuelle) et elle est connectée. Deux ouvertures simultanées du lien : un seul compte. |
| Une entreprise par compte | Une adresse dont le compte appartient déjà à une entreprise ne peut pas être invitée (pas encore de changement d'entreprise). Un compte sans entreprise (inscrit non validé, ou retiré d'une équipe) est réactivé avec le nouveau mot de passe. |
| Retrait | Accès coupé immédiatement (compte désactivé), tâches TeamNest non terminées et tickets FlowDesk ouverts désassignés ; son nom reste sur le travail passé. Le propriétaire ne peut pas être retiré ni changer de rôle. |

**Hors périmètre :** transfert de propriété, appartenance à plusieurs entreprises, connexion par Google, double authentification.

## Facturo (devis & factures)

| Élément | Règle |
|---|---|
| Clients | Par entreprise ; suppression impossible s'ils ont des documents. |
| Brouillon | Modifiable et supprimable, sans numéro. |
| Émission | Numéro séquentiel sans trou par entreprise, type et année : `FAC-2026-0001`, `DEV-2026-0001`. Le document devient non modifiable ; les coordonnées vendeur et client sont figées à cet instant. |
| Facture | `draft → issued ⇄ paid` ; `issued → credited` quand des avoirs couvrent tout le montant. Émission refusée sans raison sociale et BRN. |
| Avoir | Créé depuis une facture émise ou payée (`AVO-2026-0001`), même client et devise, jamais daté avant elle. Total ou partiel, jamais au-delà du reste à créditer (vérifié à l'enregistrement et, sous verrou, à l'émission). Une facture payée puis entièrement créditée reste `paid` : un remboursement est dû. |
| Devis | `draft → sent → accepted / declined` ; « Create invoice » crée un brouillon de facture (une seule par devis). |
| Montants | Entiers en cents, calculés côté serveur, arrondi au plus proche par ligne. TVA par ligne, 15 % par défaut si l'entreprise a un n° TVA, sinon 0 %. |
| Langue | Réglage par entreprise (page Entreprise) : français par défaut ou anglais ; une langue choisie sur la fiche client passe avant. S'applique au document imprimé, à la page du lien client et à l'e-mail par défaut. Figée à l'émission : changer le réglage ne modifie pas les documents déjà émis. L'interface de l'app reste en français. |
| PDF | Page imprimable `/facturo/print.php?id=…` → « Enregistrer en PDF » du navigateur. |
| E-mail | Documents émis uniquement. Message modifiable + lien privé `/facturo/view.php?t=…` (jeton aléatoire, sans connexion, non indexé) où le client consulte, imprime ou télécharge. Envoyé via SMTP (`config.php` → `mail`), expéditeur = raison sociale, réponse vers l'e-mail de l'entreprise. Chaque envoi, réussi ou non, est journalisé. |

### e-Invoicing MRA

Activable par entreprise (page Company). Sources : *MRA Technical Guidelines 2023*, *Data Structure of an
e-Invoice v1.0*, *Functional Specifications of the EBS* (juin 2023) et cas de test du portail développeur MRA.

| Élément | Règle |
|---|---|
| Identifiants | Propres à chaque entreprise (username, mot de passe, EBS MRA ID du portail MRA) : la MRA rejette une facture dont le TAN vendeur diffère de celui du compte. Mot de passe chiffré en base (`app.secret_key`). |
| Authentification | Clé AES-256 aléatoire, identifiants chiffrés RSA avec la clé publique MRA ; jeton + clé de session mis en cache ~24 h ; ré-authentification automatique si la MRA refuse le jeton. |
| Transmission | Factures (`STD`) et avoirs (`CRN`, avec facture de référence et motif) à l'émission, chiffrés AES-256-ECB. IRN + QR code stockés et imprimés sur le document. Devis non transmis. |
| Compteur / chaînage | Compteur EBS par entreprise, jamais remis à zéro ; `previousNoteHash` = SHA-256 de (date-heure + montant + BRN + numéro) du document précédent du même type, `0` pour le premier. |
| Lignes | TVA par ligne : 15 % (TC01), taux zéro (TC02), exonéré (TC03) ; bien ou service. |
| Panne MRA | Le document est émis quand même, statut « en attente », renvoyé dans l'ordre par le bouton « Send to MRA now », à l'émission suivante ou par `tools/mra_retry.php` (cron). |
| Garde-fous | Envoi par e-mail bloqué tant que le document n'est pas fiscalisé ; avoir impossible sur une facture non fiscalisée ; documents en MUR uniquement ; TVA, BRN et adresse vendeur obligatoires. |
| Rejet | Le motif MRA est affiché. Le document émis est figé : si l'erreur vient des données (ex. TAN erroné), corriger le profil puis émettre un avoir et une nouvelle facture. |

**Non vérifié contre la vraie MRA** (testé contre un serveur simulant la spécification) : à valider en SANDBOX
puis TEST DRIVE sur le portail MRA avant la mise en production — notamment le format exact de la clé de
session renvoyée, le hash du premier document (`0`), et les noms de champs, qui diffèrent légèrement entre
les documents MRA. Le mapping est centralisé dans `src/Facturo/Fiscalisation.php::payload()`.

Calendrier de l'obligation : MUR 100 M+ depuis mai 2024, MUR 80 M+ annoncé pour 2025-26 ; phases suivantes
non confirmées. À vérifier sur https://www.mra.mu/index.php/e-invoicing.

**Hors périmètre :**

- Factures en devise étrangère avec e-invoicing (montants MUR requis), notes de débit (DRN), signature (`signedHash`, optionnelle).
- Pièce jointe PDF dans l'e-mail (le client passe par le lien), relances automatiques, paiements partiels,
  multi-taux de change, export comptable.

## ClientBloom (CRM & fidélité)

| Élément | Règle |
|---|---|
| Cible | Commerces B2C : le client est identifié au comptoir par son téléphone (format local, +230 retiré). |
| Cashback | % du montant **payé** (hors cashback utilisé), arrondi à l'inférieur. Utilisable à partir d'un minimum, jamais au-delà du solde ni du montant de l'achat. Bonus de bienvenue optionnel. |
| Circuit fermé | Le cashback ne se dépense que chez le commerçant et n'est jamais remboursé en argent. Volontaire : un solde convertible ou utilisable ailleurs s'approche de la monnaie électronique (régulée par la Bank of Mauritius) — **à faire valider par un juriste**. |
| Registre | Append-only (`clientbloom_transactions`) : achat, utilisation, bonus, ajustement, expiration, annulation. Chaque opération verrouille la fiche client : le solde stocké = la somme du registre, jamais négatif (testé avec 10 utilisations simultanées). |
| Corrections | Owner/admin : ajustement manuel motivé, annulation d'une opération par écriture inverse (une seule fois ; refusée si le cashback a déjà été dépensé). |
| Expiration | Solde perdu après N mois sans activité (0 = jamais), via `tools/clientbloom_expire.php` (cron quotidien). |
| CRM | Fiche, tags, anniversaire, notes datées, historique ; segments (avec cashback, inactifs 60 j+, meilleurs clients, anniversaires du mois, consentement) ; export CSV (owner/admin, protégé contre l'injection de formules). |
| Carte client | Lien privé sans connexion (solde + dernières opérations), partageable par WhatsApp depuis la fiche. |
| Données personnelles | Consentement marketing horodaté (Data Protection Act 2017). « Erase personal data » efface l'identité et les notes, garde le registre anonyme (pièce comptable) ; refusé tant qu'un solde reste. |
| KPI | Ventes via le programme, cashback émis / utilisé (annulations déduites), clients actifs, **cashback en circulation** = engagement envers les clients. |

**Hors périmètre :** envoi de campagnes SMS/WhatsApp (pas de fournisseur intégré ; l'export CSV filtre les consentants), paliers (silver/gold), points convertibles.

## RendezVous (prise de rendez-vous)

| Élément | Règle |
|---|---|
| Cible | Salons, cliniques, garages, coachs : le client réserve seul une prestation sur un lien partagé (WhatsApp, Facebook, Google Maps). |
| Prestations | Nom, durée, prix facultatif (affiché), réservable ou masquée. |
| Équipe | Personnes ou ressources (fauteuil, salle), chacune avec son agenda et ses horaires par jour, plusieurs plages (« 08:30-12:30, 13:30-17:00 »). Toute personne assure toutes les prestations. |
| Horaires proposés | Créneaux tous les N minutes dans les horaires, sans chevauchement, après le délai minimum, jusqu'à N jours à l'avance. « Peu importe » attribue la personne la moins chargée ce jour-là. |
| Concurrence | Chaque réservation verrouille les agendas concernés puis revérifie : deux clients n'obtiennent jamais le même créneau (testé avec 4 réservations simultanées). |
| Anti-abus | Téléphone obligatoire en ligne ; 5 réservations en ligne par heure et par connexion ; 3 rendez-vous à venir par numéro ; jeton CSRF de la page. |
| Back-office | Agenda du jour + semaine ; statuts confirmé → honoré / absent / annulé (annulé est définitif) ; rendez-vous saisi par l'équipe à n'importe quelle heure (chevauchement refusé). |
| Client | Page de confirmation et lien privé pour consulter ou annuler (jusqu'à N minutes avant). E-mails de confirmation, d'annulation et de rappel la veille si un e-mail est laissé ; copie des réservations en ligne à l'adresse choisie. Page et e-mails dans la langue des documents de l'entreprise. |
| ClientBloom | Si l'app est active, l'agenda affiche le solde fidélité du client reconnu par son téléphone, avec un lien vers sa fiche. Aucun client fidélité n'est créé par une réservation (pas de bonus de bienvenue sur une réservation fantôme). |
| Heure | Heure de Maurice (UTC+4) partout, y compris les horodatages, écrite par l'application : le fuseau du serveur de base n'intervient pas. |

**Hors périmètre :** SMS/WhatsApp automatiques (pas de fournisseur), acompte ou paiement en ligne, prestations réservées à certaines personnes, congés ponctuels (bloquer un créneau par un rendez-vous interne en attendant), facture Facturo depuis un rendez-vous.

**Bookora** (réservations en ligne) recouvre RendezVous : à décider si on le fusionne ou si on le recentre (hébergement, tables, activités).

## Formelio (formulaires & sondages)

| Élément | Règle |
|---|---|
| Formulaires | Modèles « Satisfaction client », « Contact », « Inscription » ou vide. 10 types de questions : texte court/long, e-mail, téléphone, nombre, date, choix unique/multiples, note 1-5, recommandation 0-10 (NPS). 50 questions max. |
| Cycle | Brouillon (aperçu pour l'équipe, fermé au public) → ouvert → fermé. Lien public à partager (copie, WhatsApp), régénérable. |
| Modifications | Chaque question garde un identifiant fixe ; chaque réponse garde l'intitulé tel qu'il a été posé. Renommer ou supprimer une question ne fausse jamais les réponses reçues. |
| Réponses | Synthèse par question (répartition, moyenne, score NPS = % promoteurs − % détracteurs), détail de chaque réponse, suppression (owner/admin), export CSV (owner/admin, protégé contre l'injection de formules), e-mail à chaque réponse si une adresse est indiquée. |
| Anti-abus | Jeton CSRF de la page, champ piège invisible pour les robots, 20 envois par heure et par connexion pour un formulaire. |
| Langue | Textes fixes de la page (boutons, erreurs) dans la langue des documents de l'entreprise ; les questions sont rédigées par l'entreprise. |
| RendezVous | Réglage « Sondage de satisfaction » : quand un rendez-vous est marqué « Honoré », le client reçoit un e-mail avec le lien (une seule fois par rendez-vous, une seule réponse par rendez-vous) ; la réponse est marquée « après un rendez-vous ». |

**Hors périmètre :** logique conditionnelle, téléversement de fichiers, paiement, envoi de campagnes de sondage (l'export ClientBloom filtre les consentants).

## FlowDesk (support client)

| Élément | Règle |
|---|---|
| Entrées | Formulaire de contact public (lien à partager), ticket saisi par l'équipe (téléphone, comptoir, WhatsApp), réponse Formelio (option « créer un ticket » d'un formulaire : nom, e-mail et téléphone repris des réponses). |
| Numérotation | #1, #2… sans trou par entreprise (ligne de réglages verrouillée ; testé avec 5 créations simultanées). |
| Fil | Message client, réponse (envoyée par e-mail au client avec le lien de sa demande) ou note interne (jamais visible ni envoyée au client). |
| Statuts | À traiter → En attente du client (après une réponse) → Résolu / Clôturé. Une réponse du client remet le ticket « À traiter », même résolu ; un ticket clôturé n'accepte plus de réponse. |
| File | Filtres À traiter, Mes tickets, En attente, Résolus, Tous ; recherche par n°, sujet, client, e-mail, téléphone ; tri par priorité puis ancienneté ; repère « sans réponse ». Le premier qui répond se voit assigner le ticket. |
| Client | Page privée de la demande (fil sans les notes internes, réponse). Pas de lecture des e-mails entrants : le client répond depuis sa page. Pages et e-mails dans la langue des documents de l'entreprise. |
| Notifications | Nouveau ticket → adresse de l'entreprise ; réponse du client → personne assignée, sinon l'adresse de l'entreprise. |
| Anti-abus | CSRF, champ piège, 5 tickets par heure et par connexion, 20 réponses par heure sur un ticket. |
| ClientBloom | Fiche fidélité reconnue par téléphone ou e-mail, affichée à côté du ticket. |

**Hors périmètre :** réception des e-mails (boîte support), réponses types, délais contractuels (SLA) avec alertes, pièces jointes, satisfaction après résolution.

## TeamNest (projets & tâches)

| Élément | Règle |
|---|---|
| Projets | Nom, description, client Facturo facultatif et taux horaire HT ; avancement, tâches en retard et temps non facturé sur chaque carte ; archivage. |
| Tâches | Tableau À faire / En cours / Fait (boutons pour changer de colonne), assignation à un membre (e-mail quand quelqu'un d'autre l'assigne), échéance, priorité, description ; « Mes tâches » par échéance. |
| Temps passé | Saisie « 45 », « 1h30 », « 1.5 » par jour (jamais dans le futur) ; supprimable tant qu'il n'est pas facturé. |
| Facturation | « Facturer » (owner/admin, Facturo actif) crée un brouillon de facture : une ligne par tâche en heures au taux du projet, TVA 15 % si l'entreprise a un n° TVA. Le temps est marqué facturé ; deux clics simultanés ne facturent qu'une fois ; supprimer le brouillon libère le temps. Une tâche dont du temps est facturé ne se supprime pas. |
| FlowDesk | Depuis un ticket : « Créer la tâche » dans un projet (priorité haute si le ticket l'est), lien dans les deux sens. |
| BizPilot | Tâches en retard dans « À faire ». |

**Hors périmètre :** glisser-déposer, sous-tâches et commentaires, chronomètre, diagramme de Gantt, budget du projet.

## ShopLokal (boutique en ligne, sans paiement en ligne)

| Élément | Règle |
|---|---|
| Catalogue | Owner/admin. Prix saisi TTC, stocké HT avec un code TVA MRA (15 % par défaut si l'entreprise a un n° TVA). Stock facultatif (vide = non suivi), alerte à 3 ou moins. Photo réduite à 800 px en JPEG dans le navigateur, 400 Ko max., vérifiée côté serveur. |
| Boutique | Lien public `/shoplokal/s.php?o=…` (fermée par défaut, nouveau lien = l'ancien renvoie 404). Panier sur le téléphone du client, livraison (frais HT, offerte dès un montant TTC d'articles) ou retrait. Page et e-mails dans la langue des documents de l'entreprise. |
| Paiement | À la livraison, virement ou Juice, avec les instructions sur la page de commande. L'entreprise marque la commande payée. Le paiement par carte attend la passerelle MIPS. |
| Commande | Numérotation sans trou ; produits verrouillés pendant la commande, stock revérifié puis réservé (deux clients pour le dernier article : un seul passe). Annuler remet le stock. Statuts : nouvelle → confirmée → expédiée / prête → terminée, ou annulée (définitif). E-mails au client (réception, confirmation, expédition, annulation) et à l'entreprise. |
| Montants | TVA arrondie par ligne comme Facturo : la commande et sa facture sont identiques au centime. Conséquence : 2 × Rs 750,00 TTC peut faire Rs 1 499,99. |
| Facturo | « Créer la facture » (owner/admin) : brouillon, client Facturo retrouvé par e-mail puis téléphone, sinon créé ; une facture par commande. |
| Anti-abus | CSRF, champ piège, 5 commandes par heure et par connexion. |
| BizPilot | Commandes et ventes TTC du mois ; nouvelles commandes et stock bas dans « À faire ». |

**Hors périmètre :** paiement par carte, variantes (taille, couleur), codes promo, zones de livraison, plusieurs photos, export.

## BizPilot (tableau de bord)

Page unique du dirigeant, réservée au propriétaire et aux administrateurs. Aucune table : lecture des autres apps actives (`src/BizPilot/Dashboard.php`).

| Bloc | Contenu (mois choisi, comparé au précédent) |
|---|---|
| À faire | Factures en retard (montant), devis envoyés depuis plus de 14 jours, documents non fiscalisés MRA, rendez-vous du jour, tickets sans réponse. |
| Facturation | Facturé TTC et HT (avoirs déduits), factures marquées payées, impayés et retard (nets des avoirs), devis en attente et taux d'acceptation, graphique 6 mois facturé / payé, meilleurs clients. Montants en MUR ; documents en devise étrangère signalés à part. |
| Rendez-vous | Nombre, part en ligne, annulations, taux d'absence, valeur des prestations honorées (prix affiché). |
| Fidélité | Ventes via le programme, nouveaux clients, cashback émis / utilisé / en circulation. |
| Satisfaction | Score NPS et note moyenne sur toutes les réponses du mois, nombre de réponses. |
| Support | Tickets reçus et résolus, délai moyen de première réponse, file à traiter. |

« Factures payées » se fonde sur la date à laquelle la facture est marquée payée (pas de suivi des paiements partiels ni des encaissements bancaires).

## Lien Facturo → ClientBloom

Option « Reward paid Facturo invoices » du programme ClientBloom (désactivée par défaut ; les deux apps doivent être actives).
Code : `src/ClientBloom/FacturoRewards.php`, appelé par `DocumentsController` après un changement de statut ou l'émission d'un avoir.

| Événement Facturo | Effet ClientBloom |
|---|---|
| Facture marquée payée | Achat du montant TTC **net des avoirs émis** (MUR uniquement) → cashback au **taux factures** (distinct du taux comptoir, 1 % par défaut), plafonné par facture si un plafond est fixé (0 = sans plafond), une fois par paiement. Client retrouvé par lien existant, puis téléphone, puis e-mail ; sinon créé (tag `facturo`, sans consentement marketing). |
| Facture repassée non payée | Achat annulé (écriture inverse). Si le cashback a déjà été dépensé : le changement de statut passe quand même, avertissement sur la facture, correction manuelle dans ClientBloom. |
| Avoir sur une facture récompensée | Reprise de la même part du cashback **réellement versé** (donc après plafond) que la part remboursée (arrondi à l'inférieur), dans la limite du solde ; la dépense du client est réduite d'autant. |
| Devise étrangère, client sans téléphone ni e-mail, facture entièrement créditée | Pas de récompense, motif affiché sur la facture. |

Le résultat est affiché sur la facture ou l'avoir (`clientbloom_note`) avec un lien vers la fiche client ; la référence du
mouvement de cashback est le numéro de facture. Une erreur côté fidélité ne bloque jamais la facturation (journalisée).

## Ajouter une app

1. Passer son `status` à `available` dans `src/Suite/Catalog.php`.
2. Créer `templates/modules/<slug>.view.php` (rendu dans la coquille commune).
3. Ses tables SQL portent `organization_id` + clé étrangère vers `organizations`.
4. Ses endpoints commencent par `Modules::require($user, '<slug>')` (pages) ou une vérification équivalente (API).

## Mise en place sur une base existante

```
mysql -u root -p mips_platform < sql/migrations/001_suite.sql
mysql -u root -p mips_platform < sql/migrations/002_facturo.sql
mysql -u root -p mips_platform < sql/migrations/003_facturo_credit_notes_email.sql
mysql -u root -p mips_platform < sql/migrations/004_mra_einvoicing.sql
mysql -u root -p mips_platform < sql/migrations/005_clientbloom.sql
mysql -u root -p mips_platform < sql/migrations/006_facturo_clientbloom.sql
mysql -u root -p mips_platform < sql/migrations/007_clientbloom_invoice_rate.sql
mysql -u root -p mips_platform < sql/migrations/008_document_language.sql
mysql -u root -p mips_platform < sql/migrations/009_client_document_language.sql
mysql -u root -p mips_platform < sql/migrations/010_rendezvous.sql
mysql -u root -p mips_platform < sql/migrations/011_formelio.sql
mysql -u root -p mips_platform < sql/migrations/012_flowdesk.sql
mysql -u root -p mips_platform < sql/migrations/013_teamnest.sql
mysql -u root -p mips_platform < sql/migrations/014_shoplokal.sql
mysql -u root -p mips_platform < sql/migrations/015_team.sql
```

Puis dans `config/config.php` :
- `app.url` et le bloc `mail` (serveur SMTP) : sans `mail.host`, l'envoi est désactivé et l'interface l'indique ;
- `app.secret_key` (32 octets aléatoires en base64) : requis pour stocker les mots de passe MRA ;
- bloc `mra` : URLs (sandbox par défaut) et clé publique MRA téléchargée sur le portail (`config/mra_public_key.pem`).

Cron :
```
*/5 * * * * php tools/mra_retry.php
15 2 * * *  php tools/clientbloom_expire.php
0 * * * *   php tools/rendezvous_reminders.php
```

## Reste à décider

- Ordre de construction des apps suivantes ; sort de Bookora face à RendezVous.
- Tarification : prix par app, pack, ou par utilisateur.
- Fin d'essai : que voit le client à J+30 (blocage, lecture seule, paiement).
