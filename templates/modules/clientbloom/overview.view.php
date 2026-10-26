<?php
/**
 * Program KPIs and rules.
 *
 * @var callable $e
 * @var array<string,int> $stats
 * @var array{cashback_bp:int,min_redeem_cents:int,welcome_bonus_cents:int,expiry_months:int,facturo_rewards:int} $rules
 * @var array{id:int,name:string,role:string} $org
 * @var bool $can_manage
 */
use App\Facturo\Money;
use App\Suite\Modules;

$facturoOn = Modules::isEnabled($org['id'], 'facturo');

$m = static fn (int $c): string => Money::format($c, 'MUR');
$redemption = $stats['issued_cents'] > 0 ? round(100 * $stats['redeemed_cents'] / $stats['issued_cents']) . ' %' : '—';
?>
<section class="card">
  <h2>Ce mois-ci</h2>
  <div class="kpis">
    <div class="kpi"><span>Ventes via le programme</span><strong><?= $e($m($stats['sales_cents'])) ?></strong></div>
    <div class="kpi"><span>Clients acheteurs</span><strong><?= (int) $stats['buyers'] ?></strong></div>
    <div class="kpi"><span>Cashback émis</span><strong><?= $e($m($stats['issued_cents'])) ?></strong></div>
    <div class="kpi"><span>Cashback utilisé</span><strong><?= $e($m($stats['redeemed_cents'])) ?></strong><small><?= $e($redemption) ?> de l'émis</small></div>
  </div>
  <h2>Global</h2>
  <div class="kpis">
    <div class="kpi"><span>Clients</span><strong><?= (int) $stats['customers'] ?></strong></div>
    <div class="kpi"><span>Actifs (30 jours)</span><strong><?= (int) $stats['active_30d'] ?></strong></div>
    <div class="kpi"><span>Consentement marketing</span><strong><?= (int) $stats['consented'] ?></strong></div>
    <div class="kpi kpi--warn"><span>Cashback en circulation</span><strong><?= $e($m($stats['outstanding_cents'])) ?></strong><small>ce que vos clients peuvent encore dépenser</small></div>
  </div>
</section>

<section class="card">
  <h2>Règles du programme</h2>
  <form id="program-form" novalidate>
    <div class="form-grid">
      <div class="field"><label for="pr-rate">Cashback en caisse (% du montant payé)</label>
        <input type="text" id="pr-rate" name="cashback_rate" inputmode="decimal" value="<?= $e(Money::rateToInput($rules['cashback_bp'])) ?>"<?= $can_manage ? '' : ' disabled' ?>></div>
      <div class="field"><label for="pr-min">Minimum utilisable (Rs)</label>
        <input type="text" id="pr-min" name="min_redeem" inputmode="decimal" value="<?= $e(Money::toInput($rules['min_redeem_cents'])) ?>"<?= $can_manage ? '' : ' disabled' ?>></div>
      <div class="field"><label for="pr-bonus">Bonus de bienvenue (Rs)</label>
        <input type="text" id="pr-bonus" name="welcome_bonus" inputmode="decimal" value="<?= $e(Money::toInput($rules['welcome_bonus_cents'])) ?>"<?= $can_manage ? '' : ' disabled' ?>></div>
      <div class="field"><label for="pr-exp">Expiration après inactivité (mois, 0 = jamais)</label>
        <input type="text" id="pr-exp" name="expiry_months" inputmode="numeric" value="<?= (int) $rules['expiry_months'] ?>"<?= $can_manage ? '' : ' disabled' ?>></div>
    </div>
    <label class="checkbox"><input type="checkbox" name="facturo_rewards"<?= $rules['facturo_rewards'] === 1 ? ' checked' : '' ?><?= $can_manage && $facturoOn ? '' : ' disabled' ?>>
      Récompenser les factures Facturo payées (cashback sur le total de la facture lorsqu'elle est marquée payée)</label>
    <div class="form-grid">
      <div class="field"><label for="pr-irate">Cashback sur les factures (%)</label>
        <input type="text" id="pr-irate" name="invoice_cashback_rate" inputmode="decimal" value="<?= $e(Money::rateToInput($rules['invoice_cashback_bp'])) ?>"<?= $can_manage && $facturoOn ? '' : ' disabled' ?>></div>
      <div class="field"><label for="pr-icap">Cashback max. par facture (Rs, 0 = sans plafond)</label>
        <input type="text" id="pr-icap" name="invoice_cap" inputmode="decimal" value="<?= $e(Money::toInput($rules['invoice_cap_cents'])) ?>"<?= $can_manage && $facturoOn ? '' : ' disabled' ?>></div>
    </div>
    <?php if (!$facturoOn): ?>
      <p class="muted small">Activez Facturo depuis le lanceur d'apps pour récompenser les factures payées.</p>
    <?php endif; ?>
    <p class="muted small">Le cashback ne peut être dépensé que dans votre commerce et n'est jamais remboursé en espèces.
       Un changement de taux ne s'applique qu'aux ventes futures.</p>
    <?php if ($can_manage): ?>
      <div class="actions"><button type="submit" class="btn-primary btn-inline">Enregistrer les règles</button></div>
      <p id="program-saved" class="success" role="status" hidden>Enregistré.</p>
    <?php endif; ?>
  </form>
</section>
