<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'onboarding';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main app-wide">
    <section class="card" id="alerts-card" hidden>
      <h2>To act on</h2>
      <div id="alerts"></div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Merchant portal applications</h2>
        <form id="app-filters" class="toolbar" novalidate>
          <label for="a-status" class="sr-only">Status</label>
          <select id="a-status" name="status">
            <option value="submitted">To review</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="all">All</option>
          </select>
        </form>
      </div>
      <p class="muted">Pre-qualifications sent by prospects on the merchant portal. Accepting one creates the merchant and opens its onboarding case.</p>
      <p id="app-error" class="error" role="alert" hidden></p>
      <div id="applications"></div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Onboarding &amp; KYC cases</h2>
        <form id="filters" class="toolbar" novalidate>
          <label for="f-status" class="sr-only">Status</label>
          <select id="f-status" name="status">
            <option value="open">Open cases</option>
            <option value="under_review">Under review</option>
            <option value="collecting">Collecting documents</option>
            <option value="on_hold">On hold</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
          <label for="f-q" class="sr-only">Search</label>
          <input type="text" id="f-q" name="q" placeholder="Merchant">
          <button type="submit" class="btn-secondary">Search</button>
        </form>
      </div>
      <p class="muted">Start a case from the merchant record (Merchants &rarr; merchant &rarr; Start onboarding).</p>
      <p id="list-error" class="error" role="alert" hidden></p>
      <div id="cases"></div>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/onboarding.js"></script>
</body>
</html>
