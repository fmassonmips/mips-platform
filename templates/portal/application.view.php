<?php require __DIR__ . '/partials/header.php'; ?>

  <main class="app-main app-wide">
    <section class="card">
      <h2>Pre-qualification</h2>
      <p id="app-error" class="error error-pre" role="alert" hidden></p>
      <div id="app-summary" hidden></div>

      <form id="app-form" class="grid-form grid-form-roomy" novalidate hidden>
        <p class="muted field-wide">Tell us about your business. MIPS reviews this first; if it can go further, you will be asked for the company and identity documents. Fields marked * are required.</p>

        <h3 class="field-wide">Company</h3>
        <div class="field"><label for="a-legal">Legal name *</label><input type="text" id="a-legal" name="legal_name" maxlength="255" required></div>
        <div class="field"><label for="a-trading">Trading name *</label><input type="text" id="a-trading" name="trading_name" maxlength="255" required></div>
        <div class="field"><label for="a-brn">BRN *</label><input type="text" id="a-brn" name="brn" maxlength="32" required></div>
        <div class="field"><label for="a-vat">VAT number</label><input type="text" id="a-vat" name="vat_number" maxlength="32"></div>
        <div class="field"><label for="a-coi">Country of incorporation *</label><input type="text" id="a-coi" name="country_of_incorporation" maxlength="60" required></div>
        <div class="field field-wide"><label for="a-addr">Registered address *</label><textarea id="a-addr" name="registered_address" rows="2" maxlength="1000" required></textarea></div>

        <h3 class="field-wide">Activity</h3>
        <div class="field"><label for="a-sector">Business sector *</label><select id="a-sector" name="sector" required></select></div>
        <div class="field"><label for="a-web">Website</label><input type="url" id="a-web" name="website" maxlength="255" placeholder="https://"></div>
        <div class="field"><label for="a-coo">Countries where you sell *</label><input type="text" id="a-coo" name="countries_of_operation" maxlength="255" required></div>
        <div class="field field-wide"><label for="a-ps">Products and services sold *</label><textarea id="a-ps" name="products_services" rows="2" maxlength="2000" required></textarea></div>

        <h3 class="field-wide">Payments</h3>
        <div class="field field-check field-wide" id="a-methods"><span class="label">Payment methods wanted *</span></div>
        <div class="field"><label for="a-band">Expected monthly volume *</label><select id="a-band" name="monthly_volume_band" required></select></div>
        <div class="field"><label for="a-ticket">Average ticket (MUR) *</label><input type="text" id="a-ticket" name="average_ticket_mur" inputmode="decimal" required></div>

        <h3 class="field-wide">Regulation</h3>
        <div class="field field-check"><label><input type="checkbox" id="a-reg" name="is_regulated" value="1"> The business holds a licence from a regulator</label></div>
        <div class="field"><label for="a-regulator">Regulator</label><input type="text" id="a-regulator" name="regulator" maxlength="120" placeholder="e.g. FSC, Bank of Mauritius"></div>

        <h3 class="field-wide">Contact</h3>
        <div class="field"><label for="a-cname">Contact name *</label><input type="text" id="a-cname" name="contact_name" maxlength="120" required></div>
        <div class="field"><label for="a-crole">Position</label><input type="text" id="a-crole" name="contact_role" maxlength="120"></div>
        <div class="field"><label for="a-cphone">Phone *</label><input type="tel" id="a-cphone" name="contact_phone" maxlength="40" required></div>

        <div class="field field-check field-wide">
          <label><input type="checkbox" id="a-decl" name="declaration" value="1"> I confirm that this information is true and complete, and that I am authorised to apply on behalf of the business. *</label>
        </div>
        <div class="field field-submit">
          <button type="submit" class="btn-primary btn-auto">Send to MIPS</button>
        </div>
      </form>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/portal-application.js"></script>
</body>
</html>
