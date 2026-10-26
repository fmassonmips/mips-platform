<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'onboarding';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main app-wide" id="case-page" data-id="<?= (int) ($_GET['id'] ?? 0) ?>">
    <p><a href="/onboarding.php">&larr; All cases</a></p>
    <p id="page-error" class="error error-pre" role="alert" hidden></p>

    <section class="card">
      <div class="card-head">
        <h2 id="case-title">Onboarding case</h2>
        <span id="case-status" class="badge"></span>
      </div>
      <p id="case-meta" class="muted"></p>
      <form id="case-form" class="grid-form" novalidate>
        <div class="field">
          <label for="k-risk">Risk rating</label>
          <select id="k-risk" name="risk_rating">
            <option value="">Not set</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </div>
        <div class="field">
          <label for="k-analyst">Analyst</label>
          <select id="k-analyst" name="assigned_to"><option value="">Unassigned</option></select>
        </div>
        <div class="field">
          <label for="k-due">Due date</label>
          <input type="date" id="k-due" name="due_date">
        </div>
        <div class="field field-wide">
          <label for="k-notes">Analyst notes</label>
          <textarea id="k-notes" name="notes" rows="2"></textarea>
        </div>
        <div class="field field-submit">
          <button type="submit" class="btn-secondary">Save</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Decision</h2>
      <div id="blockers"></div>
      <div id="decision"></div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Documents</h2>
        <div class="toolbar">
          <button id="remind-btn" type="button" class="btn-secondary">Email the merchant what is missing</button>
        </div>
      </div>
      <p id="remind-info" class="muted"></p>
      <p class="muted">Formats: PDF, JPEG, PNG. A document is accepted or rejected by someone other than the person who uploaded it.</p>
      <div id="checklist"></div>
      <p id="doc-error" class="error" role="alert" hidden></p>
    </section>

    <section class="card">
      <h2>Directors, beneficial owners and signatories</h2>
      <p id="party-intro" class="muted"></p>
      <div id="parties"></div>
      <button type="button" id="party-new" class="btn-secondary">Add a person</button>
      <form id="party-form" class="grid-form panel" novalidate hidden>
        <input type="hidden" id="pt-id" name="id">
        <div class="field">
          <label for="pt-name">Full name</label>
          <input type="text" id="pt-name" name="full_name" required>
        </div>
        <div class="field field-check">
          <span class="label">Roles</span>
          <label><input type="checkbox" name="roles" value="director"> Director</label>
          <label><input type="checkbox" name="roles" value="ubo"> Beneficial owner</label>
          <label><input type="checkbox" name="roles" value="signatory"> Authorised signatory</label>
          <label><input type="checkbox" name="roles" value="shareholder"> Shareholder</label>
        </div>
        <div class="field">
          <label for="pt-pct">Ownership %</label>
          <input type="text" id="pt-pct" name="ownership_pct" inputmode="decimal">
        </div>
        <div class="field">
          <label for="pt-nat">Nationality</label>
          <input type="text" id="pt-nat" name="nationality">
        </div>
        <div class="field">
          <label for="pt-dob">Date of birth</label>
          <input type="date" id="pt-dob" name="date_of_birth">
        </div>
        <div class="field">
          <label for="pt-idno">ID / passport number <span class="muted">(encrypted)</span></label>
          <input type="text" id="pt-idno" name="id_number" autocomplete="off" placeholder="Leave empty to keep the stored one">
        </div>
        <div class="field field-check">
          <label><input type="checkbox" id="pt-pep" name="is_pep" value="1"> Politically exposed person (PEP)</label>
        </div>
        <div class="field">
          <label for="pt-scr">Sanctions / PEP screening</label>
          <select id="pt-scr" name="screening_result">
            <option value="pending">Not done</option><option value="clear">Clear</option><option value="match">Match</option>
          </select>
        </div>
        <div class="field">
          <label for="pt-ref">Screening reference</label>
          <input type="text" id="pt-ref" name="screening_reference" placeholder="Tool and case number">
        </div>
        <div class="field field-wide">
          <label for="pt-notes">Notes</label>
          <input type="text" id="pt-notes" name="notes">
        </div>
        <div class="field field-submit">
          <button type="submit" class="btn-primary btn-auto">Save</button>
          <button type="button" id="party-cancel" class="btn-secondary">Cancel</button>
        </div>
      </form>
      <p id="party-error" class="error" role="alert" hidden></p>
    </section>

    <section class="card">
      <h2>History</h2>
      <div class="two-col">
        <div><h3>Reminders sent</h3><div id="reminders"></div></div>
        <div><h3>Case activity</h3><div id="history"></div></div>
      </div>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/onboarding-case.js"></script>
</body>
</html>
