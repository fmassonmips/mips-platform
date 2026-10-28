<?php
/**
 * Merchant onboarding / KYC API.
 *
 *   GET  /api/onboarding/list?status=&q=
 *   GET  /api/onboarding/alerts            overdue cases, periodic reviews due, expiring IDs
 *   GET  /api/onboarding/get?id=
 *   POST /api/onboarding/open              { merchant_id }   initial or periodic review
 *   POST /api/onboarding/update            { id, risk_rating, assigned_to, due_date, notes }
 *   POST /api/onboarding/transition        { id, to, notes }
 *   POST /api/onboarding/party-save        { case_id, id?, full_name, roles[], ownership_pct, nationality,
 *                                            date_of_birth, id_number, is_pep, screening_result, screening_reference, notes }
 *   POST /api/onboarding/party-delete      { id }
 *   POST /api/onboarding/upload            multipart: case_id, requirement, party_id?, expires_at?, file
 *   POST /api/onboarding/document-review   { id, decision: accept|reject, reason }
 *   POST /api/onboarding/document-delete   { id }   pending documents only
 *   GET  /api/onboarding/document?id=      download (audited)
 *   POST /api/onboarding/remind            { id }   email the merchant what is outstanding
 */
declare(strict_types=1);

namespace App\Controllers\Onboarding;

use App\Audit;
use App\Auth;
use App\Crypto;
use App\Database;
use App\Onboarding\DocumentStore;
use App\Onboarding\Kyc;
use App\Request;
use App\Response;
use PDO;

final class OnboardingController
{
    private const ROLES    = ['director', 'ubo', 'signatory', 'shareholder'];

    private PDO $db;
    private Kyc $kyc;

    public function __construct()
    {
        $this->db  = Database::connection();
        $this->kyc = new Kyc();
    }

    public function list(): void
    {
        Request::require_method('GET');
        Auth::require_access('onboarding');

        $where  = [];
        $params = [];
        $status = is_string($_GET['status'] ?? null) ? (string) $_GET['status'] : 'open';
        if ($status === 'open') {
            $where[] = "c.status IN ('collecting', 'under_review', 'on_hold')";
        } elseif ($status !== '' && $status !== 'all') {
            $where[] = 'c.status = :s';
            $params[':s'] = $status;
        }
        $q = is_string($_GET['q'] ?? null) ? trim((string) $_GET['q']) : '';
        if ($q !== '') {
            $where[] = '(m.name LIKE :q1 OR m.legal_name LIKE :q2)';
            $params[':q1'] = $params[':q2'] = '%' . addcslashes($q, '%_\\') . '%';
        }

        $stmt = $this->db->prepare(
            'SELECT c.id FROM onboarding_cases c JOIN merchants m ON m.id = c.merchant_id '
            . ($where === [] ? '' : 'WHERE ' . implode(' AND ', $where))
            . ' ORDER BY FIELD(c.status, \'under_review\', \'collecting\', \'on_hold\', \'approved\', \'rejected\'), c.due_date IS NULL, c.due_date, c.id DESC LIMIT 300'
        );
        $stmt->execute($params);

        $today = date('Y-m-d');
        $cases = [];
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $c     = $this->kyc->getCase((int) $id);
            $items = array_filter($this->kyc->checklist($c), static fn ($i) => $i['required']);
            $cases[] = [
                'id' => (int) $c['id'], 'merchant_id' => (int) $c['merchant_id'], 'merchant_name' => $c['merchant_name'],
                'legal_name' => $c['legal_name'], 'kind' => $c['kind'], 'status' => $c['status'], 'risk_rating' => $c['risk_rating'],
                'assigned' => $c['assigned_name'] ?: $c['assigned_email'], 'due_date' => $c['due_date'],
                'overdue' => $c['due_date'] !== null && $c['due_date'] < $today && in_array($c['status'], Kyc::OPEN_STATUSES, true),
                'accepted' => count(array_filter($items, static fn ($i) => $i['status'] === 'accepted')),
                'pending_review' => count(array_filter($items, static fn ($i) => $i['status'] === 'pending')),
                'required' => count($items),
                'next_review_date' => $c['next_review_date'],
            ];
        }
        Response::json(['cases' => $cases]);
    }

    public function alerts(): void
    {
        Request::require_method('GET');
        Auth::require_access('onboarding');

        // Approved merchants whose periodic review is due within 60 days and not yet opened.
        $reviews = $this->db->query(
            "SELECT c.id, c.merchant_id, m.name AS merchant_name, c.risk_rating, c.next_review_date
             FROM onboarding_cases c JOIN merchants m ON m.id = c.merchant_id
             WHERE c.status = 'approved' AND c.next_review_date <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)
               AND c.id = (SELECT MAX(c2.id) FROM onboarding_cases c2 WHERE c2.merchant_id = c.merchant_id)
             ORDER BY c.next_review_date"
        )->fetchAll();

        // Accepted identity documents expiring within 60 days, on each merchant's latest case.
        $expiring = $this->db->query(
            "SELECT d.id, c.id AS case_id, c.merchant_id, m.name AS merchant_name, p.full_name, d.requirement, d.expires_at
             FROM kyc_documents d
             JOIN onboarding_cases c ON c.id = d.case_id
             JOIN merchants m ON m.id = c.merchant_id
             LEFT JOIN kyc_parties p ON p.id = d.party_id
             WHERE d.status = 'accepted' AND d.expires_at IS NOT NULL
               AND d.expires_at <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)
               AND c.id = (SELECT MAX(c2.id) FROM onboarding_cases c2 WHERE c2.merchant_id = c.merchant_id)
             ORDER BY d.expires_at"
        )->fetchAll();

        $overdue = $this->db->query(
            "SELECT c.id, m.name AS merchant_name, c.due_date, c.status
             FROM onboarding_cases c JOIN merchants m ON m.id = c.merchant_id
             WHERE c.status IN ('collecting', 'under_review', 'on_hold') AND c.due_date < CURDATE()
             ORDER BY c.due_date"
        )->fetchAll();

        Response::json(['reviews_due' => $reviews, 'documents_expiring' => $expiring, 'overdue' => $overdue]);
    }

    public function get(): void
    {
        Request::require_method('GET');
        $user = Auth::require_access('onboarding');

        $case = $this->caseOr404((int) ($_GET['id'] ?? 0));
        $reminders = $this->db->prepare(
            'SELECT r.sent_to, r.items, r.delivered, r.sent_at, u.email AS sent_by
             FROM kyc_reminders r LEFT JOIN users u ON u.id = r.sent_by WHERE r.case_id = :c ORDER BY r.id DESC'
        );
        $reminders->execute([':c' => $case['id']]);
        $history = $this->db->prepare(
            "SELECT created_at, user_email, action, details FROM audit_log
             WHERE entity_type = 'merchant' AND entity_id = :m AND action LIKE 'onboarding.%'
               AND JSON_VALUE(details, '$.case_id') = :c
             ORDER BY id DESC LIMIT 100"
        );
        $history->execute([':m' => (string) $case['merchant_id'], ':c' => (string) $case['id']]);

        $roles = $GLOBALS['config']['kyc']['approver_roles'] ?? ['admin'];
        $staff = $this->db->query("SELECT id, name, email, role FROM users WHERE is_active = 1 AND role IN ('admin', 'finance') ORDER BY name, email")->fetchAll();

        Response::json([
            'case'         => $case,
            'checklist'    => $this->kyc->checklist($case),
            'parties'      => $this->kyc->parties((int) $case['id']),
            'blockers'     => in_array($case['status'], Kyc::OPEN_STATUSES, true) ? $this->kyc->blockers($case) : [],
            'outstanding'  => in_array($case['status'], Kyc::OPEN_STATUSES, true) ? $this->kyc->outstanding($case) : [],
            'contact_email' => $this->kyc->contactEmail((int) $case['merchant_id']),
            'reminders'    => array_map(static function (array $r): array {
                $r['items'] = json_decode((string) $r['items'], true) ?: [];
                return $r;
            }, $reminders->fetchAll()),
            'history'      => array_map(static function (array $r): array {
                $r['details'] = json_decode((string) $r['details'], true);
                return $r;
            }, $history->fetchAll()),
            'requirements' => $this->kyc->requirements(),
            'staff'        => $staff,
            'can_decide'   => in_array((string) $user['role'], $roles, true)
                && (int) ($case['assigned_to'] ?? $case['created_by'] ?? 0) !== (int) $user['id'],
            'me'           => (int) $user['id'],
            'ubo_threshold_pct' => (float) ($GLOBALS['config']['kyc']['ubo_threshold_pct'] ?? 25),
            'crypto_ready' => Crypto::configured(),
            // Merchant portal account behind the case (null when staff opened it).
            'portal'       => $this->kyc->portalApplication((int) $case['id']),
        ]);
    }

    public function open(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('onboarding');
        Request::require_csrf();

        $merchantId = (int) (Request::body()['merchant_id'] ?? 0);
        $m = $this->db->prepare('SELECT id, status FROM merchants WHERE id = :id');
        $m->execute([':id' => $merchantId]);
        $merchant = $m->fetch();
        if (!is_array($merchant)) {
            Response::json(['error' => 'Merchant not found.'], 404);
        }

        $chk = $this->db->prepare("SELECT id FROM onboarding_cases WHERE merchant_id = :m AND status IN ('collecting', 'under_review', 'on_hold')");
        $chk->execute([':m' => $merchantId]);
        if (($open = $chk->fetchColumn()) !== false) {
            Response::json(['error' => 'This merchant already has an open case.', 'id' => (int) $open], 409);
        }
        $prev = $this->db->prepare("SELECT COUNT(*) FROM onboarding_cases WHERE merchant_id = :m AND status = 'approved'");
        $prev->execute([':m' => $merchantId]);
        $kind = (int) $prev->fetchColumn() > 0 ? 'periodic_review' : 'initial';

        $due = (new \DateTimeImmutable('today'))->modify('+' . (int) ($GLOBALS['config']['kyc']['default_due_days'] ?? 30) . ' days')->format('Y-m-d');
        $this->db->prepare(
            'INSERT INTO onboarding_cases (merchant_id, kind, assigned_to, due_date, created_by) VALUES (:m, :k, :a, :d, :u)'
        )->execute([':m' => $merchantId, ':k' => $kind, ':a' => (int) $user['id'], ':d' => $due, ':u' => (int) $user['id']]);
        $id = (int) $this->db->lastInsertId();

        $carried = ['parties' => 0, 'documents' => 0];
        if ($kind === 'initial') {
            $this->db->prepare("UPDATE merchants SET status = 'onboarding' WHERE id = :m AND status = 'prospect'")->execute([':m' => $merchantId]);
        } else {
            $carried = $this->carryOver($merchantId, $id);
        }
        Audit::log('onboarding.open', 'merchant', $merchantId, ['case_id' => $id, 'kind' => $kind] + ($kind === 'initial' ? [] : ['carried_over' => $carried]));
        Response::json(['success' => true, 'id' => $id], 201);
    }

    /**
     * Periodic review: start from the last approved case. People are copied
     * with screening reset (it must be redone); accepted documents still in
     * date are copied back to "pending" so the analyst re-confirms them
     * instead of asking the merchant again. Files are shared, not duplicated.
     *
     * @return array{parties:int, documents:int}
     */
    private function carryOver(int $merchantId, int $newCaseId): array
    {
        $prev = $this->db->prepare("SELECT MAX(id) FROM onboarding_cases WHERE merchant_id = :m AND status = 'approved'");
        $prev->execute([':m' => $merchantId]);
        $prevId = (int) $prev->fetchColumn();

        $map     = [];
        $parties = $this->db->prepare('SELECT * FROM kyc_parties WHERE case_id = :c');
        $parties->execute([':c' => $prevId]);
        $ins = $this->db->prepare(
            "INSERT INTO kyc_parties (case_id, full_name, roles, ownership_pct, nationality, date_of_birth, id_number_enc, is_pep, screening_result, notes)
             VALUES (:c, :n, :r, :pct, :nat, :dob, :idn, :pep, 'pending', :notes)"
        );
        foreach ($parties->fetchAll() as $p) {
            $ins->execute([':c' => $newCaseId, ':n' => $p['full_name'], ':r' => $p['roles'], ':pct' => $p['ownership_pct'],
                ':nat' => $p['nationality'], ':dob' => $p['date_of_birth'], ':idn' => $p['id_number_enc'], ':pep' => $p['is_pep'], ':notes' => $p['notes']]);
            $map[(int) $p['id']] = (int) $this->db->lastInsertId();
        }

        // Latest accepted, unexpired document per (requirement, party).
        $docs = $this->db->prepare(
            "SELECT d.* FROM kyc_documents d
             WHERE d.case_id = :c AND d.status = 'accepted' AND (d.expires_at IS NULL OR d.expires_at >= CURDATE())
               AND d.id = (SELECT MAX(d2.id) FROM kyc_documents d2 WHERE d2.case_id = d.case_id AND d2.requirement = d.requirement
                           AND d2.party_id <=> d.party_id AND d2.status = 'accepted')"
        );
        $docs->execute([':c' => $prevId]);
        $insDoc = $this->db->prepare(
            'INSERT INTO kyc_documents (case_id, requirement, party_id, path, original_name, mime, size, sha256, expires_at, uploaded_by, uploaded_at)
             VALUES (:c, :r, :p, :path, :n, :mime, :size, :sha, :exp, :u, :at)'
        );
        $n = 0;
        foreach ($docs->fetchAll() as $d) {
            if ($d['party_id'] !== null && !isset($map[(int) $d['party_id']])) {
                continue;
            }
            $insDoc->execute([':c' => $newCaseId, ':r' => $d['requirement'], ':p' => $d['party_id'] === null ? null : $map[(int) $d['party_id']],
                ':path' => $d['path'], ':n' => $d['original_name'], ':mime' => $d['mime'], ':size' => $d['size'], ':sha' => $d['sha256'],
                ':exp' => $d['expires_at'], ':u' => $d['uploaded_by'], ':at' => $d['uploaded_at']]);
            $n++;
        }
        return ['parties' => count($map), 'documents' => $n];
    }

    public function update(): void
    {
        Request::require_method('POST');
        Auth::require_access('onboarding');
        Request::require_csrf();

        $d    = Request::body();
        $case = $this->openCase((int) ($d['id'] ?? 0));

        $risk = is_string($d['risk_rating'] ?? null) && $d['risk_rating'] !== '' ? (string) $d['risk_rating'] : null;
        if ($risk !== null && !in_array($risk, ['low', 'medium', 'high'], true)) {
            Response::json(['error' => 'Invalid risk rating.'], 422);
        }
        $assigned = isset($d['assigned_to']) && (string) $d['assigned_to'] !== '' ? (int) $d['assigned_to'] : null;
        if ($assigned !== null) {
            $chk = $this->db->prepare("SELECT 1 FROM users WHERE id = :id AND is_active = 1 AND role IN ('admin', 'finance')");
            $chk->execute([':id' => $assigned]);
            if ($chk->fetchColumn() === false) {
                Response::json(['error' => 'Invalid analyst.'], 422);
            }
        }
        $due = self::date($d['due_date'] ?? null);
        if ($due === false) {
            Response::json(['error' => 'Invalid due date.'], 422);
        }
        $notes = is_string($d['notes'] ?? null) ? mb_substr(trim($d['notes']), 0, 5000) : null;

        $this->db->prepare('UPDATE onboarding_cases SET risk_rating = :r, assigned_to = :a, due_date = :d, notes = :n WHERE id = :id')
            ->execute([':r' => $risk, ':a' => $assigned, ':d' => $due, ':n' => $notes ?: null, ':id' => $case['id']]);

        $changes = [];
        foreach (['risk_rating' => $risk, 'assigned_to' => $assigned, 'due_date' => $due] as $k => $v) {
            if ((string) ($case[$k] ?? '') !== (string) ($v ?? '')) {
                $changes[$k] = ['from' => $case[$k], 'to' => $v];
            }
        }
        if ($changes !== []) {
            Audit::log('onboarding.update', 'merchant', (int) $case['merchant_id'], ['case_id' => (int) $case['id']] + $changes);
        }
        Response::json(['success' => true]);
    }

    public function transition(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('onboarding');
        Request::require_csrf();

        $d = Request::body();
        try {
            $this->kyc->transition((int) ($d['id'] ?? 0), (string) ($d['to'] ?? ''), $user,
                is_string($d['notes'] ?? null) ? mb_substr(trim($d['notes']), 0, 5000) : null);
        } catch (\RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], in_array($e->getCode(), [403, 404, 409, 422], true) ? (int) $e->getCode() : 422);
        }
        Response::json(['success' => true]);
    }

    public function partySave(): void
    {
        Request::require_method('POST');
        Auth::require_access('onboarding');
        Request::require_csrf();

        $d  = Request::body();
        $id = (int) ($d['id'] ?? 0);
        if ($id > 0) {
            $own = $this->db->prepare('SELECT case_id, screening_result FROM kyc_parties WHERE id = :id');
            $own->execute([':id' => $id]);
            $before = $own->fetch();
            if (!is_array($before)) {
                Response::json(['error' => 'Person not found.'], 404);
            }
            $caseId = (int) $before['case_id'];
        } else {
            $caseId = (int) ($d['case_id'] ?? 0);
            $before = null;
        }
        $case = $this->openCase($caseId);

        $name  = is_string($d['full_name'] ?? null) ? trim($d['full_name']) : '';
        $roles = array_values(array_intersect(self::ROLES, is_array($d['roles'] ?? null) ? $d['roles'] : []));
        $pct   = isset($d['ownership_pct']) && (string) $d['ownership_pct'] !== '' ? $d['ownership_pct'] : null;
        $dob   = self::date($d['date_of_birth'] ?? null);
        $scr   = (string) ($d['screening_result'] ?? 'pending');
        $idNo  = is_string($d['id_number'] ?? null) ? trim($d['id_number']) : '';

        $errors = [];
        if ($name === '' || mb_strlen($name) > 160) {
            $errors[] = 'Full name is required (max 160 characters).';
        }
        if ($roles === []) {
            $errors[] = 'Select at least one role.';
        }
        if ($pct !== null && (!is_numeric($pct) || (float) $pct < 0 || (float) $pct > 100)) {
            $errors[] = 'Ownership must be between 0 and 100%.';
        }
        if ($dob === false || (is_string($dob) && $dob > date('Y-m-d'))) {
            $errors[] = 'Invalid date of birth.';
        }
        if (!in_array($scr, ['pending', 'clear', 'match'], true)) {
            $errors[] = 'Invalid screening result.';
        }
        if ($idNo !== '' && !Crypto::configured()) {
            $errors[] = 'ID numbers cannot be stored until the server key (security.app_key) is configured.';
        }
        if ($errors !== []) {
            Response::json(['error' => implode(' ', $errors)], 422);
        }

        $fields = [
            ':name' => $name, ':roles' => implode(',', $roles), ':pct' => $pct === null ? null : round((float) $pct, 2),
            ':nat' => self::short($d['nationality'] ?? null, 60), ':dob' => $dob, ':pep' => !empty($d['is_pep']) ? 1 : 0,
            ':scr' => $scr, ':ref' => self::short($d['screening_reference'] ?? null, 120), ':notes' => self::short($d['notes'] ?? null, 500),
            // Screening date: kept unless the result changes.
            ':scr_changed' => $before === null || $before['screening_result'] !== $scr ? 1 : 0,
        ];

        if ($id === 0) {
            $this->db->prepare(
                'INSERT INTO kyc_parties (case_id, full_name, roles, ownership_pct, nationality, date_of_birth, is_pep,
                    screening_result, screening_reference, screened_at, notes)
                 VALUES (:c, :name, :roles, :pct, :nat, :dob, :pep, :scr, :ref,
                    CASE WHEN :scr2 = \'pending\' OR :scr_changed = 0 THEN NULL ELSE CURDATE() END, :notes)'
            )->execute($fields + [':c' => $caseId, ':scr2' => $scr]);
            $id = (int) $this->db->lastInsertId();
        } else {
            $this->db->prepare(
                'UPDATE kyc_parties SET full_name = :name, roles = :roles, ownership_pct = :pct, nationality = :nat,
                    date_of_birth = :dob, is_pep = :pep, screening_result = :scr, screening_reference = :ref,
                    screened_at = CASE WHEN :scr_changed = 1 THEN IF(:scr2 = \'pending\', NULL, CURDATE()) ELSE screened_at END,
                    notes = :notes
                 WHERE id = :id'
            )->execute($fields + [':id' => $id, ':scr2' => $scr]);
        }
        if ($idNo !== '') {
            $this->db->prepare('UPDATE kyc_parties SET id_number_enc = :e WHERE id = :id')
                ->execute([':e' => Crypto::encrypt(mb_substr($idNo, 0, 64)), ':id' => $id]);
        }

        // ID numbers are personal data: never written to the audit log.
        Audit::log('onboarding.party_save', 'merchant', (int) $case['merchant_id'], [
            'case_id' => (int) $case['id'], 'party_id' => $id, 'name' => $name, 'roles' => $roles,
            'pep' => (bool) $fields[':pep'], 'screening' => $scr, 'id_number_updated' => $idNo !== '',
        ]);
        Response::json(['success' => true, 'id' => $id]);
    }

    public function partyDelete(): void
    {
        Request::require_method('POST');
        Auth::require_access('onboarding');
        Request::require_csrf();

        $id  = (int) (Request::body()['id'] ?? 0);
        $own = $this->db->prepare('SELECT case_id, full_name FROM kyc_parties WHERE id = :id');
        $own->execute([':id' => $id]);
        $p = $own->fetch();
        if (!is_array($p)) {
            Response::json(['error' => 'Person not found.'], 404);
        }
        $case = $this->openCase((int) $p['case_id']);
        $this->db->prepare('DELETE FROM kyc_parties WHERE id = :id')->execute([':id' => $id]);
        Audit::log('onboarding.party_delete', 'merchant', (int) $case['merchant_id'], ['case_id' => (int) $case['id'], 'party_id' => $id, 'name' => $p['full_name']]);
        Response::json(['success' => true]);
    }

    public function upload(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('onboarding');
        Request::require_csrf();

        $case = $this->openCase((int) ($_POST['case_id'] ?? 0));
        try {
            $t = $this->kyc->uploadTarget($case, (string) ($_POST['requirement'] ?? ''), $_POST['party_id'] ?? null, $_POST['expires_at'] ?? null);
        } catch (\RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }
        $req     = $t['requirement'];
        $partyId = $t['party_id'];
        $expires = $t['expires'];

        try {
            $stored = (new DocumentStore())->store($case, $req['code'], $partyId, $expires,
                is_array($_FILES['file'] ?? null) ? $_FILES['file'] : [], (int) $user['id'], null, false);
        } catch (\RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], in_array($e->getCode(), [422, 500, 503], true) ? (int) $e->getCode() : 422);
        }
        $docId = $stored['id'];
        $sha   = $stored['sha256'];
        Audit::log('onboarding.document_upload', 'merchant', (int) $case['merchant_id'], [
            'case_id' => (int) $case['id'], 'document_id' => $docId, 'requirement' => $req['code'], 'party_id' => $partyId, 'sha256' => $sha,
        ]);
        Response::json(['success' => true, 'id' => $docId], 201);
    }

    public function review(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('onboarding');
        Request::require_csrf();

        $d   = Request::body();
        $doc = $this->document((int) ($d['id'] ?? 0));
        $case = $this->openCase((int) $doc['case_id']);
        $decision = (string) ($d['decision'] ?? '');
        $reason   = is_string($d['reason'] ?? null) ? mb_substr(trim($d['reason']), 0, 500) : '';

        if ($doc['status'] !== 'pending') {
            Response::json(['error' => 'This document has already been reviewed.'], 409);
        }
        if ((int) $doc['uploaded_by'] === (int) $user['id']) {
            Response::json(['error' => 'Four eyes: a document must be reviewed by someone other than the person who uploaded it.'], 409);
        }
        if (!in_array($decision, ['accept', 'reject'], true) || ($decision === 'reject' && $reason === '')) {
            Response::json(['error' => 'Choose accept or reject; a rejection needs a reason (it is sent to the merchant).'], 422);
        }

        $this->db->prepare(
            'UPDATE kyc_documents SET status = :s, reviewed_by = :u, reviewed_at = NOW(), rejection_reason = :r WHERE id = :id AND status = \'pending\''
        )->execute([':s' => $decision === 'accept' ? 'accepted' : 'rejected', ':u' => (int) $user['id'],
            ':r' => $decision === 'reject' ? $reason : null, ':id' => $doc['id']]);
        Audit::log('onboarding.document_' . ($decision === 'accept' ? 'accept' : 'reject'), 'merchant', (int) $case['merchant_id'], [
            'case_id' => (int) $case['id'], 'document_id' => (int) $doc['id'], 'requirement' => $doc['requirement'], 'reason' => $reason ?: null,
        ]);
        Response::json(['success' => true]);
    }

    public function deleteDocument(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('onboarding');
        Request::require_csrf();

        $doc  = $this->document((int) (Request::body()['id'] ?? 0));
        $case = $this->openCase((int) $doc['case_id']);
        if ($doc['status'] !== 'pending' || (int) $doc['uploaded_by'] !== (int) $user['id']) {
            Response::json(['error' => 'Only your own documents still pending review can be removed. Reviewed documents stay on record.'], 409);
        }
        // Files can be shared with an earlier case (periodic review carry-over).
        (new DocumentStore())->delete($doc);
        Audit::log('onboarding.document_delete', 'merchant', (int) $case['merchant_id'], ['case_id' => (int) $case['id'], 'document_id' => (int) $doc['id'], 'sha256' => $doc['sha256']]);
        Response::json(['success' => true]);
    }

    public function download(): void
    {
        Request::require_method('GET');
        Auth::require_access('onboarding');

        $stmt = $this->db->prepare('SELECT d.*, c.merchant_id FROM kyc_documents d JOIN onboarding_cases c ON c.id = d.case_id WHERE d.id = :id');
        $stmt->execute([':id' => (int) ($_GET['id'] ?? 0)]);
        $doc  = $stmt->fetch();
        $base = realpath((string) $GLOBALS['config']['storage']['path']);
        $file = (is_array($doc) && $base !== false) ? realpath($base . '/' . $doc['path']) : false;
        if ($file === false || !str_starts_with($file, $base . DIRECTORY_SEPARATOR) || !is_file($file)) {
            http_response_code(404);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'Document not found';
            exit;
        }
        Audit::log('onboarding.document_download', 'merchant', (int) $doc['merchant_id'], ['case_id' => (int) $doc['case_id'], 'document_id' => (int) $doc['id']]);

        $name = preg_replace('/[^A-Za-z0-9._ -]/', '_', (string) $doc['original_name']) ?: 'document';
        header('Content-Type: ' . $doc['mime']);
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Content-Length: ' . filesize($file));
        header('Cache-Control: private, no-store');
        readfile($file);
        exit;
    }

    public function remind(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('onboarding');
        Request::require_csrf();

        try {
            $r = $this->kyc->sendReminder((int) (Request::body()['id'] ?? 0), (int) $user['id']);
        } catch (\RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], in_array($e->getCode(), [404, 409, 422], true) ? (int) $e->getCode() : 422);
        }
        if (!$r['delivered']) {
            Response::json(['error' => 'The email could not be sent (mail server). The attempt is logged.'], 502);
        }
        Response::json(['success' => true, 'sent_to' => $r['sent_to'], 'items' => count($r['items'])]);
    }

    /** @return array<string,mixed> */
    private function caseOr404(int $id): array
    {
        try {
            return $this->kyc->getCase($id);
        } catch (\RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 404);
        }
    }

    /** @return array<string,mixed> case that can still be edited */
    private function openCase(int $id): array
    {
        $case = $this->caseOr404($id);
        if (!in_array($case['status'], Kyc::OPEN_STATUSES, true)) {
            Response::json(['error' => 'This case is ' . $case['status'] . ' and can no longer be changed. Open a new case for a review.'], 409);
        }
        return $case;
    }

    /** @return array<string,mixed> */
    private function document(int $id): array
    {
        $stmt = $this->db->prepare('SELECT * FROM kyc_documents WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $doc = $stmt->fetch();
        if (!is_array($doc)) {
            Response::json(['error' => 'Document not found.'], 404);
        }
        return $doc;
    }

    /** @return string|null|false Y-m-d, null when empty, false when invalid */
    private static function date(mixed $v): string|null|false
    {
        $v = is_scalar($v) ? trim((string) $v) : '';
        if ($v === '') {
            return null;
        }
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $v);
        return ($d !== false && $d->format('Y-m-d') === $v) ? $v : false;
    }

    private static function short(mixed $v, int $max): ?string
    {
        $v = is_scalar($v) ? trim((string) $v) : '';
        return $v === '' ? null : mb_substr($v, 0, $max);
    }
}
