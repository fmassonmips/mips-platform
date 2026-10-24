<?php
/**
 * MRA e-Invoicing System API client (Technical Guidelines 2023, sections 5 and 6).
 *
 * Authentication: a random AES-256 key is generated, the credentials JSON
 * (with that key as "encryptKey") is RSA-encrypted with the MRA public key.
 * MRA answers with a token (valid ~1 day) and a session key, itself
 * AES-256-ECB encrypted with our key.
 *
 * Transmission: the invoice JSON array is AES-256-ECB encrypted with the
 * session key; MRA answers with an IRN (uuid) and a QR code per invoice.
 *
 * Throws MraException; isTransient() tells network/server/token errors
 * (retry later) from rejections of the request itself.
 */
declare(strict_types=1);

namespace App\Mra;

final class Client
{
    /**
     * @param array<string,mixed> $cfg $config['mra']
     */
    public function __construct(private readonly array $cfg)
    {
    }

    public static function fromConfig(): self
    {
        return new self($GLOBALS['config']['mra'] ?? []);
    }

    /**
     * @return array{token:string,key:string,expires_at:string} key = raw 32-byte session key
     */
    public function authenticate(string $username, string $password, string $ebsMraId): array
    {
        $ourKey  = random_bytes(32);
        $payload = json_encode([
            'username'     => $username,
            'password'     => $password,
            'encryptKey'   => base64_encode($ourKey),
            'refreshToken' => 'false',
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        $publicKey = $this->publicKey();
        if (!openssl_public_encrypt($payload, $encrypted, $publicKey, OPENSSL_PKCS1_PADDING)) {
            throw new MraException('Could not encrypt the credentials with the MRA public key (credentials too long for the key?).');
        }

        $requestId = self::requestId();
        $response  = $this->post((string) $this->cfg['auth_url'], [
            'username: ' . $username,
            'ebsMraId: ' . $ebsMraId,
        ], [
            'requestId' => $requestId,
            'payload'   => base64_encode($encrypted),
        ]);

        if (($response['status'] ?? '') !== 'SUCCESS' || !is_string($response['token'] ?? null) || !is_string($response['key'] ?? null)) {
            throw new MraException('MRA authentication failed: ' . self::errors($response), false);
        }

        $decrypted = openssl_decrypt((string) base64_decode($response['key'], true), 'aes-256-ecb', $ourKey, OPENSSL_RAW_DATA);
        if ($decrypted === false) {
            throw new MraException('Could not decrypt the session key returned by MRA.', false);
        }
        // The session key comes back either raw or as a base64 string.
        $sessionKey = strlen($decrypted) === 32 ? $decrypted : base64_decode($decrypted, true);
        if (!is_string($sessionKey) || strlen($sessionKey) !== 32) {
            throw new MraException('Unexpected session key format returned by MRA.', false);
        }

        $expires = \DateTimeImmutable::createFromFormat('Ymd H:i:s', trim((string) ($response['expiryDate'] ?? '')));
        return [
            'token'      => $response['token'],
            'key'        => $sessionKey,
            'expires_at' => ($expires ?: new \DateTimeImmutable('+12 hours'))->format('Y-m-d H:i:s'),
        ];
    }

    /**
     * Transmit invoices; returns the decoded MRA response.
     *
     * @param list<array<string,mixed>> $invoices
     * @return array<string,mixed>
     */
    public function transmit(string $username, string $ebsMraId, string $token, string $sessionKey, array $invoices): array
    {
        $json = json_encode($invoices, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $encrypted = openssl_encrypt($json, 'aes-256-ecb', $sessionKey, OPENSSL_RAW_DATA);
        if ($encrypted === false) {
            throw new MraException('Could not encrypt the invoice data.', false);
        }

        return $this->post((string) $this->cfg['transmit_url'], [
            'username: ' . $username,
            'ebsMraId: ' . $ebsMraId,
            'token: ' . $token,
        ], [
            'requestId'        => self::requestId(),
            'requestDateTime'  => date('Ymd H:i:s'),
            'signedHash'       => '',
            'encryptedInvoice' => base64_encode($encrypted),
        ]);
    }

    /**
     * @param list<string> $headers
     * @param array<string,mixed> $body
     * @return array<string,mixed>
     */
    private function post(string $url, array $headers, array $body): array
    {
        foreach ($headers as $h) {
            if (preg_match('/[\r\n]/', $h)) {
                throw new MraException('Invalid header value.', false);
            }
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            CURLOPT_HTTPHEADER     => array_merge(['Content-Type: application/json', 'Accept: application/json'], $headers),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => (int) ($this->cfg['timeout'] ?? 20),
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        $raw    = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error  = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new MraException('Could not reach MRA: ' . $error);
        }
        $data = json_decode((string) $raw, true);
        if ($status >= 500 || !is_array($data)) {
            throw new MraException('MRA returned HTTP ' . $status . '.');
        }
        if ($status >= 400) {
            // Invalid/expired token is transient: re-authenticating fixes it.
            $tokenProblem = str_contains(self::errors($data), 'ERR0050') || str_contains(strtolower(self::errors($data)), 'token');
            throw new MraException('MRA rejected the request: ' . self::errors($data), $tokenProblem, $tokenProblem);
        }
        return $data;
    }

    private function publicKey(): \OpenSSLAsymmetricKey
    {
        $file = (string) ($this->cfg['public_key_file'] ?? '');
        $pem  = is_file($file) ? (string) file_get_contents($file) : '';
        if ($pem !== '' && !str_contains($pem, '-----BEGIN')) {
            // Portal key delivered as bare base64 DER.
            $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(preg_replace('/\s+/', '', $pem) ?? '', 64, "\n") . "-----END PUBLIC KEY-----\n";
        }
        $key = $pem !== '' ? openssl_pkey_get_public($pem) : false;
        if ($key === false) {
            throw new MraException('The MRA public key is missing or invalid (config mra.public_key_file).', false);
        }
        return $key;
    }

    /**
     * @param array<string,mixed> $response
     */
    public static function errors(array $response): string
    {
        $parts = [];
        foreach (['errors', 'errorMessages'] as $field) {
            foreach ((array) ($response[$field] ?? []) as $err) {
                $parts[] = is_array($err) ? trim(($err['code'] ?? '') . ' ' . ($err['description'] ?? '')) : (string) $err;
            }
        }
        return $parts !== [] ? implode('; ', $parts) : 'status ' . (string) ($response['status'] ?? 'unknown');
    }

    private static function requestId(): string
    {
        return date('YmdHis') . bin2hex(random_bytes(6));
    }
}
