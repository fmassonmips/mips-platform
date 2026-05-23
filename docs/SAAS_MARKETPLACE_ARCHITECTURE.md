# InsurLink MU — SaaS Marketplace Platform
## Centralisation des Offres d'Assurance à Maurice
**Architecture Complète | Version 1.0 | Board-Ready**

---

## Table des Matières

1. [Vision & Positionnement](#1-vision--positionnement)
2. [Modèle de Marché à Trois Côtés](#2-modèle-de-marché-à-trois-côtés)
3. [Personas Utilisateurs](#3-personas-utilisateurs)
4. [Périmètre MVP Marketplace](#4-périmètre-mvp-marketplace)
5. [Architecture Système](#5-architecture-système)
6. [Modèle de Données](#6-modèle-de-données)
7. [Moteur de Devis (Quote Engine)](#7-moteur-de-devis-quote-engine)
8. [Portails Utilisateurs](#8-portails-utilisateurs)
9. [Liste des Écrans](#9-liste-des-écrans)
10. [Flux Principaux](#10-flux-principaux)
11. [Modèle de Revenus & Tarification](#11-modèle-de-revenus--tarification)
12. [Conformité & Réglementation FSC](#12-conformité--réglementation-fsc)
13. [Feuille de Route IA](#13-feuille-de-route-ia)
14. [Roadmap 120 Jours](#14-roadmap-120-jours)
15. [Métriques de Succès](#15-métriques-de-succès)

---

## 1. Vision & Positionnement

### 1.1 Le Problème

À Maurice, le marché de l'assurance souffre d'une **asymétrie d'information structurelle** :

- Un client souhaitant comparer 5 assureurs doit contacter 5 courtiers ou 5 agences différentes.
- Les courtiers passent 2 à 4 heures par devis à appeler chaque assureur manuellement.
- Les assureurs manquent de données agrégées sur le marché pour affiner leur tarification.
- Il n'existe aucune plateforme locale centralisant les offres en temps réel.
- Le marché de l'assurance mauricien représente **~MUR 18 milliards** de primes annuelles (2025) avec **0 % de pénétration d'une plateforme de comparaison**.

### 1.2 La Solution

**InsurLink MU Marketplace** est la première plateforme SaaS mauricienne centralisant l'intégralité des offres d'assurance, accessible à trois niveaux :

| Utilisateur | Ce qu'il obtient |
|---|---|
| **Consommateur** | Comparez les offres de SWAN, MUA, Jubilee, CIM, BAI en 3 minutes. Payez via MIPS. |
| **Courtier** | Générez des devis multi-assureurs pour vos clients depuis une seule interface. |
| **Assureur** | Accédez à une nouvelle distribution digitale. Recevez des leads qualifiés. |

### 1.3 Positionnement Concurrentiel

| Critère | Compare the Market (UK) | GoCompare (UK) | InsurLink MU |
|---|---|---|---|
| Marché cible | UK | UK | Maurice (marché local) |
| Intégration MIPS/Juice | Non | Non | **Natif** |
| Interface en français | Non | Non | **Oui (EN + FR)** |
| Portail courtier intégré | Non | Non | **Oui** |
| Conformité FSC Maurice | N/A | N/A | **Built-in** |
| IA comparative | Basique | Non | **Phase 2** |
| Prix pour l'assureur | Commission élevée | Commission élevée | **Tarification locale** |

### 1.4 Opportunité de Marché

```
Marché adressable total (TAM) :
  ~150 courtiers FSC × 12 agents moyens × MUR 10M primes/agent = MUR 18Mrd

Marché adressable serviceable (SAM) :
  20% des courtiers adoptant la plateforme = MUR 3.6Mrd de primes sous gestion

Part de marché cible (SOM) à 2 ans :
  5% des primes sous gestion × 1% commission plateforme = MUR 1.8M de revenus/an
  + abonnements SaaS = MUR 3.6M+ ARR à 24 mois
```

---

## 2. Modèle de Marché à Trois Côtés

```
                    ┌─────────────────────────────────────────┐
                    │         INSURLINK MU MARKETPLACE         │
                    │                                          │
  ┌─────────────┐   │  ┌──────────────────────────────────┐   │   ┌─────────────┐
  │             │   │  │        CATALOGUE PRODUITS         │   │   │             │
  │ CONSOMMATEURS│◄──┤  │  Tous les produits, toutes les   │   ├──►│  ASSUREURS  │
  │             │   │  │  tarifications, toutes les règles │   │   │  SWAN, MUA, │
  │ Particuliers│   │  └──────────────┬───────────────────┘   │   │  Jubilee,   │
  │ Entreprises │   │                 │                         │   │  CIM, BAI   │
  └──────┬──────┘   │  ┌──────────────▼───────────────────┐   │   └─────────────┘
         │          │  │         MOTEUR DE DEVIS            │   │
         │          │  │  Calcul primes · Scoring couverture│   │
  ┌──────▼──────┐   │  │  Comparaison · Recommandation IA  │   │
  │             │   │  └──────────────┬───────────────────┘   │
  │   COURTIERS │◄──┤                 │                         │
  │             │   │  ┌──────────────▼───────────────────┐   │
  │ Agents FSC  │   │  │      PAIEMENT & ÉMISSION          │   │
  │ Indépendants│   │  │  MIPS · Juice · Carte · Virement  │   │
  └─────────────┘   │  └──────────────────────────────────┘   │
                    └─────────────────────────────────────────┘

Flux d'argent :
  Consommateur → Prime → Assureur → Commission → Courtier + Plateforme
```

### 2.1 Rôles et Droits d'Accès

| Rôle | Accès | Crée des devis ? | Voit tous les assureurs ? |
|---|---|---|---|
| **Admin Plateforme** | Tout | Oui | Oui |
| **Admin Assureur** | Ses propres produits et leads | Non | Ses produits uniquement |
| **Admin Courtier** | Son portefeuille + marketplace | Oui (pour ses clients) | Oui |
| **Agent Courtier** | Ses clients + marketplace | Oui | Oui |
| **Consommateur** | Son propre espace | Oui (auto-service) | Oui |
| **Visiteur** | Comparateur public | Oui (sans compte) | Oui |

---

## 3. Personas Utilisateurs

### Persona 1 : Leila, Consommatrice (B2C)

| Attribut | Détail |
|---|---|
| Âge | 28 ans |
| Lieu | Moka |
| Situation | Vient d'acheter une voiture d'occasion, cherche une assurance auto |
| Comportement | Cherche sur Google "assurance auto Maurice prix", compare sur mobile |
| Frustration | Appeler 3 assureurs différents, re-expliquer les mêmes infos à chaque fois |
| Objectif | Obtenir le meilleur prix en moins de 5 minutes et payer avec Juice |
| **Job to be done** | *"Montrez-moi les prix de tous les assureurs sans que j'aie à les appeler un par un."* |

---

### Persona 2 : Raj, le Courtier Indépendant (B2B Primaire)

| Attribut | Détail |
|---|---|
| Portefeuille | 180 clients, MUR 12M de primes |
| Outil actuel | WhatsApp + Excel + appels téléphoniques aux assureurs |
| Temps perdu | 3h par devis commercial (4–5 assureurs à appeler) |
| Objectif | Générer un devis comparatif en 5 minutes et l'envoyer au client |
| **Job to be done** | *"Donnez-moi les 3 meilleures offres pour mon client avec un lien de paiement, en un clic."* |

---

### Persona 3 : Kavita, Directrice Marketing chez SWAN Insurance

| Attribut | Détail |
|---|---|
| Rôle | Responsable des canaux de distribution digitaux |
| Objectif | Augmenter la part de marché sans augmenter la force de vente |
| Frustration | Aucune visibilité sur combien de prospects comparent ses offres |
| **Job to be done** | *"Mettez mes produits devant tous les courtiers et consommateurs mauriciens. Je veux voir mes leads en temps réel."* |

---

### Persona 4 : Marie, Directrice d'un Cabinet (B2B Secondaire)

| Attribut | Détail |
|---|---|
| Équipe | 6 agents, 800 clients actifs |
| Objectif | Outiller ses agents avec la meilleure techno pour gagner des clients commerciaux |
| **Job to be done** | *"Que mes agents puissent sortir un devis comparatif professionnel devant le client en réunion."* |

---

## 4. Périmètre MVP Marketplace

### 4.1 Dans le Périmètre MVP

| Module | Fonctionnalités Clés |
|---|---|
| **Catalogue Produits** | Saisie manuelle des produits par les assureurs, grilles tarifaires, règles de calcul |
| **Moteur de Devis** | Calcul multi-assureurs basé sur les grilles, scoring couverture, tri par valeur |
| **Comparateur Public** | Interface sans compte, comparaison instantanée, partage de devis |
| **Portail Consommateur** | Compte personnel, historique de devis, gestion de ses polices |
| **Portail Courtier** | CRM intégré (hérité du broker platform), devis multi-assureurs, envoi client |
| **Portail Assureur** | Gestion produits et tarifs, vue leads reçus, statistiques de performance |
| **Portail Admin** | Gestion de la plateforme, validation des produits, reporting revenus |
| **Paiement MIPS** | Lien de paiement sur le devis sélectionné, webhook de confirmation |
| **Émission digitale** | Génération de note de couverture PDF, envoi automatique |
| **Notifications** | Email + WhatsApp sur chaque étape du parcours |

### 4.2 Hors Périmètre MVP

| Fonctionnalité | Phase Cible |
|---|---|
| API temps réel avec les assureurs | Phase 2 |
| IA de recommandation (Claude API) | Phase 2 |
| Application mobile native | Phase 3 |
| Gestion des sinistres | Phase 3 |
| Telematics / assurance à l'usage | Phase 3 |
| Assurance vie (soumise à régulation spécifique) | Phase 2 avec conseil FSC |
| Réconciliation des commissions | Phase 2 |

---

## 5. Architecture Système

### 5.1 Architecture Multi-Portails

```
                          ┌─────────────────────────────────┐
                          │         Nginx (HTTPS)            │
                          │    Reverse Proxy + Rate Limit    │
                          └─────┬──────────┬──────────┬──────┘
                                │          │          │
              ┌─────────────────▼──┐  ┌────▼──────┐  ┌▼──────────────────┐
              │  app.insurlink.mu  │  │ insurer.  │  │  admin.insurlink.  │
              │  (Consumer + Broker│  │insurlink.mu│  │       mu          │
              │      Portal)       │  │(Insurer   │  │  (Platform Admin) │
              └─────────────────────  │ Portal)   │  └───────────────────┘
                                      └───────────┘
                    All portals share the same PHP application and database.
                    Subdomain routing handled by Nginx → single index.php.
                    Portal context injected via X-Portal header or subdomain detection.
```

### 5.2 Stack Technique

| Couche | Technologie | Justification |
|---|---|---|
| Backend | PHP 8.2 (existant) | Continuité avec le broker platform |
| Frontend | Alpine.js + Tailwind CSS | Léger, mobile-first, pas de build step complexe |
| Comparateur public | Rendu côté serveur + Alpine.js | SEO-friendly pour l'acquisition organique |
| Base de données | MariaDB 10.11 (existant) | Schéma étendu |
| Cache (devis) | Redis | Mise en cache des calculs de devis 15 min |
| PDF (note de couverture) | mPDF ou TCPDF | Génération de documents PDF côté serveur |
| Email | Sendgrid (existant) | |
| WhatsApp | Meta Cloud API (existant) | |
| Paiement | MIPS (existant) | |
| IA (Phase 2) | Anthropic Claude API | `claude-sonnet-4-6` |
| Monitoring | Uptime Kuma + Sentry | |
| Stockage documents | Scaleway Object Storage | RGPD + proximit  Maurice |

### 5.3 Modèle de Domaine

```
Platform
  └── Portals: consumer / broker / insurer / admin

Insurer ──< InsurerProduct ──< RatingTable ──< RatingFactor
                                           ──< RatingDiscount

QuoteRequest ──< QuoteResult (one per insurer/product combination)
             ──< SelectedQuote ──< PolicyApplication ──< PaymentLink
                                                     ──< CoverNote (PDF)

Consumer ──< QuoteRequest
Broker   ──< QuoteRequest (on behalf of client)

Lead ──< QuoteResult (insurer sees leads for their products)
```

---

## 6. Modèle de Données

*(Extension du schéma existant dans `sql/schema.sql`)*

### Nouvelles Tables

#### `consumers` — Comptes consommateurs directs

| Colonne | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK → users | Credentials d'authentification |
| first_name | VARCHAR(80) | |
| last_name | VARCHAR(80) | |
| nic_number | VARCHAR(20) | Chiffré côté application |
| date_of_birth | DATE | |
| email | VARCHAR(254) | |
| phone_mobile | VARCHAR(30) | E.164 |
| phone_whatsapp | VARCHAR(30) | |
| language_pref | ENUM('en','fr') | |
| address | TEXT | |
| created_at | DATETIME | |

---

#### `insurer_rate_tables` — Grilles tarifaires par produit

| Colonne | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| insurer_product_id | BIGINT FK | |
| name | VARCHAR(100) | Ex. "Tarif Auto 2026" |
| base_premium_annual | DECIMAL(12,2) | Prime de base avant facteurs |
| currency | CHAR(3) | 'MUR' |
| valid_from | DATE | |
| valid_to | DATE | NULL = toujours valide |
| is_active | TINYINT(1) | |
| created_by_insurer_id | BIGINT FK | L'assureur qui a créé ce tarif |
| approved_by_admin_at | DATETIME | NULL jusqu'à validation plateforme |
| created_at | DATETIME | |

---

#### `rating_factors` — Facteurs de tarification

| Colonne | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| rate_table_id | BIGINT FK | |
| factor_name | VARCHAR(60) | age_vehicle / driver_age / sum_insured / etc. |
| factor_type | ENUM('multiplier','additive','percentage','lookup') | |
| apply_order | TINYINT | Ordre d'application (1 = premier) |
| rules_json | JSON | Règles de calcul (voir ci-dessous) |
| is_active | TINYINT(1) | |

**Format `rules_json` pour type `lookup` :**
```json
{
  "input_field": "vehicle_age_years",
  "brackets": [
    {"min": 0,  "max": 2,  "value": 1.00},
    {"min": 3,  "max": 5,  "value": 1.10},
    {"min": 6,  "max": 10, "value": 1.25},
    {"min": 11, "max": 999,"value": 1.45}
  ]
}
```

**Format `rules_json` pour type `multiplier` :**
```json
{
  "input_field": "sum_insured",
  "rate_per_1000": 2.50,
  "min_premium": 5000
}
```

---

#### `rating_discounts` — Remises applicables

| Colonne | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| rate_table_id | BIGINT FK | |
| discount_name | VARCHAR(60) | no_claims_bonus / multi_policy / loyalty / etc. |
| discount_type | ENUM('percentage','fixed_amount') | |
| discount_value | DECIMAL(8,4) | % ou MUR |
| condition_json | JSON | Conditions d'éligibilité |
| max_discount_pct | DECIMAL(5,2) | Plafond de remise cumulée |
| is_active | TINYINT(1) | |

---

#### `quote_requests` — Demandes de devis

| Colonne | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| reference | VARCHAR(20) | QR-YYYYMMDD-XXXX, public |
| portal_origin | ENUM('consumer','broker','public') | D'où vient la demande |
| consumer_id | BIGINT FK | NULL si visiteur ou courtier |
| broker_agent_id | BIGINT FK | NULL si consommateur direct |
| client_id | BIGINT FK → clients | NULL si consommateur non-client courtier |
| product_type | ENUM('motor','property','health','liability','marine','fleet','other') | |
| risk_profile_json | JSON | Toutes les données du risque (voir ci-dessous) |
| status | ENUM('pending','quoted','selected','paid','expired','cancelled') | |
| expires_at | DATETIME | Les devis expirent après 72h |
| session_token | VARCHAR(64) | Pour visiteurs non-connectés |
| ip_address | VARCHAR(45) | |
| created_at | DATETIME | |

**Format `risk_profile_json` pour assurance auto :**
```json
{
  "vehicle": {
    "make": "Toyota",
    "model": "Vios",
    "year": 2021,
    "registration": "B 1234",
    "value": 450000,
    "usage": "private",
    "annual_mileage_km": 15000
  },
  "driver": {
    "age": 32,
    "years_licensed": 10,
    "claims_last_3_years": 0,
    "occupation": "professional"
  },
  "cover": {
    "type": "comprehensive",
    "excess_preference": 5000,
    "named_drivers": 1
  }
}
```

---

#### `quote_results` — Résultats par assureur

| Colonne | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| quote_request_id | BIGINT FK | |
| insurer_id | BIGINT FK | |
| insurer_product_id | BIGINT FK | |
| rate_table_id | BIGINT FK | Grille utilisée pour le calcul |
| premium_annual | DECIMAL(12,2) | Prime annuelle calculée |
| premium_monthly | DECIMAL(12,2) | Si paiement mensuel disponible |
| sum_insured | DECIMAL(15,2) | |
| excess_amount | DECIMAL(10,2) | |
| cover_highlights_json | JSON | Points forts de la couverture |
| exclusions_json | JSON | Principales exclusions |
| calculation_breakdown_json | JSON | Détail du calcul (facteurs appliqués) |
| coverage_score | TINYINT | /100, calculé par le moteur |
| value_score | TINYINT | /100, prime vs couverture |
| ai_recommendation_rank | TINYINT | NULL jusqu'à Phase 2 |
| ai_rationale | TEXT | NULL jusqu'à Phase 2 |
| is_available | TINYINT(1) | 0 si le risque est hors critères |
| unavailability_reason | VARCHAR(255) | Ex. "Véhicule > 15 ans" |
| created_at | DATETIME | |

---

#### `selected_quotes` — Devis sélectionné par le client

| Colonne | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| quote_request_id | BIGINT FK | |
| quote_result_id | BIGINT FK | |
| selected_by_user_id | BIGINT FK | Consumer ou agent courtier |
| selection_reason | TEXT | Optionnel — pourquoi ce choix |
| payment_link_id | BIGINT FK → payment_links | |
| cover_note_path | VARCHAR(500) | PDF généré |
| cover_note_sent_at | DATETIME | |
| status | ENUM('selected','payment_pending','paid','policy_issued','cancelled') | |
| selected_at | DATETIME | |

---

#### `leads` — Leads générés pour les assureurs

| Colonne | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| insurer_id | BIGINT FK | |
| quote_result_id | BIGINT FK | |
| quote_request_id | BIGINT FK | |
| lead_type | ENUM('quote_shown','quote_selected','payment_made') | |
| lead_value_mur | DECIMAL(10,2) | Montant facturé à l'assureur |
| invoiced_at | DATETIME | NULL jusqu'à facturation |
| created_at | DATETIME | |

---

#### `platform_commissions` — Commissions plateforme

| Colonne | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| insurer_id | BIGINT FK | |
| insurer_product_id | BIGINT FK | NULL = s'applique à tous les produits |
| commission_type | ENUM('per_lead_shown','per_lead_selected','per_policy_placed','subscription') | |
| commission_value | DECIMAL(10,4) | % ou montant fixe MUR |
| effective_from | DATE | |
| effective_to | DATE | NULL = indéfini |
| is_active | TINYINT(1) | |

---

#### `insurer_users` — Comptes portail assureur

| Colonne | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK → users | |
| insurer_id | BIGINT FK | |
| role | ENUM('admin','product_manager','analyst') | |
| is_active | TINYINT(1) | |

---

#### `cover_note_templates` — Modèles de notes de couverture

| Colonne | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| insurer_id | BIGINT FK | |
| product_type | ENUM | |
| template_html | LONGTEXT | HTML avec variables {{...}} |
| is_active | TINYINT(1) | |
| approved_at | DATETIME | Validé par admin plateforme |

---

#### `marketplace_analytics` — Événements d'analytique

| Colonne | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| event_type | VARCHAR(60) | quote_started / quote_completed / product_viewed / payment_made |
| portal_origin | ENUM('consumer','broker','public') | |
| insurer_id | BIGINT FK | NULL si non applicable |
| product_type | VARCHAR(30) | |
| premium_amount | DECIMAL(12,2) | NULL si pas encore calculé |
| session_id | VARCHAR(64) | |
| user_id | BIGINT FK | NULL si visiteur |
| occurred_at | DATETIME | |

---

## 7. Moteur de Devis (Quote Engine)

### 7.1 Algorithme de Calcul

```
Entrée : QuoteRequest (profil risque + type de produit)

ÉTAPE 1 — Sélection des produits éligibles
  SELECT ip.*, rt.base_premium_annual, rt.id AS rate_table_id
  FROM insurer_products ip
  JOIN insurer_rate_tables rt ON rt.insurer_product_id = ip.id
  WHERE ip.product_type = :product_type
    AND ip.is_active = 1
    AND rt.is_active = 1
    AND rt.valid_from <= CURDATE()
    AND (rt.valid_to IS NULL OR rt.valid_to >= CURDATE())
    AND rt.approved_by_admin_at IS NOT NULL

ÉTAPE 2 — Pour chaque produit éligible :
  a) Vérifier les critères d'acceptation (âge véhicule, somme assurée min/max, etc.)
  b) Si refus : créer QuoteResult avec is_available = 0 + raison
  c) Si accepté : calculer la prime :
      prime = base_premium
      POUR CHAQUE factor (trié par apply_order) :
        SI factor.type = 'multiplier'  : prime = prime × factor.value(input)
        SI factor.type = 'additive'    : prime = prime + factor.value(input)
        SI factor.type = 'percentage'  : prime = prime × (1 + factor.pct/100)
        SI factor.type = 'lookup'      : prime = prime × lookup(input, factor.brackets)
      POUR CHAQUE discount éligible :
        remise = calculer_remise(discount, prime)
        prime = prime - remise (plafonné à max_discount_pct)
      prime = max(prime, minimum_premium)
  d) Calculer coverage_score (0–100) basé sur les garanties offertes
  e) Calculer value_score (0–100) = f(couverture / prime)
  f) Stocker QuoteResult

ÉTAPE 3 — Trier les résultats
  Tri primaire : premium_annual ASC (mode "moins cher")
  Tri alternatif : value_score DESC (mode "meilleur rapport qualité/prix")

ÉTAPE 4 — Générer les leads
  Créer un Lead de type 'quote_shown' pour chaque assureur dont le produit apparaît

ÉTAPE 5 — Mettre en cache
  Stocker QuoteRequest.id → résultats dans Redis (TTL 15 min)
  Permettre le rechargement de devis sans recalcul

Sortie : QuoteRequest avec N QuoteResults triés
```

### 7.2 Calcul du Coverage Score

Le `coverage_score` (0–100) évalue la qualité de la couverture indépendamment du prix :

```
Critères évalués (pondération) :
  - Garanties incluses vs liste standard         : 40 points
  - Montant de la franchise (plus bas = mieux)   : 20 points
  - Étendue territoriale de la couverture        : 15 points
  - Assistance et services inclus                : 15 points
  - Délai de traitement des sinistres (réputation): 10 points

coverage_score = Σ(critère × poids) / total_possible × 100
```

### 7.3 Calcul du Value Score

```
value_score = (coverage_score / premium_normalized) × 100

Où premium_normalized = premium_annual / median_premium_for_product_type
  (médiane calculée sur tous les résultats de cette demande)
```

Un value_score > 100 = meilleur rapport qualité/prix que la médiane du marché.

---

## 8. Portails Utilisateurs

### 8.1 Portail Public / Consommateur (`app.insurlink.mu`)

**Visiteur (sans compte) :**
- Saisir les données du risque (véhicule, propriété, etc.)
- Voir les devis comparatifs instantanément
- Partager un devis par lien
- Sauvegarder un devis en créant un compte
- Payer via MIPS et recevoir une note de couverture

**Consommateur connecté :**
- Historique des devis
- Mes polices (si achetées via la plateforme)
- Rappels de renouvellement automatiques
- Documents téléchargeables

### 8.2 Portail Courtier (`app.insurlink.mu/broker`)

**Extension du broker platform existant :**
- Toutes les fonctionnalités CRM existantes (clients, polices, rendez-vous)
- **+ Comparateur intégré** : générer un devis multi-assureurs pour un client en 1 clic
- **+ Devis pro** : présentation PDF au format courtier (sans afficher les marges)
- **+ Pipeline de devis** : suivi des devis envoyés aux clients
- **+ Partage client** : envoyer un lien de comparaison au client (il voit et paie directement)
- **+ Analytics** : taux de conversion de ses devis, performance par assureur

### 8.3 Portail Assureur (`insurer.insurlink.mu`)

- **Tableau de bord** : leads reçus, taux de conversion, part de marché
- **Gestion produits** : créer/modifier les produits et grilles tarifaires
- **Validation** : soumettre les tarifs à l'approbation de l'admin plateforme
- **Leads** : liste des demandes de devis incluant leurs produits
- **Analytique** : positionnement prix vs concurrents (anonymisé)
- **Facturation** : suivi des commissions dues à la plateforme

### 8.4 Portail Admin Plateforme (`admin.insurlink.mu`)

- **Gestion des assureurs** : onboarding, validation des tarifs, configuration des commissions
- **Modération des contenus** : approbation des notes de couverture et templates
- **Reporting financier** : revenus par assureur, par courtier, par produit
- **Audit complet** : log de toutes les actions
- **Configuration du moteur** : ajustement des pondérations du coverage score
- **Gestion des utilisateurs** : tous portails confondus

---

## 9. Liste des Écrans

### Portail Public / Consommateur

| # | Écran | Description |
|---|---|---|
| P01 | Accueil | Hero + sélecteur de type d'assurance + valeur proposition |
| P02 | Formulaire devis auto | Saisie véhicule, conducteur, couverture souhaitée |
| P03 | Formulaire devis habitation | Saisie bien, situation géographique, valeur |
| P04 | Formulaire devis santé | Âge, nombre de personnes, niveau de couverture |
| P05 | Formulaire devis responsabilité | Type d'activité, chiffre d'affaires, effectif |
| P06 | Résultats comparaison | Tableau comparatif trié, filtres, mode liste/carte |
| P07 | Détail d'un devis | Couverture complète, exclusions, calculateur franchise |
| P08 | Sélection et paiement | Récap du devis choisi + lien MIPS |
| P09 | Confirmation et note de couverture | Reçu + PDF téléchargeable + options de partage |
| P10 | Mon compte — Tableau de bord | Mes devis, mes polices, mes rappels |
| P11 | Inscription / Connexion | |
| P12 | Partage de devis | Lien public vers un devis spécifique |

### Portail Courtier (extension)

| # | Écran | Description |
|---|---|---|
| B01 | Comparateur courtier | Génère un devis pour un client du CRM |
| B02 | Résultats comparaison (vue courtier) | Inclut les commissions, les notes internes |
| B03 | Partage client | Envoi du lien de comparaison au client |
| B04 | Devis PDF professionnel | Export PDF branded brokerage |
| B05 | Pipeline de devis | Tous les devis envoyés, leur statut, taux de conversion |
| B06 | Analytics courtier | Performance par assureur, par type de produit |

### Portail Assureur

| # | Écran | Description |
|---|---|---|
| I01 | Tableau de bord assureur | KPIs : leads, conversions, part de marché |
| I02 | Mes produits | Liste des produits actifs/en attente |
| I03 | Créer/Modifier un produit | Formulaire complet + upload grille tarifaire |
| I04 | Gestionnaire de facteurs | Interface de saisie des rating factors |
| I05 | Mes leads | Liste des demandes de devis avec profil risque |
| I06 | Analytique marché | Positionnement prix (concurrents anonymisés) |
| I07 | Facturation | Commissions dues, historique de facturation |
| I08 | Templates note de couverture | Upload et validation du template PDF |

### Portail Admin

| # | Écran | Description |
|---|---|---|
| A01 | Dashboard admin | Vue globale : devis/jour, revenus, assureurs actifs |
| A02 | Gestion assureurs | Liste, onboarding, suspension |
| A03 | Validation tarifs | File d'attente des tarifs à approuver |
| A04 | Configuration commissions | Tarification par assureur/produit |
| A05 | Reporting financier | Revenus, commissions, factures générées |
| A06 | Configuration moteur | Poids du coverage score, règles métier |
| A07 | Journal d'audit global | Toutes les actions sur toute la plateforme |
| A08 | Gestion utilisateurs | Tous les comptes, toutes les plateformes |

---

## 10. Flux Principaux

### 10.1 Parcours Consommateur Direct (B2C)

```
1. Visiteur arrive sur app.insurlink.mu
2. Sélectionne "Assurance Auto"
3. Remplit le formulaire (5–7 champs essentiels)
4. Clique "Comparer maintenant"
   → QuoteEngine calcule les primes pour tous les assureurs actifs
   → Affiche résultats triés par prix dans les 3 secondes
5. Explore les devis (filtre par couverture, trie par valeur)
6. Clique sur "Sélectionner" pour l'offre choisie
7. Saisit ses informations personnelles (ou se connecte)
8. Clique "Payer maintenant" → MIPS payment link
9. Paie via Juice ou carte
10. Reçoit :
    - Email de confirmation avec note de couverture PDF
    - WhatsApp de confirmation avec résumé
    - Accès à son espace client
11. J-45 avant expiration : renouvellement automatique déclenché
```

### 10.2 Parcours Courtier (B2B)

```
1. Agent se connecte au portail courtier
2. Ouvre la fiche d'un client
3. Clique "Générer un devis comparatif"
4. Saisit les données du risque (pré-remplies depuis la fiche client si disponible)
5. QuoteEngine calcule → résultats en 3 secondes
6. Courtier visualise les résultats (avec ses commissions affichées)
7. Option A : Partage un lien de comparaison directement au client
   → Le client voit les devis (sans les commissions) et peut payer seul
8. Option B : Le courtier sélectionne lui-même l'offre et génère le lien de paiement
9. Paiement MIPS → note de couverture générée
10. La police est créée dans le CRM du courtier
```

### 10.3 Onboarding Assureur

```
1. L'assureur soumet une demande via le formulaire public
2. Admin plateforme valide l'identité et le numéro FSC
3. Compte portail assureur créé, invitations envoyées
4. L'assureur crée ses produits dans le portail :
   a) Informations produit (nom, type, description, document wordage PDF)
   b) Grille tarifaire (base premium + facteurs)
   c) Critères d'acceptation (âge max véhicule, somme assurée min/max)
   d) Template de note de couverture
5. Admin plateforme valide les tarifs (vérification conformité FSC)
6. Produits publiés sur la marketplace
7. L'assureur commence à recevoir des leads
```

### 10.4 Génération de Note de Couverture (PDF)

```
1. Paiement MIPS confirmé (webhook)
2. Système récupère : selected_quote, quote_request, consumer/client info
3. Rend le template HTML de la note de couverture (variables remplacées)
4. Génère le PDF via mPDF
5. Stocke dans Object Storage (chemin enregistré dans selected_quotes.cover_note_path)
6. Envoie au consommateur par email + WhatsApp
7. Notifie l'assureur (nouveau lead "payment_made")
8. Notifie le courtier si applicable
9. Crée un enregistrement police dans le CRM (si via portail courtier)
```

---

## 11. Modèle de Revenus & Tarification

### 11.1 Revenus Côté Assureur

#### Abonnement Assureur — 3 Niveaux

**Tier Visibility — MUR 3 000/mois**
- Produits listés sur la marketplace
- Leads "devis affiché" : inclus illimité
- Leads "devis sélectionné" : MUR 50/lead (facturation mensuelle)
- Analytique de base (son positionnement)
- 1 compte portail assureur

**Tier Growth — MUR 8 000/mois**
- Tout Visibility +
- Leads "paiement effectué" : 0.5% de la prime
- Analytique avancée (vs marché anonymisé)
- Mise en avant produit (badge "Recommandé")
- 3 comptes portail assureur
- Support prioritaire

**Tier Premium — MUR 18 000/mois**
- Tout Growth +
- Leads "paiement effectué" : 0.3% de la prime (taux réduit)
- Intégration API prioritaire (Phase 2)
- Rapport mensuel de marché personnalisé
- Accès aux données agrégées (segments, pricing trends)
- Comptes illimités
- Account manager dédié

---

### 11.2 Revenus Côté Courtier

**Extension du broker platform existant :**

| Plan | Prix | Accès Marketplace |
|---|---|---|
| Starter | MUR 1 500/mois | Non |
| Growth | MUR 4 500/mois | Oui — comparateur intégré |
| Pro | MUR 10 000/mois | Oui + Analytics + API |
| Marketplace Add-on | MUR 2 000/mois | Pour abonnés Starter |

---

### 11.3 Revenus Côté Consommateur

- **Gratuit** pour les consommateurs — la plateforme est financée par les assureurs.
- Option "Rapport premium" (Phase 2) : MUR 99 pour un rapport comparatif PDF détaillé avec recommandation IA.

---

### 11.4 Projection de Revenus (24 mois)

| Source | Mois 6 | Mois 12 | Mois 24 |
|---|---|---|---|
| Abonnements assureurs | MUR 30 000 | MUR 90 000 | MUR 200 000 |
| Leads sélectionnés | MUR 15 000 | MUR 60 000 | MUR 180 000 |
| Commissions polices | MUR 5 000 | MUR 40 000 | MUR 250 000 |
| Abonnements courtiers | MUR 25 000 | MUR 80 000 | MUR 200 000 |
| **Total MRR** | **MUR 75 000** | **MUR 270 000** | **MUR 830 000** |
| **ARR équivalent** | MUR 900 000 | MUR 3.24M | **MUR 9.96M** |

---

## 12. Conformité & Réglementation FSC

### 12.1 Statut Réglementaire de la Plateforme

La plateforme InsurLink MU **n'est pas un assureur** et **n'est pas un courtier**. Elle est un **intermédiaire technologique** (technology intermediary / insurtech marketplace). Ce statut doit être clarifié avec la FSC avant le lancement commercial.

**Actions recommandées :**
1. Consulter la FSC sur le cadre réglementaire applicable (Insurance Act 2005, Section 14A — Electronic commerce).
2. Obtenir une opinion juridique formelle sur le modèle "lead generation + facilitation de paiement".
3. Ajouter les mentions légales obligatoires sur chaque devis affiché.
4. Coordonner avec chaque assureur partenaire pour la rédaction des accords de distribution.

### 12.2 Obligations sur les Devis

Chaque devis affiché doit inclure :
- Mention que le prix est indicatif et peut varier selon l'inspection / souscription finale.
- Nom et numéro de licence FSC de l'assureur.
- Lien vers le document de conditions générales (wording).
- Date de validité du devis.
- Mention que la plateforme est rémunérée par les assureurs.

### 12.3 Protection des Données (DPA 2017)

- Les données du formulaire de devis (données personnelles) sont soumises au DPA.
- Consentement explicite requis avant collecte.
- Droit d'accès, rectification et suppression implémentés.
- Données de devis anonymisées après 12 mois (sauf si police émise → 7 ans).
- Pas de partage des données personnelles aux assureurs sans consentement explicite.

### 12.4 Sécurité des Paiements

- La plateforme ne stocke jamais de données de carte bancaire.
- Toutes les transactions passent par le terminal hébergé MIPS.
- Scope PCI-DSS : SAQ-A (redirect vers MIPS) — pas de traitement carte côté plateforme.

---

## 13. Feuille de Route IA

### Phase 1 — Scoring Règles Métier (Mois 1–3)

Le moteur de devis utilise des règles codées en dur pour calculer `coverage_score` et `value_score`. Pas d'IA — pure logique métier paramétrable.

### Phase 2 — Recommandation IA Personnalisée (Mois 4–9)

**Modèle :** Claude API (`claude-sonnet-4-6` ou plus récent)

```
Input :
  - Profil risque du client
  - Résultats de devis (N offres)
  - Préférences exprimées par le client
  - Historique de réclamations (si disponible)
  - Profil démographique anonymisé

Prompt système :
  "Tu es un conseiller en assurance expert du marché mauricien.
   Analyse ces offres pour un client avec ce profil.
   Identifie les 3 meilleures options en tenant compte de son budget,
   de ses besoins réels et des exclusions importantes.
   Explique ta recommandation en 2 phrases max en [langue].
   Signale tout écart de couverture significatif.
   Reste neutre — ne favorise aucun assureur en particulier."

Output :
  - Classement avec rationale
  - Alertes sur les lacunes de couverture
  - Suggestions de garanties additionnelles pertinentes

Garde-fous :
  - L'IA est consultative uniquement
  - Disclosure systématique : "Recommandation assistée par IA, validée par un professionnel"
  - Toutes les recommandations IA loggées dans ai_recommendations
  - L'utilisateur peut ignorer le classement IA
```

### Phase 3 — Analytique Prédictive Marché (Mois 10–18)

```
Données disponibles après 12 mois de marketplace :
  - Élasticité-prix par segment (qui choisit quoi à quel prix)
  - Tendances de sinistralité par région géographique (basé sur exclusions signalées)
  - Taux de conversion par canal (courtier vs direct vs mobile)
  - Saisonnalité des demandes (cyclones, fin d'année)

Services vendus aux assureurs (Tier Premium) :
  - Rapport mensuel : "Votre positionnement prix vs marché"
  - Analyse de vos taux de conversion vs concurrents
  - Recommandations de repricing basées sur la demande
```

### Phase 4 — Intégration API Temps Réel (Mois 12–24)

Connexion directe aux systèmes de tarification des assureurs pour des devis en temps réel (sans grilles manuelles). Priorité selon l'appétit digital de chaque assureur.

```
Assureur → API REST/SOAP → QuoteEngine Adapter → QuoteResult
                                    ↕
                         Fallback : grille tarifaire manuelle
```

---

## 14. Roadmap 120 Jours

### Sprint 1 (J1–J14) — Fondations Marketplace

| Tâche | Priorité |
|---|---|
| Schéma DB marketplace (nouvelles tables) | P0 |
| Système d'authentification multi-portail | P0 |
| Onboarding assureur + création de compte | P0 |
| Interface de saisie produit + grille tarifaire | P0 |
| Seeds : tous les produits SWAN, MUA, Jubilee avec grilles | P1 |

### Sprint 2 (J15–J28) — Moteur de Devis v1

| Tâche | Priorité |
|---|---|
| QuoteEngine — calcul prime avec facteurs simples | P0 |
| QuoteEngine — calcul coverage_score et value_score | P0 |
| API interne `/quote/calculate` | P0 |
| Mise en cache Redis des devis | P1 |
| Tests unitaires sur les calculs de prime | P0 |

### Sprint 3 (J29–J42) — Comparateur Consommateur

| Tâche | Priorité |
|---|---|
| Formulaire de devis auto (P02) | P0 |
| Page de résultats comparatifs (P06) | P0 |
| Détail devis (P07) | P0 |
| Formulaire devis habitation (P03) | P1 |
| Partage de devis par lien (P12) | P1 |

### Sprint 4 (J43–J56) — Paiement & Émission

| Tâche | Priorité |
|---|---|
| Intégration MIPS sur sélection de devis | P0 |
| Génération de note de couverture PDF | P0 |
| Envoi email + WhatsApp post-paiement | P0 |
| Système de leads (enregistrement par assureur) | P0 |
| Création automatique de police dans le CRM courtier | P1 |

### Sprint 5 (J57–J70) — Portail Assureur

| Tâche | Priorité |
|---|---|
| Dashboard assureur (I01) | P0 |
| Vue leads (I05) | P0 |
| Analytique positionnement prix (I06) | P1 |
| Gestion des rating factors (I04) | P0 |
| Validation de tarifs par l'admin (A03) | P0 |

### Sprint 6 (J71–J84) — Portail Courtier (extension)

| Tâche | Priorité |
|---|---|
| Comparateur intégré dans le CRM (B01, B02) | P0 |
| Partage lien client (B03) | P0 |
| Export devis PDF professionnel (B04) | P1 |
| Pipeline de devis (B05) | P1 |
| Analytics courtier (B06) | P2 |

### Sprint 7 (J85–J98) — Admin & Compliance

| Tâche | Priorité |
|---|---|
| Portail admin complet (A01–A08) | P0 |
| Configuration des commissions (A04) | P0 |
| Rapport financier (A05) | P0 |
| Mentions légales + disclosure réglementaire sur tous les devis | P0 |
| Audit log global | P0 |

### Sprint 8 (J99–J120) — Lancement & Scaling

| Tâche | Priorité |
|---|---|
| Tests de charge (1 000 devis simultanés) | P0 |
| Revue sécurité OWASP + PCI | P0 |
| SEO on-page (balises, schema.org Insurance) | P1 |
| Onboarding 3 assureurs pilotes (SWAN, MUA + 1) | P0 |
| Onboarding 5 cabinets de courtage pilotes | P0 |
| Lancement public soft (liste d'attente) | P1 |
| Lancement public complet | P0 |

---

## 15. Métriques de Succès

### Métriques Produit (Mois 3)

| Métrique | Objectif |
|---|---|
| Assureurs actifs sur la marketplace | 3 |
| Produits disponibles | 15+ |
| Devis générés/jour | 50+ |
| Temps de génération d'un devis | < 3 secondes |
| Taux de complétion du formulaire | > 70% |
| Taux de sélection d'un devis affiché | > 25% |
| Taux de conversion devis → paiement | > 40% |

### Métriques Business (Mois 6)

| Métrique | Objectif |
|---|---|
| Assureurs abonnés (payants) | 4 |
| Courtiers abonnés (Growth+) | 15 |
| Devis générés/mois | 2 000+ |
| Polices émises via plateforme/mois | 200+ |
| MRR | MUR 75 000+ |
| NPS consommateur | > 8/10 |

### Métriques Marché (Mois 12)

| Métrique | Objectif |
|---|---|
| Part des polices auto Maurice comparées via InsurLink | > 5% |
| ARR | MUR 3.24M+ |
| Pénétration courtiers FSC | > 20% |
| Pénétration assureurs | > 60% (acteurs majeurs) |

---

*InsurLink MU Marketplace — Architecture v1.0*
*Confidentiel — Usage interne et Board uniquement*
