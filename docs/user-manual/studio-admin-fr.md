# Manuel utilisateur — Studio (Français)

Pour les propriétaires de studio, instructeurs et personnel d'accueil. Ce guide explique comment piloter ton studio au quotidien avec le MIPS Booking & Payment Engine.

> 🇬🇧 English version: [`studio-admin-en.md`](./studio-admin-en.md)

## Sommaire
1. [Rôles et accès](#1-rôles-et-accès)
2. [Se connecter](#2-se-connecter)
3. [L'écran « Aujourd'hui »](#3-lécran--aujourdhui-)
4. [Publier le planning de la semaine](#4-publier-le-planning-de-la-semaine)
5. [Modifier ou annuler un cours](#5-modifier-ou-annuler-un-cours)
6. [Pointer les clients à l'arrivée](#6-pointer-les-clients-à-larrivée)
7. [Gérer les clients](#7-gérer-les-clients)
8. [Effectuer un remboursement](#8-effectuer-un-remboursement)
9. [Ajustements manuels de crédit](#9-ajustements-manuels-de-crédit)
10. [Suivre le chiffre d'affaires](#10-suivre-le-chiffre-daffaires)
11. [Notifications](#11-notifications)
12. [Réglages](#12-réglages)
13. [La boucle de rétention en pratique](#13-la-boucle-de-rétention-en-pratique)
14. [Questions fréquentes](#14-questions-fréquentes)

---

## 1. Rôles et accès

| Rôle | Peut faire |
|---|---|
| **Owner (propriétaire)** | Tout : planning, clients, remboursements, réglages, chiffre d'affaires |
| **Instructeur** | Voir ses cours, pointer les clients, voir le planning du jour |
| **Accueil (front-desk)** | Voir le planning du jour, pointer les clients |
| **Admin (plateforme)** | Opérations multi-studios (réservé au personnel MIPS) |

Le propriétaire crée les comptes pour les instructeurs et le personnel d'accueil. Il peut changer les rôles à tout moment depuis **Réglages → Équipe**.

## 2. Se connecter

1. Va sur `https://app.mips.studio/login`.
2. Saisis ton email et ton mot de passe.
3. Tu restes connecté pendant 12 heures ; la session se prolonge à chaque clic.

> 🔒 Après 10 tentatives échouées en 15 minutes, ton compte est verrouillé pendant 30 minutes. Attends ou contacte le support MIPS.

## 3. L'écran « Aujourd'hui »

Ton écran d'accueil après connexion.

Tu vois :
- **Les cours du jour**, en ordre chronologique. Chaque carte affiche : horaire, instructrice, salle, capacité, réservations en cours, no-shows.
- Un bouton **Pointer** sur chaque cours.
- Un panneau latéral : chiffre d'affaires du jour, no-shows du jour, remboursements du jour.

Tape un cours pour entrer dans le détail des présences.

## 4. Publier le planning de la semaine

**Planning → Vue semaine → routine du dimanche soir :**

1. Clique **Dupliquer la semaine précédente** pour copier les cours de la semaine passée vers la suivante.
2. Passe chaque jour en revue ; ajuste capacité ou instructrice si besoin.
3. Ajoute un nouveau cours : clique sur un créneau vide → renseigne type de cours, instructrice, salle, capacité → **Enregistrer en brouillon**.
4. Quand tu as fini, clique **Publier la semaine** — les clients peuvent réserver.

> 💡 Les cours sont en **BROUILLON** jusqu'à ce que tu publies. Les brouillons sont invisibles pour les clients.

Tu peux modifier un cours publié à tout moment. Les clients déjà inscrits voient les mises à jour automatiquement.

## 5. Modifier ou annuler un cours

### Modifier

1. Depuis la vue semaine, clique le cours.
2. Modifie les champs. À noter :
   - Tu **ne peux pas** réduire la capacité en dessous du nombre de réservations existantes — annule d'abord des réservations spécifiques.
   - Changer l'horaire ou l'instructrice notifie automatiquement les clients inscrits.

### Annuler un cours

1. Depuis le détail du cours, clique **Annuler le cours**.
2. Confirme. Toutes les réservations confirmées :
   - Sont **intégralement remboursées** via un reversal MIPS.
   - Les clients reçoivent un SMS + email d'excuse avec l'avis de remboursement.
3. Le créneau apparaît grisé sur le calendrier.

Cette action est **journalisée dans l'audit log** et ne peut pas être annulée.

## 6. Pointer les clients à l'arrivée

Ouvre le cours depuis l'écran **Aujourd'hui** → **Pointer**.

Tu vois la liste des clients confirmés. Pour chacun :
- Tape **Présent** à son arrivée.
- Tape **No-show** en fin de cours pour les absents.

Si tu oublies, le système marque automatiquement les absents 1 heure après la fin du cours.

> 💡 Walk-ins sans réservation : depuis le pointage → **Ajouter walk-in** → cherche le client ou crée-le → choisis le paiement (espèces ou MIPS).

## 7. Gérer les clients

Onglet **Clients** :

- **Recherche** par nom ou téléphone.
- **Filtre** par statut :
  - `Actif` — récemment venu, solde positif.
  - `Solde faible` — il reste 1 session. Tes cibles de revente.
  - `Inactif` — aucun cours depuis 60+ jours.
  - `Expiré` — forfaits expirés sans renouvellement.
- **Export** CSV pour outils de marketing.

### Profil client

Clique un client pour voir :
- Coordonnées, statut, statistiques de vie.
- Onglet **Réservations** — historique complet.
- Onglet **Paiements** — toutes les transactions, remboursables d'ici.
- Onglet **Notifications** — quels messages ont été envoyés, quand, et le statut de livraison.
- Onglet **Ajustements manuels** — piste d'audit des crédits ajoutés.

## 8. Effectuer un remboursement

Depuis une réservation confirmée ou un paiement :

1. Clique **Rembourser**.
2. Choisis le mode :
   - **Remboursement total** — argent rendu via MIPS vers le moyen de paiement d'origine ; session recréditée.
   - **Remboursement partiel** — rembourse une partie d'un achat de forfait (ex. 2 sessions inutilisées d'un pack 5).
   - **Crédit uniquement** — recrédite la session, garde l'argent. Utile pour un geste commercial.
3. Saisis une raison interne (texte libre). Obligatoire pour l'audit.
4. Confirme.

Le client reçoit un email de notification. Le remboursement apparaît sur sa carte ou son Juice sous 5 jours ouvrés (selon MIPS).

> ⚠️ Les remboursements sont journalisés dans l'audit log avec ton nom, la raison et un horodatage. Ils ne peuvent pas être supprimés.

## 9. Ajustements manuels de crédit

Pour un geste commercial, une erreur, ou une session offerte :

1. Profil client → **Ajouter du crédit**.
2. Saisis les sessions à ajouter (ou retirer, avec un nombre négatif).
3. Saisis une raison.
4. Confirme.

Le crédit apparaît immédiatement dans le solde du client. Il ne reçoit pas de notification automatique — écris-lui toi-même si nécessaire.

## 10. Suivre le chiffre d'affaires

Onglet **Chiffre d'affaires** :

- **Cette semaine / mois / période personnalisée**.
- Barres empilées : revenus par moyen de paiement (Juice / Carte / Espèces / Offert).
- Remboursements en barres négatives.
- Colonne **CA net** = brut moins frais MIPS.
- Export CSV pour la comptabilité.

> 💡 Le rapport de réconciliation matinal t'est envoyé par email chaque jour si un écart est détecté entre nos enregistrements et le règlement MIPS. Ouvre l'email — c'est un incident.

## 11. Notifications

La plateforme envoie automatiquement des messages à tes clients (voir manuel client). Tu peux :

- **Réglages → Notifications** — désactiver le rappel email 24 h si tes clients trouvent ça intrusif. Le SMS 2 h, la confirmation de réservation et l'avis de remboursement ne peuvent pas être désactivés (transactionnels).
- **Clients → profil → onglet Notifications** — voir ce qui a été envoyé et si c'est bien arrivé.
- Un client avec des badges rouges (email rebondi ou SMS non délivrable) nécessite un coup de fil.

## 12. Réglages

Les réglages du studio se trouvent dans **Réglages**.

### Informations studio
- Nom, logo, identifiant URL public (ex. : `lea-pilates`), coordonnées.

### Forfaits
- Créer / modifier / archiver des forfaits. Exemples : Séance à la carte MUR 450 / 1 jour, Pack 5 MUR 2 000 / 60 jours, Pack 10 MUR 3 500 / 90 jours.
- Les forfaits archivés restent valides pour les clients existants mais disparaissent des options d'achat.

### Politiques
- **Délai d'annulation gratuite** (heures avant cours). Par défaut 12.
- **Cutoff** (minutes avant cours où les réservations ferment). Par défaut 15.
- **No-show** : consomme-t-il une session ? Par défaut oui.

### Notifications
- Activer / désactiver le rappel 24 h. Modifier le texte (SMS + email) — tu peux remplacer les textes par défaut de la plateforme.

### Équipe
- Ajouter du personnel : saisis email + rôle. Ils reçoivent un email pour définir leur mot de passe.
- Changer les rôles, désactiver des utilisateurs.

### Identifiants MIPS
- Ton merchant ID et webhook secret. Ne les modifie pas sans coordination avec le support MIPS.

## 13. La boucle de rétention en pratique

C'est ce qui distingue cette plateforme d'un calendrier générique.

**Le déclencheur** : quand la dernière réservation d'un client fait passer son solde restant à 1.

**Ce qui se passe automatiquement** :
- Il reçoit un SMS et un email avec un lien de renouvellement en 1 clic.
- S'il avait une carte enregistrée, le renouvellement est instantané : il tape le lien, le forfait se renouvelle, il réserve le cours suivant.

**Ce que tu dois surveiller** :
- Dans **Chiffre d'affaires**, tu verras les lignes « Renouvellement » étiquetées. Suis le ratio déclenchements solde-faible → renouvellements.
- Dans l'onglet **Clients**, le filtre `Solde faible` montre ta liste chaude — ce sont les personnes que tu peux appeler personnellement si l'automatisation ne les a pas converties.

**Bonne pratique** : ne relance pas manuellement quelqu'un dans les 7 jours après le message automatisé. Laisse-le agir, puis appelle ceux qui n'ont pas converti.

## 14. Questions fréquentes

**Q : Un client dit avoir payé mais sa réservation n'est pas confirmée.**
R : Cherche son téléphone dans **Clients**, ouvre l'onglet **Paiements**. Si le paiement est `PENDING` depuis plus de 10 minutes, le système se réconciliera automatiquement dans les 5 minutes. S'il est `FAILED`, demande-lui de repayer. Si ça reste flou, contacte le support MIPS avec le `payment_id`.

**Q : Je veux offrir un cours à un VIP.**
R : **Ajouter du crédit** avec `sessions = +1, raison = « Offert »`. Pas de flux d'argent, journalisé.

**Q : Un cours a 12 réservations mais seulement 11 tapis sont arrivés.**
R : Modifie la capacité du cours de 12 à 11. Le système bloque la réduction à cause des réservations existantes — annule d'abord une réservation spécifique, puis réduis.

**Q : Un client annule pile au bord du délai gratuit.**
R : C'est l'horloge serveur qui décide. S'il a annulé à 11 h 59 min 59 s pour un cours 12 heures plus tard — crédit retourné. À 12 h 00 min 01 s — consommé. Pas d'override.

**Q : Puis-je voir qui s'est désabonné des notifications ?**
R : Oui — le profil client affiche des badges rouges à côté de SMS / Email si le client s'est désabonné ou si son adresse a rebondi.

**Q : Puis-je envoyer une campagne marketing ?**
R : Pas dans le MVP. Exporte la liste des clients `Inactif` en CSV et utilise ton outil habituel. L'automatisation marketing est en Phase 2.

---

Tu as besoin de quelque chose qui n'est pas ici ? Dis-le à ton contact MIPS — les studios pilotes façonnent la prochaine release.
