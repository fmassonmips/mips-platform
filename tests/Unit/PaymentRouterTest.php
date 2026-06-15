<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\PaymentType;
use App\Providers\ProviderRegistry;
use App\Routing\PaymentRouter;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class PaymentRouterTest extends TestCase
{
    private function router(): PaymentRouter
    {
        $providers = [
            'passpass' => ['enabled' => true, 'mode' => 'sandbox'],
            'paypump'  => ['enabled' => true, 'mode' => 'sandbox'],
            'inflow'   => ['enabled' => true, 'mode' => 'sandbox'],
            'cardrail' => ['enabled' => true, 'mode' => 'stub'],
        ];
        $routing = [
            'rules' => [
                'BANK_TRANSFER'    => 'passpass',
                'QR'               => 'passpass',
                'PAYPUMP_TRANSFER' => 'paypump',
                'WORKFLOW'         => 'inflow',
                'CARD'             => 'cardrail',
            ],
            'priority' => ['passpass', 'paypump', 'inflow', 'cardrail'],
            'default'  => 'passpass',
        ];
        return new PaymentRouter(new ProviderRegistry($providers), $routing);
    }

    public function testEachTypeRoutesToExpectedProvider(): void
    {
        $r = $this->router();
        self::assertSame('passpass', $r->resolveKey(PaymentType::BankTransfer));
        self::assertSame('passpass', $r->resolveKey(PaymentType::Qr));
        self::assertSame('paypump', $r->resolveKey(PaymentType::PaypumpTransfer));
        self::assertSame('inflow', $r->resolveKey(PaymentType::Workflow));
        self::assertSame('cardrail', $r->resolveKey(PaymentType::Card));
    }

    public function testRoutedProviderSupportsTheType(): void
    {
        $provider = $this->router()->route(PaymentType::BankTransfer);
        self::assertSame('passpass', $provider->name());
        self::assertTrue($provider->supports(PaymentType::BankTransfer));
    }

    public function testFallsBackToPriorityWhenNoExplicitRule(): void
    {
        // PAYMENT_LINK has no explicit rule above; priority finds passpass.
        self::assertSame('passpass', $this->router()->resolveKey(PaymentType::PaymentLink));
    }

    public function testUnroutableWhenProviderDisabled(): void
    {
        $registry = new ProviderRegistry([
            'passpass' => ['enabled' => false],
            'paypump'  => ['enabled' => false],
            'inflow'   => ['enabled' => false],
            'cardrail' => ['enabled' => false],
        ]);
        $router = new PaymentRouter($registry, ['rules' => [], 'priority' => ['passpass'], 'default' => 'passpass']);
        $this->expectException(RuntimeException::class);
        $router->resolveKey(PaymentType::BankTransfer);
    }
}
