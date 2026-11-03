# Registre des captures — dossier FSC (B01 p. 55–62, G01 p. 2–5 et 8)

Établi le 2026-11-03. Équivalent FSC du registre BoM (`outputs/bom-screenshots/capture-register.md`).
**Aucune capture n'a été insérée dans B01 ni dans G01.**

## Constat préalable

Les emplacements de B01 et G01 décrivent la plateforme **MIPSIT DIGITAL LTD**. Ses sections « Platform interface »
reprennent la documentation d'un autre prestataire (Payop, voir `validation-documents-fsc.md`).

Les seules captures disponibles viennent du prototype `mips-platform` : non déployé, données fictives, bandeau
DEMONSTRATION ENVIRONMENT. Il pose trois problèmes pour la FSC :

1. **Ce n'est pas la plateforme décrite.** Insérer ces images sous un texte qui décrit la plateforme MIPSIT en
   production ferait passer un prototype pour le système réel. C'est ce que la règle « pas de faux écrans » interdit.
2. **Elles montrent une activité mauricienne**, celle que la licence PIS exclut. Par exemple, S03a : société
   immatriculée à Maurice, BRN, « Countries where you sell: Mauritius », volumes en MUR, paiement par QR et terminaux.
3. **Elles ne couvrent pas l'espace du marchand actif** (soldes, transactions, retraits) : le prototype ne l'a pas.

**Recommandation** : prendre les captures sur la **plateforme réelle** qui servira MIPS INTERNATIONAL, avec données
masquées et environnement identifié. Réécrire ensuite les textes de G01 et B01 d'après ces écrans. Les captures du
prototype ne peuvent servir qu'en dernier recours, légendées comme telles, et seulement pour l'entrée en relation.

## Emplacements et captures possibles

| # | Emplacement | Demande | Capture du prototype | Utilisable pour la FSC ? |
|---|---|---|---|---|
| 1 | G01 p.2 · B01 p.55 | Écran de connexion + conditions | S01c (inscription), S01d (connexion), S01e (2FA, QR flouté), S01f (conditions) | **Non en l'état** : conditions = texte de remplissage ; prototype, pas la plateforme décrite |
| 2 | G01 p.2 · B01 p.55 | Feuille de route de l'onboarding | S02c, S02d (suivi du dossier côté marchand) | Mécanisme seulement ; légende « prototype » obligatoire |
| 3 | G01 p.3 · B01 p.55 | Formulaire de préqualification (« pre-check ») | S03a | **Non** : marchand mauricien, ventes à Maurice, MUR, BRN : contredit le périmètre PIS |
| 4 | G01 p.4 · B01 p.56 | Formulaires des pièces | S04c (dépôt des pièces par le marchand) | Mécanisme seulement ; la liste des pièces est mauricienne (BRN, etc.) |
| 5 | G01 p.4 · B01 p.57 | Interface de la plateforme | S05b (navigation du portail d'entrée en relation) | **Non** : pas d'espace marchand actif dans le prototype |
| 6 | G01 p.5 · B01 p.58 | Vue d'ensemble (soldes, tickets, transactions) | — | **Absent**. Ne pas présenter S06 (rapport interne) comme un dashboard marchand |
| 7 | G01 p.8 · B01 p.62 | « Screenshots of platform where appropriate » (moyens de paiement, transactions, remboursements, chargebacks, change, retraits, projets, réglages, etc.) | — | **Absent** |

G01 compte huit mentions entre crochets pour sept emplacements : la légende de la vue d'ensemble apparaît deux fois.

## Ce qui manque pour la FSC (équivalent des « preuves manquantes » BoM)

| Élément | Pourquoi | Qui |
|---|---|---|
| Captures de la plateforme réelle, données masquées | Prouver que la plateforme est « tried and tested » | Technique (MIPSIT) |
| Certificat PCI DSS (annexe D de B01) | Exigé si transactions par carte | Technique |
| Projet de contrat marchand, contrats avec prestataires et passerelles | Exigé par la FSC | Juridique |
| Conditions d'utilisation réelles | Les captures S01f/C05 montrent un texte de remplissage | Juridique |
| Politique de cantonnement des fonds (E07), si des fonds sont détenus | G01 décrit soldes, réserves, retraits | Finance, conformité |
| Procédure de réclamations et de litiges (E08), transparence des frais | Exigée par la supervision FSC | Conformité |
| Plan de continuité et de reprise (E04) avec RTO/RPO chiffrés | Annoncés partout, jamais chiffrés | Technique |
| Engagement d'autorisation dans chaque pays visé | Condition de licence | Conformité |

## Ce que le prototype peut apporter au dossier FSC

- Le **mécanisme** de contrôle de l'entrée en relation : conditions versionnées, 2FA obligatoire, préqualification,
  double regard sur les pièces et la décision, journal d'audit, antivirus des pièces.
- Le **cahier des charges** de la version production (v0.1, en projet) comme référence des contrôles visés.
  Il ne doit pas être joint en l'état : il contient des propositions non tranchées.

Ces éléments ne prouvent pas que la plateforme de MIPS INTERNATIONAL applique ces contrôles.
