<?php
/**
 * MIPS back-office: companies, trials, subscriptions, suspension, notes.
 * Reserved to the MIPS team (config backoffice.staff); 404 for anyone else.
 *   /backoffice.php?f=<filter>&q=<search>   list
 *   /backoffice.php?org=<id>                one company
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use App\Backoffice\Companies;
use App\Backoffice\Log;
use App\Backoffice\Staff;

header('X-Robots-Tag: noindex');
$user       = Staff::requirePage();
$csrf_token = \App\Csrf::token();
$orgId      = is_string($_GET['org'] ?? null) && ctype_digit($_GET['org']) ? (int) $_GET['org'] : 0;

if ($orgId > 0) {
    $company = Companies::find($orgId);
    if ($company === null) {
        http_response_code(404);
        echo 'Entreprise introuvable.';
        exit;
    }
    $members    = Companies::members($orgId);
    $apps       = Companies::apps($orgId);
    $log        = Log::recent($orgId, 100);
    $page_title = $company['name'];
} else {
    $company    = null;
    $filter     = is_string($_GET['f'] ?? null) && isset(Companies::FILTERS[$_GET['f']]) ? $_GET['f'] : 'all';
    $search     = is_string($_GET['q'] ?? null) ? mb_substr(trim($_GET['q']), 0, 100) : '';
    $kpis       = Companies::kpis();
    $companies  = Companies::list($filter, $search);
    $log        = Log::recent(null, 15);
    $page_title = 'Back-office';
}

require TEMPLATES_PATH . '/backoffice.view.php';
