# Revue de sécurité — octobre 2026

Quatre relectures indépendantes du code : isolation entre entreprises, authentification et pages publiques, injections et affichage, réseau sortant et déploiement. Chaque constat a été vérifié sur le code puis testé (suite `e2e20` et mises à jour de `e2e14`, `e2e19`).

## Corrigé

| # | Gravité | Problème | Correction |
|---|---|---|---|
| 1 | Haute | Une connexion réussie effaçait les échecs de toute l'adresse IP : un attaquant alternant « 4 essais sur la victime / 1 connexion sur son propre compte » devinait sans fin | Une connexion n'efface que les échecs de **sa** propre adresse e-mail ; compteur par IP séparé (20 échecs / 15 min) |
| 2 | Moyenne | 5 faux mots de passe suffisaient à bloquer n'importe qui, sans limite de durée | Une adresse attaquée reste accessible depuis une connexion déjà utilisée par son titulaire (90 jours) ; les autres attendent. Un lien « mot de passe oublié » lève le blocage |
| 3 | Moyenne-haute | Un attaquant inscrivant l'adresse d'une personne avant elle gardait son mot de passe sur le compte | Chaque inscription garde son propre mot de passe ; la page de confirmation redemande le mot de passe choisi à l'inscription |
| 4 | Moyenne | L'invitant reçoit le lien : il pouvait remplacer le mot de passe d'un compte existant sans entreprise et s'y connecter ; le message « autre entreprise » révélait les comptes | Un compte existant doit saisir **son** mot de passe pour accepter ; réponse identique pour toute adresse ; la personne déjà rattachée ailleurs est prévenue par e-mail |
| 5 | Moyenne | Les formulaires publics pouvaient envoyer des e-mails à n'importe quelle adresse, avec du texte du visiteur dans l'objet | 5 e-mails / jour par destinataire (toutes entreprises), 200 / jour par entreprise ; objet FlowDesk sans texte du visiteur ; IPv6 compté par /64 |
| 6 | Faible | Un membre retiré pouvait réactiver son compte en se réinscrivant | Lien de confirmation seulement pour une adresse jamais confirmée (`verified_at`, migration 019) |
| 7 | Faible | Un admin pouvait annuler ou rétrograder l'invitation d'administrateur faite par le propriétaire | Réservé au propriétaire |
| 8 | Faible | Nom d'entreprise du type « PayPal <service@paypal.com> » affiché comme expéditeur | Nom d'expéditeur toujours entre guillemets |
| 9 | Faible | Session sans durée maximale ; jeton CSRF conservé après confirmation / réinitialisation / invitation ; mots de passe > 72 caractères tronqués par bcrypt | Reconnexion après 12 h ; nouveau jeton à chaque connexion ; 72 caractères au plus |
| 10 | Moyenne | En production, une URL MRA sandbox aurait produit des IRN non légaux enregistrés comme « fiscalisé » | Refusé si `app.env = production` |
| 11 | Faible | Synchro iCal : plages réseau internes non couvertes, port libre, proxy d'environnement, message d'erreur technique | Port 443 seul, plages CGNAT/benchmark/IETF/multicast refusées, proxy ignoré, message générique |
| 12 | Faible | Crons : une entreprise en erreur arrêtait les suivantes ; seed de test réinitialisant le mot de passe ; `demo_seed` utilisable en production | Isolation par entreprise + code de sortie 1 ; seed sans écrasement ; `demo_seed` refusé en production |

## Vérifié sans problème

Isolation des données entre entreprises (aucun accès croisé trouvé sur les 10 applications), injections SQL, XSS, CSV, en-têtes e-mail, fichiers images, jetons (aléatoires 32 octets, seule l'empreinte SHA-256 stockée, usage unique), sessions (cookies HttpOnly/Secure/SameSite, ID régénéré à la connexion, expiration après 30 min d'inactivité), CSRF sur toutes les requêtes POST, en-têtes de sécurité (CSP stricte, anti-iframe).

## Risques résiduels acceptés

- La page d'invitation indique à celui qui détient le lien si l'adresse a déjà un compte MIPS (il faut une invitation par adresse, 20 / jour / entreprise).
- Sans SMTP configuré, l'inscription répond « compte existant » : configurer le SMTP avant l'ouverture publique.
- Les limites reposent sur l'adresse IP du client : derrière un proxy ou un CDN, la vraie adresse doit être restaurée (voir `deploiement.md`).

## Décision à prendre

Facturo n'a aucune restriction de rôle : un simple membre peut émettre une facture, l'avoir et la marquer payée. Si la facturation doit être réservée au propriétaire et aux administrateurs, c'est un changement court.
