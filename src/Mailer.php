<?php
/**
 * Plain-text email sender. Transports (config 'mail.transport'):
 *  - smtp : minimal SMTP client (STARTTLS or implicit TLS, AUTH LOGIN)
 *  - mail : PHP mail(), relies on the server's sendmail setup
 *  - log  : writes the message to the PHP error log (development only)
 *
 * send() never throws: it returns false and logs the reason, so a mail
 * outage cannot break the calling request.
 */
declare(strict_types=1);

namespace App;

use RuntimeException;

final class Mailer
{
    public static function send(string $to, string $subject, string $body): bool
    {
        $cfg = $GLOBALS['config']['mail'] ?? [];
        // Header injection guard: no line breaks in header values.
        $to      = str_replace(["\r", "\n"], '', $to);
        $subject = str_replace(["\r", "\n"], ' ', $subject);
        if (filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
            error_log('[Mail] invalid recipient');
            return false;
        }

        try {
            switch ($cfg['transport'] ?? 'log') {
                case 'smtp':
                    self::smtp($cfg, $to, $subject, $body);
                    return true;
                case 'mail':
                    $ok = mail($to, self::encodeHeader($subject), self::wrapBody($body), implode("\r\n", self::headers($cfg, null, null)));
                    if (!$ok) {
                        throw new RuntimeException('mail() returned false');
                    }
                    return true;
                default:
                    error_log("[Mail:log] To: $to | Subject: $subject\n$body");
                    return true;
            }
        } catch (\Throwable $e) {
            error_log('[Mail] ' . $e->getMessage());
            return false;
        }
    }

    /** @param array<string,mixed> $cfg */
    private static function smtp(array $cfg, string $to, string $subject, string $body): void
    {
        $s       = $cfg['smtp'] ?? [];
        $enc     = (string) ($s['encryption'] ?? 'tls');
        $host    = (string) ($s['host'] ?? 'localhost');
        $port    = (int) ($s['port'] ?? 587);
        $timeout = (int) ($s['timeout'] ?? 10);

        $remote = ($enc === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $ctx    = stream_context_create(['ssl' => ['peer_name' => $host, 'verify_peer' => true, 'verify_peer_name' => true]]);
        $sock   = @stream_socket_client($remote, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT, $ctx);
        if ($sock === false) {
            throw new RuntimeException("SMTP connect to $host:$port failed: $errstr");
        }
        stream_set_timeout($sock, $timeout);

        try {
            self::expect($sock, 220);
            $ehlo = 'EHLO ' . (gethostname() ?: 'localhost');
            self::cmd($sock, $ehlo, 250);
            if ($enc === 'tls') {
                self::cmd($sock, 'STARTTLS', 220);
                if (!stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                    throw new RuntimeException('STARTTLS negotiation failed');
                }
                self::cmd($sock, $ehlo, 250);
            }
            if (($s['username'] ?? '') !== '') {
                self::cmd($sock, 'AUTH LOGIN', 334);
                self::cmd($sock, base64_encode((string) $s['username']), 334);
                self::cmd($sock, base64_encode((string) $s['password']), 235);
            }
            self::cmd($sock, 'MAIL FROM:<' . $cfg['from'] . '>', 250);
            self::cmd($sock, 'RCPT TO:<' . $to . '>', [250, 251]);
            self::cmd($sock, 'DATA', 354);

            $headers = self::headers($cfg, $to, $subject);
            $data    = implode("\r\n", $headers) . "\r\n\r\n" . self::wrapBody($body);
            // Dot-stuffing (RFC 5321 4.5.2).
            $data = preg_replace('/^\./m', '..', $data);
            fwrite($sock, $data . "\r\n.\r\n");
            self::expect($sock, 250);
            fwrite($sock, "QUIT\r\n");
        } finally {
            fclose($sock);
        }
    }

    /**
     * @param array<string,mixed> $cfg
     * @return list<string>
     */
    private static function headers(array $cfg, ?string $to, ?string $subject): array
    {
        $fromName = str_replace(["\r", "\n", '"'], '', (string) ($cfg['from_name'] ?? ''));
        $domain   = substr(strrchr((string) $cfg['from'], '@') ?: '@localhost', 1);
        $headers  = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . ($fromName !== '' ? self::encodeHeader($fromName) . ' ' : '') . '<' . $cfg['from'] . '>',
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . $domain . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: quoted-printable',
            'Auto-Submitted: auto-generated',
        ];
        // mail() adds To/Subject itself.
        if ($to !== null) {
            $headers[] = 'To: <' . $to . '>';
        }
        if ($subject !== null) {
            $headers[] = 'Subject: ' . self::encodeHeader($subject);
        }
        return $headers;
    }

    private static function encodeHeader(string $v): string
    {
        return preg_match('/[^\x20-\x7E]/', $v) ? '=?UTF-8?B?' . base64_encode($v) . '?=' : $v;
    }

    private static function wrapBody(string $body): string
    {
        return quoted_printable_encode(str_replace(["\r\n", "\r", "\n"], ["\n", "\n", "\r\n"], $body));
    }

    /** @param resource $sock */
    private static function cmd($sock, string $line, int|array $expect): string
    {
        fwrite($sock, $line . "\r\n");
        return self::expect($sock, $expect);
    }

    /**
     * Read a (possibly multi-line) reply and check its code.
     *
     * @param resource      $sock
     * @param int|list<int> $expect
     */
    private static function expect($sock, int|array $expect): string
    {
        $reply = '';
        while (($line = fgets($sock, 515)) !== false) {
            $reply .= $line;
            if (strlen($line) < 4 || $line[3] !== '-') {
                break;
            }
        }
        $code = (int) substr($reply, 0, 3);
        if (!in_array($code, (array) $expect, true)) {
            // Never echo credentials: replies only, not our commands.
            throw new RuntimeException('SMTP unexpected reply: ' . trim($reply));
        }
        return $reply;
    }
}
