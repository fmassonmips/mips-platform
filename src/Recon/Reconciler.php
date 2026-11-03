<?php
/**
 * MCB vs MIPS e-commerce reconciliation for one month.
 *
 * Method (MCB recon procedure):
 *  1. Scope checks before anything: full extraction (not filtered on
 *     order_is_bundled = 1), sentinel merchants present, date windows.
 *  2. MID remaps applied to both files (same merchant, two MIDs).
 *  3. Aggregate by (MID, currency); gap = MCB - MIPS.
 *  4. Split each gap, in this order, into:
 *       card_verif  MIPS rows at 0 x verification amount (MCB books them as PURCHASE)
 *       clearing    gap on the last days of the month / after the MCB file's last day
 *       watch       MIPS rows on watch-list MIDs (last_merchant_mid), absent from MCB
 *       mips_only   MCB total is 0
 *       mcb_only    MIPS total is 0
 *       real        what is left: transactions missing on the MCB side
 *     A category takes at most what is left, and only when it has the same
 *     sign as what is left.
 *  5. Close to zero: categories sum to the gap exactly. All arithmetic is
 *     done in integer cents so this holds by construction; it is asserted.
 *
 * MCB rows dated outside the month (e.g. last month's clearing carried
 * into this file) are excluded and reported, not compared.
 */
declare(strict_types=1);

namespace App\Recon;

use App\Database;
use App\Reporting\CommissionImporter;
use App\Reporting\Spreadsheet;
use PDO;
use RuntimeException;

final class Reconciler
{
    public const CATEGORIES = ['card_verif', 'clearing', 'watch', 'mips_only', 'mcb_only', 'real'];
    private const CLAIM_ITEMS_PER_LINE = 500;

    private PDO $db;
    /** @var array<string,mixed> */
    private array $cfg;
    /** @var array<string,string> */
    private array $remaps = [];
    /** @var array<string,true> */
    private array $watch = [];

    public function __construct()
    {
        $this->db  = Database::connection();
        $this->cfg = $GLOBALS['config']['recon'] ?? [];
    }

    /** Recompute a run from its stored files. Returns the summary. */
    public function compute(int $runId): array
    {
        $stmt = $this->db->prepare('SELECT * FROM recon_runs WHERE id = :id');
        $stmt->execute([':id' => $runId]);
        $run = $stmt->fetch();
        if (!is_array($run)) {
            throw new RuntimeException('Run not found.');
        }

        $base  = rtrim((string) $GLOBALS['config']['storage']['path'], '/');
        $start = $run['period'] . '-01';
        $end   = (new \DateTimeImmutable($start))->modify('last day of this month')->format('Y-m-d');

        $this->remaps = $this->db->query('SELECT from_mid, to_mid FROM recon_mid_remaps')->fetchAll(PDO::FETCH_KEY_PAIR);
        $this->watch  = array_fill_keys($this->db->query('SELECT mid FROM recon_watch_mids')->fetchAll(PDO::FETCH_COLUMN), true);

        $warnings = [];
        $lines    = [];   // key "mid|CUR" => aggregates (amounts in cents)

        $mcb  = $this->readMcb($base . '/' . $run['mcb_path'], (string) $run['mcb_name'], $start, $end, $lines, $warnings);
        $mips = $this->readMips($base . '/' . $run['mips_path'], (string) $run['mips_name'], $start, $end, $lines, $warnings);

        $this->scopeChecks($run, $mcb, $mips, $start, $end, $warnings);

        // Clearing window: last N days of the month, plus any day after the
        // MCB file's last day (file extracted before month end).
        $tailFrom = (new \DateTimeImmutable($end))->modify('-' . max(0, (int) ($this->cfg['month_end_days'] ?? 2) - 1) . ' days')->format('Y-m-d');
        if ($mcb['max_date'] !== null && $mcb['max_date'] < $tailFrom) {
            $tailFrom = (new \DateTimeImmutable($mcb['max_date']))->modify('+1 day')->format('Y-m-d');
        }

        $verif = $this->cfg['verification_amount'] ?? ['MUR' => 10.0, 'default' => 1.0];
        foreach ($lines as &$l) {
            $l['diff'] = $l['mcb'] - $l['mips'];
            $left      = $l['diff'];
            $unit      = (int) round(((float) ($verif[$l['currency']] ?? $verif['default'] ?? 1.0)) * 100);

            $tail = 0;
            foreach ($l['days'] as $day => $d) {
                if ($day >= $tailFrom) {
                    $tail += $d[0] - $d[1];
                }
            }

            // Ordered candidates; one-sided lines take whatever is left at their turn.
            foreach (['card_verif', 'clearing', 'watch', 'mips_only', 'mcb_only'] as $cat) {
                $c = match ($cat) {
                    'card_verif' => $l['zero'] * $unit,
                    'clearing'   => $tail,
                    'watch'      => -$l['watch_mips'],
                    'mips_only'  => $l['mcb'] === 0 ? $left : 0,
                    'mcb_only'   => $l['mips'] === 0 ? $left : 0,
                };
                $take    = self::take($c, $left);
                $l[$cat] = $take;
                $left   -= $take;
            }
            $l['real'] = $left;

            $sum = 0;
            foreach (self::CATEGORIES as $cat) {
                $sum += $l[$cat];
            }
            if ($sum !== $l['diff']) {
                throw new RuntimeException('Internal error: categories do not close to zero for MID ' . $l['mid']);
            }
        }
        unset($l);

        $claims = $this->claimItems($base . '/' . $run['mips_path'], (string) $run['mips_name'], $start, $end, $lines);
        $summary = $this->summarise($lines, $mcb, $mips);
        $this->store($runId, $lines, $claims, $summary, $warnings);

        return $summary;
    }

    /**
     * @param array<string,array<string,mixed>> $lines
     * @param list<string>                      $warnings
     * @return array<string,mixed>
     */
    private function readMcb(string $path, string $name, string $start, string $end, array &$lines, array &$warnings): array
    {
        $rows   = Spreadsheet::rows($path, $name);
        $header = Spreadsheet::header($rows);
        $col    = $this->columns($header, $this->cfg['mcb_columns'] ?? [], ['mid', 'currency', 'amount', 'date'], 'MCB');

        $out = ['rows' => 0, 'skipped_type' => 0, 'outside' => [], 'bad' => 0, 'min_date' => null, 'max_date' => null, 'totals' => []];
        for (; $rows->valid(); $rows->next()) {
            $r = $rows->current();
            if (Spreadsheet::isBlankRow($r)) {
                continue;
            }
            $get = static fn (string $k): string => isset($col[$k]) ? trim((string) ($r[$col[$k]] ?? '')) : '';

            if (isset($col['type']) && strtoupper($get('type')) !== 'PURCHASE') {
                $out['skipped_type']++;
                continue;
            }
            $amount = CommissionImporter::parseAmount($get('amount'));
            $date   = CommissionImporter::parseDate($get('date'));
            $mid    = $this->mid($get('mid'));
            $cur    = strtoupper($get('currency'));
            if ($amount === null || $date === null || $mid === '' || $cur === '') {
                $out['bad']++;
                continue;
            }
            $cents = (int) round($amount * 100);
            if ($date < $start || $date > $end) {
                $out['outside'][$cur] = ($out['outside'][$cur] ?? 0) + $cents;
                continue;
            }
            $out['rows']++;
            $out['min_date'] = $out['min_date'] === null || $date < $out['min_date'] ? $date : $out['min_date'];
            $out['max_date'] = $out['max_date'] === null || $date > $out['max_date'] ? $date : $out['max_date'];
            $out['totals'][$cur] = ($out['totals'][$cur] ?? 0) + $cents;

            $l = &self::line($lines, $mid, $cur);
            $l['mcb'] += $cents;
            $l['days'][$date][0] = ($l['days'][$date][0] ?? 0) + $cents;
            $l['days'][$date][1] ??= 0;
            if ($l['mcb_name'] === null && $get('name') !== '') {
                $l['mcb_name'] = $get('name');
            }
            unset($l);
        }
        if ($out['bad'] > 0) {
            $warnings[] = "MCB: {$out['bad']} rows skipped (unreadable MID, currency, amount or date).";
        }
        return $out;
    }

    /**
     * @param array<string,array<string,mixed>> $lines
     * @param list<string>                      $warnings
     * @return array<string,mixed>
     */
    private function readMips(string $path, string $name, string $start, string $end, array &$lines, array &$warnings): array
    {
        $rows   = Spreadsheet::rows($path, $name);
        $header = Spreadsheet::header($rows);
        $col    = $this->columns($header, $this->cfg['mips_columns'] ?? [], ['mid', 'currency', 'amount', 'date'], 'MIPS');
        foreach (['est_test', 'is_test_order'] as $t) {
            if (in_array($t, $header, true)) {
                $col[$t] = array_search($t, $header, true);
            }
        }

        $out = ['rows' => 0, 'not_success' => 0, 'test' => 0, 'no_mid' => 0, 'no_mid_amount' => [], 'outside' => [],
            'bad' => 0, 'bundled' => 0, 'unbundled' => 0, 'merchants' => [], 'min_date' => null, 'max_date' => null,
            'totals' => [], 'has_bundled_column' => isset($col['bundled']), 'has_last_mid_column' => isset($col['last_mid'])];

        for (; $rows->valid(); $rows->next()) {
            $r = $rows->current();
            if (Spreadsheet::isBlankRow($r)) {
                continue;
            }
            $get = static fn (string $k): string => isset($col[$k]) ? trim((string) ($r[$col[$k]] ?? '')) : '';

            if (isset($col['status']) && strtoupper($get('status')) !== 'SUCCESS') {
                $out['not_success']++;
                continue;
            }
            if (self::truthy($get('est_test')) || self::truthy($get('is_test_order'))) {
                $out['test']++;
                continue;
            }
            $amount = CommissionImporter::parseAmount($get('amount'));
            $date   = CommissionImporter::parseDate($get('date'));
            $cur    = strtoupper($get('currency'));
            if ($amount === null || $date === null || $cur === '') {
                $out['bad']++;
                continue;
            }
            $cents = (int) round($amount * 100);
            $mid   = $this->mid($get('mid'));
            if ($mid === '') {
                // No card MID: QR / non-card rails, outside the e-commerce scope.
                $out['no_mid']++;
                $out['no_mid_amount'][$cur] = ($out['no_mid_amount'][$cur] ?? 0) + $cents;
                continue;
            }
            if ($date < $start || $date > $end) {
                $out['outside'][$cur] = ($out['outside'][$cur] ?? 0) + $cents;
                continue;
            }

            $out['rows']++;
            $out['min_date'] = $out['min_date'] === null || $date < $out['min_date'] ? $date : $out['min_date'];
            $out['max_date'] = $out['max_date'] === null || $date > $out['max_date'] ? $date : $out['max_date'];
            $out['totals'][$cur] = ($out['totals'][$cur] ?? 0) + $cents;
            $bundled = self::truthy($get('bundled'));
            $out[$bundled ? 'bundled' : 'unbundled']++;
            $merchant = $get('merchant');
            if ($merchant !== '') {
                $out['merchants'][strtolower($merchant)] = true;
            }

            $l = &self::line($lines, $mid, $cur);
            $l['mips'] += $cents;
            $l['count']++;
            if ($cents === 0) {
                $l['zero']++;
            }
            if ($bundled) {
                $l['bundled'] = true;
            }
            $lastMid = $this->mid($get('last_mid'));
            if (($lastMid !== '' && isset($this->watch[$lastMid])) || isset($this->watch[$mid])) {
                $l['watch_mips'] += $cents;
            }
            if ($merchant !== '') {
                $l['names'][$merchant] = ($l['names'][$merchant] ?? 0) + 1;
            }
            $l['days'][$date][1] = ($l['days'][$date][1] ?? 0) + $cents;
            $l['days'][$date][0] ??= 0;
            unset($l);
        }
        if ($out['bad'] > 0) {
            $warnings[] = "MIPS: {$out['bad']} rows skipped (unreadable currency, amount or date).";
        }
        return $out;
    }

    /**
     * @param array<string,mixed> $run
     * @param array<string,mixed> $mcb
     * @param array<string,mixed> $mips
     * @param list<string>        $warnings
     */
    private function scopeChecks(array $run, array $mcb, array $mips, string $start, string $end, array &$warnings): void
    {
        // 1. Filtered extraction ("no_qr", order_is_bundled = 1 only) creates
        //    massive false positives: direct-acquiring merchants are missing.
        if (!$mips['has_bundled_column']) {
            $warnings[] = 'MIPS file has no order_is_bundled column: extraction scope cannot be checked and the bundle view is empty.';
        } elseif ($mips['unbundled'] === 0 && $mips['bundled'] > 0) {
            $warnings[] = 'BLOCKING: every MIPS row has order_is_bundled = 1. This looks like a filtered ("no_qr") extraction that excludes direct-acquiring merchants MCB does settle. Use the full extraction.';
        }
        foreach ($this->cfg['sentinel_merchants'] ?? [] as $s) {
            if (!isset($mips['merchants'][strtolower((string) $s)])) {
                $warnings[] = "Sentinel merchant \"$s\" is absent from the MIPS file: check that the extraction is complete.";
            }
        }
        if (!$mips['has_last_mid_column']) {
            $warnings[] = 'MIPS file has no last_merchant_mid column: watch-list MIDs are matched on card_merchant_id only.';
        }

        // 2. Date windows.
        foreach (['MCB' => $mcb, 'MIPS' => $mips] as $label => $f) {
            if ($f['rows'] === 0) {
                $warnings[] = "BLOCKING: no $label row dated in {$run['period']}.";
                continue;
            }
            if ($f['min_date'] > $start) {
                $warnings[] = "$label file starts on {$f['min_date']}, after the 1st of the month.";
            }
            if ($f['max_date'] < $end) {
                $warnings[] = "$label file ends on {$f['max_date']}, before the end of the month: the gap on the last days is classified as clearing lag.";
            }
            foreach ($f['outside'] as $cur => $cents) {
                $warnings[] = sprintf('%s rows dated outside %s excluded: %s %s%s.', $label, $run['period'], $cur, number_format($cents / 100, 2),
                    $label === 'MCB' ? ' (usually last month\'s clearing carried over)' : '');
            }
        }
        foreach ($mips['no_mid_amount'] as $cur => $cents) {
            $warnings[] = sprintf('MIPS rows without card_merchant_id excluded (QR / non-card, out of e-commerce scope): %s %s.', $cur, number_format($cents / 100, 2));
        }
        if ($mcb['skipped_type'] > 0) {
            $warnings[] = "MCB: {$mcb['skipped_type']} non-PURCHASE rows ignored.";
        }
        if ($mips['not_success'] > 0 || $mips['test'] > 0) {
            $warnings[] = "MIPS: {$mips['not_success']} non-SUCCESS and {$mips['test']} test rows ignored.";
        }
    }

    /**
     * Second pass over the MIPS file: transactions of lines with a real gap
     * where MCB is short, on the days MCB is short.
     *
     * @param array<string,array<string,mixed>> $lines
     * @return array<string,list<array<string,mixed>>>
     */
    private function claimItems(string $path, string $name, string $start, string $end, array $lines): array
    {
        $wanted = [];
        foreach ($lines as $key => $l) {
            if ($l['real'] >= 0) {
                continue;
            }
            foreach ($l['days'] as $day => $d) {
                if ($d[0] - $d[1] < 0) {
                    $wanted[$key][$day] = true;
                }
            }
        }
        if ($wanted === []) {
            return [];
        }

        $rows   = Spreadsheet::rows($path, $name);
        $header = Spreadsheet::header($rows);
        $col    = $this->columns($header, $this->cfg['mips_columns'] ?? [], [], 'MIPS');
        $out    = [];
        for (; $rows->valid(); $rows->next()) {
            $r = $rows->current();
            if (Spreadsheet::isBlankRow($r)) {
                continue;
            }
            $get = static fn (string $k): string => isset($col[$k]) ? trim((string) ($r[$col[$k]] ?? '')) : '';
            if (isset($col['status']) && strtoupper($get('status')) !== 'SUCCESS') {
                continue;
            }
            $date = CommissionImporter::parseDate($get('date'));
            $key  = $this->mid($get('mid')) . '|' . strtoupper($get('currency'));
            if ($date === null || !isset($wanted[$key][$date])) {
                continue;
            }
            $amount = CommissionImporter::parseAmount($get('amount'));
            if ($amount === null || $amount == 0.0 || count($out[$key] ?? []) >= self::CLAIM_ITEMS_PER_LINE) {
                continue;
            }
            $out[$key][] = [
                'txn_at'    => self::timestamp($get('date')),
                'reference' => mb_substr($get('reference'), 0, 128) ?: null,
                'network'   => mb_substr($get('network'), 0, 32) ?: null,
                'amount'    => round($amount, 2),
            ];
        }
        return $out;
    }

    /**
     * @param array<string,array<string,mixed>> $lines
     * @param array<string,mixed>               $mcb
     * @param array<string,mixed>               $mips
     * @return array<string,mixed>
     */
    private function summarise(array $lines, array $mcb, array $mips): array
    {
        $cur = [];
        foreach ($lines as $l) {
            $c = &$cur[$l['currency']];
            $c ??= ['mcb' => 0, 'mips' => 0, 'diff' => 0, 'watch_mips' => 0, 'bundle_mcb' => 0, 'bundle_mips' => 0,
                'bundle_diff' => 0, 'lines' => 0] + array_fill_keys(self::CATEGORIES, 0);
            $c['mcb']  += $l['mcb'];
            $c['mips'] += $l['mips'];
            $c['diff'] += $l['diff'];
            $c['watch_mips'] += $l['watch_mips'];
            $c['lines']++;
            foreach (self::CATEGORIES as $cat) {
                $c[$cat] += $l[$cat];
            }
            if ($l['bundled']) {
                $c['bundle_mcb']  += $l['mcb'];
                $c['bundle_mips'] += $l['mips'];
                $c['bundle_diff'] += $l['diff'];
            }
            unset($c);
        }
        ksort($cur);

        $pct = static fn (int $num, int $den): ?float => $den === 0 ? null : round($num / $den * 100, 4);
        $out = [];
        $allDiff = $allMips = 0;
        foreach ($cur as $code => $c) {
            $residual = $c['diff'];
            foreach (self::CATEGORIES as $cat) {
                $residual -= $c[$cat];
            }
            $allDiff += $c['diff'];
            $allMips += $c['mips'];
            $out[$code] = [
                'mcb' => $c['mcb'] / 100, 'mips' => $c['mips'] / 100, 'diff' => $c['diff'] / 100, 'lines' => $c['lines'],
                'categories' => array_map(static fn ($v) => $v / 100, array_intersect_key($c, array_flip(self::CATEGORIES))),
                'unexplained' => $residual / 100,   // always 0: checked per line
                'pct' => [
                    'global'      => $pct($c['diff'], $c['mips']),
                    'excl_watch'  => $pct($c['diff'] - $c['watch'], $c['mips'] - $c['watch_mips']),
                    'bundle'      => $pct($c['bundle_diff'], $c['bundle_mips']),
                    'real'        => $pct($c['real'], $c['mips']),
                ],
                'bundle' => ['mcb' => $c['bundle_mcb'] / 100, 'mips' => $c['bundle_mips'] / 100, 'diff' => $c['bundle_diff'] / 100],
            ];
        }

        return [
            'currencies'   => $out,
            // Indicative only: currencies are added without conversion.
            'global_pct_mixed_currencies' => $pct($allDiff, $allMips),
            'files' => [
                'mcb'  => ['rows' => $mcb['rows'], 'from' => $mcb['min_date'], 'to' => $mcb['max_date']],
                'mips' => ['rows' => $mips['rows'], 'from' => $mips['min_date'], 'to' => $mips['max_date'],
                    'bundled_rows' => $mips['bundled'], 'unbundled_rows' => $mips['unbundled']],
            ],
        ];
    }

    /**
     * @param array<string,array<string,mixed>>       $lines
     * @param array<string,list<array<string,mixed>>> $claims
     * @param array<string,mixed>                     $summary
     * @param list<string>                            $warnings
     */
    private function store(int $runId, array $lines, array $claims, array $summary, array $warnings): void
    {
        $merchantByMid = $this->db->query(
            "SELECT i.value, m.id FROM merchant_identifiers i JOIN merchants m ON m.id = i.merchant_id WHERE i.type = 'MID'"
        )->fetchAll(PDO::FETCH_KEY_PAIR);
        $merchantByName = array_change_key_case($this->db->query('SELECT name, id FROM merchants')->fetchAll(PDO::FETCH_KEY_PAIR));

        $this->db->beginTransaction();
        try {
            $this->db->prepare('DELETE FROM recon_lines WHERE run_id = :r')->execute([':r' => $runId]);

            $insLine = $this->db->prepare(
                'INSERT INTO recon_lines (run_id, mid, merchant_name, merchant_id, currency, mcb_amount, mips_amount, mips_count,
                    mips_zero_count, is_bundled, diff, amt_card_verif, amt_clearing, amt_watch, amt_mips_only, amt_mcb_only, amt_real)
                 VALUES (:r, :mid, :name, :mid_id, :cur, :mcb, :mips, :n, :z, :b, :diff, :cv, :cl, :w, :mo, :bo, :real)'
            );
            $insDay   = $this->db->prepare('INSERT INTO recon_daily (line_id, day, mcb_amount, mips_amount) VALUES (:l, :d, :mcb, :mips)');
            $insClaim = $this->db->prepare(
                'INSERT INTO recon_claim_items (line_id, txn_at, reference, network, amount) VALUES (:l, :t, :ref, :net, :a)'
            );

            ksort($lines);
            foreach ($lines as $key => $l) {
                $name = null;
                if ($l['names'] !== []) {
                    arsort($l['names']);
                    $name = (string) array_key_first($l['names']);
                }
                $name ??= $l['mcb_name'];
                $merchantId = $merchantByMid[$l['mid']] ?? ($name !== null ? ($merchantByName[strtolower($name)] ?? null) : null);

                $insLine->execute([
                    ':r' => $runId, ':mid' => $l['mid'], ':name' => $name === null ? null : mb_substr($name, 0, 255),
                    ':mid_id' => $merchantId, ':cur' => $l['currency'], ':mcb' => $l['mcb'] / 100, ':mips' => $l['mips'] / 100,
                    ':n' => $l['count'], ':z' => $l['zero'], ':b' => $l['bundled'] ? 1 : 0, ':diff' => $l['diff'] / 100,
                    ':cv' => $l['card_verif'] / 100, ':cl' => $l['clearing'] / 100, ':w' => $l['watch'] / 100,
                    ':mo' => $l['mips_only'] / 100, ':bo' => $l['mcb_only'] / 100, ':real' => $l['real'] / 100,
                ]);
                $lineId = (int) $this->db->lastInsertId();

                ksort($l['days']);
                foreach ($l['days'] as $day => $d) {
                    $insDay->execute([':l' => $lineId, ':d' => $day, ':mcb' => $d[0] / 100, ':mips' => $d[1] / 100]);
                }
                foreach ($claims[$key] ?? [] as $c) {
                    $insClaim->execute([':l' => $lineId, ':t' => $c['txn_at'], ':ref' => $c['reference'], ':net' => $c['network'], ':a' => $c['amount']]);
                }
            }

            $this->db->prepare('UPDATE recon_runs SET summary = :s, warnings = :w, computed_at = NOW() WHERE id = :id')->execute([
                ':s' => json_encode($summary, JSON_UNESCAPED_UNICODE), ':w' => json_encode($warnings, JSON_UNESCAPED_UNICODE), ':id' => $runId,
            ]);
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Resolve configured column candidates against a header.
     *
     * @param list<string>                $header
     * @param array<string,list<string>>  $spec
     * @param list<string>                $required
     * @return array<string,int>
     */
    private function columns(array $header, array $spec, array $required, string $label): array
    {
        $col = [];
        foreach ($spec as $key => $candidates) {
            $name = Spreadsheet::pick($header, $candidates);
            if ($name === null && $key === 'date') {
                foreach ($header as $h) {
                    if (str_contains(strtolower($h), 'date')) {
                        $name = $h;
                        break;
                    }
                }
            }
            if ($name !== null) {
                $col[$key] = (int) array_search($name, $header, true);
            }
        }
        $missing = array_diff($required, array_keys($col));
        if ($missing !== []) {
            $want = array_map(static fn ($k) => $k . ' (' . implode(' / ', $spec[$k] ?? []) . ')', $missing);
            throw new RuntimeException("$label file: missing column(s) " . implode(', ', $want) . '. Adjust config recon.' . strtolower($label) . '_columns if the export changed.');
        }
        return $col;
    }

    /** Normalise a MID as exported by Excel, then apply the remap table. */
    private function mid(string $raw): string
    {
        $v = trim($raw);
        if ($v === '' || in_array(strtolower($v), ['nan', 'null', 'none'], true)) {
            return '';
        }
        if (preg_match('/^\d+\.0+$/', $v)) {
            $v = substr($v, 0, (int) strpos($v, '.'));
        } elseif (is_numeric($v) && stripos($v, 'e') !== false) {
            $v = sprintf('%.0f', (float) $v);
        }
        return $this->remaps[$v] ?? $v;
    }

    /**
     * @param array<string,array<string,mixed>> $lines
     * @return array<string,mixed>
     */
    private static function &line(array &$lines, string $mid, string $cur): array
    {
        $key = $mid . '|' . $cur;
        $lines[$key] ??= ['mid' => $mid, 'currency' => $cur, 'mcb' => 0, 'mips' => 0, 'count' => 0, 'zero' => 0,
            'bundled' => false, 'watch_mips' => 0, 'names' => [], 'mcb_name' => null, 'days' => []];
        return $lines[$key];
    }

    /** Portion of candidate $c that fits in $left with the same sign. */
    private static function take(int $c, int $left): int
    {
        if ($c === 0 || $left === 0 || ($c > 0) !== ($left > 0)) {
            return 0;
        }
        return $left > 0 ? min($c, $left) : max($c, $left);
    }

    /** Readable timestamp: Excel serials become "Y-m-d H:i:s", text is kept. */
    private static function timestamp(string $v): string
    {
        if (is_numeric($v) && (float) $v > 32874 && (float) $v < 73051) {
            return gmdate('Y-m-d H:i:s', (int) round(((float) $v - 25569) * 86400));
        }
        return mb_substr($v, 0, 32);
    }

    private static function truthy(string $v): bool
    {
        return in_array(strtolower($v), ['1', 'true', 'yes', 'y', 'oui', '1.0'], true);
    }
}
