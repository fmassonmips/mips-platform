<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Rbac;
use PHPUnit\Framework\TestCase;

final class RbacTest extends TestCase
{
    public function testComplianceOfficerCanDecideKyc(): void
    {
        self::assertTrue(Rbac::can(['role' => 'compliance_officer'], 'kyc.decide'));
        self::assertTrue(Rbac::can(['role' => 'compliance_officer'], 'merchant.approve'));
    }

    public function testMerchantCannotApprove(): void
    {
        self::assertFalse(Rbac::can(['role' => 'merchant'], 'merchant.approve'));
        self::assertFalse(Rbac::can(['role' => 'merchant'], 'kyc.decide'));
    }

    public function testFinanceCanSettleButNotApproveKyc(): void
    {
        self::assertTrue(Rbac::can(['role' => 'finance_officer'], 'settlement.batch.manage'));
        self::assertTrue(Rbac::can(['role' => 'finance_officer'], 'reconciliation.manage'));
        self::assertFalse(Rbac::can(['role' => 'finance_officer'], 'kyc.decide'));
    }

    public function testSuperAdminCanDoAnything(): void
    {
        self::assertTrue(Rbac::can(['role' => 'super_admin'], 'anything.at.all'));
    }

    public function testLegacyUserRoleMapsToConsumer(): void
    {
        self::assertTrue(Rbac::can(['role' => 'user'], 'payment.initiate'));
        self::assertFalse(Rbac::can(['role' => 'user'], 'settlement.batch.manage'));
    }

    public function testUnknownPermissionDeniedByDefault(): void
    {
        self::assertFalse(Rbac::can(['role' => 'consumer'], 'platform.routing.manage'));
    }
}
