<?php
/**
 * POST /api/shoplokal/public — place an order, no login (CSRF token of the shop page).
 *
 * Input (JSON body):
 *   { "o": <shop token>, "cart": [{ "product_id", "quantity" }], "name", "phone", "email", "address",
 *     "delivery_method": "delivery" | "pickup", "payment_method": "cod" | "bank" | "juice", "note", "website": "" }
 *
 * Responses: 200 { "success": true, "order_url" } · 404 / 409 / 419 / 422 { "error": "..." } (shop language)
 */
declare(strict_types=1);

namespace App\Controllers\ShopLokal;

use App\Csrf;
use App\Request;
use App\Response;
use App\ShopLokal\Orders;
use App\ShopLokal\Settings;
use App\ShopLokal\Text;
use App\Suite\Modules;
use App\Suite\Tenant;

final class PublicController
{
    public function handle(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }
        $data  = Request::json();
        $orgId = Settings::orgByToken(Request::str($data, 'o', 40));
        $t     = Text::for($orgId !== null ? Tenant::profile($orgId)['document_language'] : 'fr');
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => $t['err_session']], 419);
        }
        if ($orgId === null) {
            Response::json(['error' => $t['not_found']], 404);
        }
        if (!Modules::isEnabled($orgId, 'shoplokal') || !Settings::get($orgId)['shop_open']) {
            Response::json(['error' => $t['closed']], 409);
        }
        // Bots fill every field; people never see this one.
        if (Request::str($data, 'website', 200) !== '') {
            Response::json(['success' => true, 'order_url' => null]);
        }
        $cart = [];
        foreach (is_array($data['cart'] ?? null) ? array_slice($data['cart'], 0, 100) : [] as $c) {
            if (is_array($c)) {
                $cart[] = ['product_id' => (int) ($c['product_id'] ?? 0), 'quantity' => (int) ($c['quantity'] ?? 0)];
            }
        }
        $in = [];
        foreach (['name' => 200, 'phone' => 40, 'email' => 300, 'address' => 600, 'delivery_method' => 10, 'payment_method' => 10, 'note' => 600] as $f => $max) {
            $in[$f] = Request::str($data, $f, $max);
        }
        [$order, $error] = Orders::place($orgId, $cart, $in, (string) ($_SERVER['REMOTE_ADDR'] ?? ''), $t);
        if ($error !== null) {
            Response::json(['error' => $error], $error === $t['err_limit'] ? 409 : 422);
        }
        Response::json(['success' => true, 'order_url' => '/shoplokal/o.php?t=' . $order['token'] . '&new=1']);
    }
}
