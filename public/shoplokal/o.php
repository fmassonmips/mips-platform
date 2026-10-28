<?php
/**
 * Customer's order page: /shoplokal/o.php?t=<order token>
 * Summary, status, how to pay. No login.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');
header('Cache-Control: private, no-store');

$found = \App\ShopLokal\Orders::findByToken(is_string($_GET['t'] ?? null) ? $_GET['t'] : '');
if ($found === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Commande introuvable.\nOrder not found.";
    exit;
}
[$orgId, $order] = $found;
$profile  = \App\Suite\Tenant::profile($orgId);
$lang     = $profile['document_language'];
$t        = \App\ShopLokal\Text::for($lang);
$settings = \App\ShopLokal\Settings::get($orgId);
$isNew    = ($_GET['new'] ?? '') === '1';
$e        = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/modules/shoplokal/order-public.view.php';
