<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\RiskRating;
use PHPUnit\Framework\TestCase;

final class RiskRatingTest extends TestCase
{
    public function testScoreBands(): void
    {
        self::assertSame(RiskRating::Low, RiskRating::fromScore(0));
        self::assertSame(RiskRating::Low, RiskRating::fromScore(39));
        self::assertSame(RiskRating::Medium, RiskRating::fromScore(40));
        self::assertSame(RiskRating::Medium, RiskRating::fromScore(69));
        self::assertSame(RiskRating::High, RiskRating::fromScore(70));
        self::assertSame(RiskRating::High, RiskRating::fromScore(100));
    }
}
