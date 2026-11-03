# Validation des documents du dossier FSC — MIPS INTERNATIONAL PAYMENT SOLUTIONS LTD

Revue du 2026-11-03 des cinq documents transmis par le CEO, pour la demande de licence **Payment Intermediary
Services (PIS)** auprès de la FSC. **Aucun document n'a été modifié.** Les numéros de page sont ceux d'une conversion
PDF (LibreOffice) : B01 75 p., G01 8 p., contrôle interne 13 p., risques 15 p., manuel IT 13 p. Le rendu Word peut
décaler de 1 à 2 pages. Exigences de référence : `exigences-fsc-pis.md`.

Pour respecter la règle sur les données personnelles, ce rapport désigne les personnes par leur fonction, pas par leur nom.

## Verdict

**Aucun des cinq documents n'est déposable en l'état.** Trois problèmes de fond priment sur l'insertion des captures :

1. **Périmètre.** La licence PIS n'est accordée que pour une activité **exclusivement hors de Maurice** (Rule 3(iii),
   FSC 2024). B01 ne le dit nulle part et vise des marchands « in the Continent of Africa and the Indian Ocean »
   (p.26), des points de vente physiques et des banques acquéreuses locales (p.25) ; le manuel IT cite Bank One et
   l'ICPS (p.7). La FSC consultera la Banque de Maurice.
2. **Détention des fonds.** Les trois politiques affirment que MIPS INTERNATIONAL ne détient pas de fonds (manuel IT
   p.2 : « shall not hold or control client funds »). G01 et B01 décrivent l'inverse : soldes marchands, réserve
   glissante, retraits, versements, change entre portefeuilles ; B01 p.22 « collecting, holding, and remitting funds
   on behalf of clients », p.31 « Client funds are held in a separate bank account ». Il faut choisir un modèle et
   aligner les cinq documents. Si des fonds sont détenus, il manque la politique de cantonnement (E07).
3. **Description de plateforme reprise d'un autre prestataire.** B01 p.55 : « a Merchant creates an account with
   **Payop** » ; le schéma de flux p.30 porte une case « Payop ». Le back-office décrit dans G01 et B01 p.55–62
   (solde « Referral », affiliation « up to 30% », « Cashbox », « Equilibrium », passages en « you/your »)
   correspond à la documentation d'un autre prestataire, pas à un écran MIPS vérifié. **Il faut réécrire ces
   sections d'après les écrans réels, pas chercher des captures qui collent au texte.**

## B01 — Business Plan

**Bloquants**
- Périmètre et engagement d'autorisation dans chaque pays visé : absents (voir verdict). Seul « strictly through
  licensed counterparties in each jurisdiction » (p.10).
- Fonds : contradiction entre p.10 « without holding funds beyond the permitted settlement windows » et p.22, p.29–31 ;
  « Settlement Payables » au bilan (p.69) ; aucune banque de cantonnement, lettre de reconnaissance ou
  réconciliation des fonds clients. La « End-of-day reconciliation » (p.35) n'en tient pas lieu.
- Activités présentées comme existantes sans preuve : **change exécuté** (p.32 « allowing users to perform currency
  exchange and will charge its fee (through reduced or increased exchange rate) » ; p.59), initiation de paiement /
  open banking (p.29), e-wallets (p.30), **versements à des tiers sans vérification du bénéficiaire** (p.60), qui
  contredisent p.31 (« strictly prohibits the electronic transfer of client funds to any third party ») et
  constituent un signal LBC/FT.
- **États financiers prévisionnels faux (p.68–70)** :
  - résultats reportés calculés sur l'EBITDA et non sur le résultat net : année 1 (1 730) au lieu de (1 890),
    année 2 (2 430) au lieu de (2 770) ; le bilan n'équilibre que par cette erreur ;
  - flux de trésorerie d'exploitation de l'année 1 à **+1 890** pour une perte de 1 890 (erreur de signe) ; corrigé,
    la trésorerie devient quasi nulle en fin d'année 1 et négative en année 2 ;
  - capital indiqué de trois façons : MUR 2,3 M (p.12, ≈ 50 kUSD), 6 000 kUSD (bilan), 2 400 kUSD d'apports
    (trésorerie). Une perte de 1,89 MUSD sur un capital de 50 kUSD entame le capital minimal exigé ;
  - total de l'actif courant de l'année 5 : 22 410 affiché pour 22 340 calculé.
- Dirigeants : pas de CV pour la Deputy MLRO ni pour le responsable de l'audit interne ; Compliance Officer et MLRO
  cumulés (p.20) ; dirigeants fournis par la management company (question d'indépendance).
- Non traités : National Code of Corporate Governance, s. 71(3) FSA, politiques E04, E07, E08, transparence des frais,
  **certificat PCI DSS** (p.62 dit seulement « in alignment with PCI DSS » ; annexe D « provided separately »).

**Incohérences**
- Hébergement : Google Cloud (p.22), AWS Irlande (p.53), « ISO-certified cloud data centres » (p.4).
- Plateforme « MIPSIT DIGITAL LTD » (p.53) alors que p.47 dit « without outsourcing any IT services ».
- Noms : MIPSIT DIGITAL LTD, MIPS IT Digital Ltd, « MIP INTERNATIONAL » (p.32), « MIP's » (p.30).
- Résidence d'un administrateur : « Non-Resident Director » (p.3) contre « Country of Residence: Mauritius » (p.15).
- Actionnariat : total 99,98 % ; un nom en doublon ; noms abrégés ou différents dans le graphique (p.13) ;
  pourcentages dans la colonne des noms (p.14) ; deux adresses pour MIPSIT (p.7, p.14).
- Bénéficiaire effectif présenté comme unique (p.51, annexe C) alors qu'aucune personne ne détient 25 % ;
  deux personnes liées cumulent environ 25,4 % : à analyser.
- Fonctions citées absentes de l'organigramme (p.39) : CCO, CFO, Commercial Committee, Key Account Manager.
- « Payment **Initiation** Services (PIS) » (p.19) au lieu de Payment Intermediary Services.
- Exemple de change incohérent (p.32 : paiement en KES, facture en EUR, puis « GBP is converted into EUR »).
- Démarrage « November 2026 » (p.5) ; un administrateur « currently serves as a Director » d'une société non encore constituée (p.18).
- Taux d'impôt effectif de 3 % dès l'année 3 malgré les pertes reportables.
- Sommaire faux (Platform annoncée p.50, réelle p.52) ; biographie tronquée (p.19) ; coquilles (« fit and
  proprietary », « .CVS », « Quartre Bornes », « procedures are complaint »).

**À remplir**
- **p.5** : tableau « Outsourced service providers » (nom, pays, numéro d'immatriculation, autorité, service).
  Candidats cités ailleurs, à confirmer : management company, MIPSIT DIGITAL (plateforme), hébergeur cloud, outils de
  filtrage et de vérification, cabinet d'audit, conseil juridique, assureur, auditeur de conformité.
- **p.5–6** : tableau « Payment partners » (nom, pays, numéro, autorité, service, représentant). **Attention** :
  les acquéreurs locaux (MCB, SBM, ABSA) y renverraient à une activité mauricienne, hors périmètre PIS.
- **p.55–62** : sept emplacements de captures (voir `registre-captures-fsc.md`).
- Annexes A à E vides (assurance RC professionnelle, lettre de l'auditeur de conformité, relevé du bénéficiaire
  effectif, certifications de la plateforme, preuve de fonds).
- Postes « To be appointed » (p.39) : Head of Onboarding, DPO, Technology Officer, Head of Finance, RH.

**À faire confirmer** : cotation de l'actionnaire MCB Equity Fund à la SEM et son lien avec MCB acquéreur ; marque
MIPS® dans l'UE et au Royaume-Uni ; références juridiques citées (circulaire CL1-121018, FSA s.29, FIAMLA s.17(b),
liste de pays interdits) ; statut réglementaire de MIPSIT (« N/A », p.14) ; affirmation « cardholder data is not
transmitted through MIPS's systems » (p.53) ; banque du compte principal ; hypothèses de revenus et de salaires.

## G01 — Platform Technical Description

**Bloquants**
- p.1 : « Payment services shall only be provided to the Merchants via the **MIPSIT DIGITAL LTD** Platform » : si la
  plateforme appartient à MIPSIT, c'est une externalisation intragroupe à déclarer et contractualiser.
- p.1 : « secure servers in Ireland (AWS Amazon) », contredit par le manuel IT (Google Cloud, Johannesburg, reprise en Belgique).
- p.5–7 : soldes, réserves, retraits, versements = détention de fonds, contraire aux trois politiques.
- p.7 : versements « do not require the prior verification of the recipient's details » (« you can pay out money to
  your website users, employees, providers ») : risque LBC/FT majeur, contraire à la politique de risques (p.5–6).
- p.6 : « Merchants can exchange funds between their currency wallets » : exécution de change, contraire à la
  politique de risques p.9 (« currency conversion is performed by upstream rails »). À supprimer ou à réécrire en
  simple affichage, sauf capacité réelle et autorisée.
- Huit emplacements « [Insert screenshot …] » (p.2, 3, 4, 5, 8) : rien ne prouve que la plateforme est « tried and tested ».

**Autres** : frais prélevés sur les soldes (p.6) contre frais facturés à part (contrôle interne p.3) ; pourcentage
de réserve manquant (p.5) ; « the Merchant signs the company » (p.4) ; passages en deuxième personne ; aucune mention
de PCI DSS malgré un module « Card » ; rien sur la sécurité, la continuité, les litiges, la transparence des frais
pour le payeur (le marchand fixe la part payée par l'utilisateur final, p.5) ; affiliation jusqu'à 30 % sans
diligence sur les apporteurs. Aucune date, version ni approbation ; métadonnées au nom de rédacteurs à nettoyer.

## Politique de contrôle interne (13 p.)

- p.3 : phrase incohérente et prématurée (« shall be incorporated [...] and holds, and shall a Global Business
  Licence and a [...] PIS licence »).
- p.8 : « [Insert monetary thresholds] » et matrice des délégations à insérer après approbation du conseil.
- p.13 : approbation sans date, version, signataire ni résolution du conseil.
- Revue des accès « semi-annually » contre trimestrielle/annuelle dans le manuel IT ; changements urgents approuvés
  avant (ici) ou revus après (manuel IT) ; PCI DSS appuyé sur l'attestation du fournisseur de passerelle.
- Manques : Deputy MLRO, National Code of Corporate Governance, délais de notification à la FSC, valeurs RTO/RPO.
- Cite des politiques non fournies ici : manuel LBC/FT, externalisation, sécurité de l'information, données
  personnelles, réclamations, conflits d'intérêts, continuité. **Vérifie qu'elles existent et sont dans le dossier.**

## Politique de gestion des risques (15 p.)

- p.15 : approbation sans date, version ni signature.
- p.4, 5, 9 : modèle sans détention de fonds, contredit par G01 ; p.9 §7.8 change par les intermédiaires amont, contredit par G01.
- RTO/RPO annoncés sans valeur (p.8) ; DPO « where required » (p.10) alors que les autres documents le traitent comme nommé ;
  « ISO 27001-aligned controls, cloud certifications » (p.13) affirmé sans preuve.
- Repris d'un modèle : indicateurs de blanchiment par le commerce (« phantom shipping », p.10), « Tier 1 and Tier 2
  merchants » non définis, « GDPR or UK GDPR ».
- Registre des risques sans les risques des versements, de l'affiliation et du change ; pas de délais de
  déclaration à la FSC ou à la FIU ; pas de Deputy MLRO.

## Manuel IT (13 p.)

- **Commentaire ouvert** du rédacteur, « Client to confirm and/or amend » (p.7, §8) : à traiter et supprimer.
- p.4 : hébergement Google Cloud (Johannesburg, reprise en Belgique) avec l'identifiant d'organisation et les noms de
  projets de production : **information sensible**, à retirer ou à remplacer par une description générale avant envoi.
  Les projets cités semblent appartenir au groupe ou à MIPSIT, pas au demandeur.
- p.4 et p.7 : hébergement historique et partenaires locaux (Bank One, ICPS, Visa) : environnement mauricien à
  concilier avec le périmètre PIS.
- Aucune approbation, version ni date, alors que le §3 prévoit l'approbation du conseil ; rôle « COIO » non défini ;
  « Risk Management Committee » ; RTO/RPO sans chiffres.
- Manques : délais de notification d'incident à la FSC et au Data Protection Office ; garanties pour les transferts
  de données hors de Maurice (Afrique du Sud, Belgique) au titre du Data Protection Act 2017 ; attestation PCI DSS propre.

## Incohérences entre documents

| Sujet | B01 | G01 | Politiques |
|---|---|---|---|
| Entité qui opère | MIPS INTERNATIONAL, MIPSIT, « MIP INTERNATIONAL » | MIPSIT DIGITAL LTD | MIPS INTERNATIONAL |
| Fonds des marchands | contradictoire | détenus (soldes, réserves, retraits) | non détenus |
| Change | exécuté par MIPS | entre portefeuilles | par les intermédiaires amont |
| Hébergement | Google Cloud et AWS Irlande | AWS Irlande | Google Cloud Johannesburg / Belgique |
| Comités | — | — | quatre noms différents |
| RTO / RPO | — | — | annoncés, jamais chiffrés |
| Approbation, version | — | aucune | aucune ou incomplète |

## Décisions à prendre avant toute correction

1. **Périmètre** : quels pays, quels marchands, et comment le dossier démontre l'absence d'activité à Maurice.
2. **Fonds** : MIPS INTERNATIONAL détient-elle des fonds de marchands ? Oui → politique E07, banque de cantonnement,
   réconciliation, et cohérence avec le dossier SPIN DIGITAL (modèle sans détention retenu le 31 octobre) que la
   Banque de Maurice lira aussi. Non → retirer soldes, réserves, retraits, versements et change de G01 et B01.
3. **Plateforme** : à qui appartient-elle (MIPSIT ou MIPS INTERNATIONAL) ? Quelles fonctions décrites existent
   réellement ? Contrat d'externalisation, certificat PCI DSS.
4. **Change, versements à des tiers, affiliation, open banking, e-wallets** : supprimer ce qui n'existe pas ou
   n'est pas autorisé.
5. **États financiers** : faire refaire les tableaux par la finance.

Ensuite seulement : remplir p.5, insérer les captures réelles, compléter les annexes, dater et faire approuver les
politiques par le conseil, nettoyer les métadonnées.
