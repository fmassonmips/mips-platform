<?php
/**
 * Import a list from Excel (CSV): /import.php?type=clients|customers|products
 * (owner/admin, app writable). &template=1 downloads the CSV model.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use App\Suite\Import;
use App\Suite\Modules;
use App\Suite\Tenant;

$user = \App\Auth::require_auth();
$org  = Tenant::forUser($user);
$type = is_string($_GET['type'] ?? null) && isset(Import::TYPES[$_GET['type']]) ? $_GET['type'] : null;
if ($type === null || !Tenant::canManage($org) || !Modules::isEnabled($org['id'], Import::TYPES[$type]['app'])) {
    header('Location: /dashboard.php');
    exit;
}

if (isset($_GET['template'])) {
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="modele-import-' . $type . '.csv"');
    echo Import::template($type);
    exit;
}

$def        = Import::TYPES[$type];
$csrf_token = \App\Csrf::token();
$page_title = 'Importer : ' . $def['title'];

require TEMPLATES_PATH . '/import.view.php';
