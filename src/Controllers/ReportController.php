<?php
/**
 * Reporting endpoints (admin / finance dashboards).
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Rbac;
use App\Response;
use App\Services\ReportService;
use App\Support\Http;

final class ReportController
{
    /** GET /api/reports/kpis */
    public function kpis(): void
    {
        Http::requireMethod('GET');
        $user = Auth::require_auth();
        Rbac::require($user, 'report.read.all');

        Response::json(['kpis' => ReportService::make()->kpis()]);
    }
}
