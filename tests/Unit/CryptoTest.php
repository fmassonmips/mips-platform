<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Crypto;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class CryptoTest extends TestCase
{
    public function testRoundTrip(): void
    {
        $secret = 'sk_' . bin2hex(random_bytes(24));
        $blob   = Crypto::encrypt($secret);
        self::assertNotSame($secret, $blob);
        self::assertSame($secret, Crypto::decrypt($blob));
    }

    public function testCiphertextIsNonDeterministic(): void
    {
        // Random IV per call => different ciphertext for the same plaintext.
        self::assertNotSame(Crypto::encrypt('same'), Crypto::encrypt('same'));
    }

    public function testTamperedCiphertextFailsAuthentication(): void
    {
        $blob = Crypto::encrypt('payload');
        $raw  = base64_decode($blob, true);
        $raw[strlen($raw) - 1] = $raw[strlen($raw) - 1] ^ "\x01"; // flip a bit
        $this->expectException(RuntimeException::class);
        Crypto::decrypt(base64_encode($raw));
    }
}
