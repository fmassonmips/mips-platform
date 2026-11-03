<?php
/**
 * Monthly accounting export for the company's accountant: the sales journal
 * (every invoice and credit note issued in the month) and the VAT summary by
 * MRA tax code. Read only: nothing here writes to the database.
 *
 * Rules:
 *  - a document belongs to the month of its issue date; drafts and quotes are left out;
 *  - credit notes count negative, so the totals are net of credits;
 *  - the VAT summary covers MUR documents only (no exchange rate is stored for the
 *    others); documents in another currency are listed in the journal and counted apart;
 *  - amounts are read from the stored line and document totals, never recomputed.
 */
declare(strict_types=1);

namespace App\Facturo;

use App\Database;

final class Accounting
{
    public const TYPE_LABELS = ['invoice' => 'Facture', 'credit_note' => 'Avoir'];

    /** 'YYYY-MM' → [first day, last day], or null when the value is not a month. */
    public static function period(string $month): ?array
    {
        if (preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/', $month) !== 1) {
            return null;
        }
        $first = \DateTimeImmutable::createFromFormat('!Y-m-d', $month . '-01');
        if ($first === false) {
            return null;
        }
        return [$first->format('Y-m-d'), $first->modify('last day of this month')->format('Y-m-d')];
    }

    /** The months that have at least one issued invoice or credit note, latest first ('YYYY-MM'). */
    public static function months(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT DISTINCT DATE_FORMAT(issue_date, '%Y-%m') AS m FROM facturo_documents
             WHERE organization_id = :o AND type IN ('invoice', 'credit_note') AND status <> 'draft'
             ORDER BY m DESC"
        );
        $stmt->execute([':o' => $orgId]);
        return array_map('strval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    }

    /**
     * Sales journal of the period: one row per issued invoice or credit note, amounts signed.
     *
     * @return list<array<string,mixed>>
     */
    public static function journal(int $orgId, string $from, string $to): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT d.id, d.type, d.number, d.status, d.issue_date, d.due_date, d.currency,
                    d.subtotal_cents, d.tax_cents, d.total_cents, d.paid_at, d.client_snapshot,
                    d.mra_status, d.mra_irn, src.number AS source_number
             FROM facturo_documents d
             LEFT JOIN facturo_documents src ON src.id = d.source_document_id AND src.organization_id = d.organization_id
             WHERE d.organization_id = :o AND d.type IN ('invoice', 'credit_note') AND d.status <> 'draft'
               AND d.issue_date BETWEEN :f AND :t
             ORDER BY d.issue_date, d.type DESC, d.number"
        );
        $stmt->execute([':o' => $orgId, ':f' => $from, ':t' => $to]);
        $rows = [];
        foreach ($stmt->fetchAll() as $d) {
            $sign   = $d['type'] === 'credit_note' ? -1 : 1;
            $client = json_decode((string) ($d['client_snapshot'] ?? ''), true) ?: [];
            $rows[] = [
                'id'            => (int) $d['id'],
                'date'          => (string) $d['issue_date'],
                'type'          => (string) $d['type'],
                'number'        => (string) $d['number'],
                'source_number' => $d['source_number'] !== null ? (string) $d['source_number'] : '',
                'client'        => (string) ($client['name'] ?? ''),
                'client_brn'    => (string) ($client['brn'] ?? ''),
                'client_vat'    => (string) ($client['vat_number'] ?? ''),
                'client_tan'    => (string) ($client['tan'] ?? ''),
                'currency'      => (string) $d['currency'],
                'net_cents'     => $sign * (int) $d['subtotal_cents'],
                'vat_cents'     => $sign * (int) $d['tax_cents'],
                'total_cents'   => $sign * (int) $d['total_cents'],
                'status'        => Documents::statusLabel((string) $d['type'], (string) $d['status']),
                'due_date'      => (string) ($d['due_date'] ?? ''),
                'paid_at'       => $d['paid_at'] !== null ? substr((string) $d['paid_at'], 0, 10) : '',
                'mra_status'    => (string) ($d['mra_status'] ?? ''),
                'mra_irn'       => (string) ($d['mra_irn'] ?? ''),
            ];
        }
        return $rows;
    }

    /**
     * VAT summary of the period in MUR, by MRA tax code and rate, net of credit notes.
     *
     * @return array{rows:list<array{code:string,label:string,rate:string,net_cents:int,vat_cents:int}>,
     *               net_cents:int, vat_cents:int, total_cents:int, documents:int, other_currencies:array<string,int>}
     */
    public static function vatSummary(int $orgId, string $from, string $to): array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            "SELECT COALESCE(l.tax_code, '') AS code, l.tax_rate AS rate,
                    SUM(CASE WHEN d.type = 'credit_note' THEN -l.line_total_cents ELSE l.line_total_cents END) AS net,
                    SUM(CASE WHEN d.type = 'credit_note' THEN -l.line_tax_cents ELSE l.line_tax_cents END) AS vat
             FROM facturo_document_lines l
             JOIN facturo_documents d ON d.id = l.document_id
             WHERE d.organization_id = :o AND d.type IN ('invoice', 'credit_note') AND d.status <> 'draft'
               AND d.currency = 'MUR' AND d.issue_date BETWEEN :f AND :t
             GROUP BY code, rate
             ORDER BY code, rate DESC"
        );
        $stmt->execute([':o' => $orgId, ':f' => $from, ':t' => $to]);
        $rows = [];
        foreach ($stmt->fetchAll() as $r) {
            $code = (string) $r['code'];
            $rows[] = [
                'code'      => $code,
                'label'     => Documents::TAX_CODES[$code]['label'] ?? 'TVA ' . rtrim(rtrim((string) $r['rate'], '0'), '.') . ' %',
                'rate'      => rtrim(rtrim((string) $r['rate'], '0'), '.'),
                'net_cents' => (int) $r['net'],
                'vat_cents' => (int) $r['vat'],
            ];
        }
        // Totals from the documents themselves (what the customers were billed), checked against the lines.
        $tot = $pdo->prepare(
            "SELECT COUNT(*) AS n,
                    COALESCE(SUM(CASE WHEN type = 'credit_note' THEN -subtotal_cents ELSE subtotal_cents END), 0) AS net,
                    COALESCE(SUM(CASE WHEN type = 'credit_note' THEN -tax_cents ELSE tax_cents END), 0) AS vat,
                    COALESCE(SUM(CASE WHEN type = 'credit_note' THEN -total_cents ELSE total_cents END), 0) AS total
             FROM facturo_documents
             WHERE organization_id = :o AND type IN ('invoice', 'credit_note') AND status <> 'draft'
               AND currency = 'MUR' AND issue_date BETWEEN :f AND :t"
        );
        $tot->execute([':o' => $orgId, ':f' => $from, ':t' => $to]);
        $t = $tot->fetch();
        $other = $pdo->prepare(
            "SELECT currency, COUNT(*) FROM facturo_documents
             WHERE organization_id = :o AND type IN ('invoice', 'credit_note') AND status <> 'draft'
               AND currency <> 'MUR' AND issue_date BETWEEN :f AND :t
             GROUP BY currency ORDER BY currency"
        );
        $other->execute([':o' => $orgId, ':f' => $from, ':t' => $to]);
        return [
            'rows'             => $rows,
            'net_cents'        => (int) $t['net'],
            'vat_cents'        => (int) $t['vat'],
            'total_cents'      => (int) $t['total'],
            'documents'        => (int) $t['n'],
            'other_currencies' => array_map('intval', $other->fetchAll(\PDO::FETCH_KEY_PAIR)),
        ];
    }

    /** CSV cell: values a spreadsheet would run as a formula get a leading quote (numbers stay numbers). */
    public static function cell(mixed $v): string
    {
        $v = (string) ($v ?? '');
        return preg_match('/^[=+\-@\t\r]/', $v) === 1 && !is_numeric($v) ? "'" . $v : $v;
    }

    /** Signed cents → "-1234.50" (dot decimal, no thousands separator: what spreadsheets and accounting software import). */
    public static function amount(int $cents): string
    {
        return Money::toInput($cents);
    }
}
