<?php
/**
 * The signed-in user's own security settings.
 *
 *   GET  /api/account/status
 *   POST /api/account/password         { current_password, new_password }
 *   POST /api/account/2fa-setup        -> { secret, uri }   (kept in session until confirmed)
 *   POST /api/account/2fa-enable       { code } -> { recovery_codes }
 *   POST /api/account/2fa-disable      { password, code }   (refused when the role requires 2FA)
 *   POST /api/account/recovery-codes   { password } -> { recovery_codes }
 *
 * Sensitive changes require the current password (and a code to disable
 * 2FA) so that an unattended open session is not enough.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Auth;
use App\Crypto;
use App\Database;
use App\Passwords;
use App\Request;
use App\Response;
use App\Session;
use App\Totp;
use App\TwoFactor;
use App\Validator;

final class AccountController
{
    public function status(): void
    {
        Request::require_method('GET');
        $user = Auth::require_auth();

        Response::json([
            'email'               => $user['email'],
            'two_factor_enabled'  => TwoFactor::isEnabled($user),
            'two_factor_required' => TwoFactor::isRequired($user),
            'recovery_codes_left' => TwoFactor::isEnabled($user) ? TwoFactor::recoveryCodesLeft((int) $user['id']) : 0,
            'app_key_configured'  => Crypto::configured(),
        ]);
    }

    public function password(): void
    {
        Request::require_method('POST');
        $user = Auth::require_auth();
        Request::require_csrf();

        $d       = Request::body();
        $current = is_string($d['current_password'] ?? null) ? (string) $d['current_password'] : '';
        $new     = is_string($d['new_password'] ?? null) ? (string) $d['new_password'] : '';

        if (!$this->checkPassword((int) $user['id'], $current)) {
            Audit::log('account.password_change_failed', 'user', (int) $user['id']);
            Response::json(['error' => 'Current password is incorrect.'], 422);
        }
        $err = Validator::password($new, (int) ($GLOBALS['config']['security']['password_min_length'] ?? 8));
        if ($err !== null) {
            Response::json(['error' => $err], 422);
        }
        if ($new === $current) {
            Response::json(['error' => 'The new password must be different.'], 422);
        }

        $changedAt = Passwords::set((int) $user['id'], $new);
        // Keep this session; every other session of the user is signed out.
        Session::regenerate();
        $_SESSION['pwd_at'] = $changedAt;
        Audit::log('account.password_change', 'user', (int) $user['id']);
        Response::json(['success' => true]);
    }

    public function setup(): void
    {
        Request::require_method('POST');
        $user = Auth::require_auth();
        Request::require_csrf();

        if (TwoFactor::isEnabled($user)) {
            Response::json(['error' => 'Two-factor authentication is already enabled.'], 409);
        }
        if (!Crypto::configured()) {
            error_log('[2FA] security.app_key is not configured');
            Response::json(['error' => 'Two-factor authentication is not available yet: the server key is not configured. Contact an administrator.'], 503);
        }

        $secret = Totp::newSecret();
        $_SESSION['totp_setup'] = ['secret' => $secret, 'at' => time()];
        Response::json(['secret' => $secret, 'uri' => Totp::uri($secret, (string) $user['email'])]);
    }

    public function enable(): void
    {
        Request::require_method('POST');
        $user = Auth::require_auth();
        Request::require_csrf();

        $setup = $_SESSION['totp_setup'] ?? null;
        if (!is_array($setup) || time() - (int) $setup['at'] > 900) {
            Response::json(['error' => 'Setup expired. Start again.'], 409);
        }
        $code = is_string(Request::body()['code'] ?? null) ? (string) Request::body()['code'] : '';
        $step = Totp::match((string) $setup['secret'], $code);
        if ($step === null) {
            Response::json(['error' => 'Invalid code. Check the time on your phone and try the next code.'], 422);
        }

        $codes = TwoFactor::enable((int) $user['id'], (string) $setup['secret'], $step);
        unset($_SESSION['totp_setup']);
        Audit::log('account.2fa_enable', 'user', (int) $user['id']);
        Response::json(['success' => true, 'recovery_codes' => $codes]);
    }

    public function disable(): void
    {
        Request::require_method('POST');
        $user = Auth::require_auth();
        Request::require_csrf();

        if (TwoFactor::isRequired($user)) {
            Response::json(['error' => 'Your role requires two-factor authentication.'], 409);
        }
        $d = Request::body();
        if (!$this->checkPassword((int) $user['id'], (string) ($d['password'] ?? ''))
            || TwoFactor::verify((int) $user['id'], (string) ($d['code'] ?? '')) === null) {
            Audit::log('account.2fa_disable_failed', 'user', (int) $user['id']);
            Response::json(['error' => 'Password or code is incorrect.'], 422);
        }

        TwoFactor::disable((int) $user['id']);
        Audit::log('account.2fa_disable', 'user', (int) $user['id']);
        Response::json(['success' => true]);
    }

    public function recoveryCodes(): void
    {
        Request::require_method('POST');
        $user = Auth::require_auth();
        Request::require_csrf();

        if (!TwoFactor::isEnabled($user)) {
            Response::json(['error' => 'Two-factor authentication is not enabled.'], 409);
        }
        if (!$this->checkPassword((int) $user['id'], (string) (Request::body()['password'] ?? ''))) {
            Response::json(['error' => 'Password is incorrect.'], 422);
        }

        $codes = TwoFactor::replaceRecoveryCodes((int) $user['id']);
        Audit::log('account.recovery_codes_regenerate', 'user', (int) $user['id']);
        Response::json(['success' => true, 'recovery_codes' => $codes]);
    }

    private function checkPassword(int $userId, string $password): bool
    {
        $stmt = Database::connection()->prepare('SELECT password_hash FROM users WHERE id = :id');
        $stmt->execute([':id' => $userId]);
        $hash = $stmt->fetchColumn();
        return is_string($hash) && $password !== '' && password_verify($password, $hash);
    }
}
