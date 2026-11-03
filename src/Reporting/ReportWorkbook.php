<?php
/**
 * Excel workbook of the monthly report, laid out like the analytics
 * workbook (analyze.py) so month-end readers find the same tabs:
 *
 *   Summary_MUR_volume   report lines x imported months of the 12-month window, + MoM
 *   Summary_txn          same, transaction counts
 *   Cleaning             cleaning counts per month
 *   Detail_YYYY-MM       full line table of the selected month
 *   Merchant_segments    TPE-only / online-only / both, per month
 *   FX                   non-MUR rows per month and currency (never converted)
 *   Top_merchants        selected month, with previous month
 *   Flags                "verify before use" list of the selected month
 *
 * Every figure is a number cell (pivot-ready), never text.
 */
declare(strict_types=1);

namespace App\Reporting;

final class ReportWorkbook
{
    public static function build(string $period): ?XlsxWriter
    {
        $mr  = new MonthlyReport();
        $cur = $mr->build($period);
        if ($cur === null) {
            return null;
        }

        // Imported months of the 12-month window ending at $period, oldest first.
        $imported = array_flip($mr->periods());
        $months   = [];
        $d = new \DateTimeImmutable($period . '-01');
        for ($i = 11; $i >= 0; $i--) {
            $p = $d->modify("-$i month")->format('Y-m');
            if (isset($imported[$p])) {
                $months[] = $p;
            }
        }
        $reports = [];
        foreach ($months as $p) {
            $reports[$p] = $p === $period ? $cur : $mr->build($p);
        }

        // Line order: the selected month's, then lines seen only in other months.
        $labels = array_map(static fn ($l) => $l['label'], $cur['lines']);
        foreach ($reports as $r) {
            foreach ($r['lines'] as $l) {
                if (!in_array($l['label'], $labels, true)) {
                    $labels[] = $l['label'];
                }
            }
        }
        $value = static function (array $r, string $label, string $key) {
            foreach ($r['lines'] as $l) {
                if ($l['label'] === $label) {
                    return $l[$key];
                }
            }
            return null;
        };
        $strong = static fn (string $label): bool => (bool) preg_match('/total|strict|all$/', $label);

        $x     = new XlsxWriter();
        $title = 'MIPS monthly report — ' . $period . ' (MUR volumes only; non-MUR never converted)';
        $prev  = count($months) >= 2 ? $months[count($months) - 2] : null;

        foreach (['mur_vol' => ['Summary_MUR_volume', 'money', 'MoM vol'], 'txn' => ['Summary_txn', 'int', 'MoM txn']] as $key => [$name, $fmt, $momLabel]) {
            $cols = [['Line', 'text', 34]];
            foreach ($months as $p) {
                $cols[] = [$p, $fmt, 15];
            }
            $rows = [];
            $bold = [];
            foreach ($labels as $i => $label) {
                $row = [$label];
                foreach ($months as $p) {
                    $row[] = $value($reports[$p], $label, $key);
                }
                if ($prev !== null) {
                    $a = $value($reports[$period], $label, $key);
                    $b = $value($reports[$prev], $label, $key);
                    $row[] = ($a !== null && $b !== null && (float) $b != 0.0) ? $a / $b - 1 : null;
                }
                $rows[] = $row;
                if ($strong($label)) {
                    $bold[] = $i;
                }
            }
            if ($prev !== null) {
                $cols[] = ["$momLabel $prev → $period", 'pct', 16];
            }
            $x->addSheet($name, ['title' => $title, 'columns' => $cols, 'rows' => $rows, 'bold_rows' => $bold]);
        }

        $x->addSheet('Cleaning', [
            'title'   => 'Cleaning (frozen rules): SUCCESS only, test rows and refund-only rows dropped, refunds not netted',
            'columns' => [['Month', 'text', 10], ['Raw rows', 'int', 12], ['Not SUCCESS', 'int', 13], ['Test', 'int', 10],
                ['Refund-only', 'int', 13], ['Refunds reported', 'money', 17], ['Clean rows', 'int', 12], ['Source file', 'text', 40]],
            'rows'    => array_map(static fn ($p) => [$p, (int) $reports[$p]['cleaning']['rows_raw'], (int) $reports[$p]['cleaning']['rows_not_success'],
                (int) $reports[$p]['cleaning']['rows_test'], (int) $reports[$p]['cleaning']['rows_refund_only'],
                (float) $reports[$p]['cleaning']['refund_total_reported'], (int) $reports[$p]['cleaning']['rows_clean'],
                $reports[$p]['cleaning']['filename']], $months),
        ]);

        $x->addSheet('Detail_' . $period, [
            'title'   => $title,
            'columns' => [['Line', 'text', 34], ['Txn', 'int', 10], ['MUR txn', 'int', 10], ['MUR volume', 'money', 16],
                ['Avg ticket', 'money', 12], ['Non-MUR txn', 'int', 12], ['MUR volume prev', 'money', 16], ['MoM vol', 'pct', 10],
                ['Txn prev', 'int', 10], ['MoM txn', 'pct', 10]],
            'rows'    => array_map(static fn ($l) => [$l['label'], $l['txn'], $l['mur_txn'], $l['mur_vol'], $l['avg_ticket'], $l['fx_txn'],
                $l['prev_mur_vol'], $l['mom_vol'], $l['prev_txn'], $l['mom_txn']], $cur['lines']),
            'bold_rows' => array_keys(array_filter($cur['lines'], static fn ($l) => $strong($l['label']))),
        ]);

        $x->addSheet('Merchant_segments', [
            'columns' => [['Month', 'text', 10], ['Active forms', 'int', 13], ['TPE only', 'int', 11], ['Online only', 'int', 12], ['Both', 'int', 8]],
            'rows'    => array_map(static fn ($p) => [$p, $reports[$p]['segments']['active_forms'], $reports[$p]['segments']['tpe_only'],
                $reports[$p]['segments']['online_only'], $reports[$p]['segments']['both']], $months),
        ]);

        $fx = [];
        foreach ($months as $p) {
            foreach ($reports[$p]['fx'] as $f) {
                $fx[] = [$p, $f['currency'], $f['txn'], $f['vol']];
            }
        }
        $x->addSheet('FX', [
            'title'   => 'Non-MUR rows, per currency, never converted (no FX column in the source)',
            'columns' => [['Month', 'text', 10], ['Currency', 'text', 10], ['Txn', 'int', 10], ['Volume (own currency)', 'money', 20]],
            'rows'    => $fx,
        ]);

        $x->addSheet('Top_merchants', [
            'title'   => 'Top merchants by MUR volume — ' . $period,
            'columns' => [['Merchant', 'text', 34], ['Txn', 'int', 10], ['MUR volume', 'money', 16], ['Previous month', 'money', 16], ['MoM', 'pct', 10]],
            'rows'    => array_map(static fn ($m) => [$m['merchant'], $m['txn'], $m['mur_vol'], $m['prev_mur_vol'], $m['mom_vol']], $cur['top_merchants']),
        ]);

        $x->addSheet('Flags', [
            'title'   => 'Verify before use — ' . $period,
            'columns' => [['Flag', 'text', 120]],
            'rows'    => array_map(static fn ($f) => [$f], $cur['flags']),
        ]);

        return $x;
    }
}
