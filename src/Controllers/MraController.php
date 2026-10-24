<?php
/**
 * POST /api/suite/mra — MRA e-invoicing settings of the caller's organization (owner/admin).
 *
 * Input (JSON body), by action:
 *   save { "enabled": bool, "username", "password" (empty = keep), "ebs_id" }
 *   test {}                       authenticate with the saved credentials
 *
 * Responses:
 *   200 { "success": true, "message"?: "..." }
 *   401 / 403 / 405 / 419 { "error": "..." }
 *   422 { "error": "..." }         invalid settings, or MRA refused the test
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Csrf;
use App\Mra\Client;
use App\Mra\MraException;
use App\Mra\Settings;
use App\Request;
use App\Response;
use App\Suite\Tenant;

final class MraController
{
    public function handle(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }
        $user = Auth::current_user();
        if ($user === null) {
            Response::json(['error' => 'Unauthorized'], 401);
        }
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Invalid CSRF token.'], 419);
        }
        $org = Tenant::forUser($user);
        if (!Tenant::canManage($org)) {
            Response::json(['error' => 'Only an owner or admin can change MRA settings.'], 403);
        }

        $data = Request::json();
        switch (Request::str($data, 'action', 16)) {
            case 'save':
                $error = Settings::save(
                    $org['id'],
                    ($data['enabled'] ?? false) === true,
                    Request::str($data, 'username', 200),
                    is_string($data['password'] ?? null) ? $data['password'] : '',
                    Request::str($data, 'ebs_id', 100)
                );
                if ($error !== null) {
                    Response::json(['error' => $error], 422);
                }
                Response::json(['success' => true]);

            case 'test':
                try {
                    $c = Settings::credentials($org['id']);
                    Client::fromConfig()->authenticate($c['username'], $c['password'], $c['ebs_id']);
                } catch (MraException | \RuntimeException $e) {
                    Response::json(['error' => $e->getMessage()], 422);
                }
                Response::json(['success' => true, 'message' => 'Connected to MRA: credentials accepted.']);

            default:
                Response::json(['error' => 'Invalid action.'], 422);
        }
    }
}
