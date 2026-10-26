<?php
/**
 * Self-service password reset.
 *
 *   POST /api/auth/forgot  { email }            always 200 (no account enumeration)
 *   POST /api/auth/reset   { token, password }  200 | 410 invalid/expired link | 422
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Database;
use App\Mailer;
use App\PasswordReset;
use App\RateLimiter;
use App\Request;
use App\Response;
use App\Validator;

final class PasswordResetController
{
    public function forgot(): void
    {
        Request::require_method('POST');
        Request::require_csrf();

        $email = is_string(Request::body()['email'] ?? null) ? trim((string) Request::body()['email']) : '';
        if (Validator::email($email) !== null) {
            Response::json(['error' => 'Enter a valid email address.'], 422);
        }

        // Each request counts as an attempt: caps emails per address and per IP.
        $rl    = $GLOBALS['config']['rate_limit'];
        $ip    = Request::ip();
        $rlKey = 'reset:' . strtolower($email);
        if (RateLimiter::tooManyAttempts($ip, $rlKey, (int) $rl['max_attempts'], (int) $rl['window_seconds'])) {
            Response::json(['error' => 'Too many attempts. Please try again later.'], 429);
        }
        RateLimiter::record($ip, $rlKey, false);

        $stmt = Database::connection()->prepare('SELECT id, email, name FROM users WHERE email = :e AND is_active = 1');
        $stmt->execute([':e' => $email]);
        $user = $stmt->fetch();

        if (is_array($user)) {
            $url     = PasswordReset::create((int) $user['id'], null);
            $minutes = (int) ($GLOBALS['config']['security']['reset_token_minutes'] ?? 60);
            $sent    = Mailer::send(
                (string) $user['email'],
                'Reset your MIPS Dashboard password',
                "Hello " . ($user['name'] ?: $user['email']) . ",\n\n"
                . "Someone asked to reset the password of your MIPS Dashboard account.\n"
                . "To choose a new password, open this link within $minutes minutes:\n\n$url\n\n"
                . "If you did not ask for this, ignore this email: your password stays unchanged.\n"
            );
            Audit::log('auth.reset_requested', 'user', (int) $user['id'], ['email_sent' => $sent], $user);
        } else {
            Audit::log('auth.reset_requested', 'user', null, ['email' => $email, 'known' => false]);
        }

        Response::json(['success' => true, 'message' => 'If an active account exists for this address, a reset link has been sent.']);
    }

    public function reset(): void
    {
        Request::require_method('POST');
        Request::require_csrf();

        $data     = Request::body();
        $token    = is_string($data['token'] ?? null) ? (string) $data['token'] : '';
        $password = is_string($data['password'] ?? null) ? (string) $data['password'] : '';

        $err = Validator::password($password, (int) ($GLOBALS['config']['security']['password_min_length'] ?? 8));
        if ($err !== null) {
            Response::json(['error' => $err], 422);
        }

        $user = PasswordReset::consume($token, $password);
        if ($user === null) {
            Response::json(['error' => 'This link is invalid, expired or already used. Ask for a new one.'], 410);
        }

        // Fresh start for login attempts on this account.
        RateLimiter::clearKey((string) $user['email']);
        Audit::log('auth.password_reset', 'user', (int) $user['id'], [], $user);
        Response::json(['success' => true]);
    }
}
