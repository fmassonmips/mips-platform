<?php
/**
 * Client-facing document page: /facturo/view.php?t=<public token>
 * Reached from the link in the e-mail; no login. Only issued documents.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');
header('Cache-Control: private, no-store');

$token = is_string($_GET['t'] ?? null) ? $_GET['t'] : '';
$doc   = \App\Facturo\Documents::findByToken($token);

if ($doc === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Document introuvable.';
    exit;
}

$e = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
require TEMPLATES_PATH . '/modules/facturo/print.view.php';
