# InsurLink MU — Manuel Utilisateur
**Édition Française | Version 1.0**
*Pour les Courtiers et Agents d'Assurance*

---

## Table des Matières

1. [Introduction](#1-introduction)
2. [Démarrage](#2-démarrage)
3. [Tableau de Bord](#3-tableau-de-bord)
4. [Gestion des Clients](#4-gestion-des-clients)
5. [Gestion des Polices](#5-gestion-des-polices)
6. [Prise de Rendez-vous](#6-prise-de-rendez-vous)
7. [Liens de Paiement](#7-liens-de-paiement)
8. [Pipeline de Renouvellement](#8-pipeline-de-renouvellement)
9. [Paramètres](#9-paramètres)
10. [Foire Aux Questions](#10-foire-aux-questions)
11. [Glossaire](#11-glossaire)

---

## 1. Introduction

### Qu'est-ce qu'InsurLink MU ?

InsurLink MU est une plateforme tout-en-un conçue spécifiquement pour les courtiers d'assurance à Maurice. Elle vous permet de :

- **Ne jamais manquer un renouvellement** — des rappels automatiques sont envoyés à vos clients à 45, 30 et 15 jours avant l'expiration de leur police.
- **Encaisser plus rapidement** — générez un lien de paiement MIPS ou Juice en quelques secondes et envoyez-le directement à votre client par email ou WhatsApp.
- **Planifier les inspections sans allers-retours** — partagez un lien de réservation avec vos clients pour qu'ils choisissent eux-mêmes leur créneau.
- **Garder un dossier irréprochable** — toutes les polices, communications et paiements sont centralisés et conformes aux exigences de la FSC.

### À qui s'adresse ce manuel ?

Ce manuel est destiné aux :
- **Courtiers / Agents** — les utilisateurs quotidiens qui gèrent les clients et les polices.
- **Directeurs / Administrateurs** — les responsables d'équipe avec accès aux portefeuilles de tous les agents et aux paramètres de la plateforme.

---

## 2. Démarrage

### 2.1 Connexion

1. Ouvrez votre navigateur et accédez à `https://app.insurlink.mu`.
2. Saisissez votre **adresse email** et votre **mot de passe**.
3. Cliquez sur **Se connecter**.

> **Conseil :** Pour des raisons de sécurité, la plateforme vous déconnecte automatiquement après 30 minutes d'inactivité. Pensez à sauvegarder régulièrement votre travail.

Si vous avez oublié votre mot de passe, cliquez sur **Mot de passe oublié ?** sur la page de connexion et suivez les instructions envoyées à votre adresse email.

---

### 2.2 Configuration Initiale (Administrateur uniquement)

Lors de la création du compte de votre cabinet, l'administrateur doit compléter l'assistant de configuration :

**Étape 1 — Profil du Cabinet**
- Saisissez le nom légal de votre entreprise.
- Renseignez votre **Numéro de Licence FSC** (obligatoire pour la conformité réglementaire).
- Téléversez votre logo (facultatif — apparaît dans les emails envoyés à vos clients).

**Étape 2 — Configuration MIPS**
- Saisissez votre **Identifiant Marchand MIPS** et votre **Clé API MIPS** (obtenus sur mips.mu).
- Cliquez sur **Tester la connexion** pour vérifier que les identifiants fonctionnent.

> **Note de sécurité :** Votre clé API MIPS est chiffrée et stockée de manière sécurisée. Elle n'est jamais affichée en clair après enregistrement.

**Étape 3 — Configuration WhatsApp**
- Saisissez votre **Numéro WhatsApp Business** (format E.164 : `+230 5700 0000`).
- Suivez les instructions à l'écran pour connecter votre compte Meta WhatsApp Business.

**Étape 4 — Inviter des Agents**
- Saisissez les adresses email de vos collaborateurs.
- Sélectionnez leur rôle : **Agent** ou **Administrateur**.
- Ils recevront un email d'invitation pour définir leur mot de passe.

---

### 2.3 Votre Profil

Pour modifier votre nom, email ou mot de passe :
1. Cliquez sur votre **nom** en haut à droite.
2. Sélectionnez **Mon Profil**.
3. Effectuez vos modifications et cliquez sur **Enregistrer**.

Pour définir vos **horaires de travail** (utilisés pour la disponibilité des créneaux de rendez-vous) :
1. Allez dans **Paramètres → Calendrier**.
2. Activez ou désactivez chaque jour et définissez vos heures de début et de fin.
3. Cliquez sur **Enregistrer les Horaires**.

---

## 3. Tableau de Bord

Le tableau de bord est votre écran d'accueil. Il vous donne une vue d'ensemble de tout ce qui nécessite votre attention.

### 3.1 Indicateurs Clés (ligne supérieure)

| Carte | Ce qu'elle indique |
|---|---|
| **Polices Actives** | Nombre total de polices actives dans votre portefeuille |
| **Renouvellements (45 jours)** | Polices arrivant à expiration dans les 45 prochains jours |
| **Revenus à Risque** | Valeur totale des primes des polices non renouvelées arrivant à expiration |
| **Paiements en Attente** | Liens de paiement MIPS envoyés mais pas encore réglés |

### 3.2 Pipeline de Renouvellement (centre)

Un tableau Kanban présentant tous les renouvellements en cours, répartis en cinq colonnes :

| Colonne | Signification |
|---|---|
| **J-45 Envoyé** | Premier rappel envoyé, en attente de réponse du client |
| **J-30 Envoyé** | Deuxième rappel envoyé |
| **J-15 Urgent** | Dernier rappel envoyé — relance personnelle recommandée |
| **Payé** | Le client a payé via le lien MIPS |
| **Caduc** | La police a expiré sans paiement |

Cliquez sur n'importe quelle carte pour ouvrir le détail complet du renouvellement.

### 3.3 Rendez-vous à Venir (panneau droit)

Liste vos 5 prochains rendez-vous planifiés. Cliquez sur **Voir tout** pour ouvrir le calendrier complet.

### 3.4 Vue Directeur (Administrateur uniquement)

Les administrateurs disposent d'un onglet supplémentaire : **Vue Équipe**, qui affiche pour chaque agent :
- Le nombre de polices actives
- Les renouvellements prévus dans les 30 prochains jours
- Les commissions à risque sur les polices non renouvelées
- Le nombre de rendez-vous dans la semaine

---

## 4. Gestion des Clients

### 4.1 Consulter la Liste des Clients

1. Cliquez sur **Clients** dans le menu de navigation à gauche.
2. Utilisez la **barre de recherche** pour trouver un client par nom, email ou numéro de NIC.
3. Filtrez par **agent assigné**, **type de client** (particulier / société) ou **type de police**.

### 4.2 Ajouter un Nouveau Client

1. Cliquez sur **Clients → + Ajouter un Client**.
2. Renseignez les informations du client :

| Champ | Notes |
|---|---|
| **Prénom / Nom** | Ou **Nom de la Société** si le type est Société |
| **Numéro de NIC** | Numéro de carte d'identité nationale (traitement confidentiel) |
| **Numéro de Portable** | Inclure l'indicatif pays : `+230 5700 0000` |
| **Numéro WhatsApp** | Laisser vide si identique au portable |
| **Email** | Utilisé pour les emails de renouvellement et les reçus |
| **Préférence de Langue** | Anglais ou Français — détermine la langue des messages automatiques |
| **Canaux de Communication** | Choisir Email, WhatsApp ou les deux |

3. Cliquez sur **Enregistrer le Client**.

> **Conseil :** Le numéro WhatsApp est crucial — c'est là que sont envoyés les rappels de renouvellement. Confirmez toujours ce numéro avec le client.

### 4.3 Fiche Client

La fiche client regroupe tout en une seule vue :
- **Onglet Informations** — coordonnées, NIC, préférence de langue.
- **Onglet Polices** — toutes les polices du client.
- **Onglet Communications** — historique complet de chaque email et message WhatsApp envoyé.
- **Onglet Documents** — bordereaux de police, copies de pièces d'identité, rapports d'inspection.
- **Onglet Rendez-vous** — rendez-vous passés et à venir.

### 4.4 Modifier un Client

1. Ouvrez la fiche client.
2. Cliquez sur **Modifier** (en haut à droite).
3. Effectuez vos modifications et cliquez sur **Enregistrer**.

Toutes les modifications sont enregistrées dans le journal d'audit.

### 4.5 Ajouter une Note

Sur n'importe quelle fiche client :
1. Faites défiler jusqu'à la section **Notes**.
2. Saisissez votre note.
3. Cliquez sur **Enregistrer la Note**.

Les notes sont visibles par tous les agents du cabinet.

---

## 5. Gestion des Polices

### 5.1 Consulter les Polices

1. Cliquez sur **Polices** dans le menu de navigation.
2. Filtrez par :
   - **Statut** : Active / Brouillon / Caduque / Renouvelée / Annulée
   - **Date d'expiration** : ex., "expirant dans les 30 prochains jours"
   - **Assureur** : SWAN, MUA, Jubilee, etc.
   - **Type de produit** : Auto, Habitation, Vie, Santé, Responsabilité, Marine, Flotte

### 5.2 Créer une Nouvelle Police

1. Allez sur la fiche client → **Onglet Polices** → **+ Ajouter une Police**.
   *(Ou allez dans Polices → + Ajouter une Police et recherchez le client.)*

2. Renseignez les détails de la police :

**Section A — Assureur et Produit**

| Champ | Notes |
|---|---|
| **Assureur** | Sélectionnez dans la liste (SWAN, MUA, Jubilee, CIM, AML, BAI) |
| **Type de Produit** | Auto / Habitation / Vie / Santé / Responsabilité / Marine / Flotte |
| **Nom du Produit** | ex., "Tous Risques Auto Plus" |

**Section B — Conditions de la Police**

| Champ | Notes |
|---|---|
| **Numéro de Police** | Le numéro attribué par l'assureur |
| **Date de Début** | Date de prise d'effet de la couverture |
| **Date d'Expiration** | Date d'expiration — pilote l'automatisation des renouvellements |
| **Montant de la Prime** | Prime annuelle en MUR |
| **Valeur Assurée** | Valeur totale assurée en MUR |
| **Franchise** | Montant de la franchise client en MUR |
| **Type de Couverture** | ex., Tous Risques, Tiers Simple, Tiers Incendie et Vol |
| **Fréquence de Paiement** | Annuel / Semestriel / Trimestriel / Mensuel |

**Section C — Description du Bien**

| Champ | Notes |
|---|---|
| **Description du Bien** | ex., "Toyota Vios B 1234" ou "Villa à Balaclava" |
| **Détails du Véhicule** | Marque, Modèle, Année, Immatriculation (pour les polices auto) |

**Section D — Commission du Courtier**

| Champ | Notes |
|---|---|
| **Commission %** | Votre taux de commission convenu |
| **Montant de la Commission** | Calculé automatiquement : prime × taux |

**Section E — Inspection**

| Champ | Notes |
|---|---|
| **Inspection Requise ?** | Activez si l'assureur exige une inspection avant la mise en couverture |

3. Cliquez sur **Enregistrer la Police**.

> **Ce qui se passe ensuite :** Le système crée automatiquement un enregistrement de renouvellement et définit les dates de déclenchement des rappels à **J-45**, **J-30** et **J-15** avant la date d'expiration.

### 5.3 Téléverser un Document de Police

1. Ouvrez la page de détail de la police.
2. Cliquez sur **Documents → Téléverser**.
3. Sélectionnez le fichier (PDF recommandé, 20 Mo maximum).
4. Choisissez le type de document : Bordereau de Police / Note de Couverture / Autre.
5. Cliquez sur **Téléverser**.

Le document est stocké de manière sécurisée et accessible à tous les agents du cabinet.

### 5.4 Cycle de Vie du Statut d'une Police

```
BROUILLON → ACTIVE → RENOUVELÉE (après réception du paiement)
                   → CADUQUE   (si J-0 passe sans paiement)
                   → ANNULÉE   (annulation manuelle)
                   → SINISTRE  (sinistre en cours)
```

Pour modifier manuellement le statut d'une police :
1. Ouvrez la police.
2. Cliquez sur **Changer le Statut** (administrateur uniquement pour la réactivation Caduque → Active).
3. Sélectionnez le nouveau statut et ajoutez une note explicative.

---

## 6. Prise de Rendez-vous

### 6.1 Types de Rendez-vous

| Type | Quand l'utiliser |
|---|---|
| **Inspection de Véhicule** | Avant l'émission d'une police auto — l'assureur exige une inspection du véhicule |
| **Expertise Immobilière** | Avant l'émission d'une police habitation — évaluation du risque par un expert |
| **Audit de Risques** | Pour les clients professionnels — évaluation complète par vidéo ou en présentiel |
| **Réunion Générale** | Réunion client générale (mise en relation, discussion de renouvellement, etc.) |

### 6.2 Planifier un Rendez-vous

**Option A — Le courtier planifie pour le client :**
1. Allez dans **Rendez-vous → + Planifier un Rendez-vous**.
2. Sélectionnez le **client** et la **police** (si applicable).
3. Choisissez le **type de rendez-vous** et le **format** (Présentiel ou Visioconférence).
4. Sélectionnez une date et un créneau horaire parmi vos disponibilités.
5. Si présentiel : saisissez le **lieu**.
6. Si vidéo : un lien de réunion est généré automatiquement.
7. Ajoutez les **instructions** à l'intention du client.
8. Cliquez sur **Planifier** — le client reçoit un email et un message WhatsApp de confirmation avec une invitation calendrier.

**Option B — Le client réserve via un lien en libre-service :**
1. Allez dans **Rendez-vous → Partager le Lien de Réservation**.
2. Copiez le lien et envoyez-le à votre client (WhatsApp, email ou SMS).
3. Le client ouvre le lien, sélectionne un créneau et confirme — aucune connexion requise.
4. Vous recevez une notification lors de la confirmation de la réservation.

### 6.3 Gérer les Rendez-vous

Le **Calendrier des Rendez-vous** (cliquez sur **Rendez-vous** dans le menu) affiche tous vos rendez-vous en vue hebdomadaire ou mensuelle.

Cliquez sur n'importe quel rendez-vous pour :
- **Consulter les détails** — client, type, format, horaire, lieu / lien vidéo.
- **Ajouter des notes post-rendez-vous** — consignez le résultat de l'inspection.
- **Téléverser un rapport d'inspection** — joignez le rapport PDF.
- **Marquer comme Terminé / Absent / Annulé**.

> **Rappel automatique :** Le système envoie automatiquement un rappel au client la veille du rendez-vous. Vous n'avez rien à faire.

### 6.4 Lier un Rendez-vous à une Police

Si le rendez-vous aboutit à l'émission d'une police :
1. Ouvrez le rendez-vous.
2. Cliquez sur **Lier à une Police** et recherchez la police concernée.
3. Si l'inspection est terminée et satisfaisante, activez **Inspection Réalisée** sur la fiche police.

---

## 7. Liens de Paiement

### 7.1 Qu'est-ce qu'un Lien de Paiement MIPS ?

Un lien de paiement MIPS est une URL sécurisée qui dirige votre client vers une page de paiement hébergée où il peut régler par :
- **Juice** (MCB Juice / SBM Juice)
- **Carte de crédit ou de débit** (Visa / Mastercard)

Lorsque le client paie, le système est automatiquement notifié et le statut de la police est mis à jour. Vous ne manipulez jamais les données de carte bancaire.

### 7.2 Générer un Lien de Paiement

1. Ouvrez une **police** ou un **dossier de renouvellement**.
2. Cliquez sur **Générer un Lien de Paiement**.
3. Renseignez les informations :

| Champ | Notes |
|---|---|
| **Montant (MUR)** | Le montant de la prime — pré-rempli depuis la police |
| **Description** | Affichée au client sur la page de paiement |
| **Type de paiement** | Paiement complet ou Acompte (ex., "1 de 4") |
| **Expiration du lien** | Durée de validité du lien (par défaut : 30 jours) |

4. Cliquez sur **Générer**.
5. Le lien apparaît — vous pouvez :
   - **Copier** et coller dans WhatsApp manuellement.
   - **Envoyer par Email** — ouvre un email pré-rempli avec le lien intégré.
   - **Envoyer par WhatsApp** — ouvre un message WhatsApp pré-rempli.
   - **Joindre au Renouvellement** — inclut automatiquement le lien dans le prochain message de renouvellement.

### 7.3 Suivre les Paiements

Allez dans **Paiements** dans le menu de navigation pour voir tous les liens de paiement avec leur statut :

| Statut | Signification |
|---|---|
| **En Attente** | Lien envoyé, le client n'a pas encore payé |
| **Payé** | Paiement confirmé par MIPS |
| **Expiré** | Le lien a dépassé sa date de validité |
| **Échoué** | Tentative de paiement échouée |

Lorsqu'un paiement est confirmé, vous recevez une notification dans l'application et le client reçoit automatiquement un reçu par email.

### 7.4 Historique des Paiements

Sur n'importe quelle fiche police, cliquez sur l'onglet **Paiements** pour consulter l'historique complet des paiements, avec chaque référence de transaction MIPS pour votre réconciliation comptable.

---

## 8. Pipeline de Renouvellement

Le pipeline de renouvellement est au cœur d'InsurLink MU. Il garantit qu'aucune police ne devient caduque par suite d'un rappel manqué.

### 8.1 Fonctionnement de l'Automatisation

Chaque matin à 8h00, le système vérifie toutes les polices actives et envoie automatiquement des rappels de renouvellement en fonction de la date d'expiration :

| Déclencheur | Quand | Ce qui est envoyé |
|---|---|---|
| **J-45** | 45 jours avant expiration | Rappel de renouvellement amical + lien de paiement MIPS |
| **J-30** | 30 jours avant expiration | Second rappel (ton plus urgent) |
| **J-15** | 15 jours avant expiration | Avis urgent + le courtier est notifié pour un suivi personnel |
| **J-0** | Le jour de l'expiration | Avis de caducité au client + alerte critique au courtier |

Les messages sont envoyés dans la **langue préférée du client** (français ou anglais) via ses **canaux préférés** (email et/ou WhatsApp).

### 8.2 Vue du Pipeline de Renouvellement

Allez dans **Renouvellements** pour consulter le tableau Kanban avec tous vos renouvellements en cours.

**Lecture du pipeline :**
- Chaque carte affiche : nom du client, type de police, assureur, date d'expiration, montant de la prime.
- **Bordure rouge** = police caduque ou J-15 atteint sans paiement.
- **Bordure orange** = J-30 atteint sans paiement.
- **Vert** = paiement reçu.

**Filtrage du pipeline :**
- Utilisez la barre de filtre pour n'afficher que vos renouvellements assignés.
- L'administrateur peut basculer pour voir les renouvellements de tous les agents.

### 8.3 Page de Détail d'un Renouvellement

Cliquez sur une carte de renouvellement pour ouvrir le détail complet :

- **Chronologie** — affiche exactement quels messages ont été envoyés et quand.
- **Aperçus des messages** — cliquez sur un message envoyé pour voir exactement ce que le client a reçu.
- **Lien de paiement** — affiche le lien MIPS généré et son statut actuel.
- **Notes de l'agent** — ajoutez des notes sur vos échanges avec le client.
- **Envoi manuel** — renvoyez manuellement un message de rappel si nécessaire.

### 8.4 Envoyer Manuellement un Message de Renouvellement

Si vous souhaitez envoyer un message en dehors du calendrier automatisé :
1. Ouvrez le détail du renouvellement.
2. Cliquez sur **Envoyer un Message Maintenant**.
3. Choisissez le modèle de message (J-45, J-30, J-15 ou personnalisé).
4. Prévisualisez le message — vous pouvez modifier le texte avant envoi.
5. Sélectionnez les canaux (Email, WhatsApp ou les deux).
6. Cliquez sur **Envoyer**.

Le système enregistre le message et le consigne dans la chronologie des communications.

### 8.5 Lorsqu'un Client Paie

Lorsque MIPS confirme le paiement :
1. Le statut du renouvellement passe automatiquement à **Payé**.
2. Le statut de la police est mis à jour sur **Renouvelée**.
3. Une nouvelle période de police est créée (début = ancienne expiration + 1 jour).
4. Les nouveaux déclencheurs de renouvellement sont définis pour l'année suivante.
5. Le client reçoit un reçu de paiement par email.
6. Vous recevez une notification dans l'application.

**Vous n'avez aucune action manuelle à effectuer.**

### 8.6 Gérer une Police Caduque

Si une police devient caduque (J-0 atteint sans paiement) :
1. Vous recevez une **alerte critique** dans l'application et par email.
2. La police apparaît dans l'onglet **Caduques** sous Polices.
3. Contactez le client immédiatement — il n'est plus couvert.
4. Lorsque le client accepte de réactiver, générez un nouveau lien de paiement.
5. Après paiement, un administrateur peut remettre le statut de la police sur **Active** et ajuster les dates.

---

## 9. Paramètres

### 9.1 Profil du Cabinet (Administrateur uniquement)

**Paramètres → Profil du Cabinet**

| Paramètre | Description |
|---|---|
| **Nom du Cabinet** | Affiché dans toutes les communications clients |
| **Numéro de Licence FSC** | Votre immatriculation FSC — obligatoire |
| **Logo** | Apparaît dans les en-têtes d'emails (PNG/JPG, 2 Mo maximum) |
| **Téléphone** | Affiché dans les pieds de page des emails |
| **Adresse** | Affichée dans les pieds de page des emails |

### 9.2 Configuration MIPS (Administrateur uniquement)

**Paramètres → Paiements → MIPS**

| Paramètre | Description |
|---|---|
| **Identifiant Marchand** | Votre identifiant marchand MIPS |
| **Clé API** | Votre clé secrète MIPS — stockée chiffrée |
| **Tester la Connexion** | Valide les identifiants auprès de l'API MIPS |

### 9.3 Configuration WhatsApp (Administrateur uniquement)

**Paramètres → Notifications → WhatsApp**

| Paramètre | Description |
|---|---|
| **Numéro Business** | Votre numéro WhatsApp Business (format E.164) |
| **Jeton d'Accès** | Jeton API WhatsApp Meta |
| **Envoyer un Message Test** | Envoie un WhatsApp test à votre propre numéro |

### 9.4 Modèles de Notification (Administrateur uniquement)

**Paramètres → Modèles de Notification**

Vous pouvez personnaliser le texte de chaque message automatique :
1. Sélectionnez le modèle (ex., **Renouvellement J-45 — Email — Français**).
2. Modifiez l'objet et le corps du message. Utilisez `{{nom_variable}}` pour insérer du contenu dynamique.
3. Cliquez sur **Aperçu** pour voir un exemple avec des données de test.
4. Cliquez sur **Enregistrer**.

**Variables disponibles :**

| Variable | Remplacée par |
|---|---|
| `{{client_name}}` | Nom complet du client |
| `{{policy_type}}` | Nom du produit (ex., Tous Risques Auto) |
| `{{policy_number}}` | Numéro de police de l'assureur |
| `{{insurer_name}}` | Nom de l'assureur (ex., SWAN Insurance) |
| `{{expiry_date}}` | Date d'expiration (ex., 15 juin 2026) |
| `{{premium_amount}}` | Prime en MUR (ex., 24 500,00) |
| `{{payment_link}}` | L'URL de paiement MIPS |
| `{{agent_name}}` | Votre nom |
| `{{agent_phone}}` | Votre numéro de téléphone |
| `{{brokerage_name}}` | Le nom de votre cabinet |

> **Important :** Ne supprimez pas les variables obligatoires des modèles — le système n'enverra pas un message si une variable requise est manquante.

### 9.5 Gestion des Agents (Administrateur uniquement)

**Paramètres → Équipe**

Pour **inviter un nouvel agent** :
1. Cliquez sur **Inviter un Agent**.
2. Saisissez son adresse email et sélectionnez son rôle (Agent ou Administrateur).
3. Cliquez sur **Envoyer l'Invitation** — il reçoit un email pour définir son mot de passe.

Pour **désactiver un agent** (ex., lors d'un départ) :
1. Cliquez sur le nom de l'agent dans la liste.
2. Cliquez sur **Désactiver**.
3. Réassignez ses clients à un autre agent (une invite vous y guidera).

Pour **modifier le rôle d'un agent** :
1. Cliquez sur le nom de l'agent.
2. Cliquez sur **Modifier le Rôle**.
3. Sélectionnez le nouveau rôle et confirmez.

### 9.6 Paramètres du Calendrier (Chaque Agent)

**Paramètres → Calendrier**

Définissez vos jours et horaires de disponibilité pour la prise de rendez-vous :
1. Activez ou désactivez chaque jour de la semaine.
2. Pour les jours actifs, définissez vos heures de début et de fin.
3. Vérifiez votre **fuseau horaire** (par défaut : Indian/Mauritius — UTC+4).
4. Cliquez sur **Enregistrer**.

Votre disponibilité est utilisée lorsque les clients réservent via le lien de réservation en libre-service.

### 9.7 Journal d'Audit (Administrateur uniquement)

**Paramètres → Journal d'Audit**

Le journal d'audit enregistre chaque action significative effectuée sur la plateforme — requis pour la conformité FSC. Vous pouvez :
- Filtrer par **période**, **type d'action** ou **agent**.
- Exporter en CSV pour les rapports réglementaires.
- Consulter les états "avant" et "après" pour toute modification de données.

Les enregistrements sont conservés **7 ans** conformément aux exigences de la Financial Services Act.

---

## 10. Foire Aux Questions

**Q : Un client dit ne pas avoir reçu son WhatsApp de renouvellement — que faire ?**

R : Vérifiez d'abord l'**Historique des Communications** sur sa fiche — vous verrez si le message a été envoyé et s'il a été délivré. Causes fréquentes : numéro WhatsApp incorrect, téléphone éteint, ou numéro WhatsApp différent du portable. Mettez à jour le numéro WhatsApp et utilisez **Envoi Manuel** pour renvoyer le message.

---

**Q : Un client a payé mais la police affiche toujours "En Attente" — que s'est-il passé ?**

R : La confirmation de paiement MIPS prend généralement quelques secondes. Attendez 2 minutes et actualisez la page. Si la police affiche toujours "En Attente", allez dans **Paiements** et trouvez le lien — s'il affiche "Payé", cliquez sur **Synchroniser** pour déclencher manuellement la mise à jour. Si le lien affiche toujours "En Attente" alors que le client dispose d'un reçu MIPS, contactez le support avec la référence de transaction MIPS.

---

**Q : Puis-je désactiver les rappels automatiques pour un client spécifique ?**

R : Actuellement, les rappels automatiques s'appliquent à toutes les polices actives. Si un client souhaite ne plus recevoir de messages WhatsApp, supprimez son numéro WhatsApp de sa fiche — les rappels continueront uniquement par email. Une option de désinscription par client est prévue dans la feuille de route Phase 2.

---

**Q : Une police a été renouvelée avec un autre assureur — comment l'enregistrer ?**

R : Créez une nouvelle fiche police avec le nouvel assureur et le nouveau numéro de police. Définissez la date de début au lendemain de l'expiration de l'ancienne police. Le statut de l'ancienne police passera à "Renouvelée" automatiquement lors de la réception du paiement (via MIPS), ou vous pouvez le mettre à jour manuellement. Ne modifiez pas l'ancienne fiche police.

---

**Q : Comment gérer une résiliation en cours d'année ?**

R : Ouvrez la police, cliquez sur **Changer le Statut** et sélectionnez **Annulée**. Ajoutez une note avec le motif de résiliation et la date effective. Si un remboursement est dû, traitez-le via votre portail marchand MIPS (en dehors d'InsurLink MU pour le MVP).

---

**Q : Le client souhaite payer en plusieurs fois — est-ce possible ?**

R : Oui. Générez plusieurs liens de paiement — un pour chaque acompte — en utilisant l'option **Acompte** lors de la création du lien (ex., "Versement 1 de 4 — MUR 6 125"). Envoyez chaque lien à la date d'échéance correspondante. La planification automatique des paiements échelonnés est prévue dans la feuille de route Phase 2.

---

**Q : Un client peut-il se connecter et consulter ses propres polices ?**

R : Pas dans le MVP actuel. Un portail client est prévu pour la Phase 3.

---

**Q : Comment exporter ma liste de clients ou mes données de polices ?**

R : Allez dans **Clients** ou **Polices**, appliquez les filtres souhaités, puis cliquez sur **Exporter → CSV**. L'export respecte votre sélection de filtres en cours.

---

## 11. Glossaire

| Terme | Définition |
|---|---|
| **Cabinet de Courtage** | Le cabinet de courtage d'assurance utilisant InsurLink MU |
| **Agent** | Un courtier ou collaborateur qui gère les clients et les polices |
| **Administrateur** | Un agent disposant d'un accès complet, y compris aux paramètres et aux données de toute l'équipe |
| **Client** | Un particulier ou une entreprise dont les polices sont gérées par le cabinet |
| **Police** | Un contrat d'assurance entre le client et un assureur |
| **Assureur** | La compagnie d'assurance qui souscrit la police (ex., SWAN, MUA, Jubilee) |
| **Prime** | Le montant que le client paie pour sa couverture d'assurance |
| **Valeur Assurée** | Le montant maximum que l'assureur versera en cas de sinistre |
| **Franchise** | Le montant que le client doit payer de sa poche avant que l'assureur n'intervienne |
| **Renouvellement** | Le processus de prolongation d'une police pour une nouvelle période à son expiration |
| **J-45 / J-30 / J-15 / J-0** | Nombre de jours avant l'expiration de la police auxquels les rappels automatiques sont déclenchés |
| **Caduque** | Police expirée sans paiement de renouvellement — le client n'est plus couvert |
| **MIPS** | Mauritius Inter-Bank Payment System — l'infrastructure de paiement électronique locale |
| **Juice** | Application de paiement mobile MCB ou SBM — acceptée via MIPS |
| **Lien de Paiement** | URL dirigeant le client vers une page de paiement MIPS hébergée |
| **FSC** | Financial Services Commission — le régulateur des courtiers d'assurance à Maurice |
| **NIC** | National Identity Card — la carte nationale d'identité mauricienne |
| **BRN** | Business Registration Number — pour les clients personnes morales |
| **Note de Couverture** | Document provisoire confirmant la couverture d'assurance dans l'attente du bordereau de police |
| **Bordereau de Police** | Le document officiel d'assurance complet émis par l'assureur |
| **Inspection** | Évaluation physique d'un véhicule ou d'un bien immobilier requise par certains assureurs avant la mise en couverture |
| **Audit de Risques** | Évaluation complète des risques d'un client, généralement réalisée par vidéo pour les clients professionnels |
| **Journal d'Audit** | Registre automatique de toutes les modifications effectuées sur la plateforme — requis pour la conformité FSC |
| **API WhatsApp Business** | L'API officielle de Meta pour l'envoi de messages WhatsApp depuis des plateformes professionnelles |

---

*InsurLink MU — Conçu pour les Courtiers d'Assurance Mauriciens*
*Support : support@insurlink.mu | Tél : +230 xxxx xxxx*
