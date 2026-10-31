<?php
/**
 * Download the company's data as a ZIP (App\Suite\DataExport).
 *   /export.php           the owner, their company
 *   /export.php?org=<id>  the MIPS team (config backoffice.staff), logged in the back-office log
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use App\Backoffice\Log;
use App\Backoffice\Staff;
use App\Suite\DataExport;
use App\Suite\Tenant;

$user = \App\Auth::require_auth();
if (isset($_GET['org'])) {
    $user  = Staff::requirePage();
    $orgId = is_string($_GET['org']) && ctype_digit($_GET['org']) ? (int) $_GET['org'] : 0;
    if (\App\Backoffice\Companies::find($orgId) === null) {
        http_response_code(404);
        exit('Entreprise introuvable.');
    }
    Log::add((int) $user['id'], $orgId, 'export', 'Téléchargement de toutes les données');
} else {
    $org = Tenant::forUser($user);
    if ($org['role'] !== 'owner') {
        header('Location: /dashboard.php');
        exit;
    }
    $orgId = $org['id'];
}

set_time_limit(120);
$path = DataExport::zip($orgId);
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . DataExport::filename($orgId) . '"');
header('Content-Length: ' . (string) filesize($path));
header('Cache-Control: no-store');
readfile($path);
unlink($path);
