<?php
/**
 * Minimal SMTP client (no dependency): STARTTLS or implicit TLS, AUTH LOGIN,
 * one recipient, multipart/alternative text + HTML body, UTF-8 throughout.
 *
 * Configured by $config['mail']. Throws \RuntimeException on any failure;
 * the message is safe to log but may contain the server's reply.
 */
declare(strict_types=1);

namespace App\Mail;

use RuntimeException;

final class SmtpMailer
{
    /** @var resource|null */
    private $socket = null;

    /**
     * @param array<string,mixed> $cfg
     */
    public function __construct(private readonly array $cfg)
    {
    }

    public static function isConfigured(): bool
    {
        return trim((string) ($GLOBALS['config']['mail']['host'] ?? '')) !== '';
    }

    public static function fromConfig(): self
    {
        return new self($GLOBALS['config']['mail'] ?? []);
    }

    public function send(string $to, string $subject, string $text, string $html, string $fromName, ?string $replyTo = null): void
    {
        foreach ([$to, $replyTo, $subject, $fromName] as $header) {
            if ($header !== null && preg_match('/[\r\n]/', $header)) {
                throw new RuntimeException('Invalid header value.');
            }
        }
        if (!filter_var($to, FILTER_VALIDATE_EMAIL) || ($replyTo !== null && !filter_var($replyTo, FILTER_VALIDATE_EMAIL))) {
            throw new RuntimeException('Invalid e-mail address.');
        }

        $from = (string) $this->cfg['from_address'];
        try {
            $this->connect();
            $this->command('MAIL FROM:<' . $from . '>', 250);
            $this->command('RCPT TO:<' . $to . '>', [250, 251]);
            $this->command('DATA', 354);
            $this->write($this->message($from, $to, $subject, $text, $html, $fromName, $replyTo) . "\r\n.");
            $this->expect(250);
            $this->command('QUIT', 221);
        } finally {
            if (is_resource($this->socket)) {
                fclose($this->socket);
            }
            $this->socket = null;
        }
    }

    private function connect(): void
    {
        $host    = (string) $this->cfg['host'];
        $port    = (int) ($this->cfg['port'] ?? 587);
        $enc     = (string) ($this->cfg['encryption'] ?? 'tls');
        $timeout = (int) ($this->cfg['timeout'] ?? 15);

        $remote = ($enc === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $socket = @stream_socket_client($remote, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT, stream_context_create([
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $host],
        ]));
        if ($socket === false) {
            throw new RuntimeException("SMTP connection failed: $errstr ($errno)");
        }
        stream_set_timeout($socket, $timeout);
        $this->socket = $socket;

        $this->expect(220);
        $ehlo = 'EHLO ' . (gethostname() ?: 'localhost');
        $this->command($ehlo, 250);

        if ($enc === 'tls') {
            $this->command('STARTTLS', 220);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                throw new RuntimeException('SMTP STARTTLS negotiation failed.');
            }
            $this->command($ehlo, 250);
        }

        $user = (string) ($this->cfg['username'] ?? '');
        if ($user !== '') {
            $this->command('AUTH LOGIN', 334);
            $this->command(base64_encode($user), 334);
            $this->command(base64_encode((string) ($this->cfg['password'] ?? '')), 235, 'AUTH (password)');
        }
    }

    private function message(string $from, string $to, string $subject, string $text, string $html, string $fromName, ?string $replyTo): string
    {
        $boundary = 'b' . bin2hex(random_bytes(12));
        $domain   = substr(strrchr($from, '@') ?: '@localhost', 1);
        $headers  = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . $this->encodeHeader($fromName) . ' <' . $from . '>',
            'To: <' . $to . '>',
            'Subject: ' . $this->encodeHeader($subject),
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . $domain . '>',
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];
        if ($replyTo !== null) {
            $headers[] = 'Reply-To: <' . $replyTo . '>';
        }

        $part = static fn (string $type, string $body): string =>
            "--$boundary\r\nContent-Type: $type; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . rtrim(chunk_split(base64_encode($body), 76, "\r\n")) . "\r\n";

        // Base64 bodies never start a line with '.', so no dot-stuffing is needed.
        return implode("\r\n", $headers) . "\r\n\r\n"
            . $part('text/plain', $text)
            . $part('text/html', $html)
            . "--$boundary--";
    }

    private function encodeHeader(string $value): string
    {
        return preg_match('/^[\x20-\x7E]*$/', $value) ? $value : '=?UTF-8?B?' . base64_encode($value) . '?=';
    }

    /**
     * @param int|list<int> $expected
     */
    private function command(string $line, int|array $expected, ?string $label = null): void
    {
        $this->write($line);
        $this->expect($expected, $label ?? strtok($line, ' '));
    }

    private function write(string $data): void
    {
        if (fwrite($this->socket, $data . "\r\n") === false) {
            throw new RuntimeException('SMTP write failed.');
        }
    }

    /**
     * @param int|list<int> $expected
     */
    private function expect(int|array $expected, string $after = 'connect'): void
    {
        $reply = '';
        while (($line = fgets($this->socket, 1024)) !== false) {
            $reply .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        $code = (int) substr($reply, 0, 3);
        if (!in_array($code, (array) $expected, true)) {
            throw new RuntimeException('SMTP error after ' . $after . ': ' . trim($reply !== '' ? $reply : 'no reply'));
        }
    }
}
