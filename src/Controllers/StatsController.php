<?php
/**
 * GET /api/stats  — dashboard overview aggregates.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Models\Stats;
use App\Request;
use App\Response;

final class StatsController
{
    public function handle(): void
    {
        Auth::require_auth();

        if (Request::method() !== 'GET') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }

        Response::json(['data' => Stats::overview()], 200);
    }
}
