<?php
/**
 * Program KPIs and rules.
 *
 * @var callable $e
 * @var array<string,int> $stats
 * @var array{cashback_bp:int,min_redeem_cents:int,welcome_bonus_cents:int,expiry_months:int} $rules
 * @var bool $can_manage
 */
use App\Facturo\Money;

$m = static fn (int $c): string => Money::format($c, 'MUR');
$redemption = $stats['issued_cents'] > 0 ? round(100 * $stats['redeemed_cents'] / $stats['issued_cents']) . '%' : '—';
?>
<section class="card">
  <h2>This month</h2>
  <div class="kpis">
    <div class="kpi"><span>Sales via the program</span><strong><?= $e($m($stats['sales_cents'])) ?></strong></div>
    <div class="kpi"><span>Buying customers</span><strong><?= (int) $stats['buyers'] ?></strong></div>
    <div class="kpi"><span>Cashback issued</span><strong><?= $e($m($stats['issued_cents'])) ?></strong></div>
    <div class="kpi"><span>Cashback used</span><strong><?= $e($m($stats['redeemed_cents'])) ?></strong><small><?= $e($redemption) ?> of issued</small></div>
  </div>
  <h2>Overall</h2>
  <div class="kpis">
    <div class="kpi"><span>Customers</span><strong><?= (int) $stats['customers'] ?></strong></div>
    <div class="kpi"><span>Active (30 days)</span><strong><?= (int) $stats['active_30d'] ?></strong></div>
    <div class="kpi"><span>Marketing consent</span><strong><?= (int) $stats['consented'] ?></strong></div>
    <div class="kpi kpi--warn"><span>Outstanding cashback</span><strong><?= $e($m($stats['outstanding_cents'])) ?></strong><small>what customers can still spend</small></div>
  </div>
</section>

<section class="card">
  <h2>Program rules</h2>
  <form id="program-form" novalidate>
    <div class="form-grid">
      <div class="field"><label for="pr-rate">Cashback (% of amount paid)</label>
        <input type="text" id="pr-rate" name="cashback_rate" inputmode="decimal" value="<?= $e(Money::rateToInput($rules['cashback_bp'])) ?>"<?= $can_manage ? '' : ' disabled' ?>></div>
      <div class="field"><label for="pr-min">Minimum to use (MUR)</label>
        <input type="text" id="pr-min" name="min_redeem" inputmode="decimal" value="<?= $e(Money::toInput($rules['min_redeem_cents'])) ?>"<?= $can_manage ? '' : ' disabled' ?>></div>
      <div class="field"><label for="pr-bonus">Welcome bonus (MUR)</label>
        <input type="text" id="pr-bonus" name="welcome_bonus" inputmode="decimal" value="<?= $e(Money::toInput($rules['welcome_bonus_cents'])) ?>"<?= $can_manage ? '' : ' disabled' ?>></div>
      <div class="field"><label for="pr-exp">Expires after inactivity (months, 0 = never)</label>
        <input type="text" id="pr-exp" name="expiry_months" inputmode="numeric" value="<?= (int) $rules['expiry_months'] ?>"<?= $can_manage ? '' : ' disabled' ?>></div>
    </div>
    <p class="muted small">Cashback can only be spent in your business and is never paid out in cash.
       Changing the rate applies to future sales only.</p>
    <?php if ($can_manage): ?>
      <div class="actions"><button type="submit" class="btn-primary btn-inline">Save rules</button></div>
      <p id="program-saved" class="success" role="status" hidden>Saved.</p>
    <?php endif; ?>
  </form>
</section>
