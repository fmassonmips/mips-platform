# Tests de bout en bout

Chaque suite `e2eN.js` pilote un vrai navigateur (Playwright, Chromium) sur l'application servie par PHP, avec MariaDB, un faux serveur SMTP (`support/fake_smtp.py`), un faux serveur de l'API MRA (`support/fakemra/server.py`) et un faux calendrier Airbnb. Elle affiche une ligne `✓` par étape vérifiée et finit par `ALL GREEN` (les plus anciennes par `console errors: none`).

```bash
tests/e2e/run.sh              # toutes les suites
tests/e2e/run.sh e2e22 e2e25  # quelques suites
```

Prérequis et variables (`MIPS_E2E_DB`, `MIPS_E2E_WORKDIR`…) : voir l'en-tête de `run.sh`. La base de test est détruite et recréée avant chaque suite ; le script refuse `mips_platform`. Il règle aussi le fuseau global de MariaDB sur `+04:00` (heure de Maurice), comme l'application le fait pour ses propres connexions.

Sur GitHub, `.github/workflows/tests.yml` lance les mêmes suites à chaque pull request, en quatre lots parallèles (`MIPS_E2E_SHARD`).

Une suite reçoit en argument le dossier de travail (`tests/.work/`) : copie du code dans `t/`, e-mails reçus dans `mail/`, captures d'écran à la racine.

| Suite | Couvre |
|---|---|
| e2e, e2e2, e2e3, e2e6, e2e7 | Facturo : devis, factures, avoirs, e-mail, MRA (faux serveur), langues |
| e2e5 | ClientBloom, et le lien avec Facturo |
| e2e8, e2e9 | RendezVous, Formelio |
| e2e10, e2e12 | FlowDesk, TeamNest |
| e2e11 | BizPilot |
| e2e13 | ShopLokal |
| e2e14, e2e15 | Équipe et invitations, StaffZen |
| e2e16 | Bookora et synchro iCal |
| e2e17, e2e18 | Entreprise de démo, fin d'essai en lecture seule |
| e2e19, e2e20 | Comptes, revue de sécurité |
| e2e21 | Rôles Facturo |
| e2e22, e2e27 | Back-office, historique d'usage |
| e2e23 | Premiers pas, import Excel |
| e2e24, e2e28 | E-mails automatiques, résumé du lundi |
| e2e25 | Export et fermeture du compte |
| e2e26 | CGU et confidentialité |
