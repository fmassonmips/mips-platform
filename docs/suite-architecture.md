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

- Les 10 apps sont listées dans le lanceur avec le statut **coming_soon** : aucune n'est encore construite.
- Une entreprise est créée automatiquement au premier accès d'un utilisateur, qui en devient owner.
- Activer une app passe son statut à `trial` pour 30 jours ; seules les apps `available` peuvent être activées.

## Ajouter une app

1. Passer son `status` à `available` dans `src/Suite/Catalog.php`.
2. Créer `templates/modules/<slug>.view.php` (rendu dans la coquille commune).
3. Ses tables SQL portent `organization_id` + clé étrangère vers `organizations`.
4. Ses endpoints commencent par `Modules::require($user, '<slug>')` (pages) ou une vérification équivalente (API).

## Mise en place sur une base existante

```
mysql -u root -p mips_platform < sql/migrations/001_suite.sql
```

## Reste à décider

- Ordre de construction des apps (recommandation : Facturo, puis ClientBloom, puis Bookora).
- Tarification : prix par app, pack, ou par utilisateur.
- Fin d'essai : que voit le client à J+30 (blocage, lecture seule, paiement).
- Invitation de collègues dans une entreprise (pas encore d'écran).
