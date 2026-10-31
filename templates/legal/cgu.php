<?php
/**
 * Terms of use text. Every rule stated here matches what the product does;
 * change both together. Placeholders: config legal.* (App\Legal::get).
 *
 * @var callable $L publisher detail, escaped
 */
use App\Suite\Closure;
use App\Suite\Catalog;
?>
<h2>1. Objet et éditeur</h2>
<p>Les présentes conditions régissent l’utilisation de my.mips.mu, une suite d’applications de gestion pour les entreprises
  (devis et factures, fidélité, rendez-vous, formulaires, support client, projets, boutique en ligne, congés, hébergement,
  tableau de bord). Le service est édité par <?= $L('company') ?>, <?= $L('address') ?>, BRN <?= $L('brn') ?>
  (« MIPS »). Contact : <?= $L('contact_email') ?>.</p>
<p>Créer un compte vaut acceptation des présentes conditions et de la <a href="/confidentialite.php">politique de confidentialité</a>.</p>

<h2>2. Compte et équipe</h2>
<ul>
  <li>Le compte est créé par une personne majeure agissant pour une entreprise (le « client »), qui en devient le propriétaire.
    L’adresse e-mail est confirmée par un lien avant toute utilisation.</li>
  <li>Le propriétaire peut inviter des collègues comme administrateurs ou membres. Il répond de leur usage du service et
    retire leur accès quand ils quittent l’entreprise.</li>
  <li>Chacun garde son mot de passe confidentiel et prévient MIPS sans délai d’un accès qu’il n’a pas autorisé.</li>
  <li>Un compte utilisateur appartient à une seule entreprise.</li>
</ul>

<h2>3. Essai gratuit et abonnement</h2>
<ul>
  <li>Chaque application est gratuite pendant <?= Catalog::TRIAL_DAYS ?> jours à partir de son activation. Un essai terminé
    ne se relance pas.</li>
  <li>À la fin de l’essai sans abonnement, l’application passe en lecture seule : les données restent consultables,
    imprimables et exportables, mais rien ne peut plus être créé ni modifié, et ses pages publiques (réservation,
    boutique, formulaires) ferment. MIPS prévient par e-mail 7 jours avant, la veille et le jour même.</li>
  <li>Les prix et les modalités de paiement des abonnements sont ceux de l’offre communiquée au client avant sa souscription.
    [Durée, renouvellement, préavis de résiliation et révision des prix à compléter.]</li>
</ul>

<h2>4. Usage acceptable</h2>
<p>Le client s’engage à n’utiliser le service que pour son activité légale, et notamment à ne pas :</p>
<ul>
  <li>envoyer par son intermédiaire des messages non sollicités ou trompeurs, ni usurper l’identité d’une autre entreprise ;</li>
  <li>y enregistrer des données qu’il n’a pas le droit de traiter ;</li>
  <li>tenter d’accéder aux données d’une autre entreprise, de contourner les limites du service ou d’en perturber le fonctionnement.</li>
</ul>
<p>Pour protéger le service, des limites s’appliquent (nombre de tentatives de connexion, d’invitations, d’e-mails envoyés
  depuis les formulaires publics…).</p>

<h2>5. Facturation électronique MRA</h2>
<p>Quand le client l’active, Facturo transmet ses factures et avoirs à la Mauritius Revenue Authority avec les identifiants
  qu’il a fournis. Le client reste seul responsable de ses obligations fiscales : exactitude des factures, taux de TVA,
  conservation de ses pièces comptables pendant la durée légale. Une facture que la MRA n’a pas encore acceptée est
  signalée comme telle et ne doit pas être utilisée comme facture fiscale.</p>

<h2>6. Données du client</h2>
<ul>
  <li>Le client reste propriétaire des données qu’il enregistre, y compris celles de ses propres clients. MIPS les traite
    pour son compte, selon ses instructions, uniquement pour fournir le service (voir la
    <a href="/confidentialite.php">politique de confidentialité</a>).</li>
  <li>Le propriétaire peut télécharger à tout moment toutes les données de l’entreprise (fichier ZIP, page « Vos données »).</li>
  <li>Le client informe ses propres clients du traitement de leurs données, en tant que responsable de ce traitement.</li>
</ul>

<h2>7. Fermeture du compte et suppression</h2>
<ul>
  <li>Le propriétaire peut fermer le compte de l’entreprise à tout moment (page « Vos données »). Les applications et les
    pages publiques ferment immédiatement ; il peut encore se connecter pour télécharger les données ou annuler.</li>
  <li><?= Closure::DELAY_DAYS ?> jours après la demande, toutes les données de l’entreprise et les comptes de son équipe sont
    supprimés définitivement. Les copies de sauvegarde sont effacées à leur expiration, au plus tard 30 jours après.</li>
</ul>

<h2>8. Suspension</h2>
<p>MIPS peut suspendre l’accès d’une entreprise en cas d’impayé, de manquement aux présentes conditions ou de risque pour
  la sécurité du service. La raison est indiquée aux membres à la connexion ; les données sont conservées et l’accès est
  rétabli dès que la cause est levée.</p>

<h2>9. Disponibilité et support</h2>
<p>MIPS fait ses meilleurs efforts pour que le service soit disponible et sauvegarde les données chaque nuit, sans garantir
  une disponibilité ininterrompue. Support : <?= $L('contact_email') ?>. [Engagement de niveau de service éventuel à compléter.]</p>

<h2>10. Responsabilité</h2>
<p>[Clause de limitation de responsabilité à rédiger avec un juriste.]</p>

<h2>11. Modification des conditions</h2>
<p>MIPS peut modifier les présentes conditions. Chaque version est datée ; la nouvelle version est présentée à chaque
  utilisateur sur son tableau de bord pour acceptation, et la date de son acceptation est enregistrée.
  [Effet d’un refus ou d’une absence d’acceptation à préciser.]</p>

<h2>12. Droit applicable</h2>
<p>Les présentes conditions sont soumises au droit de la République de Maurice. [Juridiction compétente à compléter.]</p>
