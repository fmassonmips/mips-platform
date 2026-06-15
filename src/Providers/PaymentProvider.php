<?php
/**
 * Core contract every payment provider adapter implements.
 *
 * The routing engine depends only on this interface, so providers are
 * hot-swappable by configuration. Merchant/KYC/settlement capabilities are
 * declared by the additional interfaces in this namespace and implemented only
 * by providers that own those (regulated) responsibilities — i.e. PassPass.
 */
declare(strict_types=1);

namespace App\Providers;

use App\Domain\PaymentType;

interface PaymentProvider
{
    /** Stable machine name, persisted as transactions.provider_name. */
    public function name(): string;

    /** Can this provider handle the given payment type? */
    public function supports(PaymentType $type): bool;

    public function createPayment(PaymentRequest $request): ProviderResult;

    public function getPaymentStatus(string $providerReference): ProviderResult;

    public function refundPayment(string $providerReference, ?int $amountMinor = null): ProviderResult;

    public function cancelPayment(string $providerReference): ProviderResult;

    /**
     * Verify and parse an inbound webhook. Implementations MUST verify the
     * signature before trusting the body.
     *
     * @param array<string,string> $headers
     * @return array<string,mixed>  Normalised event (must include 'verified' bool).
     */
    public function handleWebhook(string $rawBody, array $headers): array;
}
