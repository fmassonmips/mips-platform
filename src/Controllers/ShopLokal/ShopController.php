<?php
/**
 * POST /api/shoplokal/shop — back office. Orders: any member; catalogue,
 * settings and invoices: owner/admin.
 *
 * Input (JSON body), by action:
 *   product   { "id": 0|<id>, "name", "description", "price" (VAT incl.), "tax_code", "stock", "active", "image" }
 *   settings  { "shop_open", "intro", "pay_cod", "pay_bank", "bank_details", "pay_juice", "juice_number",
 *               "delivery_enabled", "delivery_fee", "free_delivery_from", "pickup_enabled", "pickup_address", "notify_email" }
 *   new_link  {}
 *   status    { "id", "status" }
 *   paid      { "id", "paid": bool }
 *   invoice   { "id" }                draft Facturo invoice from the order (Facturo active)
 *
 * Responses: 200 { "success": true, "id"? } · 403 / 404 / 409 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers\ShopLokal;

use App\Request;
use App\Response;
use App\ShopLokal\Orders;
use App\ShopLokal\Products;
use App\ShopLokal\Settings;
use App\Suite\ModuleApi;
use App\Suite\Modules;
use App\Suite\Tenant;

final class ShopController
{
    public function handle(): void
    {
        [$user, $org] = ModuleApi::context('shoplokal');
        $data   = Request::json();
        $id     = Request::int($data, 'id');
        $action = Request::str($data, 'action', 16);

        if (in_array($action, ['product', 'settings', 'new_link', 'invoice'], true) && !Tenant::canManage($org)) {
            Response::json(['error' => 'Seul un propriétaire ou administrateur peut faire cela.'], 403);
        }

        switch ($action) {
            case 'product':
                [$id, $error] = Products::save($org['id'], $id, [
                    'name' => Request::str($data, 'name', 300), 'description' => Request::str($data, 'description', 2500),
                    'price' => Request::str($data, 'price', 20), 'tax_code' => Request::str($data, 'tax_code', 4),
                    'stock' => Request::str($data, 'stock', 10), 'active' => ($data['active'] ?? false) === true,
                    'image' => is_string($data['image'] ?? null) ? $data['image'] : '',
                ]);
                break;

            case 'settings':
                $in = [];
                foreach (['shop_open', 'pay_cod', 'pay_bank', 'pay_juice', 'delivery_enabled', 'pickup_enabled'] as $f) {
                    $in[$f] = ($data[$f] ?? false) === true;
                }
                foreach (['intro' => 600, 'bank_details' => 400, 'juice_number' => 60, 'delivery_fee' => 20,
                          'free_delivery_from' => 20, 'pickup_address' => 400, 'notify_email' => 300] as $f => $max) {
                    $in[$f] = Request::str($data, $f, $max);
                }
                $error = Settings::save($org['id'], $in);
                break;

            case 'new_link':
                Settings::newLink($org['id']);
                $error = null;
                break;

            case 'status':
                $error = Orders::setStatus($org['id'], $id, Request::str($data, 'status', 12));
                break;

            case 'paid':
                $error = Orders::setPaid($org['id'], $id, ($data['paid'] ?? false) === true);
                break;

            case 'invoice':
                if (!Modules::isEnabled($org['id'], 'facturo')) {
                    Response::json(['error' => 'Activez Facturo pour facturer les commandes.'], 409);
                }
                [$invoiceId, $error] = Orders::createInvoice($org['id'], (int) $user['id'], $id);
                if ($error === null) {
                    Response::json(['success' => true, 'id' => $invoiceId]);
                }
                break;

            default:
                Response::json(['error' => 'Action invalide.'], 422);
        }
        if ($error !== null) {
            Response::json(['error' => $error], str_contains($error, 'introuvable') ? 404 : 422);
        }
        Response::json(['success' => true, 'id' => $id]);
    }
}
