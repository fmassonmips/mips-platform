<?php
/**
 * Merchant portal: account creation and sign-in.
 *
 *   POST /api/portal/register   { name, email, password, phone }   -> always the same answer (no account enumeration)
 *   POST /api/portal/verify     { token }                           email confirmation link
 *   POST /api/portal/login      { email, password }                 -> { success } | { two_factor_required }
 *   POST /api/portal/2fa        { code }
 *   POST /api/portal/logout
 *   POST /api/portal/forgot     { email }                           -> always the same answer
 *   POST /api/portal/reset      { token, password }
 */
declare(strict_types=1);

namespace App\Controllers\Portal;

use App\Audit;
use App\Database;
use App\Mailer;
use App\Portal\PortalAuth;
use App\Portal\PortalTokens;
use App\Portal\PortalTwoFactor;
use App\RateLimiter;
use App\Request;
use App\Response;
use App\Session;
use App\Validator;

final class PortalAuthController
{
    private const PENDING_TTL = 300;

    public function register(): void
    {
        Request::require_method('POST');
        Request::require_csrf();

        $cfg   = $GLOBALS['config']['portal'] ?? [];
        $ip    = Request::ip();
        $quota = 'portal-register:' . $ip;
        if (RateLimiter::countKey($quota, 3600) >= (int) ($cfg['registrations_per_hour'] ?? 5)) {
            Response::json(['error' => 'Too many registrations from this network. Please try again later.'], 429);
        }

        $d     = Request::body();
        $name  = is_string($d['name'] ?? null) ? trim($d['name']) : '';
        $email = is_string($d['email'] ?? null) ? mb_strtolower(trim($d['email'])) : '';
        $pass  = is_string($d['password'] ?? null) ? (string) $d['password'] : '';
        $phone = is_string($d['phone'] ?? null) ? mb_substr(trim($d['phone']), 0, 40) : '';
        $err   = Validator::name($name) ?? Validator::email($email)
            ?? Validator::password($pass, (int) ($GLOBALS['config']['security']['password_min_length'] ?? 8));
        if ($err !== null) {
            Response::json(['error' => $err], 422);
        }
        RateLimiter::hit($ip, $quota);

        $db   = Database::connection();
        $stmt = $db->prepare('SELECT id, name, email_verified_at FROM portal_users WHERE email = :e');
        $stmt->execute([':e' => $email]);
        $existing = $stmt->fetch();

        if (is_array($existing) && $existing['email_verified_at'] !== null) {
            // Same answer as a new account; the owner is told by email.
            Mailer::send($email, 'MIPS merchant portal: you already have an account',
                "Hello,\n\nSomeone (maybe you) tried to create a MIPS merchant portal account with this address, which already has one.\n\n"
                . 'Sign in: ' . rtrim((string) $GLOBALS['config']['app']['url'], '/') . "/portal/login.php\n"
                . 'Forgot your password? ' . rtrim((string) $GLOBALS['config']['app']['url'], '/') . "/portal/forgot.php\n\n"
                . "If this was not you, you can ignore this email.\n\nMIPS\n");
        } else {
            if (is_array($existing)) {
                // Not confirmed yet: only send a new link. The password is never
                // replaced here, so a third party cannot pre-set it before the
                // inbox owner confirms (account pre-hijacking).
                $userId = (int) $existing['id'];
                $name   = (string) $existing['name'];
            } else {
                $db->prepare('INSERT INTO portal_users (email, password_hash, name, phone) VALUES (:e, :h, :n, :p)')
                    ->execute([':e' => $email, ':h' => password_hash($pass, PASSWORD_DEFAULT), ':n' => $name, ':p' => $phone ?: null]);
                $userId = (int) $db->lastInsertId();
                Audit::log('portal.register', 'portal_user', $userId, [], ['id' => null, 'email' => 'portal:' . $email]);
            }
            $token = PortalTokens::create($userId, 'verify', 60 * (int) ($GLOBALS['config']['portal']['verify_link_hours'] ?? 48));
            Mailer::send($email, 'MIPS merchant portal: confirm your email address',
                "Hello $name,\n\nConfirm your email address to activate your MIPS merchant portal account:\n\n"
                . PortalTokens::url('verify.php', $token) . "\n\nThe link is valid for "
                . (int) ($GLOBALS['config']['portal']['verify_link_hours'] ?? 48) . " hours.\n"
                . "If you did not ask for an account, ignore this email.\n\nMIPS\n");
        }

        Response::json(['success' => true, 'message' => 'Check your inbox: we have sent you a link to confirm your email address.']);
    }

    public function verify(): void
    {
        Request::require_method('POST');
        Request::require_csrf();

        $userId = PortalTokens::consume((string) (Request::body()['token'] ?? ''), 'verify');
        if ($userId === null) {
            Response::json(['error' => 'This link is invalid, expired or already used. Sign in, or register again to get a new link.'], 410);
        }
        Database::connection()->prepare('UPDATE portal_users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = :id')
            ->execute([':id' => $userId]);
        Audit::log('portal.email_verified', 'portal_user', $userId, [], $this->actorFor($userId));
        Response::json(['success' => true]);
    }

    public function login(): void
    {
        Request::require_method('POST');
        Request::require_csrf();

        $d     = Request::body();
        $email = is_string($d['email'] ?? null) ? mb_strtolower(trim($d['email'])) : '';
        $pass  = is_string($d['password'] ?? null) ? (string) $d['password'] : '';
        if (Validator::email($email) !== null || $pass === '') {
            Response::json(['error' => 'Invalid credentials.'], 422);
        }

        $rl  = $GLOBALS['config']['rate_limit'];
        $ip  = Request::ip();
        $key = 'portal:' . $email;
        if (RateLimiter::tooManyAttempts($ip, $key, (int) $rl['max_attempts'], (int) $rl['window_seconds'])) {
            Audit::log('portal.rate_limited', 'portal_user', null, [], ['id' => null, 'email' => $key]);
            Response::json(['error' => 'Too many attempts. Please try again later.'], 429);
        }

        $user = PortalAuth::attempt($email, $pass);
        $ok   = $user !== null && (int) $user['is_active'] === 1;
        RateLimiter::record($ip, $key, $ok);
        if (!$ok) {
            Audit::log('portal.login_failed', 'portal_user', $user['id'] ?? null, [], ['id' => null, 'email' => $key]);
            Response::json(['error' => 'Invalid credentials.'], 401);
        }
        if ($user['email_verified_at'] === null) {
            Response::json(['error' => 'Confirm your email address first: use the link we sent you. Lost it? Register again with the same address to get a new one.'], 403);
        }

        if (!empty($user['totp_enabled_at'])) {
            Session::regenerate();
            $_SESSION['portal_2fa_pending'] = ['user_id' => (int) $user['id'], 'email' => (string) $user['email'], 'at' => time()];
            Response::json(['two_factor_required' => true]);
        }

        // First sign-in: the session is limited to two-factor enrolment until it is done (PortalAuth::require).
        PortalAuth::login($user);
        RateLimiter::clearKey($key);
        Audit::log('portal.login', 'portal_user', (int) $user['id'], ['second_factor' => null], PortalAuth::actor($user));
        Response::json(['success' => true, 'enroll_2fa' => true]);
    }

    public function twoFactor(): void
    {
        Request::require_method('POST');
        Request::require_csrf();

        $pending = $_SESSION['portal_2fa_pending'] ?? null;
        if (!is_array($pending) || time() - (int) $pending['at'] > self::PENDING_TTL) {
            unset($_SESSION['portal_2fa_pending']);
            Response::json(['error' => 'Your sign-in expired. Please start again.', 'restart' => true], 401);
        }
        $userId = (int) $pending['user_id'];
        $actor  = ['id' => null, 'email' => 'portal:' . $pending['email']];
        $key    = 'portal2fa:' . $pending['email'];
        $rl     = $GLOBALS['config']['rate_limit'];
        $ip     = Request::ip();
        if (RateLimiter::tooManyAttempts($ip, $key, (int) $rl['max_attempts'], (int) $rl['window_seconds'])) {
            unset($_SESSION['portal_2fa_pending']);
            Audit::log('portal.rate_limited', 'portal_user', $userId, ['step' => '2fa'], $actor);
            Response::json(['error' => 'Too many attempts. Please try again later.', 'restart' => true], 429);
        }

        $code   = is_string(Request::body()['code'] ?? null) ? (string) Request::body()['code'] : '';
        $method = $code === '' ? null : PortalTwoFactor::verify($userId, $code);
        RateLimiter::record($ip, $key, $method !== null);
        if ($method === null) {
            Audit::log('portal.2fa_failed', 'portal_user', $userId, [], $actor);
            Response::json(['error' => 'Invalid code.'], 401);
        }

        $stmt = Database::connection()->prepare(
            'SELECT id, email, password_changed_at FROM portal_users WHERE id = :id AND is_active = 1 AND email_verified_at IS NOT NULL'
        );
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch();
        if (!is_array($user)) {
            unset($_SESSION['portal_2fa_pending']);
            Response::json(['error' => 'Your sign-in expired. Please start again.', 'restart' => true], 401);
        }
        PortalAuth::login($user);
        RateLimiter::clearKey($key);
        RateLimiter::clearKey('portal:' . $user['email']);
        Audit::log('portal.login', 'portal_user', $userId, ['second_factor' => $method], $actor);
        Response::json(['success' => true, 'recovery_codes_left' => $method === 'recovery' ? PortalTwoFactor::recoveryCodesLeft($userId) : null]);
    }

    public function logout(): void
    {
        Request::require_method('POST');
        Request::require_csrf();
        $user = PortalAuth::current();
        if ($user !== null) {
            Audit::log('portal.logout', 'portal_user', (int) $user['id'], [], PortalAuth::actor($user));
        }
        PortalAuth::logout();
        Response::json(['success' => true]);
    }

    public function forgot(): void
    {
        Request::require_method('POST');
        Request::require_csrf();

        $ip    = Request::ip();
        $quota = 'portal-forgot:' . $ip;
        if (RateLimiter::countKey($quota, 3600) >= 5) {
            Response::json(['error' => 'Too many requests. Please try again later.'], 429);
        }
        RateLimiter::hit($ip, $quota);

        $email = is_string(Request::body()['email'] ?? null) ? mb_strtolower(trim(Request::body()['email'])) : '';
        $stmt  = Database::connection()->prepare('SELECT id, name FROM portal_users WHERE email = :e AND is_active = 1 AND email_verified_at IS NOT NULL');
        $stmt->execute([':e' => $email]);
        $user = $stmt->fetch();
        if (is_array($user)) {
            $minutes = (int) ($GLOBALS['config']['security']['reset_token_minutes'] ?? 60);
            $token   = PortalTokens::create((int) $user['id'], 'reset', $minutes);
            Mailer::send($email, 'MIPS merchant portal: reset your password',
                "Hello {$user['name']},\n\nUse this link to choose a new password (valid $minutes minutes):\n\n"
                . PortalTokens::url('reset.php', $token) . "\n\nYour two-factor authentication stays in place.\n"
                . "If you did not ask for this, ignore this email: your password is unchanged.\n\nMIPS\n");
            Audit::log('portal.password_reset_requested', 'portal_user', (int) $user['id'], [], ['id' => null, 'email' => 'portal:' . $email]);
        }
        Response::json(['success' => true, 'message' => 'If an account exists for this address, we have sent a reset link.']);
    }

    public function reset(): void
    {
        Request::require_method('POST');
        Request::require_csrf();

        $d    = Request::body();
        $pass = is_string($d['password'] ?? null) ? (string) $d['password'] : '';
        $err  = Validator::password($pass, (int) ($GLOBALS['config']['security']['password_min_length'] ?? 8));
        if ($err !== null) {
            Response::json(['error' => $err], 422);
        }
        $userId = PortalTokens::consume((string) ($d['token'] ?? ''), 'reset');
        if ($userId === null) {
            Response::json(['error' => 'This link is invalid, expired or already used. Ask for a new one.'], 410);
        }
        // Every open session of the account ends (password_changed_at check).
        Database::connection()->prepare(
            'UPDATE portal_users SET password_hash = :h, password_changed_at = NOW(6), email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = :id'
        )->execute([':h' => password_hash($pass, PASSWORD_DEFAULT), ':id' => $userId]);
        Audit::log('portal.password_reset', 'portal_user', $userId, [], $this->actorFor($userId));
        Response::json(['success' => true]);
    }

    /** @return array{id:null, email:string} */
    private function actorFor(int $userId): array
    {
        $stmt = Database::connection()->prepare('SELECT email FROM portal_users WHERE id = :id');
        $stmt->execute([':id' => $userId]);
        return ['id' => null, 'email' => 'portal:' . (string) $stmt->fetchColumn()];
    }
}
