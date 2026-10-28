<?php require __DIR__ . '/partials/header.php'; ?>

  <main class="app-main app-wide">
    <p id="page-error" class="error error-pre" role="alert" hidden></p>
    <section class="card" id="no-case" hidden>
      <h2>Documents</h2>
      <p id="no-case-text"></p>
    </section>

    <div id="case-area" hidden>
      <section class="card">
        <div class="card-head">
          <h2>Send your file to MIPS</h2>
          <span id="file-status" class="badge"></span>
        </div>
        <div id="missing"></div>
        <button type="button" id="submit-btn" class="btn-primary btn-auto" hidden>My file is complete: send it to MIPS</button>
      </section>

      <section class="card">
        <h2>Directors, beneficial owners and signatories</h2>
        <p id="party-intro" class="muted"></p>
        <div id="parties"></div>
        <button type="button" id="party-new" class="btn-secondary">Add a person</button>
        <form id="party-form" class="grid-form panel" novalidate hidden>
          <input type="hidden" id="pt-id" name="id">
          <div class="field"><label for="pt-name">Full name (as on the ID) *</label><input type="text" id="pt-name" name="full_name" maxlength="160" required></div>
          <div class="field field-check">
            <span class="label">Roles *</span>
            <label><input type="checkbox" name="roles" value="director"> Director</label>
            <label><input type="checkbox" name="roles" value="ubo"> Beneficial owner</label>
            <label><input type="checkbox" name="roles" value="signatory"> Authorised signatory</label>
            <label><input type="checkbox" name="roles" value="shareholder"> Shareholder</label>
          </div>
          <div class="field"><label for="pt-pct">Ownership %</label><input type="text" id="pt-pct" name="ownership_pct" inputmode="decimal"></div>
          <div class="field"><label for="pt-nat">Nationality *</label><input type="text" id="pt-nat" name="nationality" maxlength="60" required></div>
          <div class="field"><label for="pt-dob">Date of birth *</label><input type="date" id="pt-dob" name="date_of_birth" required></div>
          <div class="field field-check field-wide">
            <label><input type="checkbox" id="pt-pep" name="is_pep" value="1"> This person holds, or held in the last years, a prominent public function (or is a close relative or associate of such a person).</label>
          </div>
          <div class="field field-submit">
            <button type="submit" class="btn-primary btn-auto">Save</button>
            <button type="button" id="party-cancel" class="btn-secondary">Cancel</button>
          </div>
        </form>
        <p id="party-error" class="error" role="alert" hidden></p>
      </section>

      <section class="card">
        <h2>Documents</h2>
        <p class="muted">Formats: PDF, JPEG or PNG, up to 20 MB each. Upload clear, complete and readable copies. Never send identity documents by email.</p>
        <div id="checklist"></div>
        <p id="doc-error" class="error" role="alert" hidden></p>
      </section>
    </div>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/portal-documents.js"></script>
</body>
</html>
