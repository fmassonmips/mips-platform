# Décision — modèle de flux de fonds du dossier SPIN DIGITAL

**Date :** 31 octobre 2026
**Décision prise par :** Florent Masson, CEO
**Statut :** retenue, **sous réserve de deux vérifications** (section 3)

## 1. Décision

**Le dossier SPIN est présenté en modèle A (passerelle).** SPIN/MIPS ne détient pas les fonds des marchands :
la banque acquéreuse (MCB, SBM, ABSA) règle directement chaque marchand, qui a son propre contrat acquéreur.
La commission MIPS est facturée chaque mois.

**Le modèle B (encaissement pour compte des marchands) n'est pas retenu.** Il ne sera envisagé que pour une raison
commerciale claire, par exemple accélérer l'entrée des petits marchands ou supprimer les impayés de commission,
et seulement après avoir renégocié les contrats acquéreurs (agrégation autorisée).

## 2. Conséquences

| Sujet | Conséquence |
|---|---|
| Dossier BoM | Déclarer explicitement « aucun fonds de marchand détenu », schéma des flux à l'appui. Ne pas promettre de réconciliation trust : il n'y a rien à réconcilier. |
| Module trust (`outputs/dev-handover/my-mips-trust-reconciliation.md`) | **Pas de développement.** La spécification reste disponible pour un éventuel passage en B. |
| Rapprochement MCB existant | Reste un contrôle des volumes acquéreur ↔ plateforme. Il n'est jamais présenté comme une protection des fonds. |
| Feuille de route my.mips.mu | Le palier « trust » sort du plan. |

## 3. Vérifications dont dépend la décision (bloquantes)

1. **Conformité — catégorie de licence.** Vérifier dans le formulaire de licence de la Banque de Maurice et dans le
   National Payment Systems Act 2018 que la licence demandée par SPIN **n'exige pas** de détenir les fonds des
   marchands. Si elle l'exige, le modèle A ne correspond pas au dossier et la décision est à revoir.
   Ces textes n'ont pas pu être lus à la source le 30 octobre (site bom.mu indisponible).
2. **Finance — portefeuilles et virements.** Confirmer qu'aucun flux (MyT Money, Juice, virement bancaire) ne passe
   par un compte MIPS. Si l'un d'eux y passe, MIPS détient déjà des fonds pour ce flux : il faut soit le faire régler
   directement au marchand, soit le cantonner.

## 4. Ce qui ferait rouvrir la décision

- Une des deux vérifications ci-dessus revient négative.
- Une raison commerciale claire de passer en B, chiffrée, avec l'accord de MCB sur l'agrégation.

## 5. Éléments sur lesquels repose la décision

- MIPS se présente comme passerelle « sans compte intermédiaire » (fiche de l'application MIPS sur Shopify).
- La commission est facturée (module de facturation), pas retenue.
- Le rapprochement MCB se fait par point de vente (Outlet) de chaque marchand.
- L'export Commission_Data d'octobre 2026 indique une banque de règlement par moyen de paiement (MCB pour 6 couples sur 9).

Détail des deux modèles : `outputs/dev-handover/my-mips-trust-reconciliation.md`, section 2.
