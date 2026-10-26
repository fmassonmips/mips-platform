<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'merchants';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main app-wide" id="merchant-page" data-id="<?= (int) ($_GET['id'] ?? 0) ?>">
    <p><a href="/merchants.php">&larr; All merchants</a></p>
    <p id="page-error" class="error" role="alert" hidden></p>

    <section class="card">
      <div class="card-head">
        <h2 id="m-title">Merchant</h2>
        <span id="m-status" class="badge"></span>
      </div>
      <form id="profile-form" class="grid-form" novalidate>
        <div class="field">
          <label for="p-name">Name <span class="muted">(import key)</span></label>
          <input type="text" id="p-name" name="name" required>
        </div>
        <div class="field">
          <label for="p-legal">Legal name</label>
          <input type="text" id="p-legal" name="legal_name">
        </div>
        <div class="field">
          <label for="p-status">Status</label>
          <select id="p-status" name="status"></select>
        </div>
        <div class="field">
          <label for="p-brn">BRN</label>
          <input type="text" id="p-brn" name="brn">
        </div>
        <div class="field">
          <label for="p-vat">VAT number</label>
          <input type="text" id="p-vat" name="vat_number">
        </div>
        <div class="field">
          <label for="p-sector">Sector</label>
          <input type="text" id="p-sector" name="sector">
        </div>
        <div class="field">
          <label for="p-manager">Account manager</label>
          <select id="p-manager" name="account_manager_id"><option value="">None</option></select>
        </div>
        <div class="field">
          <label for="p-billing">Billing email</label>
          <input type="email" id="p-billing" name="billing_email">
        </div>
        <div class="field field-check">
          <label><input type="checkbox" id="p-billable" name="is_billable" value="1"> Billable (gets commission invoices)</label>
        </div>
        <div class="field field-wide">
          <label for="p-address">Address</label>
          <textarea id="p-address" name="address" rows="2"></textarea>
        </div>
        <div class="field field-wide">
          <label for="p-notes">Notes</label>
          <textarea id="p-notes" name="notes" rows="3"></textarea>
        </div>
        <div class="field field-submit">
          <button type="submit" class="btn-primary btn-auto">Save</button>
          <span id="profile-msg" class="success-left" role="status" hidden>Saved.</span>
        </div>
      </form>
      <p id="profile-error" class="error" role="alert" hidden></p>
    </section>

    <section class="card">
      <h2>Contracts</h2>
      <div id="contracts"></div>
      <button type="button" id="contract-new" class="btn-secondary">Add contract</button>
      <form id="contract-form" class="grid-form panel" novalidate hidden>
        <input type="hidden" name="id" id="c-id">
        <div class="field">
          <label for="c-ref">Reference</label>
          <input type="text" id="c-ref" name="reference">
        </div>
        <div class="field">
          <label for="c-type">Type</label>
          <select id="c-type" name="type"></select>
        </div>
        <div class="field">
          <label for="c-status">Status</label>
          <select id="c-status" name="status"></select>
        </div>
        <div class="field">
          <label for="c-signed">Signed on</label>
          <input type="date" id="c-signed" name="signed_at">
        </div>
        <div class="field">
          <label for="c-start">Start</label>
          <input type="date" id="c-start" name="start_date">
        </div>
        <div class="field">
          <label for="c-end">End <span class="muted">(empty = open-ended)</span></label>
          <input type="date" id="c-end" name="end_date">
        </div>
        <div class="field">
          <label for="c-notice">Notice period (days)</label>
          <input type="text" id="c-notice" name="notice_days" inputmode="numeric">
        </div>
        <div class="field field-check">
          <label><input type="checkbox" id="c-renew" name="auto_renew" value="1"> Auto-renews</label>
        </div>
        <div class="field">
          <label for="c-doc">Signed PDF</label>
          <input type="file" id="c-doc" name="document" accept="application/pdf,.pdf">
        </div>
        <div class="field field-wide">
          <label for="c-notes">Notes</label>
          <textarea id="c-notes" name="notes" rows="2"></textarea>
        </div>
        <div class="field field-submit">
          <button type="submit" class="btn-primary btn-auto">Save contract</button>
          <button type="button" id="contract-cancel" class="btn-secondary">Cancel</button>
        </div>
      </form>
      <p id="contract-error" class="error" role="alert" hidden></p>
    </section>

    <section class="card">
      <h2>Contacts</h2>
      <div id="contacts"></div>
      <button type="button" id="contact-new" class="btn-secondary">Add contact</button>
      <form id="contact-form" class="grid-form panel" novalidate hidden>
        <input type="hidden" name="id" id="ct-id">
        <div class="field">
          <label for="ct-name">Name</label>
          <input type="text" id="ct-name" name="name" required>
        </div>
        <div class="field">
          <label for="ct-title">Job title</label>
          <input type="text" id="ct-title" name="job_title">
        </div>
        <div class="field">
          <label for="ct-email">Email</label>
          <input type="email" id="ct-email" name="email">
        </div>
        <div class="field">
          <label for="ct-phone">Phone</label>
          <input type="text" id="ct-phone" name="phone">
        </div>
        <div class="field field-check">
          <label><input type="checkbox" id="ct-primary" name="is_primary" value="1"> Primary contact</label>
          <label><input type="checkbox" id="ct-billing" name="is_billing" value="1"> Billing contact</label>
        </div>
        <div class="field field-wide">
          <label for="ct-notes">Notes</label>
          <input type="text" id="ct-notes" name="notes">
        </div>
        <div class="field field-submit">
          <button type="submit" class="btn-primary btn-auto">Save contact</button>
          <button type="button" id="contact-cancel" class="btn-secondary">Cancel</button>
        </div>
      </form>
      <p id="contact-error" class="error" role="alert" hidden></p>
    </section>

    <section class="card">
      <h2>Identifiers</h2>
      <p class="muted">MIDs, QR TUIs and outlet numbers used by the banks. Each identifier belongs to one merchant only.</p>
      <div id="identifiers"></div>
      <form id="identifier-form" class="inline-form" novalidate>
        <div class="field">
          <label for="i-type">Type</label>
          <select id="i-type" name="type"></select>
        </div>
        <div class="field">
          <label for="i-value">Value</label>
          <input type="text" id="i-value" name="value" required>
        </div>
        <div class="field">
          <label for="i-label">Label <span class="muted">(optional)</span></label>
          <input type="text" id="i-label" name="label" placeholder="e.g. MCB ecom, old MID">
        </div>
        <button type="submit" class="btn-secondary">Add</button>
      </form>
      <p id="identifier-error" class="error" role="alert" hidden></p>
    </section>

    <section class="card">
      <h2>Activity</h2>
      <div class="two-col">
        <div>
          <h3>Monthly volumes</h3>
          <div id="volumes"></div>
        </div>
        <div>
          <h3>Invoices</h3>
          <div id="invoices"></div>
          <h3>Specific fee rules</h3>
          <div id="fee-rules"></div>
        </div>
      </div>
      <h3>History</h3>
      <div id="history"></div>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/merchant.js"></script>
</body>
</html>
