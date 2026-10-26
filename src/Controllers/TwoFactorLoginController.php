<?php
/**
 * POST /api/auth/2fa  — second login step.
 *
 * Input: { "code": "123456" }  (authenticator code or a recovery code)
 *
 * Responses:
 *   200 { "success": true }
 *   401 { "error": "Invalid code." }
 *   401 { "error": "Your sign-in expired. Please start again.", "restart": true }
 *   429 { "error": "Too many attempts...", "restart": true }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Auth;
use App\Database;
use App\RateLimiter;
use App\Request;
use App\Response;
use App\TwoFactor;

final class TwoFactorLoginController
{
    private const PENDING_TTL = 300; // seconds between password and code

    public function handle(): void
    {
        Request::require_method('POST');
        Request::require_csrf();

        $pending = $_SESSION['2fa_pending'] ?? null;
        if (!is_array($pending) || time() - (int) $pending['at'] > self::PENDING_TTL) {
            unset($_SESSION['2fa_pending']);
            Response::json(['error' => 'Your sign-in expired. Please start again.', 'restart' => true], 401);
        }

        $userId = (int) $pending['user_id'];
        $email  = (string) $pending['email'];
        $actor  = ['id' => $userId, 'email' => $email];
        // Separate counter from the password step.
        $rlKey  = '2fa:' . $email;
        $rl     = $GLOBALS['config']['rate_limit'];
        $ip     = Request::ip();

        if (RateLimiter::tooManyAttempts($ip, $rlKey, (int) $rl['max_attempts'], (int) $rl['window_seconds'])) {
            unset($_SESSION['2fa_pending']);
            Audit::log('auth.rate_limited', 'user', $userId, ['step' => '2fa'], $actor);
            Response::json(['error' => 'Too many attempts. Please try again later.', 'restart' => true], 429);
        }

        $code   = is_string(Request::body()['code'] ?? null) ? (string) Request::body()['code'] : '';
        $method = $code === '' ? null : TwoFactor::verify($userId, $code);
        RateLimiter::record($ip, $rlKey, $method !== null);

        if ($method === null) {
            Audit::log('auth.2fa_failed', 'user', $userId, [], $actor);
            Response::json(['error' => 'Invalid code.'], 401);
        }

        $stmt = Database::connection()->prepare(
            'SELECT id, email, name, role, password_changed_at FROM users WHERE id = :id AND is_active = 1'
        );
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch();
        if (!is_array($user)) {
            unset($_SESSION['2fa_pending']);
            Response::json(['error' => 'Your sign-in expired. Please start again.', 'restart' => true], 401);
        }

        Auth::login_user($user);
        RateLimiter::clearKey($rlKey);
        unset($_SESSION['csrf_token']);
        Audit::log('auth.login', 'user', $userId, ['second_factor' => $method]);

        $left = $method === 'recovery' ? TwoFactor::recoveryCodesLeft($userId) : null;
        Response::json(['success' => true, 'recovery_codes_left' => $left], 200);
    }
}
