<?php
/**
 * POST /api/auth/login
 *
 * Input (JSON body):
 *   { "email": "...", "password": "..." }
 *
 * Responses:
 *   200 { "success": true, "user": {...} }
 *   200 { "two_factor_required": true }   password OK, now POST /api/auth/2fa
 *   401 { "error": "Invalid credentials." }
 *   422 { "error": "Invalid credentials." }
 *   429 { "error": "Too many attempts. Please try again later." }
 *   405 { "error": "Method Not Allowed" }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Auth;
use App\Csrf;
use App\RateLimiter;
use App\Session;
use App\Response;
use App\Validator;

final class LoginController
{
    public function handle(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }

        // CSRF check — the login page put a token in a meta tag and the
        // JS client sends it back via X-CSRF-Token.
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Invalid CSRF token.'], 419);
        }

        // Parse JSON body; fall back to form-encoded POST for curl testing.
        $raw  = (string) file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $data = $_POST;
        }

        $email    = is_string($data['email'] ?? null) ? trim((string) $data['email']) : '';
        $password = is_string($data['password'] ?? null) ? (string) $data['password'] : '';

        // Server-side validation. We deliberately return a *generic* message
        // to avoid leaking which of email/password was wrong.
        $minLen    = (int) ($GLOBALS['config']['security']['password_min_length'] ?? 8);
        $emailErr  = Validator::email($email);
        $passwdErr = Validator::password($password, $minLen);
        if ($emailErr !== null || $passwdErr !== null) {
            Response::json(['error' => 'Invalid credentials.'], 422);
        }

        // Rate limit (IP + email).
        $rl  = $GLOBALS['config']['rate_limit'];
        $ip  = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
        if (RateLimiter::tooManyAttempts($ip, $email, (int) $rl['max_attempts'], (int) $rl['window_seconds'])) {
            Audit::log('auth.rate_limited', 'user', null, ['email' => $email]);
            Response::json(['error' => 'Too many attempts. Please try again later.'], 429);
        }

        // Attempt credentials.
        $user = Auth::attempt($email, $password);
        RateLimiter::record($ip, $email, $user !== null);

        if ($user === null) {
            Audit::log('auth.login_failed', 'user', null, ['email' => $email]);
            Response::json(['error' => 'Invalid credentials.'], 401);
        }

        // Password OK but 2FA enabled: park the user id until the second
        // factor is verified by TwoFactorLoginController. Not logged in yet.
        if (!empty($user['totp_enabled_at'])) {
            Session::regenerate();
            $_SESSION['2fa_pending'] = ['user_id' => (int) $user['id'], 'email' => (string) $user['email'], 'at' => time()];
            // Only this account's counter: signing in to one account must never
            // reset the failures recorded against other accounts from this IP.
            RateLimiter::clearKey($email);
            Audit::log('auth.2fa_challenge', 'user', (int) $user['id'], [], $user);
            Response::json(['two_factor_required' => true], 200);
        }

        // Success: bind session, clear rate-limit counters, rotate CSRF token.
        Auth::login_user($user);
        RateLimiter::clearKey($email);
        unset($_SESSION['csrf_token']); // force new token on next page load
        Audit::log('auth.login', 'user', (int) $user['id']);

        Response::json([
            'success' => true,
            'user'    => [
                'id'    => (int)    $user['id'],
                'email' => (string) $user['email'],
                'name'  => $user['name'] ?? null,
                'role'  => $user['role'] ?? 'user',
            ],
        ], 200);
    }
}
