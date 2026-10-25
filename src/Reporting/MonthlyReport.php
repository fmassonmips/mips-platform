<?php
/**
 * Monthly transaction report for one period, compared with the previous
 * month when it has been imported. Mirrors the frozen MIPS analytics
 * layout so figures stay comparable month to month.
 *
 * Volumes are MUR only; non-MUR rows are counted and summed per currency
 * in the FX section, never converted.
 */
declare(strict_types=1);

namespace App\Reporting;

use App\Database;
use PDO;

final class MonthlyReport
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::connection();
    }

    /** @return list<string> imported periods, most recent first */
    public function periods(): array
    {
        return array_map('strval', $this->db->query('SELECT period FROM import_periods ORDER BY period DESC')->fetchAll(PDO::FETCH_COLUMN));
    }

    /** @return array<string,mixed>|null */
    public function build(string $period): ?array
    {
        $cleaning = $this->cleaning($period);
        if ($cleaning === null) {
            return null;
        }

        $prevPeriod   = self::previousPeriod($period);
        $prevCleaning = $this->cleaning($prevPeriod);
        if ($prevCleaning === null) {
            $prevPeriod = null;
        }

        $cur  = $this->lines($period);
        $prev = $prevPeriod !== null ? $this->lines($prevPeriod) : [];

        $lines = [];
        foreach ($cur as $label => $c) {
            $p = $prev[$label] ?? null;
            $lines[] = ['label' => $label] + $c + [
                'prev_mur_vol' => $p['mur_vol'] ?? null,
                'prev_txn'     => $p['txn'] ?? null,
                'mom_vol'      => self::mom($c['mur_vol'], $p['mur_vol'] ?? null),
                'mom_txn'      => self::mom($c['txn'], $p['txn'] ?? null),
            ];
        }
        // Lines present last month but gone this month still matter.
        foreach ($prev as $label => $p) {
            if (!isset($cur[$label])) {
                $lines[] = ['label' => $label, 'txn' => 0, 'mur_txn' => 0, 'mur_vol' => 0.0, 'avg_ticket' => 0.0, 'fx_txn' => 0,
                    'prev_mur_vol' => $p['mur_vol'], 'prev_txn' => $p['txn'], 'mom_vol' => -1.0, 'mom_txn' => -1.0];
            }
        }

        $segments = $this->segments($period);

        return [
            'period'          => $period,
            'previous_period' => $prevPeriod,
            'cleaning'        => $cleaning,
            'lines'           => $lines,
            'segments'        => $segments,
            'fx'              => $this->fx($period),
            'top_merchants'   => $this->topMerchants($period, $prevPeriod),
            'flags'           => $this->flags($period, $prevPeriod, $cur, $prev, $segments),
        ];
    }

    /** @return array<string,mixed>|null */
    private function cleaning(string $period): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT ip.*, i.filename, i.created_at AS imported_at
             FROM import_periods ip JOIN imports i ON i.id = ip.import_id
             WHERE ip.period = :p'
        );
        $stmt->execute([':p' => $period]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * Ordered report lines => metrics.
     *
     * @return array<string,array{txn:int,mur_txn:int,mur_vol:float,avg_ticket:float,fx_txn:int}>
     */
    private function lines(string $period): array
    {
        $stmt = $this->db->prepare(
            "SELECT channel, sof_proc_nickname AS nick, rail_type AS rail, fi_name AS fi,
                    (currency = 'MUR') AS mur, COUNT(*) AS n, SUM(amount) AS vol
             FROM transactions WHERE period = :p
             GROUP BY channel, sof_proc_nickname, rail_type, fi_name, (currency = 'MUR')"
        );
        $stmt->execute([':p' => $period]);
        $groups = $stmt->fetchAll();

        $agg = static function (callable $match) use ($groups): array {
            $txn = $murTxn = 0;
            $vol = 0.0;
            foreach ($groups as $g) {
                if (!$match($g)) {
                    continue;
                }
                $txn += (int) $g['n'];
                if ((int) $g['mur'] === 1) {
                    $murTxn += (int) $g['n'];
                    $vol    += (float) $g['vol'];
                }
            }
            return ['txn' => $txn, 'mur_txn' => $murTxn, 'mur_vol' => round($vol, 2),
                'avg_ticket' => $murTxn > 0 ? round($vol / $murTxn, 2) : 0.0, 'fx_txn' => $txn - $murTxn];
        };

        $tpe = static fn (array $g): bool => $g['channel'] === 'TPE';
        $onl = static fn (array $g): bool => $g['channel'] === 'ONLINE';

        $out = ['TPE total' => $agg($tpe)];
        $tpeNicks = array_unique(array_map(static fn ($g) => (string) $g['nick'], array_filter($groups, $tpe)));
        sort($tpeNicks);
        foreach ($tpeNicks as $n) {
            $out["TPE / $n"] = $agg(static fn ($g) => $tpe($g) && $g['nick'] === $n);
        }

        $out['Online total (all rails)'] = $agg($onl);
        $isGw = static fn (array $g): bool => $onl($g) && in_array($g['nick'], Rails::ECOM_GATEWAYS, true);
        $out['Ecom gateways (strict)'] = $agg($isGw);
        foreach (Rails::ECOM_GATEWAYS as $gw) {
            $fis = array_unique(array_map(static fn ($g) => (string) $g['fi'], array_filter($groups, static fn ($g) => $onl($g) && $g['nick'] === $gw)));
            sort($fis);
            foreach ($fis as $fi) {
                $out["Ecom / $gw / " . ($fi === '' ? '(blank)' : $fi)] = $agg(static fn ($g) => $onl($g) && $g['nick'] === $gw && $g['fi'] === $fi);
            }
        }

        foreach (Rails::TYPES as $t) {
            $out["$t all"]    = $agg(static fn ($g) => $g['rail'] === $t);
            $out["$t TPE"]    = $agg(static fn ($g) => $g['rail'] === $t && $tpe($g));
            $out["$t online"] = $agg(static fn ($g) => $g['rail'] === $t && $onl($g));
        }
        $out['QR incl. push (alt convention)'] = $agg(static fn ($g) => in_array($g['rail'], ['QR', 'PUSH'], true));

        return $out;
    }

    /** @return array{active_forms:int,tpe_only:int,online_only:int,both:int} */
    private function segments(string $period): array
    {
        $stmt = $this->db->prepare(
            "SELECT SUM(t AND NOT o) AS tpe_only, SUM(o AND NOT t) AS online_only, SUM(t AND o) AS both_channels, COUNT(*) AS active
             FROM (SELECT merchant_id, MAX(channel = 'TPE') AS t, MAX(channel = 'ONLINE') AS o
                   FROM transactions WHERE period = :p GROUP BY merchant_id) m"
        );
        $stmt->execute([':p' => $period]);
        $r = $stmt->fetch();
        return ['active_forms' => (int) $r['active'], 'tpe_only' => (int) $r['tpe_only'],
            'online_only' => (int) $r['online_only'], 'both' => (int) $r['both_channels']];
    }

    /** @return list<array{currency:string,txn:int,vol:float}> */
    private function fx(string $period): array
    {
        $stmt = $this->db->prepare(
            "SELECT currency, COUNT(*) AS txn, SUM(amount) AS vol
             FROM transactions WHERE period = :p AND currency <> 'MUR'
             GROUP BY currency ORDER BY currency"
        );
        $stmt->execute([':p' => $period]);
        return array_map(static fn ($r) => ['currency' => (string) $r['currency'], 'txn' => (int) $r['txn'], 'vol' => (float) $r['vol']], $stmt->fetchAll());
    }

    /** @return list<array<string,mixed>> */
    private function topMerchants(string $period, ?string $prevPeriod, int $limit = 15): array
    {
        $stmt = $this->db->prepare(
            "SELECT m.name, COUNT(*) AS txn, SUM(t.amount) AS vol,
                    (SELECT SUM(p.amount) FROM transactions p
                      WHERE p.period = :pp AND p.merchant_id = t.merchant_id AND p.currency = 'MUR') AS prev_vol
             FROM transactions t JOIN merchants m ON m.id = t.merchant_id
             WHERE t.period = :p AND t.currency = 'MUR'
             GROUP BY t.merchant_id, m.name
             ORDER BY vol DESC
             LIMIT $limit"
        );
        $stmt->execute([':p' => $period, ':pp' => $prevPeriod ?? '']);
        return array_map(static fn ($r) => [
            'merchant' => (string) $r['name'],
            'txn'      => (int) $r['txn'],
            'mur_vol'  => (float) $r['vol'],
            'prev_mur_vol' => $r['prev_vol'] === null ? null : (float) $r['prev_vol'],
            'mom_vol'  => self::mom((float) $r['vol'], $r['prev_vol'] === null ? null : (float) $r['prev_vol']),
        ], $stmt->fetchAll());
    }

    /**
     * "Verify before use" list. Never drop a flag because it looks minor.
     *
     * @param array<string,array<string,mixed>> $cur
     * @param array<string,array<string,mixed>> $prev
     * @param array<string,int>                 $segments
     * @return list<string>
     */
    private function flags(string $period, ?string $prevPeriod, array $cur, array $prev, array $segments): array
    {
        $flags = [];

        $stmt = $this->db->prepare("SELECT DISTINCT sof_proc_nickname FROM transactions WHERE period = :p AND rail_type = 'OTHER' ORDER BY 1");
        $stmt->execute([':p' => $period]);
        $unknown = $stmt->fetchAll(PDO::FETCH_COLUMN);
        if ($unknown !== []) {
            $flags[] = 'Nicknames classified OTHER: ' . implode(', ', array_map(static fn ($n) => $n === '' ? '(blank)' : $n, $unknown));
        }

        if ($prevPeriod !== null) {
            foreach ($this->spikes($period, $prevPeriod) as $f) {
                $flags[] = $f;
            }
            if (isset($cur['TPE / PowerCardCIM']) || isset($prev['TPE / PowerCardCIM'])) {
                $mom = self::mom((float) ($cur['TPE / PowerCardCIM']['mur_vol'] ?? 0), isset($prev['TPE / PowerCardCIM']) ? (float) $prev['TPE / PowerCardCIM']['mur_vol'] : null);
                $flags[] = 'TPE / PowerCardCIM MUR volume MoM: ' . ($mom === null ? 'n/a' : sprintf('%+.1f%%', $mom * 100)) . ' (watch: declining trend mid-2026)';
            }
        }

        $stmt = $this->db->prepare("SELECT currency, COUNT(*) AS n FROM transactions WHERE period = :p AND fi_name = 'BNI' GROUP BY currency ORDER BY currency");
        $stmt->execute([':p' => $period]);
        $bni = $stmt->fetchAll();
        if ($bni !== []) {
            $total = array_sum(array_map(static fn ($r) => (int) $r['n'], $bni));
            $parts = implode(', ', array_map(static fn ($r) => $r['currency'] . ' ' . $r['n'], $bni));
            $flags[] = "BNI: $total txn ($parts), reported in own currency, outside MUR totals";
        }

        $flags[] = 'Merchants active on both TPE and online: ' . $segments['both'] . ' (historically near zero)';
        $flags[] = 'Amount unit of somme_totale assumed MUR units (not cents). Unconfirmed.';
        $flags[] = 'refund_total_refunded semantics (within-period vs cumulative) unconfirmed; refunds not netted.';

        return $flags;
    }

    /**
     * One merchant explaining > 40% of a rail's MoM change (when that change > 10%).
     *
     * @return list<string>
     */
    private function spikes(string $period, string $prevPeriod): array
    {
        $stmt = $this->db->prepare(
            "SELECT t.period, t.sof_proc_nickname AS nick, m.name AS merchant, SUM(t.amount) AS vol
             FROM transactions t JOIN merchants m ON m.id = t.merchant_id
             WHERE t.period IN (:p, :pp) AND t.currency = 'MUR'
             GROUP BY t.period, t.sof_proc_nickname, m.name"
        );
        $stmt->execute([':p' => $period, ':pp' => $prevPeriod]);

        $data = [];
        foreach ($stmt->fetchAll() as $r) {
            $side = $r['period'] === $period ? 'c' : 'p';
            $data[(string) $r['nick']][(string) $r['merchant']][$side] = (float) $r['vol'];
        }
        ksort($data);

        $flags = [];
        foreach ($data as $nick => $merchants) {
            $c = $p = 0.0;
            $topName  = null;
            $topDelta = 0.0;
            foreach ($merchants as $name => $v) {
                $d  = ($v['c'] ?? 0.0) - ($v['p'] ?? 0.0);
                $c += $v['c'] ?? 0.0;
                $p += $v['p'] ?? 0.0;
                if ($topName === null || abs($d) > abs($topDelta)) {
                    $topName  = $name;
                    $topDelta = $d;
                }
            }
            $delta = $c - $p;
            if (abs($delta) < 1e-9 || $p == 0.0) {
                continue;
            }
            $share = $topDelta / $delta;
            if ($share > 0.4 && abs($delta) / $p > 0.1) {
                $flags[] = sprintf('%s MoM change %+.0f%% is %.0f%% explained by one merchant: %s', $nick, $delta / $p * 100, $share * 100, $topName);
            }
        }
        return $flags;
    }

    public static function previousPeriod(string $period): string
    {
        return (new \DateTimeImmutable($period . '-01'))->modify('-1 month')->format('Y-m');
    }

    private static function mom(float|int $cur, float|int|null $prev): ?float
    {
        if ($prev === null || (float) $prev == 0.0) {
            return null;
        }
        return $cur / $prev - 1;
    }
}
