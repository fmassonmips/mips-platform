<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'account';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main">
    <?php if (\App\TwoFactor::isRequired($user) && !\App\TwoFactor::isEnabled($user)): ?>
      <p class="notice" role="status">Your role requires two-factor authentication. Set it up below to access the modules.</p>
    <?php endif; ?>

    <section class="card">
      <h2>Two-factor authentication</h2>
      <p id="twofa-status" class="muted"></p>
      <p id="twofa-error" class="error" role="alert" hidden></p>

      <div id="twofa-off" hidden>
        <p>Use an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password&hellip;). After your password, it asks for a 6-digit code that changes every 30 seconds.</p>
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
        <button id="codes-done" type="button" class="btn-secondary">I have saved them</button>
      </div>

      <div id="twofa-on" hidden>
        <form id="regen-form" class="inline-form" novalidate>
          <div class="field">
            <label for="regen-password">Password</label>
            <input type="password" id="regen-password" autocomplete="current-password">
          </div>
          <button type="submit" class="btn-secondary">New recovery codes</button>
        </form>
        <form id="disable-form" class="inline-form" novalidate hidden>
          <div class="field">
            <label for="disable-password">Password</label>
            <input type="password" id="disable-password" autocomplete="current-password">
          </div>
          <div class="field">
            <label for="disable-code">Code</label>
            <input type="text" id="disable-code" inputmode="numeric" autocomplete="one-time-code">
          </div>
          <button type="submit" class="btn-secondary">Turn off</button>
        </form>
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
  <script src="/assets/js/account.js"></script>
</body>
</html>
