<?php
/**
 * Commission invoices: generation from imported transactions and the
 * draft -> issued -> paid lifecycle (void from draft or issued).
 *
 * - One invoice per merchant / period / currency. Commission is charged in
 *   the transaction currency; nothing is converted.
 * - Fees are computed on gross volume (refunds are not netted, consistent
 *   with the reporting rules).
 * - Generating a period rebuilds its drafts and leaves issued/paid invoices
 *   untouched.
 * - Numbers (PREFIX-YYYY-NNNNN) are assigned at issue time from a locked
 *   per-year counter, so issued numbers have no gaps.
 */
declare(strict_types=1);

namespace App\Billing;

use App\Database;
use PDO;
use RuntimeException;

final class InvoiceService
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::connection();
    }

    /**
     * @return array{created:int, skipped_locked:int, unpriced_lines:int, invoice_ids:list<int>}
     */
    public function generate(string $period, int $userId): array
    {
        $start   = $period . '-01';
        $end     = (new \DateTimeImmutable($start))->modify('last day of this month')->format('Y-m-d');
        $rules   = new FeeRules($start, $end);
        $vatRate = (float) ($GLOBALS['config']['billing']['vat_rate'] ?? 0);

        // Daily grain so a rule change mid-month applies from its valid_from date.
        $stmt = $this->db->prepare(
            'SELECT t.merchant_id, t.currency, t.sof_proc_nickname AS nick, t.rail_type AS rail, t.channel, t.txn_date,
                    COUNT(*) AS n, SUM(t.amount) AS vol
             FROM transactions t JOIN merchants m ON m.id = t.merchant_id
             WHERE t.period = :p AND m.is_billable = 1
             GROUP BY t.merchant_id, t.currency, t.sof_proc_nickname, t.rail_type, t.channel, t.txn_date'
        );
        $stmt->execute([':p' => $period]);

        // invoices[merchant|currency][nick|channel|rule] = line
        $invoices = [];
        foreach ($stmt->fetchAll() as $g) {
            $rule  = $rules->resolve((int) $g['merchant_id'], (string) $g['nick'], (string) $g['rail'], (string) $g['channel'], (string) $g['txn_date']);
            $key   = $g['merchant_id'] . '|' . $g['currency'];
            $lkey  = $g['nick'] . '|' . $g['channel'] . '|' . ($rule['id'] ?? 0);
            $line  = &$invoices[$key][$lkey];
            $line ??= [
                'nick' => (string) $g['nick'], 'channel' => (string) $g['channel'],
                'rule_id' => $rule !== null ? (int) $rule['id'] : null,
                'rate' => $rule !== null ? (float) $rule['rate_pct'] : 0.0,
                'fixed' => $rule !== null ? (float) $rule['fixed_fee'] : 0.0,
                'n' => 0, 'vol' => 0.0,
            ];
            $line['n']   += (int) $g['n'];
            $line['vol'] += (float) $g['vol'];
            unset($line);
        }

        $this->db->beginTransaction();
        try {
            $this->db->prepare("DELETE FROM invoices WHERE period = :p AND status = 'draft'")->execute([':p' => $period]);

            $lockedStmt = $this->db->prepare(
                "SELECT CONCAT(merchant_id, '|', currency) FROM invoices WHERE period = :p AND status IN ('issued', 'paid')"
            );
            $lockedStmt->execute([':p' => $period]);
            $locked = array_flip($lockedStmt->fetchAll(PDO::FETCH_COLUMN));

            $insInv = $this->db->prepare(
                'INSERT INTO invoices (merchant_id, period, currency, status, txn_count, volume, subtotal, vat_rate, vat_amount, total, created_by, created_at)
                 VALUES (:m, :p, :c, \'draft\', :n, :vol, :sub, :vr, :va, :tot, :u, NOW())'
            );
            $insLine = $this->db->prepare(
                'INSERT INTO invoice_lines (invoice_id, sof_proc_nickname, channel, fee_rule_id, rate_pct, fixed_fee, txn_count, volume, amount)
                 VALUES (:i, :nick, :ch, :r, :rate, :fixed, :n, :vol, :amt)'
            );

            $created = $skipped = $unpriced = 0;
            $ids = [];
            ksort($invoices);
            foreach ($invoices as $key => $lines) {
                if (isset($locked[$key])) {
                    $skipped++;
                    continue;
                }
                [$merchantId, $currency] = explode('|', $key, 2);

                $n = 0;
                $vol = $sub = 0.0;
                foreach ($lines as &$l) {
                    // Linear fee: sum(amount * rate) + count * fixed.
                    $l['amount'] = round($l['vol'] * $l['rate'] / 100 + $l['n'] * $l['fixed'], 2);
                    $n   += $l['n'];
                    $vol += $l['vol'];
                    $sub += $l['amount'];
                    if ($l['rule_id'] === null) {
                        $unpriced++;
                    }
                }
                unset($l);
                $sub = round($sub, 2);
                $vat = round($sub * $vatRate / 100, 2);

                $insInv->execute([
                    ':m' => (int) $merchantId, ':p' => $period, ':c' => $currency, ':n' => $n,
                    ':vol' => round($vol, 2), ':sub' => $sub, ':vr' => $vatRate, ':va' => $vat,
                    ':tot' => round($sub + $vat, 2), ':u' => $userId,
                ]);
                $invoiceId = (int) $this->db->lastInsertId();
                $ids[] = $invoiceId;
                $created++;

                ksort($lines);
                foreach ($lines as $l) {
                    $insLine->execute([
                        ':i' => $invoiceId, ':nick' => $l['nick'], ':ch' => $l['channel'], ':r' => $l['rule_id'],
                        ':rate' => $l['rate'], ':fixed' => $l['fixed'], ':n' => $l['n'],
                        ':vol' => round($l['vol'], 2), ':amt' => $l['amount'],
                    ]);
                }
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        return ['created' => $created, 'skipped_locked' => $skipped, 'unpriced_lines' => $unpriced, 'invoice_ids' => $ids];
    }

    /**
     * Move an invoice to a new status. Returns the updated invoice.
     *
     * @return array<string,mixed>
     */
    public function transition(int $invoiceId, string $to): array
    {
        $allowed = [
            'draft'  => ['issued', 'void'],
            'issued' => ['paid', 'void'],
            'paid'   => [],
            'void'   => [],
        ];

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('SELECT * FROM invoices WHERE id = :id FOR UPDATE');
            $stmt->execute([':id' => $invoiceId]);
            $inv = $stmt->fetch();
            if (!is_array($inv)) {
                throw new RuntimeException('Invoice not found.', 404);
            }
            if (!in_array($to, $allowed[$inv['status']] ?? [], true)) {
                throw new RuntimeException("Cannot change a {$inv['status']} invoice to $to.", 409);
            }

            if ($to === 'issued') {
                $number = $this->nextNumber((int) date('Y'));
                $this->db->prepare("UPDATE invoices SET status = 'issued', number = :num, issued_at = NOW() WHERE id = :id")
                    ->execute([':num' => $number, ':id' => $invoiceId]);
            } elseif ($to === 'paid') {
                $this->db->prepare("UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = :id")
                    ->execute([':id' => $invoiceId]);
            } else {
                // live_key NULL frees the merchant/period/currency slot for a new invoice.
                $this->db->prepare("UPDATE invoices SET status = 'void', voided_at = NOW(), live_key = NULL WHERE id = :id")
                    ->execute([':id' => $invoiceId]);
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        return (array) $this->find($invoiceId);
    }

    /** @return array<string,mixed>|null invoice with merchant name and lines */
    public function find(int $invoiceId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT i.*, m.name AS merchant_name, m.legal_name, m.brn, m.vat_number, m.address,
                    COALESCE(m.billing_email,
                             (SELECT c.email FROM merchant_contacts c
                               WHERE c.merchant_id = m.id AND c.is_billing = 1 AND c.email IS NOT NULL
                               ORDER BY c.is_primary DESC, c.id LIMIT 1)) AS billing_email
             FROM invoices i JOIN merchants m ON m.id = i.merchant_id WHERE i.id = :id'
        );
        $stmt->execute([':id' => $invoiceId]);
        $inv = $stmt->fetch();
        if (!is_array($inv)) {
            return null;
        }
        $lines = $this->db->prepare('SELECT * FROM invoice_lines WHERE invoice_id = :id ORDER BY sof_proc_nickname, channel');
        $lines->execute([':id' => $invoiceId]);
        $inv['lines'] = $lines->fetchAll();
        return $inv;
    }

    /** @return list<array<string,mixed>> */
    public function listForPeriod(string $period): array
    {
        $stmt = $this->db->prepare(
            'SELECT i.id, i.number, i.merchant_id, m.name AS merchant_name, i.period, i.currency, i.status,
                    i.txn_count, i.volume, i.subtotal, i.vat_amount, i.total, i.issued_at, i.paid_at,
                    (SELECT COUNT(*) FROM invoice_lines l WHERE l.invoice_id = i.id AND l.fee_rule_id IS NULL) AS unpriced_lines
             FROM invoices i JOIN merchants m ON m.id = i.merchant_id
             WHERE i.period = :p
             ORDER BY i.status = \'void\', m.name, i.currency'
        );
        $stmt->execute([':p' => $period]);
        return $stmt->fetchAll();
    }

    private function nextNumber(int $year): string
    {
        $this->db->prepare('INSERT IGNORE INTO invoice_sequences (year, last_value) VALUES (:y, 0)')->execute([':y' => $year]);
        $sel = $this->db->prepare('SELECT last_value FROM invoice_sequences WHERE year = :y FOR UPDATE');
        $sel->execute([':y' => $year]);
        $next = (int) $sel->fetchColumn() + 1;
        $this->db->prepare('UPDATE invoice_sequences SET last_value = :v WHERE year = :y')->execute([':v' => $next, ':y' => $year]);

        $prefix = (string) ($GLOBALS['config']['billing']['invoice_prefix'] ?? 'INV');
        return sprintf('%s-%d-%05d', $prefix, $year, $next);
    }
}
