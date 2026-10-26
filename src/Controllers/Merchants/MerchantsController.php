<?php
/**
 * Merchant directory: profile, contacts, identifiers (MID/TUI) and contracts.
 *
 *   GET  /api/merchants/list?q=&status=
 *   GET  /api/merchants/get?id=
 *   GET  /api/merchants/expiring             contracts ending / at notice deadline soon
 *   POST /api/merchants/save                 { id?, name, legal_name, status, brn, vat_number, address, sector,
 *                                              account_manager_id, billing_email, is_billable, notes }
 *   POST /api/merchants/contact-save         { merchant_id, id?, name, job_title, email, phone, is_primary, is_billing, notes }
 *   POST /api/merchants/contact-delete       { id }
 *   POST /api/merchants/identifier-save      { merchant_id, type, value, label }
 *   POST /api/merchants/identifier-delete    { id }
 *   POST /api/merchants/contract-save        multipart: merchant_id, id?, fields..., document (PDF, optional)
 *   POST /api/merchants/contract-delete      { id }   drafts only; signed contracts are terminated, not deleted
 *   GET  /api/merchants/contract-file?id=    download the stored PDF
 *
 * `name` is the Commission_Data form_name used to match imports: it cannot
 * be changed once the merchant has transactions, or the next import would
 * create a duplicate.
 */
declare(strict_types=1);

namespace App\Controllers\Merchants;

use App\Audit;
use App\Auth;
use App\Database;
use App\Request;
use App\Response;
use App\Validator;
use PDO;

final class MerchantsController
{
    private const STATUSES        = ['prospect', 'onboarding', 'active', 'suspended', 'terminated'];
    private const ID_TYPES        = ['MID', 'TUI', 'OUTLET', 'OTHER'];
    private const CONTRACT_TYPES  = ['MSA', 'PRICING', 'ADDENDUM', 'NDA', 'OTHER'];
    private const CONTRACT_STATUS = ['draft', 'signed', 'terminated'];

    private PDO $db;

    public function __construct()
    {
        $this->db = Database::connection();
    }

    public function list(): void
    {
        Request::require_method('GET');
        Auth::require_access('merchants');

        $where  = [];
        $params = [];
        $status = is_string($_GET['status'] ?? null) ? (string) $_GET['status'] : '';
        if ($status !== '') {
            if (!in_array($status, self::STATUSES, true)) {
                Response::json(['error' => 'Invalid status.'], 422);
            }
            $where[] = 'm.status = :status';
            $params[':status'] = $status;
        }
        $q = is_string($_GET['q'] ?? null) ? trim((string) $_GET['q']) : '';
        if ($q !== '') {
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $where[] = '(m.name LIKE :q1 OR m.legal_name LIKE :q2 OR m.brn LIKE :q3
                         OR EXISTS (SELECT 1 FROM merchant_identifiers i WHERE i.merchant_id = m.id AND i.value LIKE :q4))';
            $params += [':q1' => $like, ':q2' => $like, ':q3' => $like, ':q4' => $like];
        }

        $lastPeriod = $this->db->query('SELECT MAX(period) FROM import_periods')->fetchColumn() ?: null;

        $stmt = $this->db->prepare(
            "SELECT m.id, m.name, m.legal_name, m.status, m.sector, m.is_billable,
                    u.name AS account_manager, u.email AS account_manager_email,
                    (SELECT MAX(period) FROM transactions t WHERE t.merchant_id = m.id) AS last_period,
                    (SELECT SUM(amount) FROM transactions t WHERE t.merchant_id = m.id AND t.period = :lp AND t.currency = 'MUR') AS last_mur_vol,
                    (SELECT COUNT(*) FROM contracts c WHERE c.merchant_id = m.id AND c.status = 'signed') AS signed_contracts,
                    (SELECT name FROM merchant_contacts mc WHERE mc.merchant_id = m.id ORDER BY mc.is_primary DESC, mc.id LIMIT 1) AS primary_contact
             FROM merchants m LEFT JOIN users u ON u.id = m.account_manager_id
             " . ($where === [] ? '' : 'WHERE ' . implode(' AND ', $where)) . "
             ORDER BY m.name
             LIMIT 1000"
        );
        $stmt->execute($params + [':lp' => $lastPeriod ?? '']);

        $counts = $this->db->query('SELECT status, COUNT(*) AS n FROM merchants GROUP BY status')->fetchAll(PDO::FETCH_KEY_PAIR);

        Response::json([
            'merchants'   => $stmt->fetchAll(),
            'last_period' => $lastPeriod,
            'counts'      => $counts,
            'statuses'    => self::STATUSES,
            'managers'    => $this->managers(),
        ]);
    }

    public function get(): void
    {
        Request::require_method('GET');
        Auth::require_access('merchants');

        $id = (int) ($_GET['id'] ?? 0);
        $m  = $this->merchant($id);

        $contacts = $this->db->prepare('SELECT * FROM merchant_contacts WHERE merchant_id = :id ORDER BY is_primary DESC, name');
        $contacts->execute([':id' => $id]);

        $ids = $this->db->prepare('SELECT * FROM merchant_identifiers WHERE merchant_id = :id ORDER BY type, value');
        $ids->execute([':id' => $id]);

        $contracts = $this->db->prepare(
            "SELECT id, reference, type, status, signed_at, start_date, end_date, auto_renew, notice_days, notes,
                    document_name, document_size, created_at,
                    CASE WHEN end_date IS NOT NULL AND notice_days IS NOT NULL
                         THEN DATE_SUB(end_date, INTERVAL notice_days DAY) END AS notice_deadline
             FROM contracts WHERE merchant_id = :id ORDER BY status = 'terminated', start_date DESC, id DESC"
        );
        $contracts->execute([':id' => $id]);

        $volumes = $this->db->prepare(
            "SELECT period, COUNT(*) AS txn,
                    SUM(CASE WHEN currency = 'MUR' THEN amount ELSE 0 END) AS mur_vol,
                    SUM(channel = 'TPE') AS tpe_txn, SUM(channel = 'ONLINE') AS online_txn,
                    GROUP_CONCAT(DISTINCT sof_proc_nickname ORDER BY sof_proc_nickname SEPARATOR ', ') AS rails
             FROM transactions WHERE merchant_id = :id
             GROUP BY period ORDER BY period DESC LIMIT 12"
        );
        $volumes->execute([':id' => $id]);

        $invoices = $this->db->prepare(
            'SELECT id, number, period, currency, status, total FROM invoices
             WHERE merchant_id = :id ORDER BY period DESC, id DESC LIMIT 24'
        );
        $invoices->execute([':id' => $id]);

        $rules = $this->db->prepare(
            'SELECT id, sof_proc_nickname, rail_type, channel, rate_pct, fixed_fee, valid_from, valid_to
             FROM fee_rules WHERE merchant_id = :id AND is_active = 1 ORDER BY valid_from DESC'
        );
        $rules->execute([':id' => $id]);

        $onboarding = $this->db->prepare(
            'SELECT id, kind, status, risk_rating, due_date, decided_at, next_review_date
             FROM onboarding_cases WHERE merchant_id = :id ORDER BY id DESC LIMIT 1'
        );
        $onboarding->execute([':id' => $id]);

        $history = $this->db->prepare(
            "SELECT created_at, user_email, action, details FROM audit_log
             WHERE entity_type = 'merchant' AND entity_id = :id ORDER BY id DESC LIMIT 50"
        );
        $history->execute([':id' => (string) $id]);

        Response::json([
            'merchant'         => $m,
            'contacts'         => $contacts->fetchAll(),
            'identifiers'      => $ids->fetchAll(),
            'contracts'        => $contracts->fetchAll(),
            'volumes'          => $volumes->fetchAll(),
            'invoices'         => $invoices->fetchAll(),
            'fee_rules'        => $rules->fetchAll(),
            'history'          => array_map(static function (array $r): array {
                $r['details'] = $r['details'] === null ? null : json_decode((string) $r['details'], true);
                return $r;
            }, $history->fetchAll()),
            'managers'         => $this->managers(),
            'statuses'         => self::STATUSES,
            'id_types'         => self::ID_TYPES,
            'contract_types'   => self::CONTRACT_TYPES,
            'contract_status'  => self::CONTRACT_STATUS,
            'has_transactions' => $this->hasTransactions($id),
            'onboarding'       => $onboarding->fetch() ?: null,
        ]);
    }

    public function expiring(): void
    {
        Request::require_method('GET');
        Auth::require_access('merchants');

        $days = (int) ($GLOBALS['config']['merchants']['contract_alert_days'] ?? 90);
        $stmt = $this->db->prepare(
            "SELECT c.id, c.merchant_id, m.name AS merchant_name, c.reference, c.type, c.end_date, c.auto_renew, c.notice_days,
                    DATE_SUB(c.end_date, INTERVAL COALESCE(c.notice_days, 0) DAY) AS notice_deadline,
                    DATEDIFF(DATE_SUB(c.end_date, INTERVAL COALESCE(c.notice_days, 0) DAY), CURDATE()) AS days_to_deadline,
                    DATEDIFF(c.end_date, CURDATE()) AS days_to_end
             FROM contracts c JOIN merchants m ON m.id = c.merchant_id
             WHERE c.status = 'signed' AND c.end_date IS NOT NULL
               AND c.end_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
               AND DATE_SUB(c.end_date, INTERVAL COALESCE(c.notice_days, 0) DAY) <= DATE_ADD(CURDATE(), INTERVAL :d DAY)
             ORDER BY notice_deadline, c.end_date"
        );
        $stmt->execute([':d' => $days]);
        Response::json(['contracts' => $stmt->fetchAll(), 'days' => $days]);
    }

    public function save(): void
    {
        Request::require_method('POST');
        Auth::require_access('merchants');
        Request::require_csrf();

        $d  = Request::body();
        $id = (int) ($d['id'] ?? 0);

        $f = [
            'name'               => self::str($d, 'name', 255),
            'legal_name'         => self::str($d, 'legal_name', 255),
            'status'             => self::str($d, 'status', 16) ?? 'active',
            'brn'                => self::str($d, 'brn', 32),
            'vat_number'         => self::str($d, 'vat_number', 32),
            'address'            => self::str($d, 'address', 1000),
            'sector'             => self::str($d, 'sector', 100),
            'account_manager_id' => (isset($d['account_manager_id']) && (string) $d['account_manager_id'] !== '') ? (int) $d['account_manager_id'] : null,
            'billing_email'      => self::str($d, 'billing_email', 254),
            'is_billable'        => !empty($d['is_billable']) ? 1 : 0,
            'notes'              => self::str($d, 'notes', 5000),
        ];

        if ($f['name'] === null) {
            Response::json(['error' => 'Name is required.'], 422);
        }
        if (!in_array($f['status'], self::STATUSES, true)) {
            Response::json(['error' => 'Invalid status.'], 422);
        }
        if ($f['billing_email'] !== null && ($err = Validator::email($f['billing_email'])) !== null) {
            Response::json(['error' => 'Billing email: ' . $err], 422);
        }
        if ($f['account_manager_id'] !== null
            && !in_array($f['account_manager_id'], array_map(static fn ($u) => (int) $u['id'], $this->managers()), true)) {
            Response::json(['error' => 'Invalid account manager.'], 422);
        }

        $dup = $this->db->prepare('SELECT id FROM merchants WHERE name = :n AND id <> :id');
        $dup->execute([':n' => $f['name'], ':id' => $id]);
        if ($dup->fetchColumn() !== false) {
            Response::json(['error' => 'Another merchant already uses this name.'], 409);
        }

        if ($id === 0) {
            $this->db->prepare(
                'INSERT INTO merchants (name, legal_name, status, brn, vat_number, address, sector, account_manager_id, billing_email, is_billable, notes)
                 VALUES (:name, :legal_name, :status, :brn, :vat_number, :address, :sector, :account_manager_id, :billing_email, :is_billable, :notes)'
            )->execute(self::bind($f));
            $id = (int) $this->db->lastInsertId();
            Audit::log('merchant.create', 'merchant', $id, ['name' => $f['name'], 'status' => $f['status']]);
            Response::json(['success' => true, 'id' => $id], 201);
        }

        $before = $this->merchant($id);
        if ($f['name'] !== $before['name'] && $this->hasTransactions($id)) {
            Response::json(['error' => 'The import name cannot change once transactions are imported: the next import would create a duplicate merchant.'], 409);
        }

        $this->db->prepare(
            'UPDATE merchants SET name = :name, legal_name = :legal_name, status = :status, brn = :brn, vat_number = :vat_number,
                    address = :address, sector = :sector, account_manager_id = :account_manager_id,
                    billing_email = :billing_email, is_billable = :is_billable, notes = :notes
             WHERE id = :id'
        )->execute(self::bind($f) + [':id' => $id]);

        $changes = [];
        foreach ($f as $k => $v) {
            if ((string) ($before[$k] ?? '') !== (string) ($v ?? '')) {
                $changes[$k] = ['from' => $before[$k] ?? null, 'to' => $v];
            }
        }
        if ($changes !== []) {
            Audit::log(isset($changes['status']) ? 'merchant.status_change' : 'merchant.update', 'merchant', $id, $changes);
        }
        Response::json(['success' => true, 'id' => $id]);
    }

    public function contactSave(): void
    {
        Request::require_method('POST');
        Auth::require_access('merchants');
        Request::require_csrf();

        $d          = Request::body();
        $id         = (int) ($d['id'] ?? 0);
        $merchantId = $id > 0 ? $this->ownerOf('merchant_contacts', $id) : (int) ($d['merchant_id'] ?? 0);
        $this->merchant($merchantId);

        $f = [
            'name'       => self::str($d, 'name', 120),
            'job_title'  => self::str($d, 'job_title', 120),
            'email'      => self::str($d, 'email', 254),
            'phone'      => self::str($d, 'phone', 40),
            'is_primary' => !empty($d['is_primary']) ? 1 : 0,
            'is_billing' => !empty($d['is_billing']) ? 1 : 0,
            'notes'      => self::str($d, 'notes', 500),
        ];
        if ($f['name'] === null) {
            Response::json(['error' => 'Contact name is required.'], 422);
        }
        if ($f['email'] !== null && ($err = Validator::email($f['email'])) !== null) {
            Response::json(['error' => $err], 422);
        }
        if ($f['phone'] !== null && !preg_match('#^[0-9+() ./-]{3,40}$#', $f['phone'])) {
            Response::json(['error' => 'Phone may contain digits, spaces and + ( ) . / - only.'], 422);
        }

        $this->db->beginTransaction();
        try {
            // One primary contact per merchant.
            if ($f['is_primary'] === 1) {
                $this->db->prepare('UPDATE merchant_contacts SET is_primary = 0 WHERE merchant_id = :m')->execute([':m' => $merchantId]);
            }
            if ($id === 0) {
                $this->db->prepare(
                    'INSERT INTO merchant_contacts (merchant_id, name, job_title, email, phone, is_primary, is_billing, notes)
                     VALUES (:m, :name, :job_title, :email, :phone, :is_primary, :is_billing, :notes)'
                )->execute(self::bind($f) + [':m' => $merchantId]);
                $id = (int) $this->db->lastInsertId();
            } else {
                $this->db->prepare(
                    'UPDATE merchant_contacts SET name = :name, job_title = :job_title, email = :email, phone = :phone,
                            is_primary = :is_primary, is_billing = :is_billing, notes = :notes WHERE id = :id'
                )->execute(self::bind($f) + [':id' => $id]);
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        Audit::log('merchant.contact_save', 'merchant', $merchantId, ['contact_id' => $id, 'name' => $f['name'], 'email' => $f['email']]);
        Response::json(['success' => true, 'id' => $id]);
    }

    public function contactDelete(): void
    {
        Request::require_method('POST');
        Auth::require_access('merchants');
        Request::require_csrf();

        $id         = (int) (Request::body()['id'] ?? 0);
        $merchantId = $this->ownerOf('merchant_contacts', $id);
        $this->db->prepare('DELETE FROM merchant_contacts WHERE id = :id')->execute([':id' => $id]);
        Audit::log('merchant.contact_delete', 'merchant', $merchantId, ['contact_id' => $id]);
        Response::json(['success' => true]);
    }

    public function identifierSave(): void
    {
        Request::require_method('POST');
        Auth::require_access('merchants');
        Request::require_csrf();

        $d          = Request::body();
        $merchantId = (int) ($d['merchant_id'] ?? 0);
        $this->merchant($merchantId);
        $type  = (string) ($d['type'] ?? '');
        $value = self::str($d, 'value', 64);
        $label = self::str($d, 'label', 120);

        if (!in_array($type, self::ID_TYPES, true) || $value === null) {
            Response::json(['error' => 'Type and value are required.'], 422);
        }

        $chk = $this->db->prepare(
            'SELECT m.name FROM merchant_identifiers i JOIN merchants m ON m.id = i.merchant_id WHERE i.type = :t AND i.value = :v'
        );
        $chk->execute([':t' => $type, ':v' => $value]);
        $owner = $chk->fetchColumn();
        if ($owner !== false) {
            Response::json(['error' => "$type $value is already linked to $owner."], 409);
        }

        $this->db->prepare('INSERT INTO merchant_identifiers (merchant_id, type, value, label) VALUES (:m, :t, :v, :l)')
            ->execute([':m' => $merchantId, ':t' => $type, ':v' => $value, ':l' => $label]);
        Audit::log('merchant.identifier_add', 'merchant', $merchantId, ['type' => $type, 'value' => $value]);
        Response::json(['success' => true], 201);
    }

    public function identifierDelete(): void
    {
        Request::require_method('POST');
        Auth::require_access('merchants');
        Request::require_csrf();

        $id   = (int) (Request::body()['id'] ?? 0);
        $stmt = $this->db->prepare('SELECT merchant_id, type, value FROM merchant_identifiers WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if (!is_array($row)) {
            Response::json(['error' => 'Not found.'], 404);
        }
        $this->db->prepare('DELETE FROM merchant_identifiers WHERE id = :id')->execute([':id' => $id]);
        Audit::log('merchant.identifier_remove', 'merchant', (int) $row['merchant_id'], ['type' => $row['type'], 'value' => $row['value']]);
        Response::json(['success' => true]);
    }

    public function contractSave(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('merchants');
        Request::require_csrf();

        // Multipart (file upload): fields come from $_POST.
        $d          = $_POST;
        $id         = (int) ($d['id'] ?? 0);
        $merchantId = $id > 0 ? $this->ownerOf('contracts', $id) : (int) ($d['merchant_id'] ?? 0);
        $this->merchant($merchantId);

        $f = [
            'reference'   => self::str($d, 'reference', 64),
            'type'        => (string) ($d['type'] ?? 'MSA'),
            'status'      => (string) ($d['status'] ?? 'draft'),
            'signed_at'   => self::date($d, 'signed_at'),
            'start_date'  => self::date($d, 'start_date'),
            'end_date'    => self::date($d, 'end_date'),
            'auto_renew'  => !empty($d['auto_renew']) ? 1 : 0,
            'notice_days' => (isset($d['notice_days']) && trim((string) $d['notice_days']) !== '') ? (int) $d['notice_days'] : null,
            'notes'       => self::str($d, 'notes', 5000),
        ];

        $errors = [];
        if (!in_array($f['type'], self::CONTRACT_TYPES, true)) {
            $errors[] = 'Invalid contract type.';
        }
        if (!in_array($f['status'], self::CONTRACT_STATUS, true)) {
            $errors[] = 'Invalid contract status.';
        }
        foreach (['signed_at' => 'signature date', 'start_date' => 'start date', 'end_date' => 'end date'] as $k => $label) {
            if ($f[$k] === false) {
                $errors[] = "Invalid $label.";
            }
        }
        if (is_string($f['start_date']) && is_string($f['end_date']) && $f['end_date'] < $f['start_date']) {
            $errors[] = 'End date is before start date.';
        }
        if ($f['status'] === 'signed' && $f['signed_at'] === null) {
            $errors[] = 'A signed contract needs a signature date.';
        }
        if ($f['notice_days'] !== null && ($f['notice_days'] < 0 || $f['notice_days'] > 3650)) {
            $errors[] = 'Notice period must be between 0 and 3650 days.';
        }
        if ($errors !== []) {
            Response::json(['error' => implode(' ', $errors)], 422);
        }

        $doc = $this->storeDocument($merchantId);

        if ($id === 0) {
            $this->db->prepare(
                'INSERT INTO contracts (merchant_id, reference, type, status, signed_at, start_date, end_date, auto_renew, notice_days, notes, created_by)
                 VALUES (:m, :reference, :type, :status, :signed_at, :start_date, :end_date, :auto_renew, :notice_days, :notes, :u)'
            )->execute(self::bind($f) + [':m' => $merchantId, ':u' => (int) $user['id']]);
            $id     = (int) $this->db->lastInsertId();
            $action = 'merchant.contract_create';
        } else {
            $this->db->prepare(
                'UPDATE contracts SET reference = :reference, type = :type, status = :status, signed_at = :signed_at,
                        start_date = :start_date, end_date = :end_date, auto_renew = :auto_renew,
                        notice_days = :notice_days, notes = :notes WHERE id = :id'
            )->execute(self::bind($f) + [':id' => $id]);
            $action = 'merchant.contract_update';
        }

        if ($doc !== null) {
            // A replaced document stays on disk: the audit trail keeps its hash.
            $this->db->prepare(
                'UPDATE contracts SET document_path = :p, document_name = :n, document_sha256 = :h, document_size = :s WHERE id = :id'
            )->execute([':p' => $doc['path'], ':n' => $doc['name'], ':h' => $doc['sha256'], ':s' => $doc['size'], ':id' => $id]);
        }

        Audit::log($action, 'merchant', $merchantId, [
            'contract_id'     => $id,
            'reference'       => $f['reference'],
            'status'          => $f['status'],
            'end_date'        => $f['end_date'],
            'document_sha256' => $doc['sha256'] ?? null,
        ]);
        Response::json(['success' => true, 'id' => $id]);
    }

    public function contractDelete(): void
    {
        Request::require_method('POST');
        Auth::require_access('merchants');
        Request::require_csrf();

        $id   = (int) (Request::body()['id'] ?? 0);
        $stmt = $this->db->prepare('SELECT merchant_id, status, reference FROM contracts WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $c = $stmt->fetch();
        if (!is_array($c)) {
            Response::json(['error' => 'Contract not found.'], 404);
        }
        if ($c['status'] !== 'draft') {
            Response::json(['error' => 'Only drafts can be deleted. Mark a signed contract as terminated instead.'], 409);
        }
        $this->db->prepare('DELETE FROM contracts WHERE id = :id')->execute([':id' => $id]);
        Audit::log('merchant.contract_delete', 'merchant', (int) $c['merchant_id'], ['contract_id' => $id, 'reference' => $c['reference']]);
        Response::json(['success' => true]);
    }

    public function contractFile(): void
    {
        Request::require_method('GET');
        Auth::require_access('merchants');

        $id   = (int) ($_GET['id'] ?? 0);
        $stmt = $this->db->prepare('SELECT merchant_id, document_path, document_name FROM contracts WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $c    = $stmt->fetch();
        $base = realpath((string) $GLOBALS['config']['storage']['path']);
        $file = (is_array($c) && $c['document_path'] && $base !== false) ? realpath($base . '/' . $c['document_path']) : false;
        // realpath + prefix check: a stored path can never escape the storage dir.
        if ($file === false || !str_starts_with($file, $base . DIRECTORY_SEPARATOR) || !is_file($file)) {
            http_response_code(404);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'Document not found';
            exit;
        }

        Audit::log('merchant.contract_download', 'merchant', (int) $c['merchant_id'], ['contract_id' => $id]);

        $name = preg_replace('/[^A-Za-z0-9._ -]/', '_', (string) $c['document_name']) ?: 'contract.pdf';
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Content-Length: ' . filesize($file));
        header('Cache-Control: private, no-store');
        readfile($file);
        exit;
    }

    /**
     * Validate and store an uploaded PDF, if any.
     *
     * @return array{path:string,name:string,sha256:string,size:int}|null
     */
    private function storeDocument(int $merchantId): ?array
    {
        $file = $_FILES['document'] ?? null;
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            return null;
        }
        if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
            Response::json(['error' => 'Upload failed (file too large for the server?).'], 422);
        }
        $max = (int) ($GLOBALS['config']['storage']['max_document_bytes'] ?? 0);
        if ($max > 0 && (int) $file['size'] > $max) {
            Response::json(['error' => 'Document too large.'], 422);
        }
        $head = (string) file_get_contents((string) $file['tmp_name'], false, null, 0, 5);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']);
        if ($head !== '%PDF-' || $mime !== 'application/pdf') {
            Response::json(['error' => 'Only PDF documents are accepted.'], 422);
        }

        $base = (string) $GLOBALS['config']['storage']['path'];
        $rel  = 'contracts/' . $merchantId . '/' . bin2hex(random_bytes(16)) . '.pdf';
        $dest = $base . '/' . $rel;
        if ((!is_dir(dirname($dest)) && !@mkdir(dirname($dest), 0750, true) && !is_dir(dirname($dest)))
            || !move_uploaded_file((string) $file['tmp_name'], $dest)) {
            error_log('[Contracts] cannot write ' . $dest);
            Response::json(['error' => 'Document storage is not writable. Contact an administrator.'], 500);
        }

        return [
            'path'   => $rel,
            'name'   => mb_substr(basename((string) $file['name']), 0, 255),
            'sha256' => (string) hash_file('sha256', $dest),
            'size'   => (int) filesize($dest),
        ];
    }

    /** @return array<string,mixed> */
    private function merchant(int $id): array
    {
        $stmt = $this->db->prepare(
            'SELECT m.*, u.name AS account_manager, u.email AS account_manager_email
             FROM merchants m LEFT JOIN users u ON u.id = m.account_manager_id WHERE m.id = :id'
        );
        $stmt->execute([':id' => $id]);
        $m = $stmt->fetch();
        if (!is_array($m)) {
            Response::json(['error' => 'Merchant not found.'], 404);
        }
        return $m;
    }

    /** Merchant id owning a row of a child table (404 if the row is missing). */
    private function ownerOf(string $table, int $id): int
    {
        // $table is always a literal from this class, never user input.
        $stmt = $this->db->prepare("SELECT merchant_id FROM $table WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $m = $stmt->fetchColumn();
        if ($m === false) {
            Response::json(['error' => 'Not found.'], 404);
        }
        return (int) $m;
    }

    private function hasTransactions(int $id): bool
    {
        $stmt = $this->db->prepare('SELECT 1 FROM transactions WHERE merchant_id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        return $stmt->fetchColumn() !== false;
    }

    /** @return list<array<string,mixed>> active staff allowed on the merchants module */
    private function managers(): array
    {
        $roles = array_values(array_unique(array_merge(['admin'], $GLOBALS['config']['access']['merchants'] ?? [])));
        $in    = implode(',', array_fill(0, count($roles), '?'));
        $stmt  = $this->db->prepare("SELECT id, name, email FROM users WHERE is_active = 1 AND role IN ($in) ORDER BY name, email");
        $stmt->execute($roles);
        return $stmt->fetchAll();
    }

    /** @param array<string,mixed> $d */
    private static function str(array $d, string $key, int $max): ?string
    {
        if (!is_scalar($d[$key] ?? null)) {
            return null;
        }
        $v = trim((string) $d[$key]);
        if ($v === '') {
            return null;
        }
        if (mb_strlen($v) > $max) {
            Response::json(['error' => ucfirst(str_replace('_', ' ', $key)) . " is too long (max $max characters)."], 422);
        }
        return $v;
    }

    /**
     * @param array<string,mixed> $d
     * @return string|null|false  Y-m-d, null when empty, false when invalid
     */
    private static function date(array $d, string $key): string|null|false
    {
        $v = is_scalar($d[$key] ?? null) ? trim((string) $d[$key]) : '';
        if ($v === '') {
            return null;
        }
        $dt = \DateTimeImmutable::createFromFormat('!Y-m-d', $v);
        return ($dt !== false && $dt->format('Y-m-d') === $v) ? $v : false;
    }

    /**
     * @param array<string,mixed> $f
     * @return array<string,mixed>
     */
    private static function bind(array $f): array
    {
        $out = [];
        foreach ($f as $k => $v) {
            $out[':' . $k] = $v;
        }
        return $out;
    }
}
