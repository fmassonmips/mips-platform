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

- **Facturo** est disponible. Les 9 autres apps sont listées en **coming_soon**.
- Une entreprise est créée automatiquement au premier accès d'un utilisateur, qui en devient owner.
- Activer une app la passe en `trial` pour 30 jours. Désactiver puis réactiver ne relance jamais l'essai ;
  une fois l'essai terminé, l'app est bloquée (« Free trial ended ») jusqu'à ce que la facturation existe.
- Le profil entreprise (raison sociale, BRN, n° TVA, adresse) est partagé par toutes les apps (`/api/suite/organization`).

## Facturo (devis & factures)

| Élément | Règle |
|---|---|
| Clients | Par entreprise ; suppression impossible s'ils ont des documents. |
| Brouillon | Modifiable et supprimable, sans numéro. |
| Émission | Numéro séquentiel sans trou par entreprise, type et année : `FAC-2026-0001`, `DEV-2026-0001`. Le document devient non modifiable ; les coordonnées vendeur et client sont figées à cet instant. |
| Facture | `draft → issued ⇄ paid`. Émission refusée sans raison sociale et BRN. |
| Devis | `draft → sent → accepted / declined` ; « Create invoice » crée un brouillon de facture (une seule par devis). |
| Montants | Entiers en cents, calculés côté serveur, arrondi au plus proche par ligne. TVA par ligne, 15 % par défaut si l'entreprise a un n° TVA, sinon 0 %. |
| PDF | Page imprimable `/facturo/print.php?id=…` → « Enregistrer en PDF » du navigateur. |

**Hors périmètre, à faire avant de vendre à des entreprises assujetties à la TVA :**

- **e-Invoicing MRA** : les factures des entreprises concernées doivent être transmises en temps réel à la MRA
  (JSON, numéro IRN + QR code en retour). Obligatoire depuis mai 2024 au-dessus de MUR 100 M de chiffre
  d'affaires, étendu au-dessus de MUR 80 M pour 2025-26 ; les phases suivantes ne sont pas confirmées.
  À vérifier sur https://www.mra.mu/index.php/e-invoicing avant toute commercialisation.
- **Avoirs** : une facture émise ne peut être ni modifiée ni annulée ; la correction légale passe par un avoir (non implémenté).
- Envoi par e-mail, relances, paiements partiels, multi-taux de change, export comptable.

## Ajouter une app

1. Passer son `status` à `available` dans `src/Suite/Catalog.php`.
2. Créer `templates/modules/<slug>.view.php` (rendu dans la coquille commune).
3. Ses tables SQL portent `organization_id` + clé étrangère vers `organizations`.
4. Ses endpoints commencent par `Modules::require($user, '<slug>')` (pages) ou une vérification équivalente (API).

## Mise en place sur une base existante

```
mysql -u root -p mips_platform < sql/migrations/001_suite.sql
mysql -u root -p mips_platform < sql/migrations/002_facturo.sql
```

## Reste à décider

- Ordre de construction des apps suivantes (recommandation : ClientBloom, puis Bookora).
- Tarification : prix par app, pack, ou par utilisateur.
- Fin d'essai : que voit le client à J+30 (blocage, lecture seule, paiement).
- Invitation de collègues dans une entreprise (pas encore d'écran).
