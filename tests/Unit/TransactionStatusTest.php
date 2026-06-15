<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\TransactionStatus;
use PHPUnit\Framework\TestCase;

final class TransactionStatusTest extends TestCase
{
    public function testForwardTransitionsAreAllowed(): void
    {
        self::assertTrue(TransactionStatus::Created->canTransitionTo(TransactionStatus::Processing));
        self::assertTrue(TransactionStatus::Processing->canTransitionTo(TransactionStatus::Paid));
        self::assertTrue(TransactionStatus::Paid->canTransitionTo(TransactionStatus::Settled));
        self::assertTrue(TransactionStatus::Settled->canTransitionTo(TransactionStatus::Reconciled));
    }

    public function testBackwardOrIllegalTransitionsAreRejected(): void
    {
        self::assertFalse(TransactionStatus::Paid->canTransitionTo(TransactionStatus::Created));
        self::assertFalse(TransactionStatus::Created->canTransitionTo(TransactionStatus::Paid));
        self::assertFalse(TransactionStatus::Reconciled->canTransitionTo(TransactionStatus::Processing));
    }

    public function testTerminalStates(): void
    {
        self::assertTrue(TransactionStatus::Refunded->isTerminal());
        self::assertTrue(TransactionStatus::Failed->isTerminal());
        self::assertTrue(TransactionStatus::Cancelled->isTerminal());
        self::assertFalse(TransactionStatus::Paid->isTerminal());
    }

    public function testPaidCanBeRefundedOrSettled(): void
    {
        $next = TransactionStatus::Paid->nextStates();
        self::assertContains(TransactionStatus::Refunded, $next);
        self::assertContains(TransactionStatus::Settled, $next);
    }
}
