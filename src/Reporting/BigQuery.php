<?php
/**
 * Read Commission_Data rows straight from BigQuery (no Composer dependency).
 *
 * Authentication: Google service account key (JSON file outside the web
 * root, path in config bigquery.credentials_path). A JWT signed with the
 * key (RS256) is exchanged for an OAuth access token, scope
 * bigquery.readonly. The account only needs BigQuery Data Viewer on the
 * table and BigQuery Job User on the project.
 *
 * Query: standard SQL, parameterised month bounds, cost cap
 * (maximumBytesBilled). Long jobs are polled; results are paged.
 *
 * monthRows() yields the header first, then one list of strings per row,
 * the same shape as Spreadsheet::rows(), so CommissionImporter applies the
 * exact same cleaning rules as for an uploaded export.
 */
declare(strict_types=1);

namespace App\Reporting;

use RuntimeException;

final class BigQuery
{
    private const SCOPE = 'https://www.googleapis.com/auth/bigquery.readonly';
    private const IDENT = '/^[A-Za-z_][A-Za-z0-9_]{0,299}$/';

    /** @var array<string,mixed> */
    private array $cfg;
    private ?string $token = null;
    private int $tokenExpires = 0;

    public function __construct()
    {
        $this->cfg = $GLOBALS['config']['bigquery'] ?? [];
    }

    public static function enabled(): bool
    {
        return !empty($GLOBALS['config']['bigquery']['enabled']);
    }

    /** Table name shown to users and stored as the import source. */
    public function tableName(): string
    {
        return (string) ($this->cfg['table'] ?? '');
    }

    /**
     * Rows of one month, header first.
     *
     * @return \Generator<int, list<string>>
     */
    public function monthRows(string $period): \Generator
    {
        [$sql, $params] = $this->monthQuery($period);
        $tz = new \DateTimeZone((string) ($this->cfg['timezone'] ?? 'Indian/Mauritius'));
        $dateCol = (string) $this->cfg['date_column'];

        $first = true;
        foreach ($this->query($sql, $params) as [$fields, $row]) {
            if ($first) {
                yield array_map(static fn ($f) => (string) $f['name'], $fields);
                $first = false;
            }
            $out = [];
            foreach ($fields as $i => $f) {
                $out[] = self::cell($row['f'][$i]['v'] ?? null, (string) $f['type'], $f['name'] === $dateCol ? $tz : null);
            }
            yield $out;
        }
        if ($first) {
            throw new RuntimeException("BigQuery returned no row for $period in {$this->tableName()}.");
        }
    }

    /**
     * SQL + named parameters for one month. Identifiers come from config and
     * are validated; values are always query parameters.
     *
     * @return array{0:string, 1:list<array<string,mixed>>}
     */
    public function monthQuery(string $period): array
    {
        $table = (string) ($this->cfg['table'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_$]+$/', $table)) {
            throw new RuntimeException('config bigquery.table must be "project.dataset.table".');
        }
        $cols = $this->cfg['columns'] ?? [];
        $date = (string) ($this->cfg['date_column'] ?? '');
        foreach (array_merge($cols, [$date]) as $c) {
            if (!preg_match(self::IDENT, (string) $c)) {
                throw new RuntimeException("Invalid column name in config bigquery: $c");
            }
        }
        if (!in_array($date, $cols, true)) {
            $cols[] = $date;
        }

        // Month bounds in local time: a transaction at 01:00 Mauritius time on
        // the 1st belongs to that month even though it is the 31st in UTC.
        $tz   = (string) ($this->cfg['timezone'] ?? 'Indian/Mauritius');
        $type = strtoupper((string) ($this->cfg['date_column_type'] ?? 'TIMESTAMP'));
        $expr = match ($type) {
            'TIMESTAMP' => "DATE(`$date`, @tz)",
            'DATETIME'  => "DATE(`$date`)",
            'DATE'      => "`$date`",
            'STRING'    => "SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(`$date`, 1, 10))",
            default     => throw new RuntimeException('config bigquery.date_column_type must be TIMESTAMP, DATETIME, DATE or STRING.'),
        };

        $start = $period . '-01';
        $end   = (new \DateTimeImmutable($start))->modify('last day of this month')->format('Y-m-d');
        $sql   = 'SELECT ' . implode(', ', array_map(static fn ($c) => "`$c`", $cols))
            . " FROM `$table` WHERE $expr BETWEEN @start AND @end";

        $params = [
            ['name' => 'start', 'parameterType' => ['type' => 'DATE'], 'parameterValue' => ['value' => $start]],
            ['name' => 'end', 'parameterType' => ['type' => 'DATE'], 'parameterValue' => ['value' => $end]],
        ];
        if ($type === 'TIMESTAMP') {
            $params[] = ['name' => 'tz', 'parameterType' => ['type' => 'STRING'], 'parameterValue' => ['value' => $tz]];
        }
        return [$sql, $params];
    }

    /**
     * Run a query and yield [schema fields, row] pairs across all pages.
     *
     * @param list<array<string,mixed>> $params
     * @return \Generator<int, array{0:list<array<string,mixed>>, 1:array<string,mixed>}>
     */
    private function query(string $sql, array $params): \Generator
    {
        $project = (string) ($this->cfg['project'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]+$/', $project)) {
            throw new RuntimeException('config bigquery.project is not set.');
        }
        $base = rtrim((string) ($this->cfg['api_base'] ?? 'https://bigquery.googleapis.com'), '/') . "/bigquery/v2/projects/$project";

        $body = [
            'query'          => $sql,
            'useLegacySql'   => false,
            'parameterMode'  => 'NAMED',
            'queryParameters' => $params,
            'timeoutMs'      => 30000,
            'maxResults'     => 10000,
            'maximumBytesBilled' => (string) (int) ($this->cfg['max_bytes_billed'] ?? 10 * 1024 ** 3),
        ];
        if (!empty($this->cfg['location'])) {
            $body['location'] = (string) $this->cfg['location'];
        }
        $res = $this->call('POST', "$base/queries", $body);

        $job      = $res['jobReference'] ?? [];
        $deadline = time() + (int) ($this->cfg['max_wait_seconds'] ?? 300);
        while (empty($res['jobComplete'])) {
            if (time() > $deadline) {
                throw new RuntimeException('BigQuery query did not finish in time.');
            }
            $res = $this->call('GET', $this->resultsUrl($base, $job, null));
        }

        $fields = $res['schema']['fields'] ?? [];
        while (true) {
            foreach ($res['rows'] ?? [] as $row) {
                yield [$fields, $row];
            }
            if (empty($res['pageToken'])) {
                return;
            }
            $res = $this->call('GET', $this->resultsUrl($base, $job, (string) $res['pageToken']));
        }
    }

    /** @param array<string,mixed> $job */
    private function resultsUrl(string $base, array $job, ?string $pageToken): string
    {
        $q = ['maxResults' => 10000, 'timeoutMs' => 30000];
        if (!empty($job['location'])) {
            $q['location'] = $job['location'];
        }
        if ($pageToken !== null) {
            $q['pageToken'] = $pageToken;
        }
        return "$base/queries/" . rawurlencode((string) ($job['jobId'] ?? '')) . '?' . http_build_query($q);
    }

    /**
     * @param array<string,mixed>|null $body
     * @return array<string,mixed>
     */
    private function call(string $method, string $url, ?array $body = null): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 90,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $this->accessToken(), 'Content-Type: application/json'],
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_THROW_ON_ERROR));
        }
        $raw    = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err    = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new RuntimeException('BigQuery unreachable: ' . $err);
        }
        $data = json_decode((string) $raw, true);
        if ($status >= 400 || !is_array($data)) {
            $msg = is_array($data) ? (string) ($data['error']['message'] ?? 'unknown error') : 'invalid response';
            throw new RuntimeException("BigQuery error ($status): $msg");
        }
        return $data;
    }

    /** OAuth access token from the service account key, cached until expiry. */
    private function accessToken(): string
    {
        if ($this->token !== null && time() < $this->tokenExpires - 60) {
            return $this->token;
        }
        $path = (string) ($this->cfg['credentials_path'] ?? '');
        $key  = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        if (!is_array($key) || empty($key['client_email']) || empty($key['private_key'])) {
            throw new RuntimeException('BigQuery service account key not found or invalid (config bigquery.credentials_path).');
        }
        $tokenUri = (string) ($this->cfg['token_uri'] ?? $key['token_uri'] ?? 'https://oauth2.googleapis.com/token');

        $now = time();
        $b64 = static fn (string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
        $unsigned = $b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR)) . '.'
            . $b64(json_encode(['iss' => $key['client_email'], 'scope' => self::SCOPE, 'aud' => $tokenUri,
                'iat' => $now, 'exp' => $now + 3600], JSON_THROW_ON_ERROR));
        $pkey = openssl_pkey_get_private((string) $key['private_key']);
        if ($pkey === false || !openssl_sign($unsigned, $sig, $pkey, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Cannot sign with the BigQuery service account key.');
        }

        $ch = curl_init($tokenUri);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_POSTFIELDS     => http_build_query([
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'  => $unsigned . '.' . $b64($sig),
            ]),
        ]);
        $raw    = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if ($status !== 200 || !is_array($data) || empty($data['access_token'])) {
            // Never log the key or the assertion.
            throw new RuntimeException('BigQuery authentication failed (' . $status . ').');
        }
        $this->token        = (string) $data['access_token'];
        $this->tokenExpires = $now + (int) ($data['expires_in'] ?? 3600);
        return $this->token;
    }

    /**
     * BigQuery REST values are strings; TIMESTAMP is epoch seconds. Convert to
     * what the export contains (local "Y-m-d H:i:s" for the date column).
     */
    private static function cell(mixed $v, string $type, ?\DateTimeZone $tz): string
    {
        if ($v === null) {
            return '';
        }
        if (is_array($v)) {
            return json_encode($v, JSON_UNESCAPED_UNICODE) ?: '';
        }
        $v = (string) $v;
        if ($type === 'TIMESTAMP' && is_numeric($v)) {
            $dt = (new \DateTimeImmutable('@' . (int) floor((float) $v)));
            return $dt->setTimezone($tz ?? new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        }
        if ($type === 'BOOLEAN' || $type === 'BOOL') {
            return strtolower($v) === 'true' ? '1' : '0';
        }
        return $v;
    }
}
