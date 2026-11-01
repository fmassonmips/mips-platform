<?php
declare(strict_types=1);

namespace App\Mra;

/**
 * Failure talking to MRA. Transient failures (network, server error, expired
 * token) are retried later; the others need the data or settings fixed.
 * An account failure (credentials, EBS, configuration) concerns every document
 * of the company: they stay pending, untouched, until it is fixed.
 * An uncertain failure (no answer after the invoice was sent) may have been
 * fiscalised by MRA: it must not be sent again blindly.
 */
final class MraException extends \RuntimeException
{
    public function __construct(
        string $message,
        private readonly bool $transient = true,
        private readonly bool $tokenRejected = false,
        private readonly bool $account = false,
        private readonly bool $uncertain = false
    ) {
        parent::__construct($message);
    }

    public static function account(string $message): self
    {
        return new self($message, false, false, true);
    }

    public function isTransient(): bool
    {
        return $this->transient;
    }

    public function isTokenRejected(): bool
    {
        return $this->tokenRejected;
    }

    public function isAccount(): bool
    {
        return $this->account;
    }

    public function isUncertain(): bool
    {
        return $this->uncertain;
    }
}
