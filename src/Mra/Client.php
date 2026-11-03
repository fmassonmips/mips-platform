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
 * (retry later) from rejections of the request itself, isAccount() a problem
 * with the company's credentials or the configuration (nothing to retry until
 * fixed), isUncertain() an invoice sent without an answer (it may have been
 * fiscalised: never resend it automatically).
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
    public function authenticate(string $username, string $password, string $ebsMraId, bool $refresh = false): array
    {
        $ourKey  = random_bytes(32);
        $payload = json_encode([
            'username'     => $username,
            'password'     => $password,
            'encryptKey'   => base64_encode($ourKey),
            'refreshToken' => $refresh ? 'true' : 'false',   // true: renewing in the 10 minutes before expiry (§ 5.1.4)
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        $publicKey = $this->publicKey();
        if (!openssl_public_encrypt($payload, $encrypted, $publicKey, OPENSSL_PKCS1_PADDING)) {
            throw MraException::account('Impossible de chiffrer les identifiants avec la clé publique MRA (identifiants trop longs pour la clé ?).');
        }

        $requestId = self::requestId();
        $response  = $this->post((string) $this->cfg['auth_url'], [
            'username: ' . $username,
            'ebsMraId: ' . $ebsMraId,
        ], [
            'requestId' => $requestId,
            'payload'   => base64_encode($encrypted),
        ], false);

        if (($response['status'] ?? '') !== 'SUCCESS' || !is_string($response['token'] ?? null) || !is_string($response['key'] ?? null)) {
            throw MraException::account('Échec de l’authentification MRA : ' . self::errors($response));
        }

        $decrypted = openssl_decrypt((string) base64_decode($response['key'], true), 'aes-256-ecb', $ourKey, OPENSSL_RAW_DATA);
        if ($decrypted === false) {
            throw MraException::account('Impossible de déchiffrer la clé de session renvoyée par la MRA.');
        }
        // The session key comes back either raw or as a base64 string.
        $sessionKey = strlen($decrypted) === 32 ? $decrypted : base64_decode($decrypted, true);
        if (!is_string($sessionKey) || strlen($sessionKey) !== 32) {
            throw MraException::account('Format de clé de session inattendu renvoyé par la MRA.');
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
            throw new MraException('Impossible de chiffrer les données de la facture.', false);
        }

        $response = $this->post((string) $this->cfg['transmit_url'], [
            'username: ' . $username,
            'ebsMraId: ' . $ebsMraId,
            'token: ' . $token,
        ], [
            'requestId'        => self::requestId(),
            'requestDateTime'  => date('Ymd H:i:s'),
            'signedHash'       => '',
            'encryptedInvoice' => base64_encode($encrypted),
        ], true);
        // A test environment's IRN is not legal: in production, only a LIVE answer counts.
        $environment = strtoupper((string) ($response['environment'] ?? ''));
        if (self::isProduction() && $environment !== '' && $environment !== 'LIVE') {
            throw MraException::account('La MRA a répondu depuis l’environnement ' . $environment . ', pas LIVE : vérifiez les URL MRA (mra.auth_url, mra.transmit_url).');
        }
        return $response;
    }

    /** Anything but a declared demo or development instance counts as production. */
    public static function isProduction(): bool
    {
        return !in_array($GLOBALS['config']['app']['env'] ?? 'production', ['demo', 'development'], true);
    }

    /**
     * @param list<string> $headers
     * @param array<string,mixed> $body
     * @param bool $invoice true when the body carries invoices: a lost answer is then uncertain
     * @return array<string,mixed>
     */
    private function post(string $url, array $headers, array $body, bool $invoice): array
    {
        foreach ($headers as $h) {
            if (preg_match('/[\r\n]/', $h)) {
                throw MraException::account('Valeur d’en-tête invalide (identifiants MRA).');
            }
        }
        // In production a sandbox or simulation URL would store a non-legal IRN as "fiscalised":
        // refuse, the documents stay pending until the LIVE URLs are configured.
        if ($url === '' || (self::isProduction() && preg_match('/sandbox|simulation|conformance/i', $url))) {
            throw MraException::account('Configuration MRA incomplète : renseignez les URL LIVE du portail MRA (mra.auth_url, mra.transmit_url).');
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
        $raw     = curl_exec($ch);
        $status  = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error   = curl_error($ch);
        $errno   = curl_errno($ch);
        $sentAll = (float) curl_getinfo($ch, CURLINFO_PRETRANSFER_TIME) > 0;   // connected, request on its way
        curl_close($ch);

        if ($raw === false) {
            // Timeout or cut connection once the invoice was sent: MRA may have fiscalised it.
            if ($invoice && $sentAll && in_array($errno, [CURLE_OPERATION_TIMEDOUT, CURLE_GOT_NOTHING, CURLE_RECV_ERROR, CURLE_SEND_ERROR], true)) {
                throw new MraException('Pas de réponse de la MRA après l’envoi (' . $error . ') : le document a peut-être été fiscalisé. Vérifiez sur le portail MRA avant de le renvoyer.', false, false, false, true);
            }
            throw new MraException('Impossible de joindre la MRA : ' . $error);
        }
        $data = json_decode((string) $raw, true);
        if ($status >= 500 || !is_array($data)) {
            throw new MraException('La MRA a répondu HTTP ' . $status . '.');
        }
        if ($status >= 400 && !$invoice) {
            // Authentication refused (credentials, EBS not active, key): the company's settings, not a document.
            throw MraException::account('Échec de l’authentification MRA : ' . self::errors($data));
        }
        if ($status >= 400) {
            // Invalid/expired token (ERR0050) is transient: re-authenticating fixes it.
            $tokenProblem = str_contains(self::errors($data), 'ERR0050');
            throw new MraException('La MRA a rejeté la requête : ' . self::errors($data), $tokenProblem, $tokenProblem);
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
            throw MraException::account('La clé publique MRA est absente ou invalide (config mra.public_key_file).');
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
