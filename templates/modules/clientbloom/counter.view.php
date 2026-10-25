<?php
/**
 * Counter: find a customer by phone, record a sale, use cashback.
 *
 * @var callable $e
 * @var array{cashback_bp:int,min_redeem_cents:int,welcome_bonus_cents:int,expiry_months:int} $rules
 */
use App\Facturo\Money;
?>
<section class="card">
  <h2>Counter</h2>
  <p class="muted small">Cashback: <?= $e(Money::rateToInput($rules['cashback_bp'])) ?>% of the amount paid ·
     usable from <?= $e(Money::format($rules['min_redeem_cents'], 'MUR')) ?></p>
  <form id="lookup-form" class="inline-form" novalidate>
    <div class="field grow">
      <label for="lookup-phone">Customer phone</label>
      <input type="tel" id="lookup-phone" name="phone" inputmode="tel" autocomplete="off" required autofocus>
    </div>
    <button type="submit" class="btn-primary btn-inline">Find</button>
  </form>

  <div id="not-found" hidden>
    <p>No customer with this number. <a id="create-link" href="/app.php?m=clientbloom&amp;p=customer">Create the customer</a></p>
  </div>

  <div id="checkout" hidden>
    <div class="customer-banner">
      <div><strong id="co-name"></strong> <span class="muted" id="co-phone"></span><br>
        <span class="muted small" id="co-visits"></span></div>
      <div class="balance"><span class="muted small">Cashback</span><strong id="co-balance"></strong></div>
    </div>
    <form id="checkout-form" novalidate>
      <div class="form-grid">
        <div class="field"><label for="co-amount">Purchase amount (MUR)</label>
          <input type="text" id="co-amount" name="amount" inputmode="decimal" required></div>
        <div class="field"><label for="co-redeem">Cashback to use (MUR)</label>
          <input type="text" id="co-redeem" name="redeem" inputmode="decimal" placeholder="0.00"></div>
        <div class="field"><label for="co-ref">Receipt / reference</label>
          <input type="text" id="co-ref" name="reference" maxlength="100"></div>
      </div>
      <div class="actions">
        <button type="submit" class="btn-primary btn-inline">Record sale</button>
        <a id="co-profile" class="btn-link" href="#">Customer profile</a>
      </div>
    </form>
  </div>

  <p id="co-result" class="success" role="status" hidden></p>
</section>
