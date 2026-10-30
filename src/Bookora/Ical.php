<?php
/**
 * Calendar sync with Airbnb, Booking.com and the like (iCal, RFC 5545).
 *
 * Export: one feed per place listing the nights taken here (confirmed stays,
 * held requests, the owner's closures), never imported events (no echo back)
 * and never guest names. Import: the platform's feed replaces this place's
 * imported blocks; an imported stay that overlaps a confirmed booking here
 * is reported as a double booking. The import only fetches https URLs whose
 * host resolves to public addresses, pinned for the request (no SSRF through
 * DNS tricks), without redirects, size and time capped.
 */
declare(strict_types=1);

namespace App\Bookora;

use App\Database;
use App\RendezVous\Booking;

final class Ical
{
    private const MAX_BYTES = 1_000_000;

    /**
     * @param array<string,mixed> $unit
     */
    public static function export(array $unit): string
    {
        $pdo   = Database::connection();
        $since = Booking::now()->modify('-30 days')->format('Y-m-d');
        $b = $pdo->prepare(
            'SELECT id, check_in, check_out, status FROM bookora_bookings WHERE unit_id = :u AND check_out >= :s
               AND (status = \'confirmed\' OR (status = \'new\' AND hold_until > :now)) ORDER BY check_in'
        );
        $b->execute([':u' => (int) $unit['id'], ':s' => $since, ':now' => Booking::now()->format('Y-m-d H:i:s')]);
        $k = $pdo->prepare('SELECT id, start_date, end_date FROM bookora_blocks WHERE unit_id = :u AND source = \'manual\' AND end_date >= :s ORDER BY start_date');
        $k->execute([':u' => (int) $unit['id'], ':s' => $since]);

        $stamp = gmdate('Ymd\THis\Z');
        $host  = parse_url((string) ($GLOBALS['config']['app']['url'] ?? ''), PHP_URL_HOST) ?: 'mips.mu';
        $out   = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MIPS//Bookora//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
                  'X-WR-CALNAME:' . self::escape((string) $unit['name'])];
        $event = static function (string $uid, string $start, string $end, string $summary) use (&$out, $stamp): void {
            array_push($out, 'BEGIN:VEVENT', 'UID:' . $uid, 'DTSTAMP:' . $stamp, 'DTSTART;VALUE=DATE:' . str_replace('-', '', $start),
                'DTEND;VALUE=DATE:' . str_replace('-', '', $end), 'SUMMARY:' . $summary, 'END:VEVENT');
        };
        foreach ($b->fetchAll() as $r) {
            $event('booking-' . $r['id'] . '@' . $host, (string) $r['check_in'], (string) $r['check_out'], $r['status'] === 'new' ? 'Option' : 'Réservé');
        }
        foreach ($k->fetchAll() as $r) {
            $event('block-' . $r['id'] . '@' . $host, (string) $r['start_date'], (string) $r['end_date'], 'Fermé');
        }
        $out[] = 'END:VCALENDAR';
        return implode("\r\n", $out) . "\r\n";
    }

    /**
     * Fetch the place's imported calendar and replace its imported blocks.
     *
     * @param array<string,mixed> $unit
     * @return array{0:int,1:?string} [events imported, error or double-booking warning]
     */
    public static function sync(array $unit): array
    {
        $url = (string) ($unit['ical_import_url'] ?? '');
        if ($url === '') {
            return [0, null];
        }
        [$body, $error] = self::fetch($url);
        $events = $body !== null ? self::parse($body) : [];
        if ($body !== null && $events === null) {
            $error = 'Le contenu reçu n\'est pas un calendrier iCal.';
        }
        $pdo = Database::connection();
        $now = Booking::now();
        if ($error !== null) {
            // Keep the previous blocks: a platform being down must not reopen nights it had taken.
            $pdo->prepare('UPDATE bookora_units SET ical_error = :e, ical_synced_at = :at WHERE id = :u')
                ->execute([':e' => mb_substr($error, 0, 300), ':at' => $now->format('Y-m-d H:i:s'), ':u' => (int) $unit['id']]);
            return [0, $error];
        }
        $today = $now->format('Y-m-d');
        $keep  = array_values(array_filter($events, static fn (array $e): bool => $e['end'] > $today));
        $warn  = null;
        $pdo->beginTransaction();
        try {
            $pdo->prepare('SELECT id FROM bookora_units WHERE id = :u FOR UPDATE')->execute([':u' => (int) $unit['id']]);
            $pdo->prepare('DELETE FROM bookora_blocks WHERE unit_id = :u AND source = \'ical\'')->execute([':u' => (int) $unit['id']]);
            $ins = $pdo->prepare(
                'INSERT INTO bookora_blocks (unit_id, start_date, end_date, reason, source, created_at) VALUES (:u, :s, :e, :r, \'ical\', :at)'
            );
            $clash = $pdo->prepare(
                'SELECT number FROM bookora_bookings WHERE unit_id = :u AND status = \'confirmed\' AND check_in < :e AND check_out > :s LIMIT 1'
            );
            foreach ($keep as $e) {
                $ins->execute([':u' => (int) $unit['id'], ':s' => $e['start'], ':e' => $e['end'], ':r' => $e['summary'], ':at' => $now->format('Y-m-d H:i:s')]);
                $clash->execute([':u' => (int) $unit['id'], ':e' => $e['end'], ':s' => $e['start']]);
                if ($warn === null && ($n = $clash->fetchColumn()) !== false) {
                    $warn = 'Double réservation : le calendrier importé occupe des nuits de la réservation n° ' . $n
                          . ' (' . substr($e['start'], 8, 2) . '/' . substr($e['start'], 5, 2) . ' → ' . substr($e['end'], 8, 2) . '/' . substr($e['end'], 5, 2) . ').';
                }
            }
            $pdo->prepare('UPDATE bookora_units SET ical_error = :e, ical_synced_at = :at WHERE id = :u')
                ->execute([':e' => $warn, ':at' => $now->format('Y-m-d H:i:s'), ':u' => (int) $unit['id']]);
            $pdo->commit();
        } catch (\Throwable $ex) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $ex;
        }
        if ($warn !== null) {
            Notifier::safely(static fn () => Notifier::doubleBooking((int) $unit['organization_id'], (string) $unit['name'], $warn));
        }
        return [count($keep), $warn];
    }

    /**
     * Events with all-day or timed start/end, as nights [start, end).
     *
     * @return list<array{start:string,end:string,summary:?string}>|null null when not a calendar
     */
    public static function parse(string $ics): ?array
    {
        $ics = str_replace(["\r\n", "\r"], "\n", $ics);
        if (!str_contains($ics, 'BEGIN:VCALENDAR')) {
            return null;
        }
        $ics    = preg_replace("/\n[ \t]/", '', $ics) ?? '';   // unfold long lines
        $events = [];
        $cur    = null;
        foreach (explode("\n", $ics) as $line) {
            if ($line === 'BEGIN:VEVENT') {
                $cur = ['start' => null, 'end' => null, 'summary' => null, 'cancelled' => false];
                continue;
            }
            if ($cur === null) {
                continue;
            }
            if ($line === 'END:VEVENT') {
                if ($cur['start'] !== null && !$cur['cancelled']) {
                    $end = $cur['end'] ?? (new \DateTimeImmutable($cur['start']))->modify('+1 day')->format('Y-m-d');
                    if ($end <= $cur['start']) {
                        $end = (new \DateTimeImmutable($cur['start']))->modify('+1 day')->format('Y-m-d');
                    }
                    $events[] = ['start' => $cur['start'], 'end' => $end, 'summary' => $cur['summary']];
                }
                $cur = null;
                continue;
            }
            $pos = strpos($line, ':');
            if ($pos === false) {
                continue;
            }
            $name  = strtoupper(explode(';', substr($line, 0, $pos))[0]);
            $value = trim(substr($line, $pos + 1));
            if ($name === 'DTSTART' || $name === 'DTEND') {
                if (preg_match('/^(\d{4})(\d{2})(\d{2})/', $value, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
                    $cur[$name === 'DTSTART' ? 'start' : 'end'] = $m[1] . '-' . $m[2] . '-' . $m[3];
                }
            } elseif ($name === 'SUMMARY') {
                $cur['summary'] = mb_substr(str_replace(['\\,', '\\;', '\\n', '\\N', '\\\\'], [',', ';', ' ', ' ', '\\'], $value), 0, 200) ?: null;
            } elseif ($name === 'STATUS' && strtoupper($value) === 'CANCELLED') {
                $cur['cancelled'] = true;
            }
            if (count($events) >= 2000) {
                break;
            }
        }
        return $events;
    }

    /**
     * @return array{0:?string,1:?string} [body, error]
     */
    private static function fetch(string $url): array
    {
        $cfg     = $GLOBALS['config']['bookora'] ?? [];
        $private = ($cfg['ical_allow_private'] ?? false) === true;
        $parts   = parse_url($url);
        $scheme  = strtolower((string) ($parts['scheme'] ?? ''));
        $host    = (string) ($parts['host'] ?? '');
        if ($host === '' || !($scheme === 'https' || ($scheme === 'http' && $private))) {
            return [null, 'Adresse refusée : utilisez le lien https fourni par la plateforme.'];
        }
        $port = (int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));
        if (!$private && $port !== 443) {
            return [null, 'Adresse refusée : utilisez le lien https fourni par la plateforme.'];
        }
        $ips  = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
        if ($ips === []) {
            return [null, 'Adresse introuvable (' . $host . ').'];
        }
        foreach ($ips as $ip) {
            if (!$private && (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) || self::inDeniedRange($ip))) {
                return [null, 'Adresse refusée : réseau privé.'];
            }
        }
        $buf = '';
        $ch  = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RESOLVE         => [$host . ':' . $port . ':' . $ips[0]],
            CURLOPT_FOLLOWLOCATION  => false,
            CURLOPT_PROXY           => '',    // never through a proxy set in the environment: the pinned IP is the one checked
            CURLOPT_NOPROXY         => '*',
            CURLOPT_SSL_VERIFYPEER  => true,
            CURLOPT_SSL_VERIFYHOST  => 2,
            CURLOPT_PROTOCOLS       => $private ? (CURLPROTO_HTTPS | CURLPROTO_HTTP) : CURLPROTO_HTTPS,
            CURLOPT_TIMEOUT         => (int) ($cfg['ical_timeout'] ?? 10),
            CURLOPT_CONNECTTIMEOUT  => 5,
            CURLOPT_USERAGENT       => 'MIPS-Bookora/1.0',
            CURLOPT_HTTPHEADER      => ['Accept: text/calendar'],
            CURLOPT_WRITEFUNCTION   => static function ($ch, string $chunk) use (&$buf): int {
                $buf .= $chunk;
                return strlen($buf) > self::MAX_BYTES ? 0 : strlen($chunk);   // 0 aborts the transfer
            },
        ]);
        $ok     = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err    = curl_error($ch);
        curl_close($ch);
        if (strlen($buf) > self::MAX_BYTES) {
            return [null, 'Calendrier trop volumineux.'];
        }
        if ($ok === false) {
            error_log('[Bookora iCal] ' . $host . ': ' . $err);   // details for us, not for the tenant
            return [null, 'Calendrier injoignable. Vérifiez le lien.'];
        }
        if ($status !== 200) {
            return [null, 'Calendrier injoignable (HTTP ' . $status . ').'];
        }
        return [$buf, null];
    }

    /**
     * IPv4 ranges PHP's NO_PRIV/NO_RES flags let through: carrier-grade NAT,
     * IETF protocol assignments, benchmarking, multicast and reserved.
     */
    private static function inDeniedRange(string $ip): bool
    {
        $n = ip2long($ip);
        if ($n === false) {
            return false;
        }
        foreach (['100.64.0.0/10', '192.0.0.0/24', '198.18.0.0/15', '224.0.0.0/4', '240.0.0.0/4'] as $cidr) {
            [$base, $bits] = explode('/', $cidr);
            $mask = -1 << (32 - (int) $bits);
            if (($n & $mask) === (ip2long($base) & $mask)) {
                return true;
            }
        }
        return false;
    }

    private static function escape(string $text): string
    {
        return str_replace(['\\', ';', ',', "\n", "\r"], ['\\\\', '\\;', '\\,', '\\n', ''], $text);
    }
}
