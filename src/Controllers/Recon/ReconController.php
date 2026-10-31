<?php
/**
 * MCB vs MIPS reconciliation API.
 *
 *   POST /api/recon/run            multipart: period (YYYY-MM), mcb (.xlsx/.csv), mips (.xlsx/.csv)
 *   POST /api/recon/recompute      { id }   after a remap / watch-list change
 *   GET  /api/recon/runs
 *   GET  /api/recon/get?id=
 *   GET  /api/recon/daily?line_id=
 *   GET  /api/recon/export?id=&kind=summary|lines|claims    CSV
 *   GET  /api/recon/settings
 *   POST /api/recon/remap-add      { from_mid, to_mid, label }
 *   POST /api/recon/remap-delete   { id }
 *   POST /api/recon/watch-add      { mid, label }
 *   POST /api/recon/watch-delete   { id }
 */
declare(strict_types=1);

namespace App\Controllers\Recon;

use App\Audit;
use App\Auth;
use App\Csv;
use App\Database;
use App\Recon\Reconciler;
use App\Request;
use App\Response;
use PDO;

final class ReconController
{
    private const LABELS = [
        'card_verif' => 'Card verifications',
        'clearing'   => 'Month-end clearing lag',
        'watch'      => 'Watch-list MIDs',
        'mips_only'  => 'Only on MIPS side',
        'mcb_only'   => 'Only on MCB side',
        'real'       => 'Missing on MCB side (real)',
    ];

    private PDO $db;

    public function __construct()
    {
        $this->db = Database::connection();
    }

    public function run(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('recon');
        Request::require_csrf();

        $period = Request::period($_POST['period'] ?? null);
        if ($period === null) {
            Response::json(['error' => 'Month must be in YYYY-MM format.'], 422);
        }

        $stored = [];
        foreach (['mcb' => 'MCB', 'mips' => 'MIPS'] as $field => $label) {
            $f = $_FILES[$field] ?? null;
            if (!is_array($f) || $f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file((string) $f['tmp_name'])) {
                $this->discard($stored);
                Response::json(['error' => "$label file missing or too large for the server upload limit."], 422);
            }
            $ext = strtolower(pathinfo((string) $f['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, ['xlsx', 'csv'], true)) {
                $this->discard($stored);
                Response::json(['error' => "$label file must be .xlsx or .csv."], 422);
            }
            $rel  = 'recon/' . $period . '/' . bin2hex(random_bytes(12)) . '.' . $ext;
            $dest = rtrim((string) $GLOBALS['config']['storage']['path'], '/') . '/' . $rel;
            if ((!is_dir(dirname($dest)) && !@mkdir(dirname($dest), 0750, true) && !is_dir(dirname($dest)))
                || !move_uploaded_file((string) $f['tmp_name'], $dest)) {
                $this->discard($stored);
                error_log('[Recon] cannot write ' . $dest);
                Response::json(['error' => 'File storage is not writable. Contact an administrator.'], 500);
            }
            $stored[$field] = ['path' => $rel, 'abs' => $dest, 'name' => mb_substr(basename((string) $f['name']), 0, 255),
                'sha' => (string) hash_file('sha256', $dest)];
        }

        $this->db->prepare(
            'INSERT INTO recon_runs (period, mcb_path, mcb_name, mcb_sha256, mips_path, mips_name, mips_sha256, created_by)
             VALUES (:p, :mp, :mn, :ms, :ip, :in, :is, :u)'
        )->execute([
            ':p' => $period, ':mp' => $stored['mcb']['path'], ':mn' => $stored['mcb']['name'], ':ms' => $stored['mcb']['sha'],
            ':ip' => $stored['mips']['path'], ':in' => $stored['mips']['name'], ':is' => $stored['mips']['sha'], ':u' => (int) $user['id'],
        ]);
        $runId = (int) $this->db->lastInsertId();

        @set_time_limit(600);
        try {
            (new Reconciler())->compute($runId);
        } catch (\RuntimeException $e) {
            $this->db->prepare('DELETE FROM recon_runs WHERE id = :id')->execute([':id' => $runId]);
            $this->discard($stored);
            Audit::log('recon.rejected', 'period', $period, ['reason' => $e->getMessage()]);
            Response::json(['error' => $e->getMessage()], 422);
        }

        Audit::log('recon.run', 'recon_run', $runId, [
            'period' => $period, 'mcb_file' => $stored['mcb']['name'], 'mcb_sha256' => $stored['mcb']['sha'],
            'mips_file' => $stored['mips']['name'], 'mips_sha256' => $stored['mips']['sha'],
        ]);
        Response::json(['success' => true, 'id' => $runId], 201);
    }

    public function recompute(): void
    {
        Request::require_method('POST');
        Auth::require_access('recon');
        Request::require_csrf();

        $id = (int) (Request::body()['id'] ?? 0);
        @set_time_limit(600);
        try {
            (new Reconciler())->compute($id);
        } catch (\RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }
        Audit::log('recon.recompute', 'recon_run', $id);
        Response::json(['success' => true]);
    }

    public function runs(): void
    {
        Request::require_method('GET');
        Auth::require_access('recon');

        $rows = $this->db->query(
            'SELECT r.id, r.period, r.mcb_name, r.mips_name, r.created_at, r.computed_at, r.summary, r.warnings, u.email AS created_by
             FROM recon_runs r LEFT JOIN users u ON u.id = r.created_by
             ORDER BY r.period DESC, r.id DESC LIMIT 100'
        )->fetchAll();
        Response::json(['runs' => array_map(static function (array $r): array {
            $s = json_decode((string) $r['summary'], true) ?: [];
            $r['currencies'] = array_map(static fn ($c) => ['diff' => $c['diff'], 'real' => $c['categories']['real'], 'pct' => $c['pct']['global']], $s['currencies'] ?? []);
            $r['warning_count'] = count(json_decode((string) $r['warnings'], true) ?: []);
            unset($r['summary'], $r['warnings']);
            return $r;
        }, $rows)]);
    }

    public function get(): void
    {
        Request::require_method('GET');
        Auth::require_access('recon');

        $run = $this->runRow((int) ($_GET['id'] ?? 0));

        $lines = $this->db->prepare(
            'SELECT l.*, (SELECT COUNT(*) FROM recon_claim_items c WHERE c.line_id = l.id) AS claim_items
             FROM recon_lines l WHERE l.run_id = :r ORDER BY l.currency, ABS(l.diff) DESC'
        );
        $lines->execute([':r' => $run['id']]);
        $lines = $lines->fetchAll();

        // Previous month: latest run of that period.
        $prevPeriod = (new \DateTimeImmutable($run['period'] . '-01'))->modify('-1 month')->format('Y-m');
        $prev = $this->db->prepare('SELECT id, summary FROM recon_runs WHERE period = :p ORDER BY id DESC LIMIT 1');
        $prev->execute([':p' => $prevPeriod]);
        $prev = $prev->fetch() ?: null;

        // Watch-list cumulative: latest run of each month up to this one.
        $cum = $this->db->prepare(
            'SELECT l.currency, SUM(l.amt_watch) AS total, COUNT(DISTINCT r.period) AS months
             FROM recon_lines l JOIN recon_runs r ON r.id = l.run_id
             WHERE r.period <= :p AND r.id = (SELECT MAX(r2.id) FROM recon_runs r2 WHERE r2.period = r.period)
             GROUP BY l.currency HAVING SUM(l.amt_watch) <> 0'
        );
        $cum->execute([':p' => $run['period']]);

        Response::json([
            'run'      => array_merge($run, [
                'summary'  => json_decode((string) $run['summary'], true),
                'warnings' => json_decode((string) $run['warnings'], true) ?: [],
            ]),
            'lines'    => $lines,
            'labels'   => self::LABELS,
            'previous' => $prev === null ? null : ['id' => (int) $prev['id'], 'period' => $prevPeriod, 'summary' => json_decode((string) $prev['summary'], true)],
            'watch_cumulative' => $cum->fetchAll(),
            'remap_suggestions' => $this->suggestions($lines),
        ]);
    }

    public function daily(): void
    {
        Request::require_method('GET');
        Auth::require_access('recon');

        $id   = (int) ($_GET['line_id'] ?? 0);
        $days = $this->db->prepare('SELECT day, mcb_amount, mips_amount, mcb_amount - mips_amount AS diff FROM recon_daily WHERE line_id = :l ORDER BY day');
        $days->execute([':l' => $id]);
        $claims = $this->db->prepare('SELECT txn_at, reference, network, amount FROM recon_claim_items WHERE line_id = :l ORDER BY txn_at');
        $claims->execute([':l' => $id]);
        Response::json(['days' => $days->fetchAll(), 'claims' => $claims->fetchAll()]);
    }

    public function export(): void
    {
        Request::require_method('GET');
        Auth::require_access('recon');

        $run  = $this->runRow((int) ($_GET['id'] ?? 0));
        $kind = (string) ($_GET['kind'] ?? 'lines');
        Audit::log('recon.export', 'recon_run', (int) $run['id'], ['kind' => $kind]);
        $tag = str_replace('-', '', $run['period']);

        if ($kind === 'summary') {
            $s    = json_decode((string) $run['summary'], true) ?: [];
            $rows = [];
            foreach ($s['currencies'] ?? [] as $cur => $c) {
                $rows[] = [$cur, 'MCB total', $c['mcb']];
                $rows[] = [$cur, 'MIPS total', $c['mips']];
                $rows[] = [$cur, 'Gap (MCB - MIPS)', $c['diff']];
                foreach (self::LABELS as $k => $label) {
                    $rows[] = [$cur, $label, $c['categories'][$k]];
                }
                $rows[] = [$cur, 'Unexplained (must be 0)', $c['unexplained']];
                foreach ($c['pct'] as $k => $v) {
                    $rows[] = [$cur, '% gap / MIPS: ' . $k, $v];
                }
            }
            foreach (json_decode((string) $run['warnings'], true) ?: [] as $w) {
                $rows[] = ['', 'WARNING', $w];
            }
            Csv::download("Recon_MCB_vs_MIPS_{$tag}_summary.csv", ['currency', 'item', 'value'], $rows);
        }

        if ($kind === 'claims') {
            $stmt = $this->db->prepare(
                'SELECT l.mid, l.merchant_name, l.currency, c.txn_at, c.reference, c.network, c.amount
                 FROM recon_claim_items c JOIN recon_lines l ON l.id = c.line_id
                 WHERE l.run_id = :r ORDER BY l.currency, l.mid, c.txn_at'
            );
            $stmt->execute([':r' => $run['id']]);
            Csv::download("Reclamation_MCB_{$tag}.csv", ['mid', 'merchant', 'currency', 'date', 'reference', 'network', 'amount'],
                array_map('array_values', $stmt->fetchAll()));
        }

        $stmt = $this->db->prepare(
            'SELECT mid, merchant_name, currency, mcb_amount, mips_amount, diff, amt_card_verif, amt_clearing, amt_watch,
                    amt_mips_only, amt_mcb_only, amt_real, mips_count, mips_zero_count, is_bundled
             FROM recon_lines WHERE run_id = :r ORDER BY currency, ABS(diff) DESC'
        );
        $stmt->execute([':r' => $run['id']]);
        Csv::download("Recon_MCB_vs_MIPS_{$tag}_by_merchant.csv",
            ['mid', 'merchant', 'currency', 'mcb', 'mips', 'gap', ...array_values(self::LABELS), 'mips_txn', 'mips_zero_txn', 'bundle'],
            array_map('array_values', $stmt->fetchAll()));
    }

    public function settings(): void
    {
        Request::require_method('GET');
        Auth::require_access('recon');
        Response::json([
            'remaps' => $this->db->query('SELECT id, from_mid, to_mid, label FROM recon_mid_remaps ORDER BY label, from_mid')->fetchAll(),
            'watch'  => $this->db->query('SELECT id, mid, label FROM recon_watch_mids ORDER BY mid')->fetchAll(),
        ]);
    }

    public function remapAdd(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('recon');
        Request::require_csrf();

        $d    = Request::body();
        $from = self::mid($d['from_mid'] ?? '');
        $to   = self::mid($d['to_mid'] ?? '');
        if ($from === null || $to === null || $from === $to) {
            Response::json(['error' => 'Two different numeric MIDs are required.'], 422);
        }
        // No chains: a target cannot itself be remapped, and vice versa.
        $chk = $this->db->prepare('SELECT 1 FROM recon_mid_remaps WHERE from_mid IN (:a, :b) OR to_mid = :c');
        $chk->execute([':a' => $from, ':b' => $to, ':c' => $from]);
        if ($chk->fetchColumn() !== false) {
            Response::json(['error' => 'One of these MIDs is already part of a remap.'], 409);
        }
        $label = is_string($d['label'] ?? null) ? mb_substr(trim($d['label']), 0, 120) : null;
        $this->db->prepare('INSERT INTO recon_mid_remaps (from_mid, to_mid, label, created_by) VALUES (:f, :t, :l, :u)')
            ->execute([':f' => $from, ':t' => $to, ':l' => $label ?: null, ':u' => (int) $user['id']]);
        Audit::log('recon.remap_add', 'recon_remap', (int) $this->db->lastInsertId(), ['from' => $from, 'to' => $to, 'label' => $label]);
        Response::json(['success' => true], 201);
    }

    public function remapDelete(): void
    {
        $this->deleteSetting('recon_mid_remaps', 'recon.remap_delete');
    }

    public function watchAdd(): void
    {
        Request::require_method('POST');
        Auth::require_access('recon');
        Request::require_csrf();

        $d   = Request::body();
        $mid = self::mid($d['mid'] ?? '');
        if ($mid === null) {
            Response::json(['error' => 'A numeric MID is required.'], 422);
        }
        $label = is_string($d['label'] ?? null) ? mb_substr(trim($d['label']), 0, 120) : null;
        $this->db->prepare('INSERT IGNORE INTO recon_watch_mids (mid, label) VALUES (:m, :l)')->execute([':m' => $mid, ':l' => $label ?: null]);
        Audit::log('recon.watch_add', 'recon_watch', $mid, ['label' => $label]);
        Response::json(['success' => true], 201);
    }

    public function watchDelete(): void
    {
        $this->deleteSetting('recon_watch_mids', 'recon.watch_delete');
    }

    private function deleteSetting(string $table, string $action): void
    {
        Request::require_method('POST');
        Auth::require_access('recon');
        Request::require_csrf();

        $id   = (int) (Request::body()['id'] ?? 0);
        // $table is always a literal from this class.
        $row  = $this->db->prepare("SELECT * FROM $table WHERE id = :id");
        $row->execute([':id' => $id]);
        $before = $row->fetch();
        if (!is_array($before)) {
            Response::json(['error' => 'Not found.'], 404);
        }
        $this->db->prepare("DELETE FROM $table WHERE id = :id")->execute([':id' => $id]);
        Audit::log($action, $table, $id, $before);
        Response::json(['success' => true]);
    }

    /**
     * Pairs of one-sided lines that cancel out in the same currency: likely
     * the same merchant under two MIDs (candidate remap).
     *
     * @param list<array<string,mixed>> $lines
     * @return list<array<string,mixed>>
     */
    private function suggestions(array $lines): array
    {
        $mcbOnly  = array_filter($lines, static fn ($l) => (float) $l['mips_amount'] == 0.0 && (float) $l['mcb_amount'] != 0.0);
        $mipsOnly = array_filter($lines, static fn ($l) => (float) $l['mcb_amount'] == 0.0 && (float) $l['mips_amount'] != 0.0);
        $out = [];
        foreach ($mcbOnly as $a) {
            foreach ($mipsOnly as $b) {
                if ($a['currency'] !== $b['currency']) {
                    continue;
                }
                $x = (float) $a['mcb_amount'];
                $y = (float) $b['mips_amount'];
                $tolerance = max(1.0, 0.005 * max(abs($x), abs($y)));
                if (abs($x - $y) <= $tolerance) {
                    $out[] = ['mcb_mid' => $a['mid'], 'mips_mid' => $b['mid'], 'currency' => $a['currency'],
                        'mcb_amount' => $x, 'mips_amount' => $y, 'merchant' => $b['merchant_name'] ?? $a['merchant_name']];
                }
            }
        }
        return $out;
    }

    /** @return array<string,mixed> */
    private function runRow(int $id): array
    {
        $stmt = $this->db->prepare('SELECT r.*, u.email AS created_by_email FROM recon_runs r LEFT JOIN users u ON u.id = r.created_by WHERE r.id = :id');
        $stmt->execute([':id' => $id]);
        $run = $stmt->fetch();
        if (!is_array($run)) {
            Response::json(['error' => 'Reconciliation not found.'], 404);
        }
        unset($run['mcb_path'], $run['mips_path']);
        return $run;
    }

    /** @param array<string,array<string,string>> $stored */
    private function discard(array $stored): void
    {
        foreach ($stored as $f) {
            @unlink($f['abs']);
        }
    }

    private static function mid(mixed $v): ?string
    {
        $v = is_scalar($v) ? trim((string) $v) : '';
        return preg_match('/^\d{1,32}$/', $v) ? $v : null;
    }
}
