<?php
/**
 * Canonical lifecycle states for a transaction.
 *
 * Provider-specific statuses are normalised into these by each provider adapter
 * so the rest of the platform only ever reasons about one vocabulary.
 */
declare(strict_types=1);

namespace App\Domain;

enum TransactionStatus: string
{
    case Created        = 'CREATED';
    case Pending        = 'PENDING';
    case PendingKyc     = 'PENDING_KYC';
    case PendingPayment = 'PENDING_PAYMENT';
    case Processing     = 'PROCESSING';
    case Paid           = 'PAID';
    case Failed         = 'FAILED';
    case Cancelled      = 'CANCELLED';
    case Refunded       = 'REFUNDED';
    case Settled        = 'SETTLED';
    case Reconciled     = 'RECONCILED';

    /**
     * Allowed forward transitions. Used to guard status updates so a webhook or
     * admin action can never move a transaction backwards into an invalid state.
     *
     * @return list<self>
     */
    public function nextStates(): array
    {
        return match ($this) {
            self::Created        => [self::Pending, self::PendingKyc, self::PendingPayment, self::Processing, self::Cancelled, self::Failed],
            self::Pending        => [self::PendingPayment, self::Processing, self::Cancelled, self::Failed],
            self::PendingKyc     => [self::Pending, self::Cancelled, self::Failed],
            self::PendingPayment => [self::Processing, self::Cancelled, self::Failed],
            self::Processing     => [self::Paid, self::Failed, self::Cancelled],
            self::Paid           => [self::Refunded, self::Settled],
            self::Settled        => [self::Reconciled, self::Refunded],
            self::Reconciled     => [self::Refunded],
            self::Refunded, self::Failed, self::Cancelled => [],
        };
    }

    public function canTransitionTo(self $target): bool
    {
        return in_array($target, $this->nextStates(), true);
    }

    public function isTerminal(): bool
    {
        return $this->nextStates() === [];
    }
}
