<?php
/**
 * Merchant QR endpoints: create/list (merchant), show, pay (customer).
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Database;
use App\Rbac;
use App\Response;
use App\Services\QrService;
use App\Support\Http;
use App\Support\Money;
use RuntimeException;

final class QrController
{
    /** POST /api/qr/create  { qr_type, amount?, currency? } */
    public function create(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'qr.manage');

        try {
            $qr = QrService::make()->create((int) $user['id'], Http::jsonBody());
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }
        Response::json(['success' => true, 'qr' => $this->present($qr)], 201);
    }

    /** GET /api/qr/list */
    public function list(): void
    {
        Http::requireMethod('GET');
        $user = Auth::require_auth();
        Rbac::require($user, 'qr.manage');
        $rows = array_map([$this, 'present'], QrService::make()->listForUser((int) $user['id']));
        Response::json(['qr' => $rows]);
    }

    /** GET /api/qr/show?ref=QRP_... */
    public function show(): void
    {
        Http::requireMethod('GET');
        Auth::require_auth();
        $ref = isset($_GET['ref']) ? (string) $_GET['ref'] : '';
        $qr  = QrService::make()->findByReference($ref);
        if ($qr === null) {
            Response::json(['error' => 'QR not found.'], 404);
        }
        Response::json(['qr' => $this->present($qr)]);
    }

    /** POST /api/qr/pay  { ref, amount? } */
    public function pay(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'payment.initiate');

        $data   = Http::jsonBody();
        $ref    = Http::string($data, 'ref');
        $amount = Http::string($data, 'amount');
        $cid    = $this->consumerId((int) $user['id']);

        try {
            $txn = QrService::make()->pay($ref, $cid, $amount !== '' ? $amount : null);
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
     * @param array<string,mixed> $q
     * @return array<string,mixed>
     */
    private function present(array $q): array
    {
        return [
            'qr_reference'   => $q['qr_reference'],
            'qr_type'        => $q['qr_type'],
            'amount_minor'   => $q['amount_minor'] !== null ? (int) $q['amount_minor'] : null,
            'amount_display' => $q['amount_minor'] !== null ? Money::format((int) $q['amount_minor'], (string) $q['currency']) : null,
            'currency'       => $q['currency'],
            'payload'        => $q['payload'],
            'is_active'      => (int) $q['is_active'] === 1,
        ];
    }
}
