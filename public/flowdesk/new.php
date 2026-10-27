<?php
/**
 * Public support form: /flowdesk/new.php?o=<support form token>
 * No login. Language = the company's document language.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

use App\FlowDesk\Settings;
use App\FlowDesk\Text;

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: private, no-store');

$token = is_string($_GET['o'] ?? null) ? $_GET['o'] : '';
$orgId = Settings::orgByToken($token);
if ($orgId === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Page introuvable.\nPage not found.";
    exit;
}
$profile  = \App\Suite\Tenant::profile($orgId);
$lang     = $profile['document_language'];
$t        = Text::for($lang);
$settings = Settings::get($orgId);
$open     = $settings['form_enabled'] && \App\Suite\Modules::isEnabled($orgId, 'flowdesk');
$csrf     = \App\Csrf::token();
$e        = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/modules/flowdesk/contact.view.php';
