<?php
/**
 * Immutable DTO describing a payment to be created via a provider adapter.
 *
 * Amounts are integer MINOR units (see App\Support\Money). The idempotencyKey
 * lets the platform safely retry against a provider without double-charging.
 */
declare(strict_types=1);

namespace App\Providers;

use App\Domain\PaymentType;
use App\Support\Money;

final class PaymentRequest
{
    /**
     * @param array<string,mixed> $metadata
     */
    public function __construct(
        public readonly PaymentType $type,
        public readonly int $amountMinor,
        public readonly string $currency = Money::DEFAULT_CURRENCY,
        public readonly ?string $merchantReference = null,
        public readonly ?string $regulatedMerchantId = null,
        public readonly ?string $customerReference = null,
        public readonly ?string $description = null,
        public readonly ?string $idempotencyKey = null,
        public readonly array $metadata = [],
    ) {
    }
}
