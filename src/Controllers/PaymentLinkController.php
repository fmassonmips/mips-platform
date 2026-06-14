<?php
/**
 * Payment link endpoints: merchant create/list, public show, customer pay.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Database;
use App\Rbac;
use App\Response;
use App\Services\PaymentLinkService;
use App\Support\Http;
use App\Support\Money;
use RuntimeException;

final class PaymentLinkController
{
    /** POST /api/links/create  { amount?, currency?, description?, max_uses?, expires_at? } */
    public function create(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'paymentlink.manage');

        try {
            $link = PaymentLinkService::make()->create((int) $user['id'], Http::jsonBody());
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }
        Response::json(['success' => true, 'link' => $this->present($link)], 201);
    }

    /** GET /api/links/list — the caller's merchant links. */
    public function list(): void
    {
        Http::requireMethod('GET');
        $user = Auth::require_auth();
        Rbac::require($user, 'paymentlink.manage');
        $rows = array_map([$this, 'present'], PaymentLinkService::make()->listForUser((int) $user['id']));
        Response::json(['links' => $rows]);
    }

    /** GET /api/links/show?slug=... — view a link (any authenticated user). */
    public function show(): void
    {
        Http::requireMethod('GET');
        Auth::require_auth();
        $slug = isset($_GET['slug']) ? (string) $_GET['slug'] : '';
        $link = PaymentLinkService::make()->findBySlug($slug);
        if ($link === null) {
            Response::json(['error' => 'Payment link not found.'], 404);
        }
        Response::json(['link' => $this->present($link)]);
    }

    /** POST /api/links/pay  { slug, amount? } */
    public function pay(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'payment.initiate');

        $data   = Http::jsonBody();
        $slug   = Http::string($data, 'slug');
        $amount = Http::string($data, 'amount');
        $cid    = $this->consumerId((int) $user['id']);

        try {
            $txn = PaymentLinkService::make()->pay($slug, $cid, $amount !== '' ? $amount : null);
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }

        Response::json([
            'success'     => true,
            'transaction' => [
                'transaction_reference' => $txn['transaction_reference'],
                'status'                => $txn['status'],
                'amount_display'        => Money::format((int) $txn['amount_minor'], (string) $txn['currency']),
                'currency'              => $txn['currency'],
            ],
        ], 201);
    }

    private function consumerId(int $userId): ?int
    {
        $s = Database::connection()->prepare('SELECT id FROM consumers WHERE user_id = :u LIMIT 1');
        $s->execute([':u' => $userId]);
        $id = $s->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    /**
     * @param array<string,mixed> $l
     * @return array<string,mixed>
     */
    private function present(array $l): array
    {
        return [
            'link_reference' => $l['link_reference'],
            'slug'           => $l['slug'],
            'pay_url'        => '/pay.php?link=' . $l['slug'],
            'amount_minor'   => $l['amount_minor'] !== null ? (int) $l['amount_minor'] : null,
            'amount_display' => $l['amount_minor'] !== null ? Money::format((int) $l['amount_minor'], (string) $l['currency']) : null,
            'currency'       => $l['currency'],
            'description'    => $l['description'],
            'status'         => $l['status'],
            'uses'           => (int) $l['uses'],
            'max_uses'       => $l['max_uses'] !== null ? (int) $l['max_uses'] : null,
        ];
    }
}
