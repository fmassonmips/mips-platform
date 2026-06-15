<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Reference;
use PHPUnit\Framework\TestCase;

final class ReferenceTest extends TestCase
{
    public function testPrefixAndCharset(): void
    {
        $ref = Reference::transaction();
        self::assertStringStartsWith('TXN_', $ref);
        // Body uses Crockford base32 (no I, L, O, U).
        self::assertMatchesRegularExpression('/^TXN_[0-9A-HJKMNP-TV-Z]+$/', $ref);
    }

    public function testReferencesAreUnique(): void
    {
        $seen = [];
        for ($i = 0; $i < 500; $i++) {
            $seen[Reference::merchant()] = true;
        }
        self::assertCount(500, $seen);
    }

    public function testRegulatedTransactionPrefix(): void
    {
        self::assertStringStartsWith('RGT_', Reference::regulatedTransaction());
    }
}
