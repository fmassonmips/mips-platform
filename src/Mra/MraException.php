<?php
declare(strict_types=1);

namespace App\Mra;

/**
 * Failure talking to MRA. Transient failures (network, server error, expired
 * token) are retried later; the others need the data or settings fixed.
 */
final class MraException extends \RuntimeException
{
    public function __construct(
        string $message,
        private readonly bool $transient = true,
        private readonly bool $tokenRejected = false
    ) {
        parent::__construct($message);
    }

    public function isTransient(): bool
    {
        return $this->transient;
    }

    public function isTokenRejected(): bool
    {
        return $this->tokenRejected;
    }
}
