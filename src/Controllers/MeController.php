<?php
/**
 * GET /api/auth/me
 *
 * Returns the authenticated user, or 401 if no valid session.
 *
 * Responses:
 *   200 { "user": {...} }
 *   401 { "error": "Unauthorized" }
 *   405 { "error": "Method Not Allowed" }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Response;

final class MeController
{
    public function handle(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }

        $user = Auth::current_user();
        if ($user === null) {
            Response::json(['error' => 'Unauthorized'], 401);
        }

        Response::json([
            'user' => [
                'id'         => (int)    $user['id'],
                'email'      => (string) $user['email'],
                'name'       => $user['name'] ?? null,
                'role'       => $user['role'] ?? 'user',
                'created_at' => $user['created_at'] ?? null,
            ],
        ], 200);
    }
}
