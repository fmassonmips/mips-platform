<?php
/**
 * PassPass — the REGULATED PSP adapter.
 *
 * PassPass Ltd holds the PSP licence and performs all regulated activities:
 * merchant onboarding approval, KYC decisions, regulated payment execution and
 * settlement supervision. MIPSIT Digital Ltd (this platform) orchestrates and
 * presents; it never represents itself as the licensed PSP.
 *
 * MVP behaviour: sandbox simulation. Every method returns a normalised
 * ProviderResult so services/controllers built on top are integration-ready.
 */
declare(strict_types=1);

namespace App\Providers;

use App\Domain\PaymentType;
use App\Domain\TransactionStatus;
use App\Support\Reference;

final class PassPassProvider extends AbstractProvider implements PaymentProvider, MerchantProvider, SettlementProvider
{
    public function name(): string
    {
        return 'passpass';
    }

    public function supports(PaymentType $type): bool
    {
        return in_array($type, [
            PaymentType::BankTransfer,
            PaymentType::Qr,
            PaymentType::PaymentLink,
            PaymentType::VirtualCredential,
        ], true);
    }

    // --- Payments ---------------------------------------------------------

    public function createPayment(PaymentRequest $request): ProviderResult
    {
        if (!$this->supports($request->type)) {
            return ProviderResult::fail($this->name(), 'unsupported_type', 'PassPass cannot process ' . $request->type->value);
        }

        // Sandbox: a bank transfer settles asynchronously (PROCESSING) and is
        // later confirmed by webhook; hosted collection methods await the payer.
        $status = match ($request->type) {
            PaymentType::BankTransfer      => TransactionStatus::Processing,
            PaymentType::Qr,
            PaymentType::PaymentLink,
            PaymentType::VirtualCredential => TransactionStatus::PendingPayment,
            default                        => TransactionStatus::Pending,
        };

        return ProviderResult::ok($this->name(), $this->newProviderReference(), $status, [
            'regulated_entity'        => 'PassPass',
            'regulated_transaction_id'=> Reference::regulatedTransaction(),
            'amount_minor'            => $request->amountMinor,
            'currency'                => $request->currency,
            'payment_type'            => $request->type->value,
            'merchant_reference'      => $request->merchantReference,
            'simulated'               => !$this->isLive(),
        ]);
    }

    /** Convenience wrapper: Pay by Bank (A2A). */
    public function createBankTransfer(PaymentRequest $request): ProviderResult
    {
        return $this->createPayment(new PaymentRequest(
            type: PaymentType::BankTransfer,
            amountMinor: $request->amountMinor,
            currency: $request->currency,
            merchantReference: $request->merchantReference,
            regulatedMerchantId: $request->regulatedMerchantId,
            customerReference: $request->customerReference,
            description: $request->description,
            idempotencyKey: $request->idempotencyKey,
            metadata: $request->metadata,
        ));
    }

    /** Convenience wrapper: hosted payment link. */
    public function createPaymentLink(PaymentRequest $request): ProviderResult
    {
        $result = $this->createPayment(new PaymentRequest(
            type: PaymentType::PaymentLink,
            amountMinor: $request->amountMinor,
            currency: $request->currency,
            merchantReference: $request->merchantReference,
            regulatedMerchantId: $request->regulatedMerchantId,
            description: $request->description,
            idempotencyKey: $request->idempotencyKey,
            metadata: $request->metadata,
        ));
        return $result;
    }

    /** Convenience wrapper: merchant QR. */
    public function createQRPayment(PaymentRequest $request): ProviderResult
    {
        return $this->createPayment(new PaymentRequest(
            type: PaymentType::Qr,
            amountMinor: $request->amountMinor,
            currency: $request->currency,
            merchantReference: $request->merchantReference,
            regulatedMerchantId: $request->regulatedMerchantId,
            description: $request->description,
            idempotencyKey: $request->idempotencyKey,
            metadata: $request->metadata,
        ));
    }

    public function getPaymentStatus(string $providerReference): ProviderResult
    {
        // Sandbox: treat a settled reference as PAID. A live adapter would call
        // the PassPass status endpoint here.
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

    // --- Regulated merchant lifecycle ------------------------------------

    public function createMerchant(array $merchant): ProviderResult
    {
        $regulatedMerchantId = Reference::merchant();
        return ProviderResult::ok($this->name(), $regulatedMerchantId, TransactionStatus::PendingKyc, [
            'regulated_entity'     => 'PassPass',
            'regulated_merchant_id'=> $regulatedMerchantId,
            'kyc_status'           => 'DRAFT',
            'compliance_status'    => 'PENDING',
        ]);
    }

    public function updateMerchant(string $regulatedMerchantId, array $changes): ProviderResult
    {
        return ProviderResult::ok($this->name(), $regulatedMerchantId, TransactionStatus::PendingKyc, [
            'updated_fields' => array_keys($changes),
        ]);
    }

    public function submitKyc(string $regulatedMerchantId, array $kycPayload): ProviderResult
    {
        return ProviderResult::ok($this->name(), $regulatedMerchantId, TransactionStatus::PendingKyc, [
            'kyc_status'  => 'SUBMITTED',
            'document_count' => count($kycPayload['documents'] ?? []),
        ]);
    }

    public function approveMerchant(string $regulatedMerchantId): ProviderResult
    {
        // In production this decision is recorded by a PassPass compliance officer.
        return ProviderResult::ok($this->name(), $regulatedMerchantId, TransactionStatus::Pending, [
            'kyc_status'        => 'APPROVED',
            'compliance_status' => 'CLEARED',
        ]);
    }

    // --- Settlement -------------------------------------------------------

    public function createSettlement(array $settlement): ProviderResult
    {
        $batchId = $settlement['settlement_batch_id'] ?? Reference::batch();
        return ProviderResult::ok($this->name(), (string) $batchId, TransactionStatus::Settled, [
            'settlement_account'  => $settlement['settlement_account'] ?? null,
            'settlement_batch_id' => $batchId,
            'amount_minor'        => $settlement['amount_minor'] ?? null,
            'simulated'           => !$this->isLive(),
        ]);
    }

    // --- Webhooks ---------------------------------------------------------

    public function handleWebhook(string $rawBody, array $headers): array
    {
        $verified = $this->verifySignature($rawBody, $headers, 'X-PassPass-Signature');
        $payload  = json_decode($rawBody, true);

        return [
            'verified' => $verified,
            'provider' => $this->name(),
            'event'    => is_array($payload) ? ($payload['event'] ?? null) : null,
            'data'     => is_array($payload) ? ($payload['data'] ?? []) : [],
        ];
    }
}
