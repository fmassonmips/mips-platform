<?php
/**
 * POST /api/auth/logout
 *
 * Destroys the current session. CSRF-protected.
 *
 * Responses:
 *   200 { "success": true }
 *   405 { "error": "Method Not Allowed" }
 *   419 { "error": "Invalid CSRF token." }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Audit;
use App\Auth;
use App\Csrf;
use App\Response;

final class LogoutController
{
    public function handle(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }

        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Invalid CSRF token.'], 419);
        }

        // Log before the session (and the acting user id) is destroyed.
        Audit::log('auth.logout', 'user', isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null);
        Auth::logout_user();

        Response::json(['success' => true], 200);
    }
}
