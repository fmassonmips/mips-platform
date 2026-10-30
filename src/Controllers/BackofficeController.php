<?php
/**
 * POST /api/backoffice/company — MIPS team only (config backoffice.staff), 404 for anyone else.
 *
 * Input (JSON body), by action, always with "org_id":
 *   subscribe  { "app": <slug> | "all" }
 *   end        { "app": <slug> | "all" }        subscription ends: the app turns read-only
 *   extend     { "app", "days": 1..90, "reason" }
 *   suspend    { "reason" }                      shown to the members at login
 *   unsuspend  {}
 *   note       { "text" }
 *
 * Responses: 200 { "success": true } · 404 / 405 / 419 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Backoffice\Companies;
use App\Backoffice\Staff;
use App\Csrf;
use App\Request;
use App\Response;

final class BackofficeController
{
    public function handle(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Méthode non autorisée'], 405);
        }
        $staff = Staff::requireApi();
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Jeton de sécurité invalide, rechargez la page.'], 419);
        }
        $data  = Request::json();
        $orgId = Request::int($data, 'org_id');
        if (Companies::find($orgId) === null) {
            Response::json(['error' => 'Entreprise introuvable.'], 404);
        }
        $staffId = (int) $staff['id'];
        $app     = Request::str($data, 'app', 40);

        $error = match (Request::str($data, 'action', 16)) {
            'subscribe' => Companies::subscribe($staffId, $orgId, $app),
            'end'       => Companies::end($staffId, $orgId, $app),
            'extend'    => Companies::extend($staffId, $orgId, $app, Request::int($data, 'days'), Request::str($data, 'reason', 300)),
            'suspend'   => Companies::suspend($staff, $orgId, Request::str($data, 'reason', 300)),
            'unsuspend' => Companies::unsuspend($staffId, $orgId),
            'note'      => Companies::note($staffId, $orgId, Request::str($data, 'text', 1000)),
            default     => 'Action invalide.',
        };
        if ($error !== null) {
            Response::json(['error' => $error], 422);
        }
        Response::json(['success' => true]);
    }
}
