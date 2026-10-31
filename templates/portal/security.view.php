<?php require __DIR__ . '/partials/header.php'; ?>

  <main class="app-main">
    <?php if (empty($user['totp_enabled_at'])): ?>
      <p class="notice" role="status"><strong>Step 1 of 2: secure your account.</strong> Two-factor authentication is required for every merchant account. Set it up below, then you will be asked to accept the terms of use.</p>
    <?php endif; ?>

    <section class="card">
      <h2>Two-factor authentication</h2>
      <p id="twofa-status" class="muted"></p>
      <p id="twofa-error" class="error" role="alert" hidden></p>

      <div id="twofa-off" hidden>
        <p>Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password&hellip;). After your password, the portal will ask for the 6-digit code it shows.</p>
        <button id="setup-btn" type="button" class="btn-primary btn-auto">Set up two-factor authentication</button>
      </div>

      <div id="twofa-setup" hidden>
        <ol class="steps">
          <li>Scan this QR code with your authenticator app.
            <div class="qr"><img id="qr-img" alt="QR code for your authenticator app"></div>
            <p class="muted">Cannot scan? Enter this key manually: <code id="secret"></code></p>
          </li>
          <li>Enter the 6-digit code the app shows.
            <form id="enable-form" class="inline-form" novalidate>
              <div class="field">
                <label for="enable-code" class="sr-only">Code</label>
                <input type="text" id="enable-code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456">
              </div>
              <button type="submit" class="btn-primary btn-auto">Confirm</button>
            </form>
          </li>
        </ol>
      </div>

      <div id="codes-box" hidden>
        <p class="notice"><strong>Save these recovery codes now.</strong> Each one works once if you lose your phone. They will not be shown again.</p>
        <pre id="codes" class="codes"></pre>
        <button id="codes-done" type="button" class="btn-primary btn-auto">I have saved them</button>
      </div>

      <div id="twofa-on" hidden>
        <form id="regen-form" class="inline-form" novalidate>
          <div class="field">
            <label for="regen-password">Password</label>
            <input type="password" id="regen-password" autocomplete="current-password">
          </div>
          <button type="submit" class="btn-secondary">New recovery codes</button>
        </form>
        <p class="muted">Lost your phone and your recovery codes? Contact MIPS: we will check your identity before resetting access.</p>
      </div>
    </section>

    <section class="card">
      <h2>Change password</h2>
      <p class="muted">Your other sessions will be signed out.</p>
      <form id="password-form" novalidate>
        <div class="field">
          <label for="current-password">Current password</label>
          <input type="password" id="current-password" autocomplete="current-password" required>
        </div>
        <div class="field">
          <label for="new-password">New password</label>
          <input type="password" id="new-password" autocomplete="new-password" required minlength="8">
        </div>
        <div class="field">
          <label for="new-password2">Confirm new password</label>
          <input type="password" id="new-password2" autocomplete="new-password" required minlength="8">
        </div>
        <button type="submit" class="btn-primary btn-auto">Change password</button>
        <p id="password-error" class="error" role="alert" hidden></p>
        <p id="password-ok" class="success-left" role="status" hidden>Password changed.</p>
      </form>
    </section>
  </main>

  <script src="/assets/vendor/qrcode-1.4.4.js"></script>
  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/portal-security.js"></script>
</body>
</html>
