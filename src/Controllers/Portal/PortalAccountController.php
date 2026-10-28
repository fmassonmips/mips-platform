<?php
/**
 * Merchant portal: the merchant's own account (two-factor, password) and
 * the terms of use.
 *
 *   GET  /api/portal/account          account and gate status
 *   GET  /api/portal/terms            current terms of use
 *   POST /api/portal/terms-accept     { version_id, sha256 }
 *   POST /api/portal/2fa-setup        -> { secret, uri }
 *   POST /api/portal/2fa-enable       { code } -> { recovery_codes }
 *   POST /api/portal/recovery-codes   { password } -> { recovery_codes }
 *   POST /api/portal/password         { current_password, new_password }
 *
 * Two-factor authentication cannot be turned off by the merchant.
 */
declare(strict_types=1);

namespace App\Controllers\Portal;

use App\Audit;
use App\Crypto;
use App\Database;
use App\Portal\PortalAuth;
use App\Portal\PortalTwoFactor;
use App\Portal\Terms;
use App\Request;
use App\Response;
use App\Session;
use App\Totp;
use App\Validator;

final class PortalAccountController
{
    public function status(): void
    {
        Request::require_method('GET');
        $user  = PortalAuth::requireUser();
        $terms = Terms::current();
        Response::json([
            'email'               => $user['email'],
            'name'                => $user['name'],
            'two_factor_enabled'  => !empty($user['totp_enabled_at']),
            'recovery_codes_left' => !empty($user['totp_enabled_at']) ? PortalTwoFactor::recoveryCodesLeft((int) $user['id']) : 0,
            'terms_accepted'      => $terms !== null && Terms::hasAccepted((int) $user['id'], (int) $terms['id']),
        ]);
    }

    public function terms(): void
    {
        Request::require_method('GET');
        $user  = PortalAuth::requireUser();
        $terms = Terms::current();
        if ($terms === null) {
            Response::json(['terms' => null]);
        }
        $acc = Database::connection()->prepare('SELECT accepted_at FROM terms_acceptances WHERE portal_user_id = :u AND terms_version_id = :v');
        $acc->execute([':u' => (int) $user['id'], ':v' => (int) $terms['id']]);
        $prev = Database::connection()->prepare('SELECT COUNT(*) FROM terms_acceptances WHERE portal_user_id = :u');
        $prev->execute([':u' => (int) $user['id']]);
        Response::json([
            'terms' => [
                'id' => (int) $terms['id'], 'version' => $terms['version'], 'title' => $terms['title'], 'body' => $terms['body'],
                'sha256' => $terms['body_sha256'], 'published_at' => $terms['published_at'],
            ],
            'accepted_at'       => $acc->fetchColumn() ?: null,
            'accepted_previous' => (int) $prev->fetchColumn() > 0,
            'two_factor_enabled' => !empty($user['totp_enabled_at']),
        ]);
    }

    public function acceptTerms(): void
    {
        Request::require_method('POST');
        $user = PortalAuth::requireUser();
        Request::require_csrf();
        if (empty($user['totp_enabled_at'])) {
            Response::json(['error' => 'Set up two-factor authentication first.', 'redirect' => '/portal/security.php?enroll=1'], 403);
        }
        $d = Request::body();
        if (empty($d['agree'])) {
            Response::json(['error' => 'Tick the box to confirm you have read and accept the terms.'], 422);
        }
        try {
            Terms::accept((int) $user['id'], (int) ($d['version_id'] ?? 0), (string) ($d['sha256'] ?? ''), Request::ip(), (string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
        } catch (\RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 409);
        }
        Audit::log('portal.terms_accept', 'portal_user', (int) $user['id'],
            ['terms_version_id' => (int) $d['version_id'], 'sha256' => (string) $d['sha256']], PortalAuth::actor($user));
        Response::json(['success' => true]);
    }

    public function setup(): void
    {
        Request::require_method('POST');
        $user = PortalAuth::requireUser();
        Request::require_csrf();
        if (!empty($user['totp_enabled_at'])) {
            Response::json(['error' => 'Two-factor authentication is already enabled.'], 409);
        }
        if (!Crypto::configured()) {
            error_log('[portal 2FA] security.app_key is not configured');
            Response::json(['error' => 'Two-factor authentication is not available yet. Please try again later.'], 503);
        }
        $secret = Totp::newSecret();
        $_SESSION['portal_totp_setup'] = ['secret' => $secret, 'at' => time()];
        $uri = str_replace(rawurlencode((string) ($GLOBALS['config']['security']['totp_issuer'] ?? 'MIPS Dashboard')), rawurlencode('MIPS merchant portal'),
            Totp::uri($secret, (string) $user['email']));
        Response::json(['secret' => $secret, 'uri' => $uri]);
    }

    public function enable(): void
    {
        Request::require_method('POST');
        $user = PortalAuth::requireUser();
        Request::require_csrf();
        $setup = $_SESSION['portal_totp_setup'] ?? null;
        if (!is_array($setup) || time() - (int) $setup['at'] > 900) {
            Response::json(['error' => 'Setup expired. Start again.'], 409);
        }
        $step = Totp::match((string) $setup['secret'], (string) (Request::body()['code'] ?? ''));
        if ($step === null) {
            Response::json(['error' => 'Invalid code. Check the time on your phone and try the next code.'], 422);
        }
        $codes = PortalTwoFactor::enable((int) $user['id'], (string) $setup['secret'], $step);
        unset($_SESSION['portal_totp_setup']);
        Audit::log('portal.2fa_enable', 'portal_user', (int) $user['id'], [], PortalAuth::actor($user));
        Response::json(['success' => true, 'recovery_codes' => $codes]);
    }

    public function recoveryCodes(): void
    {
        Request::require_method('POST');
        $user = PortalAuth::requireUser();
        Request::require_csrf();
        if (empty($user['totp_enabled_at'])) {
            Response::json(['error' => 'Two-factor authentication is not enabled.'], 409);
        }
        if (!$this->checkPassword((int) $user['id'], (string) (Request::body()['password'] ?? ''))) {
            Response::json(['error' => 'Password is incorrect.'], 422);
        }
        $codes = PortalTwoFactor::replaceRecoveryCodes((int) $user['id']);
        Audit::log('portal.recovery_codes_regenerate', 'portal_user', (int) $user['id'], [], PortalAuth::actor($user));
        Response::json(['success' => true, 'recovery_codes' => $codes]);
    }

    public function password(): void
    {
        Request::require_method('POST');
        $user = PortalAuth::requireUser();
        Request::require_csrf();
        $d       = Request::body();
        $current = is_string($d['current_password'] ?? null) ? (string) $d['current_password'] : '';
        $new     = is_string($d['new_password'] ?? null) ? (string) $d['new_password'] : '';
        if (!$this->checkPassword((int) $user['id'], $current)) {
            Response::json(['error' => 'Current password is incorrect.'], 422);
        }
        $err = Validator::password($new, (int) ($GLOBALS['config']['security']['password_min_length'] ?? 8));
        if ($err !== null || $new === $current) {
            Response::json(['error' => $err ?? 'The new password must be different.'], 422);
        }
        $db = Database::connection();
        $db->prepare('UPDATE portal_users SET password_hash = :h, password_changed_at = NOW() WHERE id = :id')
            ->execute([':h' => password_hash($new, PASSWORD_DEFAULT), ':id' => (int) $user['id']]);
        $at = $db->prepare('SELECT password_changed_at FROM portal_users WHERE id = :id');
        $at->execute([':id' => (int) $user['id']]);
        // Keep this session; every other session of the account ends.
        Session::regenerate();
        $_SESSION['portal_pwd_at'] = (string) $at->fetchColumn();
        Audit::log('portal.password_change', 'portal_user', (int) $user['id'], [], PortalAuth::actor($user));
        Response::json(['success' => true]);
    }

    private function checkPassword(int $userId, string $password): bool
    {
        $stmt = Database::connection()->prepare('SELECT password_hash FROM portal_users WHERE id = :id');
        $stmt->execute([':id' => $userId]);
        $hash = $stmt->fetchColumn();
        return is_string($hash) && $password !== '' && password_verify($password, $hash);
    }
}
