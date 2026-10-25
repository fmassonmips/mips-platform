<?php
/**
 * Commission billing API.
 *
 *   GET  /api/billing/merchants
 *   POST /api/billing/merchant          { id, billing_email, is_billable }
 *   GET  /api/billing/fee-rules
 *   POST /api/billing/fee-rule          { merchant_id?, sof_proc_nickname?, rail_type?, channel?, rate_pct, fixed_fee, valid_from, valid_to? }
 *   POST /api/billing/fee-rule-disable  { id }
 *   POST /api/billing/generate          { period }
 *   GET  /api/billing/invoices?period=YYYY-MM
 *   POST /api/billing/invoice-status    { id, status: issued|paid|void }
 *   GET  /api/billing/export?period=YYYY-MM   CSV for accounting
 */
declare(strict_types=1);

namespace App\Controllers\Billing;

use App\Audit;
use App\Auth;
use App\Billing\InvoiceService;
use App\Csv;
use App\Database;
use App\Reporting\Rails;
use App\Request;
use App\Response;
use App\Validator;

final class BillingController
{
    public function merchants(): void
    {
        Request::require_method('GET');
        Auth::require_access('billing');

        $rows = Database::connection()->query(
            'SELECT m.id, m.name, m.billing_email, m.is_billable,
                    (SELECT MAX(period) FROM transactions t WHERE t.merchant_id = m.id) AS last_period
             FROM merchants m ORDER BY m.name'
        )->fetchAll();
        Response::json(['merchants' => $rows]);
    }

    public function updateMerchant(): void
    {
        Request::require_method('POST');
        Auth::require_access('billing');
        Request::require_csrf();

        $data  = Request::body();
        $id    = (int) ($data['id'] ?? 0);
        $email = is_string($data['billing_email'] ?? null) ? trim($data['billing_email']) : '';
        $bill  = !empty($data['is_billable']) ? 1 : 0;

        if ($email !== '' && ($err = Validator::email($email)) !== null) {
            Response::json(['error' => $err], 422);
        }

        $db   = Database::connection();
        $prev = $db->prepare('SELECT billing_email, is_billable FROM merchants WHERE id = :id');
        $prev->execute([':id' => $id]);
        $before = $prev->fetch();
        if (!is_array($before)) {
            Response::json(['error' => 'Merchant not found.'], 404);
        }

        $db->prepare('UPDATE merchants SET billing_email = :e, is_billable = :b WHERE id = :id')
            ->execute([':e' => $email === '' ? null : $email, ':b' => $bill, ':id' => $id]);

        Audit::log('merchant.update', 'merchant', $id, [
            'before' => $before,
            'after'  => ['billing_email' => $email === '' ? null : $email, 'is_billable' => $bill],
        ]);
        Response::json(['success' => true]);
    }

    public function feeRules(): void
    {
        Request::require_method('GET');
        Auth::require_access('billing');

        $rows = Database::connection()->query(
            'SELECT r.*, m.name AS merchant_name
             FROM fee_rules r LEFT JOIN merchants m ON m.id = r.merchant_id
             ORDER BY r.is_active DESC, m.name IS NOT NULL, m.name, r.sof_proc_nickname, r.rail_type, r.channel, r.valid_from DESC'
        )->fetchAll();
        Response::json(['fee_rules' => $rows, 'rail_types' => Rails::TYPES]);
    }

    public function createFeeRule(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('billing');
        Request::require_csrf();

        $d = Request::body();
        $opt = static fn (string $k): ?string => (is_scalar($d[$k] ?? null) && trim((string) $d[$k]) !== '') ? trim((string) $d[$k]) : null;

        $merchantId = $opt('merchant_id');
        $nickname   = $opt('sof_proc_nickname');
        $rail       = $opt('rail_type');
        $channel    = $opt('channel');
        $rate       = $opt('rate_pct') ?? '0';
        $fixed      = $opt('fixed_fee') ?? '0';
        $from       = $opt('valid_from');
        $to         = $opt('valid_to');

        $isDate = static fn (?string $v): bool => $v !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) === 1
            && checkdate((int) substr($v, 5, 2), (int) substr($v, 8, 2), (int) substr($v, 0, 4));

        $errors = [];
        if ($merchantId !== null && !ctype_digit($merchantId)) {
            $errors[] = 'Invalid merchant.';
        }
        if ($nickname !== null && mb_strlen($nickname) > 64) {
            $errors[] = 'Rail nickname is too long.';
        }
        if ($rail !== null && !in_array($rail, Rails::TYPES, true)) {
            $errors[] = 'Invalid rail type.';
        }
        if ($channel !== null && !in_array($channel, ['TPE', 'ONLINE'], true)) {
            $errors[] = 'Invalid channel.';
        }
        if (!is_numeric($rate) || (float) $rate < 0 || (float) $rate > 100) {
            $errors[] = 'Rate must be between 0 and 100 (%).';
        }
        if (!is_numeric($fixed) || (float) $fixed < 0) {
            $errors[] = 'Fixed fee must be zero or positive.';
        }
        if (!$isDate($from)) {
            $errors[] = 'Start date is required (YYYY-MM-DD).';
        }
        if ($to !== null && (!$isDate($to) || $to < (string) $from)) {
            $errors[] = 'End date must be a valid date on or after the start date.';
        }
        if ($errors !== []) {
            Response::json(['error' => implode(' ', $errors)], 422);
        }

        $db = Database::connection();
        if ($merchantId !== null) {
            $chk = $db->prepare('SELECT 1 FROM merchants WHERE id = :id');
            $chk->execute([':id' => (int) $merchantId]);
            if ($chk->fetchColumn() === false) {
                Response::json(['error' => 'Merchant not found.'], 422);
            }
        }

        $db->prepare(
            'INSERT INTO fee_rules (merchant_id, sof_proc_nickname, rail_type, channel, rate_pct, fixed_fee, valid_from, valid_to, created_by, created_at)
             VALUES (:m, :n, :r, :c, :rate, :fixed, :from, :to, :u, NOW())'
        )->execute([
            ':m' => $merchantId === null ? null : (int) $merchantId, ':n' => $nickname, ':r' => $rail, ':c' => $channel,
            ':rate' => round((float) $rate, 4), ':fixed' => round((float) $fixed, 2), ':from' => $from, ':to' => $to,
            ':u' => (int) $user['id'],
        ]);
        $id = (int) $db->lastInsertId();

        Audit::log('fee_rule.create', 'fee_rule', $id, [
            'merchant_id' => $merchantId, 'sof_proc_nickname' => $nickname, 'rail_type' => $rail, 'channel' => $channel,
            'rate_pct' => (float) $rate, 'fixed_fee' => (float) $fixed, 'valid_from' => $from, 'valid_to' => $to,
        ]);
        Response::json(['success' => true, 'id' => $id], 201);
    }

    /** Rules are never edited in place: disable and create a new one, so history stays readable. */
    public function disableFeeRule(): void
    {
        Request::require_method('POST');
        Auth::require_access('billing');
        Request::require_csrf();

        $id   = (int) (Request::body()['id'] ?? 0);
        $stmt = Database::connection()->prepare('UPDATE fee_rules SET is_active = 0 WHERE id = :id AND is_active = 1');
        $stmt->execute([':id' => $id]);
        if ($stmt->rowCount() === 0) {
            Response::json(['error' => 'Rule not found or already disabled.'], 404);
        }
        Audit::log('fee_rule.disable', 'fee_rule', $id);
        Response::json(['success' => true]);
    }

    public function generate(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('billing');
        Request::require_csrf();

        $period = Request::period(Request::body()['period'] ?? null);
        if ($period === null) {
            Response::json(['error' => 'Month must be in YYYY-MM format.'], 422);
        }

        $chk = Database::connection()->prepare('SELECT 1 FROM import_periods WHERE period = :p');
        $chk->execute([':p' => $period]);
        if ($chk->fetchColumn() === false) {
            Response::json(['error' => 'No transactions imported for ' . $period . '.'], 422);
        }

        $result = (new InvoiceService())->generate($period, (int) $user['id']);
        Audit::log('invoice.generate', 'period', $period, $result);
        Response::json(['success' => true, 'result' => $result]);
    }

    public function invoices(): void
    {
        Request::require_method('GET');
        Auth::require_access('billing');

        $period = Request::period($_GET['period'] ?? null);
        if ($period === null) {
            Response::json(['error' => 'Month must be in YYYY-MM format.'], 422);
        }
        Response::json(['invoices' => (new InvoiceService())->listForPeriod($period)]);
    }

    public function invoiceStatus(): void
    {
        Request::require_method('POST');
        Auth::require_access('billing');
        Request::require_csrf();

        $d      = Request::body();
        $id     = (int) ($d['id'] ?? 0);
        $status = (string) ($d['status'] ?? '');
        if (!in_array($status, ['issued', 'paid', 'void'], true)) {
            Response::json(['error' => 'Invalid status.'], 422);
        }

        try {
            $inv = (new InvoiceService())->transition($id, $status);
        } catch (\RuntimeException $e) {
            $code = in_array($e->getCode(), [404, 409], true) ? (int) $e->getCode() : 422;
            Response::json(['error' => $e->getMessage()], $code);
        }

        Audit::log('invoice.' . $status, 'invoice', $id, ['number' => $inv['number'], 'total' => $inv['total'], 'currency' => $inv['currency']]);
        Response::json(['success' => true, 'invoice' => $inv]);
    }

    public function export(): void
    {
        Request::require_method('GET');
        Auth::require_access('billing');

        $period = Request::period($_GET['period'] ?? null);
        if ($period === null) {
            Response::json(['error' => 'Month must be in YYYY-MM format.'], 422);
        }
        Audit::log('invoice.export', 'period', $period);

        $rows = array_map(static fn ($i) => [
            $i['number'], $i['status'], $i['merchant_name'], $i['period'], $i['currency'], (int) $i['txn_count'],
            (float) $i['volume'], (float) $i['subtotal'], (float) $i['vat_amount'], (float) $i['total'], $i['issued_at'], $i['paid_at'],
        ], (new InvoiceService())->listForPeriod($period));

        Csv::download(
            "MIPS_invoices_$period.csv",
            ['number', 'status', 'merchant', 'period', 'currency', 'txn_count', 'volume', 'subtotal', 'vat', 'total', 'issued_at', 'paid_at'],
            $rows
        );
    }
}
