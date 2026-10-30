<?php
/**
 * Privacy policy text. Every retention period and measure stated here
 * matches the code; change both together. Placeholders: config legal.*.
 *
 * @var callable $L publisher detail, escaped
 */
use App\Suite\Closure;
?>
<p>Cette politique explique quelles données personnelles my.mips.mu traite, pourquoi, combien de temps, et comment exercer
  vos droits, conformément au Data Protection Act 2017 de la République de Maurice.</p>

<h2>1. Deux rôles différents</h2>
<ul>
  <li><strong>Vos données de compte</strong> (vous, utilisateur de my.mips.mu) : MIPS (<?= $L('company') ?>) en est
    responsable de traitement.</li>
  <li><strong>Les données que votre entreprise enregistre</strong> (ses clients, réservations, factures, réponses aux
    formulaires, congés de l’équipe…) : votre entreprise en est responsable de traitement ; MIPS les traite pour son
    compte, comme sous-traitant, et seulement pour fournir le service.</li>
</ul>

<h2>2. Données de compte que nous traitons</h2>
<table class="table">
  <thead><tr><th>Données</th><th>Pourquoi</th><th>Combien de temps</th></tr></thead>
  <tbody>
    <tr><td>Nom, adresse e-mail, mot de passe (stocké uniquement sous forme chiffrée irréversible), rôle dans l’entreprise</td>
      <td>Créer et sécuriser le compte, permettre le travail en équipe</td>
      <td>Jusqu’à la fermeture du compte, puis <?= Closure::DELAY_DAYS ?> jours</td></tr>
    <tr><td>Date de dernière connexion, version des conditions acceptée</td>
      <td>Suivi du compte, preuve de l’acceptation</td><td>Idem</td></tr>
    <tr><td>Jours d’utilisation du service (la date seulement, sans le détail des pages ni des actions)</td>
      <td>Mesurer l’adoption et accompagner votre entreprise ; visible par votre entreprise dans son export et par l’équipe MIPS</td>
      <td>13 mois</td></tr>
    <tr><td>Adresse IP et adresse e-mail des tentatives de connexion</td>
      <td>Bloquer les tentatives d’intrusion</td><td>90 jours au plus</td></tr>
    <tr><td>Liens envoyés par e-mail (confirmation, mot de passe oublié, invitation)</td>
      <td>Sécurité : seule leur empreinte est stockée, chaque lien sert une fois</td>
      <td>48 heures, 1 heure ou 7 jours de validité ; conservés avec le compte</td></tr>
    <tr><td>Historique des e-mails envoyés par le service (relances, rappels)</td>
      <td>Ne pas envoyer deux fois le même e-mail</td><td>Avec le compte de l’entreprise</td></tr>
  </tbody>
</table>
<p>Base légale : l’exécution du contrat (les présentes conditions) et notre intérêt légitime à sécuriser le service.</p>

<h2>3. Ce que nous ne faisons pas</h2>
<ul>
  <li>Nous ne vendons ni ne louons aucune donnée.</li>
  <li>Nous n’utilisons pas les données de votre entreprise pour notre propre compte (publicité, profilage, revente).</li>
  <li>Pas de traceur publicitaire ni d’outil de mesure d’audience : un seul cookie, le cookie de session
    (MIPSSESSID), indispensable à la connexion. Il expire après 30 minutes d’inactivité ou 12 heures. La boutique en ligne
    garde le panier dans le navigateur, le temps de la visite.</li>
</ul>

<h2>4. Qui y a accès</h2>
<ul>
  <li>Les membres de votre entreprise, selon leur rôle.</li>
  <li>L’équipe de MIPS, nominativement autorisée, pour le support et la gestion des abonnements ; ses actions sur un compte
    (export, suspension…) sont journalisées.</li>
  <li>Nos sous-traitants : hébergement (<?= $L('host') ?>) et envoi des e-mails (<?= $L('mail_provider') ?>).
    [Transferts hors de Maurice et garanties à préciser selon les prestataires retenus.]</li>
  <li>La Mauritius Revenue Authority, pour les factures que votre entreprise choisit de fiscaliser.</li>
</ul>

<h2>5. Sécurité</h2>
<p>Connexions chiffrées (HTTPS), mots de passe stockés sous forme de hachage, limitation des tentatives de connexion,
  séparation stricte des données de chaque entreprise, identifiants MRA chiffrés, sauvegardes chiffrées chaque nuit.</p>

<h2>6. Fermeture et suppression</h2>
<p>Le propriétaire peut télécharger toutes les données de l’entreprise et fermer son compte à tout moment. Les données sont
  supprimées définitivement <?= Closure::DELAY_DAYS ?> jours après la demande ; les sauvegardes qui les contiennent
  expirent au plus tard 30 jours plus tard.</p>

<h2>7. Vos droits</h2>
<p>Vous pouvez demander l’accès à vos données, leur rectification, leur effacement, ou vous opposer à un traitement :
  <?= $L('privacy_email') ?>. Pour les données qu’une entreprise cliente a enregistrées à votre sujet (vous êtes son client),
  adressez-vous d’abord à elle : MIPS l’aidera à répondre. Vous pouvez aussi saisir le Data Protection Office de Maurice.</p>
