<?php
/**
 * Customer-facing loyalty card: /clientbloom/card.php?t=<token>
 * Shared by the business (WhatsApp, SMS); no login. Shows balance and recent activity.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');
header('Cache-Control: private, no-store');

$found = \App\ClientBloom\Customers::findByToken(is_string($_GET['t'] ?? null) ? $_GET['t'] : '');
if ($found === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Card not found.';
    exit;
}
[$orgId, $customer] = $found;

$profile  = \App\Suite\Tenant::profile($orgId);
$rules    = \App\ClientBloom\Settings::get($orgId);
$history  = \App\ClientBloom\Ledger::history($orgId, (int) $customer['id'], 10);
$e        = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/modules/clientbloom/card.view.php';
