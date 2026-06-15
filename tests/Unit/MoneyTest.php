<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Money;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class MoneyTest extends TestCase
{
    public function testToMinorConvertsMajorUnits(): void
    {
        self::assertSame(150050, Money::toMinor('1500.50'));
        self::assertSame(100000, Money::toMinor('1000'));
        self::assertSame(5, Money::toMinor('0.05'));
    }

    public function testToMinorTruncatesExtraFractionDigits(): void
    {
        self::assertSame(123, Money::toMinor('1.239'));
    }

    public function testFormatRendersMinorUnits(): void
    {
        self::assertSame('1,500.50', Money::format(150050));
        self::assertSame('0.00', Money::format(0));
    }

    public function testToMinorRejectsNonNumeric(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Money::toMinor('abc');
    }

    public function testSupportedCurrencies(): void
    {
        self::assertTrue(Money::isSupported('MUR'));
        self::assertFalse(Money::isSupported('XXX'));
    }
}
