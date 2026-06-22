<?php
/**
 * Inflow server-to-server (S2S) payment endpoints.
 *
 * Docs: https://docs.inflowpay.com/docs/server-to-server-payments
 *
 *   POST /api/payments              -> create()   create + (optionally) auto-confirm a payment
 *   POST /api/payments/confirm?id=  -> confirm()   confirm after 3-D Secure
 *   GET  /api/payments/status?id=   -> status()    fetch current state
 *
 * All endpoints require an authenticated dashboard session. State-changing
 * (POST) endpoints additionally require a valid CSRF token, matching the rest
 * of the application.
 *
 * The create() endpoint receives raw card data and forwards it to Inflow's
 * PCI-scoped host. That data is never logged and never stored — only the last
 * four digits are kept locally for reconciliation.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Csrf;
use App\Database;
use App\InflowPay;
use App\Response;
use App\Validator;
use RuntimeException;

final class PaymentController
{
    private InflowPay $inflow;

    public function __construct(?InflowPay $inflow = null)
    {
        try {
            $this->inflow = $inflow ?? new InflowPay();
        } catch (RuntimeException $e) {
            // Missing/invalid provider configuration.
            error_log('[Payment] ' . $e->getMessage());
            Response::json(['error' => 'Payments are not available right now.'], 503);
        }
    }

    /**
     * POST /api/payments
     *
     * Responses:
     *   201 { "success": true, "payment": {...} }
     *   400 { "error": "..." }            provider rejected the request
     *   402 { "error": "...", "code": ".." } payment declined
     *   422 { "error": "..." }            local validation failure
     */
    public function create(): void
    {
        $user = Auth::require_auth();

        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Invalid CSRF token.'], 419);
        }

        $data = $this->jsonBody();

        // --- pull fields -----------------------------------------------------
        $currency             = is_string($data['currency'] ?? null) ? strtoupper(trim((string) $data['currency'])) : '';
        $customerEmail        = is_string($data['customerEmail'] ?? null) ? trim((string) $data['customerEmail']) : '';
        $billingCountry       = is_string($data['billingCountry'] ?? null) ? strtoupper(trim((string) $data['billingCountry'])) : '';
        $purchasingAsBusiness = (bool) ($data['purchasingAsBusiness'] ?? false);
        $useSavedCard         = (bool) ($data['useCustomerPaymentMethod'] ?? false);
        $products             = $data['products'] ?? null;
        $card                 = $data['card'] ?? null;

        // --- validate --------------------------------------------------------
        $totalCents = 0;
        $errors = array_filter([
            Validator::products($products, $totalCents),
            Validator::currency($currency),
            Validator::email($customerEmail),
            Validator::country($billingCountry),
        ]);
        if ($errors !== []) {
            Response::json(['error' => (string) reset($errors)], 422);
        }

        // US billing requires a postal code.
        $postalCode = is_string($data['postalCode'] ?? null) ? trim((string) $data['postalCode']) : '';
        if ($billingCountry === 'US' && $postalCode === '') {
            Response::json(['error' => 'A postal code is required for US billing.'], 422);
        }

        // Business purchases require a business name and tax id.
        $businessName = is_string($data['businessName'] ?? null) ? trim((string) $data['businessName']) : '';
        $taxId        = is_string($data['taxId'] ?? null) ? trim((string) $data['taxId']) : '';
        if ($purchasingAsBusiness && ($businessName === '' || $taxId === '')) {
            Response::json(['error' => 'Business name and tax ID are required for business purchases.'], 422);
        }

        // Card data is required unless reusing a previously saved card.
        if (!$useSavedCard) {
            $cardErr = Validator::card($card);
            if ($cardErr !== null) {
                Response::json(['error' => $cardErr], 422);
            }
        }

        // Enforce the documented per-currency minimum.
        $minByCurrency = (array) ($GLOBALS['config']['inflow']['min_amount_cents'] ?? []);
        $min = (int) ($minByCurrency[$currency] ?? 0);
        if ($min > 0 && $totalCents < $min) {
            Response::json([
                'error' => sprintf('Amount is below the %s minimum of %d cents.', $currency, $min),
            ], 422);
        }

        // --- build the provider payload -------------------------------------
        $payload = [
            'products'             => $this->normaliseProducts((array) $products),
            'currency'             => $currency,
            'customerEmail'        => $customerEmail,
            'billingCountry'       => $billingCountry,
            'purchasingAsBusiness' => $purchasingAsBusiness,
        ];

        $cfg = (array) ($GLOBALS['config']['inflow'] ?? []);
        $this->copyOptional($payload, $data, [
            'firstName', 'lastName', 'savePaymentMethod', 'useCustomerPaymentMethod',
            'autoConfirm', 'pricingMode', 'metadatas', 'threeDsSuccessUrl', 'threeDsFailureUrl',
        ]);
        if ($postalCode !== '') {
            $payload['postalCode'] = $postalCode;
        }
        if ($purchasingAsBusiness) {
            $payload['businessName'] = $businessName;
            $payload['taxId']        = $taxId;
        }
        if (!$useSavedCard) {
            $payload['card'] = $this->normaliseCard((array) $card);
        }
        // Fall back to configured 3-D Secure return URLs when not supplied.
        foreach (['threeDsSuccessUrl' => 'three_ds_success_url', 'threeDsFailureUrl' => 'three_ds_failure_url'] as $field => $cfgKey) {
            if (empty($payload[$field]) && !empty($cfg[$cfgKey])) {
                $payload[$field] = (string) $cfg[$cfgKey];
            }
        }

        // --- call Inflow -----------------------------------------------------
        try {
            $resp = $this->inflow->createPayment($payload);
        } catch (RuntimeException $e) {
            error_log('[Payment] create: ' . $e->getMessage());
            Response::json(['error' => 'Payment provider is unavailable. Please try again.'], 502);
        }

        $body = $resp['body'];

        if ($resp['status'] < 200 || $resp['status'] >= 300) {
            $message = is_string($body['message'] ?? null) ? (string) $body['message'] : 'Payment could not be processed.';
            // 4xx from the provider maps to a client-correctable error.
            $clientStatus = ($resp['status'] >= 400 && $resp['status'] < 500) ? 400 : 502;
            Response::json(['error' => $message], $clientStatus);
        }

        // --- persist a local mirror -----------------------------------------
        $last4 = $useSavedCard ? null : $this->cardLast4((array) $card);
        $this->insertPayment([
            'user_id'         => (int) $user['id'],
            'inflow_id'       => is_string($body['id'] ?? null) ? (string) $body['id'] : null,
            'amount_in_cents' => is_int($body['amountInCents'] ?? null) ? (int) $body['amountInCents'] : $totalCents,
            'currency'        => is_string($body['currency'] ?? null) ? (string) $body['currency'] : $currency,
            'status'          => is_string($body['status'] ?? null) ? (string) $body['status'] : 'INITIATION',
            'customer_email'  => $customerEmail,
            'card_last4'      => $last4,
            'three_ds_url'    => is_string($body['threeDsSessionUrl'] ?? null) ? (string) $body['threeDsSessionUrl'] : null,
            'metadata'        => isset($data['metadatas']) && is_array($data['metadatas'])
                                    ? json_encode($data['metadatas'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
                                    : null,
        ]);

        Response::json([
            'success' => true,
            'payment' => $this->publicView($body),
        ], 201);
    }

    /**
     * POST /api/payments/confirm?id={paymentId}
     */
    public function confirm(): void
    {
        Auth::require_auth();

        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Invalid CSRF token.'], 419);
        }

        $paymentId = $this->paymentIdFromRequest();

        try {
            $resp = $this->inflow->confirmPayment($paymentId);
        } catch (RuntimeException $e) {
            error_log('[Payment] confirm: ' . $e->getMessage());
            Response::json(['error' => 'Payment provider is unavailable. Please try again.'], 502);
        }

        $body = $resp['body'];

        if ($resp['status'] < 200 || $resp['status'] >= 300) {
            $message = is_string($body['message'] ?? null) ? (string) $body['message'] : 'Payment could not be confirmed.';
            $clientStatus = ($resp['status'] >= 400 && $resp['status'] < 500) ? 400 : 502;
            Response::json(['error' => $message], $clientStatus);
        }

        $this->syncLocal($paymentId, $body);

        Response::json([
            'success' => true,
            'payment' => $this->publicView($body),
        ], 200);
    }

    /**
     * GET /api/payments/status?id={paymentId}
     */
    public function status(): void
    {
        Auth::require_auth();

        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }

        $paymentId = $this->paymentIdFromRequest();

        try {
            $resp = $this->inflow->getPayment($paymentId);
        } catch (RuntimeException $e) {
            error_log('[Payment] status: ' . $e->getMessage());
            Response::json(['error' => 'Payment provider is unavailable. Please try again.'], 502);
        }

        $body = $resp['body'];

        if ($resp['status'] === 404) {
            Response::json(['error' => 'Payment not found.'], 404);
        }
        if ($resp['status'] < 200 || $resp['status'] >= 300) {
            Response::json(['error' => 'Could not retrieve payment status.'], 502);
        }

        $this->syncLocal($paymentId, $body);

        Response::json(['payment' => $this->publicView($body)], 200);
    }

    // -- helpers ------------------------------------------------------------

    /** @return array<string,mixed> */
    private function jsonBody(): array
    {
        $raw  = (string) file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    private function paymentIdFromRequest(): string
    {
        $id = is_string($_GET['id'] ?? null) ? trim((string) $_GET['id']) : '';
        // Inflow ids are opaque tokens; allow a conservative character set.
        if ($id === '' || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
            Response::json(['error' => 'A valid payment id is required.'], 422);
        }
        return $id;
    }

    /**
     * Whitelist-copy optional fields from the client request into the payload.
     *
     * @param array<string,mixed>  $payload
     * @param array<string,mixed>  $data
     * @param list<string>         $keys
     */
    private function copyOptional(array &$payload, array $data, array $keys): void
    {
        foreach ($keys as $key) {
            if (array_key_exists($key, $data)) {
                $payload[$key] = $data[$key];
            }
        }
    }

    /**
     * Coerce products into the documented shape: name (string), price (int
     * cents) and quantity (int).
     *
     * @param array<int,mixed> $products
     * @return list<array<string,mixed>>
     */
    private function normaliseProducts(array $products): array
    {
        $out = [];
        foreach ($products as $p) {
            if (!is_array($p)) {
                continue;
            }
            $out[] = [
                'name'     => trim((string) ($p['name'] ?? '')),
                'price'    => (int) ($p['price'] ?? 0),
                'quantity' => (int) ($p['quantity'] ?? 0),
            ];
        }
        return $out;
    }

    /**
     * @param array<string,mixed> $card
     * @return array<string,mixed>
     */
    private function normaliseCard(array $card): array
    {
        return [
            'number'   => preg_replace('/\s+/', '', (string) ($card['number'] ?? '')),
            'expMonth' => (int) ($card['expMonth'] ?? 0),
            'expYear'  => (int) ($card['expYear'] ?? 0),
            'cvc'      => (string) ($card['cvc'] ?? ''),
        ];
    }

    /** @param array<string,mixed> $card */
    private function cardLast4(array $card): ?string
    {
        $number = preg_replace('/\s+/', '', (string) ($card['number'] ?? ''));
        return strlen($number) >= 4 ? substr($number, -4) : null;
    }

    /**
     * Project the provider response into the safe shape we return to clients.
     *
     * @param array<string,mixed> $body
     * @return array<string,mixed>
     */
    private function publicView(array $body): array
    {
        $view = [
            'id'                => $body['id'] ?? null,
            'status'            => $body['status'] ?? null,
            'amountInCents'     => $body['amountInCents'] ?? null,
            'currency'          => $body['currency'] ?? null,
            'customerEmail'     => $body['customerEmail'] ?? null,
            'threeDsSessionUrl' => $body['threeDsSessionUrl'] ?? null,
        ];
        if (isset($body['depositStatus'])) {
            $view['depositStatus'] = $body['depositStatus'];
        }
        if (isset($body['lastDepositAttempt'])) {
            $view['lastDepositAttempt'] = $body['lastDepositAttempt'];
        }
        return $view;
    }

    /**
     * Insert the local payment mirror. Failures here must never block the
     * client response — the source of truth is Inflow.
     *
     * @param array<string,mixed> $row
     */
    private function insertPayment(array $row): void
    {
        try {
            $stmt = Database::connection()->prepare(
                'INSERT INTO payments
                    (user_id, inflow_id, amount_in_cents, currency, status,
                     customer_email, card_last4, three_ds_url, metadata, created_at, updated_at)
                 VALUES
                    (:user_id, :inflow_id, :amount, :currency, :status,
                     :email, :last4, :three_ds, :metadata, NOW(), NOW())'
            );
            $stmt->execute([
                ':user_id'  => $row['user_id'],
                ':inflow_id'=> $row['inflow_id'],
                ':amount'   => $row['amount_in_cents'],
                ':currency' => $row['currency'],
                ':status'   => $row['status'],
                ':email'    => $row['customer_email'],
                ':last4'    => $row['card_last4'],
                ':three_ds' => $row['three_ds_url'],
                ':metadata' => $row['metadata'],
            ]);
        } catch (\PDOException $e) {
            error_log('[Payment] insert failed: ' . $e->getMessage());
        }
    }

    /**
     * Update the local mirror's status from a fresh provider response.
     *
     * @param array<string,mixed> $body
     */
    private function syncLocal(string $paymentId, array $body): void
    {
        $status = is_string($body['status'] ?? null) ? (string) $body['status'] : null;
        if ($status === null) {
            return;
        }

        $lastError = null;
        if (isset($body['lastDepositAttempt']) && is_array($body['lastDepositAttempt'])) {
            $code = $body['lastDepositAttempt']['errorCode'] ?? ($body['lastDepositAttempt']['status'] ?? null);
            $lastError = $code !== null ? substr((string) $code, 0, 255) : null;
        }

        try {
            $stmt = Database::connection()->prepare(
                'UPDATE payments
                    SET status = :status, last_error = :err, updated_at = NOW()
                  WHERE inflow_id = :id'
            );
            $stmt->execute([
                ':status' => $status,
                ':err'    => $lastError,
                ':id'     => $paymentId,
            ]);
        } catch (\PDOException $e) {
            error_log('[Payment] sync failed: ' . $e->getMessage());
        }
    }
}
