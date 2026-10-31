<?php
/**
 * @var callable $e
 * @var array<string,mixed> $customer
 * @var array<string,string> $profile
 * @var array{cashback_bp:int,min_redeem_cents:int,welcome_bonus_cents:int,expiry_months:int} $rules
 * @var list<array<string,mixed>> $history
 */
use App\ClientBloom\Ledger;
use App\Facturo\Money;

$business = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $e($business) ?> · Carte de fidélité</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <main class="auth-card loyalty-card">
    <p class="muted small"><?= $e($business) ?></p>
    <h1><?= $e($customer['name']) ?></h1>
    <div class="balance balance--big"><span class="muted small">Votre cashback</span>
      <strong><?= $e(Money::format((int) $customer['balance_cents'], 'MUR')) ?></strong></div>
    <p class="small">Gagnez <?= $e(Money::rateToInput($rules['cashback_bp'])) ?> % sur chaque achat chez <?= $e($business) ?>.
      Utilisable dès <?= $e(Money::format($rules['min_redeem_cents'], 'MUR')) ?>.
      <?php if ($rules['expiry_months'] > 0): ?>Expire après <?= (int) $rules['expiry_months'] ?> mois sans visite.<?php endif; ?>
      Présentez cette carte ou donnez votre numéro de téléphone en caisse.</p>
    <?php if ($history !== []): ?>
      <table class="table">
        <tbody>
          <?php foreach ($history as $t): ?>
            <tr><td><?= $e(\App\Format::date($t['created_at'])) ?></td>
              <td><?= $e(Ledger::LABELS[$t['type']] ?? $t['type']) ?></td>
              <td class="num"><?= $e(((int) $t['cashback_cents'] > 0 ? '+' : '') . Money::format((int) $t['cashback_cents'], 'MUR')) ?></td></tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    <?php endif; ?>
  </main>
</body>
</html>
