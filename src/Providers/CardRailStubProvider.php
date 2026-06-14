<?php
/**
 * CardRailStub — placeholder for future Visa/Mastercard integration.
 *
 * IMPORTANT: This is a STUB. It simulates card authorisation/settlement and
 * stores NO PAN, CVV or cardholder data. Real card acceptance requires a PCI
 * DSS compliant integration (hosted fields / tokenisation) which is out of
 * scope for the MVP.
 */
declare(strict_types=1);

namespace App\Providers;

use App\Domain\PaymentType;
use App\Domain\TransactionStatus;
use App\Support\Reference;

final class CardRailStubProvider extends AbstractProvider implements PaymentProvider
{
    public function name(): string
    {
        return 'cardrail';
    }

    public function supports(PaymentType $type): bool
    {
        return $type === PaymentType::Card;
    }

    public function createPayment(PaymentRequest $request): ProviderResult
    {
        return $this->simulateCardPayment($request);
    }

    public function simulateCardPayment(PaymentRequest $request): ProviderResult
    {
        $auth = $this->simulateAuthorization($request->amountMinor);
        if (!$auth->success) {
            return $auth;
        }
        return ProviderResult::ok($this->name(), $auth->providerReference ?? Reference::provider('card'), TransactionStatus::Processing, [
            'authorized'  => true,
            'pan_stored'  => false,
            'simulated'   => true,
        ]);
    }

    public function simulateAuthorization(int $amountMinor): ProviderResult
    {
        // Deterministic sandbox rule: amounts ending in 13 (minor) are declined.
        if ($amountMinor % 100 === 13) {
            return ProviderResult::fail($this->name(), 'do_not_honor', 'Simulated authorisation declined');
        }
        return ProviderResult::ok($this->name(), Reference::provider('card'), TransactionStatus::Processing, [
            'authorized' => true,
            'simulated'  => true,
        ]);
    }

    public function simulateSettlement(string $providerReference): ProviderResult
    {
        return ProviderResult::ok($this->name(), $providerReference, TransactionStatus::Settled, [
            'simulated' => true,
        ]);
    }

    public function getPaymentStatus(string $providerReference): ProviderResult
    {
        return ProviderResult::ok($this->name(), $providerReference, TransactionStatus::Paid, ['simulated' => true]);
    }

    public function refundPayment(string $providerReference, ?int $amountMinor = null): ProviderResult
    {
        return ProviderResult::ok($this->name(), $providerReference, TransactionStatus::Refunded, ['simulated' => true]);
    }

    public function cancelPayment(string $providerReference): ProviderResult
    {
        return ProviderResult::ok($this->name(), $providerReference, TransactionStatus::Cancelled, ['simulated' => true]);
    }

    public function handleWebhook(string $rawBody, array $headers): array
    {
        return [
            'verified' => false, // stub: no real card network webhooks
            'provider' => $this->name(),
            'event'    => null,
            'data'     => [],
        ];
    }
}
