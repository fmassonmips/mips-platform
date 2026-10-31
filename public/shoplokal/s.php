<?php
/**
 * Public shop: /shoplokal/s.php?o=<shop token>
 * Catalogue, cart and checkout on one page. No login.
 */
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

use App\ShopLokal\Orders;
use App\ShopLokal\Products;
use App\ShopLokal\Settings;
use App\ShopLokal\Text;

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: private, no-store');

$token = is_string($_GET['o'] ?? null) ? $_GET['o'] : '';
$orgId = Settings::orgByToken($token);
if ($orgId === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Boutique introuvable.\nShop not found.";
    exit;
}
$profile  = \App\Suite\Tenant::profile($orgId);
$lang     = $profile['document_language'];
$t        = Text::for($lang);
$settings = Settings::get($orgId);
$open     = $settings['shop_open'] && \App\Suite\Modules::isEnabled($orgId, 'shoplokal');
$products = $open ? Products::all($orgId, true) : [];
$deliveryTtc = Products::ttc($settings['delivery_fee_cents'], Orders::serviceTaxCode($orgId));
$csrf     = \App\Csrf::token();
$e        = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

require TEMPLATES_PATH . '/modules/shoplokal/shop-public.view.php';
