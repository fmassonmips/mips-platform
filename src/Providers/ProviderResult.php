<?php
/**
 * Normalised result returned by every provider adapter call.
 *
 * Adapters translate their own vocabulary into our canonical TransactionStatus
 * so the rest of the platform never depends on a provider's status strings.
 */
declare(strict_types=1);

namespace App\Providers;

use App\Domain\TransactionStatus;

final class ProviderResult
{
    /**
     * @param array<string,mixed> $raw  The provider's raw payload, for audit.
     */
    private function __construct(
        public readonly bool $success,
        public readonly string $providerName,
        public readonly ?string $providerReference,
        public readonly ?TransactionStatus $status,
        public readonly array $raw = [],
        public readonly ?string $errorCode = null,
        public readonly ?string $errorMessage = null,
    ) {
    }

    /**
     * @param array<string,mixed> $raw
     */
    public static function ok(
        string $providerName,
        string $providerReference,
        TransactionStatus $status,
        array $raw = [],
    ): self {
        return new self(true, $providerName, $providerReference, $status, $raw);
    }

    /**
     * @param array<string,mixed> $raw
     */
    public static function fail(
        string $providerName,
        string $errorCode,
        string $errorMessage,
        array $raw = [],
    ): self {
        return new self(false, $providerName, null, TransactionStatus::Failed, $raw, $errorCode, $errorMessage);
    }

    /** @return array<string,mixed> */
    public function toArray(): array
    {
        return [
            'success'            => $this->success,
            'provider_name'      => $this->providerName,
            'provider_reference' => $this->providerReference,
            'status'             => $this->status?->value,
            'error_code'         => $this->errorCode,
            'error_message'      => $this->errorMessage,
        ];
    }
}
