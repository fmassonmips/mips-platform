<?php
/**
 * Single client detail page: profile, interaction history and linked
 * policies / quotes. Protected.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user = \App\Auth::require_auth();

$clientId = isset($_GET['id']) && ctype_digit((string) $_GET['id']) ? (int) $_GET['id'] : 0;
$client   = $clientId > 0 ? \App\Models\Client::find($clientId) : null;
if ($client === null) {
    header('Location: /clients.php');
    exit;
}

$csrf_token = \App\Csrf::token();
$active     = 'clients';
$page_title = (string) $client['name'];

require TEMPLATES_PATH . '/client.view.php';
