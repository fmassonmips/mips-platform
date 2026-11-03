# Licence FSC « Payment Intermediary Services » (PIS) — exigences vérifiées

Établi le 2026-11-03 pour le dossier de **MIPS INTERNATIONAL PAYMENT SOLUTIONS LTD** auprès de la Financial
Services Commission (FSC). Chaque point indique sa source. Ce qui n'a pas pu être lu à la source est signalé.

## Sources lues

| Réf. | Document | Date | Accès |
|---|---|---|---|
| [F1] | FSC, *Application Form for Payment Intermediary Services Licence*, FS-2.9 (`fscmauritius.org/media/4033/af_fs-2_9.pdf`) | métadonnées du fichier : 2017-07-11 | lu en entier |
| [F2] | FSC, *Circular Letter — Payment Intermediary Services Licence – New Minimum Capital Requirements* (`fscmauritius.org/media/67437/...`) | 3 octobre 2018 | lu en entier |
| [F3] | FSC (A. Mishra), *Regulatory framework for payment intermediary services*, présentation au FS Club « Digitalisation of Payment Systems in Mauritius » (`longfinance.net/documents/3954/...`) | 13 novembre 2024 | lu (diapositives FSC) |
| — | Page FinTech du site de la FSC, Financial Services Act 2007, FIAMLA 2002, Financial Services (Other Financial Business Activity) Rules 2008 | — | **non lus à la source** : le site de la FSC refuse les accès automatisés (Incapsula) |

L'annexe du formulaire FS-2.9 (pièces à joindre) et le tracker de la plateforme FSC One ne sont pas publics :
la liste des documents E04–E13, G05, etc. vient du tableau comparatif du consultant (Dhananjay Thakoor), pas d'une
lecture de la FSC. **Vérifie ces points avec le consultant avant d'agir.**

## 1. Périmètre — point bloquant à trancher en premier

> « The FSC [...] is endowed amongst others the mandate to licence, regulate, monitor and supervise payment
> intermediary service providers, conducting business activities **exclusively outside Mauritius**. » [F3]

> « Rule 3(iii) of the Financial Services (Other Financial Business Activity) Rules 2008 was amended to empower the
> Commission to grant PIS licences only to those applicants proposing to conduct business exclusively outside
> Mauritius and which would not fall under the purview of the Bank of Mauritius. » [F3]

> « The FSC shall request the views of the Bank of Mauritius before the grant of the Payment Intermediary Services
> Licence. » [F1, note iv]

Conséquences pour le dossier :

- Le demandeur doit **confirmer par écrit** qu'il n'exercera qu'en dehors de Maurice [F3]. Toute pièce qui montre
  des marchands mauriciens, des ventes à Maurice, des volumes en roupies ou les banques acquéreuses locales comme
  activité de MIPS INTERNATIONAL contredit cette confirmation.
- Les captures du prototype `mips-platform` montrent précisément cela (marchand immatriculé à Maurice, BRN, ventes
  à Maurice, volumes en MUR, rapprochement MCB). Elles ne peuvent pas illustrer l'activité PIS sans explication
  (voir `registre-captures-fsc.md`).
- La Banque de Maurice est consultée : le dossier FSC de MIPS INTERNATIONAL et le futur dossier BoM de SPIN DIGITAL
  doivent raconter la même histoire (qui détient les fonds, quelles activités relèvent de quel régulateur).

## 2. Conditions de licence [F3, sauf mention]

| Exigence | Détail |
|---|---|
| Forme | Global Business Licence, demande déposée par une **management company** (s. 72 FSA) |
| Activité | Confirmation d'activité **exclusivement hors de Maurice** ; engagement à obtenir les autorisations dans chaque pays visé |
| Banque | Compte bancaire principal maintenu **à Maurice** |
| Capital | **MUR 2 000 000** de capital déclaré non entamé, à tout moment [F2, F3] |
| Plateforme | « Tried and tested », par exemple **certificat PCI DSS** si des transactions par carte sont traitées |
| Contrats | Projets de contrats avec les marchands, prestataires et passerelles |
| Gouvernance | Cadre conforme au National Code of Corporate Governance ; contrôle interne et procédures |
| Dirigeants | Officers « fit and proper » (s. 2 FSA) : au moins 2 administrateurs résidents ; Compliance Officer, MLRO, Deputy MLRO [F1, s. 8] |
| Siège | Adresse du siège et projet de bail |
| Dossier | Complet sur FSC One, avec un **business plan faisable décrivant le flux du service PIS** ; s. 71(3) FSA à traiter |
| Comptes | États financiers audités |
| Actionnaires, bénéficiaires effectifs | CV signé, passeport, justificatif de domicile de moins de 6 mois ; pour une société : certificat d'incorporation, actionnaires et administrateurs, derniers comptes audités [F1, s. 11] |
| Délai | 10 jours ouvrés si le dossier est complet (s. 17B FSA ; Financial Services (Determination of Application) Rules 2024) |

## 3. Ce que la FSC contrôle ensuite [F3]

- **LBC/FT** : FIAMLA 2002 et ses règlements ; KYC strict, déclarations, surveillance continue.
- **Protection des clients** : traitement sécurisé des transactions, **transparence des frais**, **règlement des litiges**.
- **Données personnelles** : Data Protection Act 2017, gestion et sécurité strictes des données.
- **Inspections sur place** (s. 43 FSA) : LBC/FT, aspects prudentiels, gouvernance, traitement équitable du public.

## 4. Pièces citées par le consultant pour la PIS (non vérifiées à la source)

Politique LBC/FT (E01), plan de continuité et de reprise (E04), politique TIC et cybersécurité avec description de la
plateforme (E05), protection des données (E06), **fonds des clients et cantonnement (E07)**, réclamations (E08),
cadre de gouvernance et comités (E13), assurance responsabilité professionnelle (G05).

## 5. À vérifier avant dépôt

1. Que MIPS INTERNATIONAL n'aura **aucun marchand ni payeur à Maurice**, et comment le dossier le démontre.
2. Que le capital de MUR 2 M n'a pas été relevé depuis la circulaire de 2018 (la présentation de 2024 cite toujours ce montant).
3. Le texte en vigueur de la Rule 3(iii) et du s. 71(3) FSA : non lus à la source.
4. Si MIPS INTERNATIONAL détient des fonds de marchands (soldes, réserves, versements), ce qu'exige la FSC pour leur cantonnement (E07) : aucune règle PIS publique trouvée sur ce point.
