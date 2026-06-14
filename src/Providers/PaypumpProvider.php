<?php
/**
 * Paypump — payment transfer / payout connector.
 *
 * Used for outbound transfers and payouts routed to it by the routing engine.
 * Paypump is NOT the regulated entity; it is a rail. Sandbox simulation in MVP.
 */
declare(strict_types=1);

namespace App\Providers;

use App\Domain\PaymentType;
use App\Domain\TransactionStatus;

final class PaypumpProvider extends AbstractProvider implements PaymentProvider
{
    public function name(): string
    {
        return 'paypump';
    }

    public function supports(PaymentType $type): bool
    {
        return $type === PaymentType::PaypumpTransfer;
    }

    public function createPayment(PaymentRequest $request): ProviderResult
    {
        return $this->createTransfer($request);
    }

    /** Paypump's native verb. */
    public function createTransfer(PaymentRequest $request): ProviderResult
    {
        if (!$this->supports($request->type)) {
            return ProviderResult::fail($this->name(), 'unsupported_type', 'Paypump cannot process ' . $request->type->value);
        }

        return ProviderResult::ok($this->name(), $this->newProviderReference(), TransactionStatus::Processing, [
            'amount_minor' => $request->amountMinor,
            'currency'     => $request->currency,
            'simulated'    => !$this->isLive(),
        ]);
    }

    public function getPaymentStatus(string $providerReference): ProviderResult
    {
        return ProviderResult::ok($this->name(), $providerReference, TransactionStatus::Paid, [
            'simulated' => !$this->isLive(),
        ]);
    }

    public function refundPayment(string $providerReference, ?int $amountMinor = null): ProviderResult
    {
        return ProviderResult::ok($this->name(), $providerReference, TransactionStatus::Refunded, [
            'refunded_amount_minor' => $amountMinor,
            'simulated'             => !$this->isLive(),
        ]);
    }

    public function cancelPayment(string $providerReference): ProviderResult
    {
        return ProviderResult::ok($this->name(), $providerReference, TransactionStatus::Cancelled, [
            'simulated' => !$this->isLive(),
        ]);
    }

    public function handleWebhook(string $rawBody, array $headers): array
    {
        $verified = $this->verifySignature($rawBody, $headers, 'X-Paypump-Signature');
        $payload  = json_decode($rawBody, true);

        return [
            'verified' => $verified,
            'provider' => $this->name(),
            'event'    => is_array($payload) ? ($payload['event'] ?? null) : null,
            'data'     => is_array($payload) ? ($payload['data'] ?? []) : [],
        ];
    }
}
