<?php
/**
 * Payment endpoints: initiate (Pay by Bank etc.), check status, and a sandbox
 * helper that simulates a provider confirmation webhook.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Database;
use App\Rbac;
use App\Response;
use App\Routing\PaymentRouter;
use App\Services\PaymentService;
use App\Support\Http;
use App\Support\Money;
use RuntimeException;

final class PaymentController
{
    /** POST /api/payments/create  { payment_type, amount_minor, currency?, merchant_reference } */
    public function create(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'payment.initiate');

        $data       = Http::jsonBody();
        $consumerId = $this->resolveConsumerId((int) $user['id']);

        // Allow callers to pass a human amount; convert to minor units if so.
        if (!isset($data['amount_minor']) && isset($data['amount'])) {
            $data['amount_minor'] = Money::toMinor((string) $data['amount'], (string) ($data['currency'] ?? Money::DEFAULT_CURRENCY));
        }

        try {
            $txn = PaymentService::make()->create($data, $consumerId);
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }

        Response::json(['success' => true, 'transaction' => $this->present($txn)], 201);
    }

    /** GET /api/payments/show?ref=TXN_... */
    public function show(): void
    {
        Http::requireMethod('GET');
        $user = Auth::require_auth();

        $ref = isset($_GET['ref']) ? (string) $_GET['ref'] : '';
        $txn = PaymentService::make()->findByReference($ref);
        if ($txn === null) {
            Response::json(['error' => 'Transaction not found.'], 404);
        }

        // Owner (consumer) may read their own; staff may read all.
        if (!Rbac::can($user, 'transaction.read.all')) {
            Rbac::require($user, 'payment.self.read');
            $consumerId = $this->resolveConsumerId((int) $user['id']);
            if ($consumerId === null || (int) $txn['consumer_id'] !== $consumerId) {
                Response::json(['error' => 'Forbidden'], 403);
            }
        }

        Response::json(['transaction' => $this->present($txn), 'events' => $this->events((int) $txn['id'])]);
    }

    /** POST /api/payments/simulate  { reference } — sandbox provider confirmation. */
    public function simulate(): void
    {
        Http::requireMethod('POST');
        Http::requireCsrf();
        $user = Auth::require_auth();
        Rbac::require($user, 'transaction.read.all');

        if (($GLOBALS['config']['platform']['sandbox'] ?? true) !== true) {
            Response::json(['error' => 'Simulation is only available in sandbox mode.'], 403);
        }

        $data = Http::jsonBody();
        $ref  = Http::string($data, 'reference');
        try {
            $txn = PaymentService::make()->confirmPaid($ref);
        } catch (RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }

        Response::json(['success' => true, 'transaction' => $this->present($txn)]);
    }

    /** GET /api/payments/routing — admin view of the routing table. */
    public function routing(): void
    {
        Http::requireMethod('GET');
        $user = Auth::require_auth();
        Rbac::require($user, 'platform.routing.manage');
        Response::json(['routing' => PaymentRouter::fromGlobalConfig()->table()]);
    }

    private function resolveConsumerId(int $userId): ?int
    {
        $stmt = Database::connection()->prepare('SELECT id FROM consumers WHERE user_id = :u LIMIT 1');
        $stmt->execute([':u' => $userId]);
        $id = $stmt->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    /**
     * @return list<array<string,mixed>>
     */
    private function events(int $txnId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT from_status, to_status, event_type, provider_name, message, created_at
               FROM transaction_events WHERE transaction_id = :t ORDER BY id'
        );
        $stmt->execute([':t' => $txnId]);
        return $stmt->fetchAll();
    }

    /**
     * @param array<string,mixed> $t
     * @return array<string,mixed>
     */
    private function present(array $t): array
    {
        return [
            'transaction_reference'    => $t['transaction_reference'],
            'regulated_entity'         => $t['regulated_entity'],
            'regulated_transaction_id' => $t['regulated_transaction_id'],
            'regulated_merchant_id'    => $t['regulated_merchant_id'],
            'payment_type'             => $t['payment_type'],
            'amount_minor'             => (int) $t['amount_minor'],
            'fee_minor'                => (int) $t['fee_minor'],
            'net_minor'                => (int) $t['net_minor'],
            'amount_display'           => Money::format((int) $t['amount_minor'], (string) $t['currency']),
            'currency'                 => $t['currency'],
            'status'                   => $t['status'],
            'provider_name'            => $t['provider_name'],
            'provider_reference'       => $t['provider_reference'],
            'reconciliation_status'    => $t['reconciliation_status'],
            'created_at'               => $t['created_at'],
        ];
    }
}
