<?php
/**
 * Merchant onboarding / KYC rules: checklist, approval blockers, workflow
 * transitions and reminders.
 *
 * Checklist: config 'kyc.requirements'. 'case' items are needed once per
 * case, 'party' items once per director / beneficial owner / signatory.
 * An item's status is the status of its latest upload; an accepted
 * document past its expiry date counts as expired.
 */
declare(strict_types=1);

namespace App\Onboarding;

use App\Audit;
use App\Database;
use App\Mailer;
use PDO;
use RuntimeException;

final class Kyc
{
    public const OPEN_STATUSES = ['collecting', 'under_review', 'on_hold'];

    /** Allowed transitions (approve / reject have extra checks). */
    private const TRANSITIONS = [
        'collecting'   => ['under_review', 'on_hold'],
        'under_review' => ['collecting', 'on_hold', 'approved', 'rejected'],
        'on_hold'      => ['collecting', 'under_review', 'rejected'],
        'approved'     => [],
        'rejected'     => [],
    ];

    private PDO $db;
    /** @var array<string,mixed> */
    private array $cfg;

    public function __construct()
    {
        $this->db  = Database::connection();
        $this->cfg = $GLOBALS['config']['kyc'] ?? [];
    }

    /** @return list<array<string,mixed>> */
    public function requirements(): array
    {
        return $this->cfg['requirements'] ?? [];
    }

    /** @return array<string,mixed> */
    public function requirement(string $code): array
    {
        foreach ($this->requirements() as $r) {
            if ($r['code'] === $code) {
                return $r;
            }
        }
        throw new RuntimeException('Unknown document type.');
    }

    /**
     * Check what an upload is for: a known document type, the person it
     * belongs to (party documents), and an expiry date that is in the future
     * (mandatory for documents that expire).
     *
     * @param array<string,mixed> $case
     * @return array{requirement:array<string,mixed>, party_id:?int, expires:?string}
     */
    public function uploadTarget(array $case, string $requirement, mixed $partyId, mixed $expiresAt): array
    {
        $req = $this->requirement($requirement);
        $pid = null;
        if ($req['scope'] === 'party') {
            $pid = (int) $partyId;
            $chk = $this->db->prepare('SELECT 1 FROM kyc_parties WHERE id = :p AND case_id = :c');
            $chk->execute([':p' => $pid, ':c' => $case['id']]);
            if ($chk->fetchColumn() === false) {
                throw new RuntimeException('Select the person this document belongs to.', 422);
            }
        }
        $raw     = is_scalar($expiresAt) ? trim((string) $expiresAt) : '';
        $expires = null;
        if ($raw !== '') {
            $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $raw);
            if ($d === false || $d->format('Y-m-d') !== $raw) {
                throw new RuntimeException('Invalid expiry date.', 422);
            }
            $expires = $raw;
        }
        if (!empty($req['expires']) && $expires === null) {
            throw new RuntimeException('An expiry date is required for this document.', 422);
        }
        if ($expires !== null && $expires < date('Y-m-d')) {
            throw new RuntimeException('This document has already expired.', 422);
        }
        return ['requirement' => $req, 'party_id' => $pid, 'expires' => $expires];
    }

    /** @return array<string,mixed> */
    public function getCase(int $id): array
    {
        $stmt = $this->db->prepare(
            'SELECT c.*, m.name AS merchant_name, m.legal_name, m.brn, m.status AS merchant_status,
                    ua.email AS assigned_email, ua.name AS assigned_name, ud.email AS decided_by_email
             FROM onboarding_cases c
             JOIN merchants m ON m.id = c.merchant_id
             LEFT JOIN users ua ON ua.id = c.assigned_to
             LEFT JOIN users ud ON ud.id = c.decided_by
             WHERE c.id = :id'
        );
        $stmt->execute([':id' => $id]);
        $case = $stmt->fetch();
        if (!is_array($case)) {
            throw new RuntimeException('Onboarding case not found.', 404);
        }
        return $case;
    }

    /** @return list<array<string,mixed>> */
    public function parties(int $caseId): array
    {
        $stmt = $this->db->prepare('SELECT * FROM kyc_parties WHERE case_id = :c ORDER BY full_name');
        $stmt->execute([':c' => $caseId]);
        return array_map(function (array $p): array {
            $p['roles']     = $p['roles'] === '' ? [] : explode(',', (string) $p['roles']);
            $p['has_id_number'] = $p['id_number_enc'] !== null;
            unset($p['id_number_enc']);
            $p['needs_docs'] = $this->needsDocs($p['roles']);
            return $p;
        }, $stmt->fetchAll());
    }

    /** @param list<string> $roles */
    public function needsDocs(array $roles): bool
    {
        return array_intersect($roles, $this->cfg['party_roles_requiring_docs'] ?? ['director', 'ubo', 'signatory']) !== [];
    }

    /**
     * Checklist rows: one per case requirement, one per (party requirement, party).
     *
     * @param array<string,mixed> $case
     * @return list<array<string,mixed>>
     */
    public function checklist(array $case): array
    {
        $docs = $this->db->prepare(
            'SELECT d.*, uu.email AS uploaded_by_email, ur.email AS reviewed_by_email, pu.email AS uploaded_by_portal_email
             FROM kyc_documents d
             LEFT JOIN users uu ON uu.id = d.uploaded_by
             LEFT JOIN portal_users pu ON pu.id = d.uploaded_by_portal
             LEFT JOIN users ur ON ur.id = d.reviewed_by
             WHERE d.case_id = :c ORDER BY d.uploaded_at DESC, d.id DESC'
        );
        $docs->execute([':c' => $case['id']]);
        $byKey = [];
        foreach ($docs->fetchAll() as $d) {
            $byKey[$d['requirement'] . '|' . ($d['party_id'] ?? '')][] = $d;
        }

        $contract = $this->db->prepare(
            "SELECT id, reference, signed_at FROM contracts
             WHERE merchant_id = :m AND status = 'signed' AND document_path IS NOT NULL ORDER BY signed_at DESC LIMIT 1"
        );
        $contract->execute([':m' => $case['merchant_id']]);
        $contract = $contract->fetch() ?: null;

        $today = date('Y-m-d');
        $item  = static function (array $req, ?array $party, array $history) use ($today): array {
            $latest = $history[0] ?? null;
            $status = $latest === null ? 'missing' : $latest['status'];
            if ($status === 'accepted' && $latest['expires_at'] !== null && $latest['expires_at'] < $today) {
                $status = 'expired';
            }
            return [
                'requirement' => $req['code'],
                'label'       => $req['label'],
                'required'    => (bool) $req['required'],
                'expires'     => !empty($req['expires']),
                'party_id'    => $party['id'] ?? null,
                'party_name'  => $party['full_name'] ?? null,
                'status'      => $status,
                'document'    => $latest,
                'history'     => array_slice($history, 1),
                'via'         => null,
            ];
        };

        $items = [];
        foreach ($this->requirements() as $req) {
            if ($req['scope'] !== 'case') {
                continue;
            }
            $row = $item($req, null, $byKey[$req['code'] . '|'] ?? []);
            if ($req['code'] === 'contract' && $row['status'] !== 'accepted' && $contract !== null) {
                $row['status'] = 'accepted';
                $row['via']    = 'Signed contract ' . ($contract['reference'] ?? '#' . $contract['id']) . ' (' . $contract['signed_at'] . ') on the merchant record';
            }
            $items[] = $row;
        }
        foreach ($this->parties((int) $case['id']) as $p) {
            if (!$p['needs_docs']) {
                continue;
            }
            foreach ($this->requirements() as $req) {
                if ($req['scope'] === 'party') {
                    $items[] = $item($req, $p, $byKey[$req['code'] . '|' . $p['id']] ?? []);
                }
            }
        }
        return $items;
    }

    /**
     * Everything that prevents approval right now (empty = approvable).
     *
     * @param array<string,mixed> $case
     * @return list<string>
     */
    public function blockers(array $case): array
    {
        $out = [];
        if (empty($case['legal_name']) || empty($case['brn'])) {
            $out[] = 'Legal name and BRN must be filled in on the merchant record.';
        }
        foreach ($this->checklist($case) as $i) {
            if ($i['required'] && $i['status'] !== 'accepted') {
                $out[] = $i['label'] . ($i['party_name'] ? ' — ' . $i['party_name'] : '') . ': ' . $i['status'] . '.';
            }
        }

        $parties   = $this->parties((int) $case['id']);
        $threshold = (float) ($this->cfg['ubo_threshold_pct'] ?? 25);
        $roles     = array_merge([], ...array_map(static fn ($p) => $p['roles'], $parties));
        if (!in_array('director', $roles, true)) {
            $out[] = 'No director recorded.';
        }
        if (!in_array('ubo', $roles, true)) {
            $out[] = 'No beneficial owner recorded.';
        }
        $pep = false;
        foreach ($parties as $p) {
            if ($p['ownership_pct'] !== null && (float) $p['ownership_pct'] >= $threshold && !in_array('ubo', $p['roles'], true)) {
                $out[] = "{$p['full_name']} holds {$p['ownership_pct']}% (threshold {$threshold}%) and must be recorded as a beneficial owner.";
            }
            if ($p['needs_docs'] && $p['screening_result'] !== 'clear') {
                $out[] = "{$p['full_name']}: sanctions/PEP screening is " . ($p['screening_result'] === 'match' ? 'a MATCH and must be resolved' : 'not recorded') . '.';
            }
            $pep = $pep || (int) $p['is_pep'] === 1;
        }
        if ($case['risk_rating'] === null) {
            $out[] = 'Risk rating not set.';
        } elseif ($pep && $case['risk_rating'] !== 'high') {
            $out[] = 'A politically exposed person is involved: the risk rating must be high.';
        }
        return $out;
    }

    /**
     * Change a case's status. Approval enforces the blockers and four eyes.
     *
     * @param array<string,mixed> $user acting user
     */
    public function transition(int $caseId, string $to, array $user, ?string $notes): void
    {
        $case = $this->getCase($caseId);
        if (!in_array($to, self::TRANSITIONS[$case['status']] ?? [], true)) {
            throw new RuntimeException("Cannot move a case from {$case['status']} to $to.", 409);
        }

        if ($to === 'approved' || $to === 'rejected') {
            if (!in_array((string) $user['role'], $this->cfg['approver_roles'] ?? ['admin'], true)) {
                throw new RuntimeException('Your role cannot approve or reject onboarding cases.', 403);
            }
            $analyst = $case['assigned_to'] ?? $case['created_by'];
            if ($analyst !== null && (int) $analyst === (int) $user['id']) {
                throw new RuntimeException('Four eyes: the assigned analyst cannot decide the case. Another approver must.', 409);
            }
            if ($notes === null || trim($notes) === '') {
                throw new RuntimeException('A decision note is required.', 422);
            }
        }
        if ($to === 'approved') {
            $blockers = $this->blockers($case);
            if ($blockers !== []) {
                throw new RuntimeException("Cannot approve yet:\n- " . implode("\n- ", $blockers), 409);
            }
        }

        $this->db->beginTransaction();
        try {
            $set    = ['status = :to'];
            $params = [':to' => $to, ':id' => $caseId];
            if ($to === 'under_review') {
                $set[] = 'submitted_at = NOW()';
            }
            if ($to === 'collecting') {
                // Back to the merchant: it can tell us again when its file is complete.
                $set[] = 'merchant_submitted_at = NULL';
            }
            if ($to === 'approved' || $to === 'rejected') {
                $set[] = 'decided_at = NOW()';
                $set[] = 'decided_by = :by';
                $set[] = 'decision_notes = :notes';
                $params[':by']    = (int) $user['id'];
                $params[':notes'] = $notes;
            }
            if ($to === 'approved') {
                $years = (int) (($this->cfg['review_years'] ?? [])[$case['risk_rating']] ?? 1);
                $set[] = 'next_review_date = :next';
                $params[':next'] = (new \DateTimeImmutable('today'))->modify("+$years years")->format('Y-m-d');
                // A newly approved merchant becomes active.
                $this->db->prepare("UPDATE merchants SET status = 'active' WHERE id = :m AND status IN ('prospect', 'onboarding')")
                    ->execute([':m' => $case['merchant_id']]);
            }
            $this->db->prepare('UPDATE onboarding_cases SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($params);
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        Audit::log('onboarding.' . $to, 'merchant', (int) $case['merchant_id'], ['case_id' => $caseId, 'from' => $case['status'], 'notes' => $notes]);
    }

    /**
     * Items the merchant still has to send (missing, rejected or expired).
     *
     * @param array<string,mixed> $case
     * @return list<string>
     */
    public function outstanding(array $case): array
    {
        $out = [];
        foreach ($this->checklist($case) as $i) {
            if (!$i['required'] || !in_array($i['status'], ['missing', 'rejected', 'expired'], true)) {
                continue;
            }
            $line = $i['label'] . ($i['party_name'] ? ' — ' . $i['party_name'] : '');
            if ($i['status'] === 'rejected' && !empty($i['document']['rejection_reason'])) {
                $line .= ' (previous document not accepted: ' . $i['document']['rejection_reason'] . ')';
            } elseif ($i['status'] === 'expired') {
                $line .= ' (document expired)';
            }
            $out[] = $line;
        }
        return $out;
    }

    /** Email address to chase: primary contact, then billing contact, then merchant billing email. */
    public function contactEmail(int $merchantId): ?string
    {
        $stmt = $this->db->prepare(
            'SELECT COALESCE(
                (SELECT email FROM merchant_contacts WHERE merchant_id = m.id AND email IS NOT NULL ORDER BY is_primary DESC, is_billing DESC, id LIMIT 1),
                m.billing_email)
             FROM merchants m WHERE m.id = :m'
        );
        $stmt->execute([':m' => $merchantId]);
        $email = $stmt->fetchColumn();
        return is_string($email) && $email !== '' ? $email : null;
    }

    /**
     * Email the merchant the list of outstanding documents.
     *
     * @return array{sent_to:string, items:list<string>, delivered:bool}
     */
    public function sendReminder(int $caseId, ?int $userId): array
    {
        $case = $this->getCase($caseId);
        if (!in_array($case['status'], self::OPEN_STATUSES, true)) {
            throw new RuntimeException('This case is closed.', 409);
        }
        $items = $this->outstanding($case);
        if ($items === []) {
            throw new RuntimeException('Nothing outstanding to chase.', 409);
        }
        $to = $this->contactEmail((int) $case['merchant_id']);
        if ($to === null) {
            throw new RuntimeException('No contact email on the merchant record.', 422);
        }

        $due  = $case['due_date'] ? "\nPlease send them by {$case['due_date']}.\n" : '';
        $sent = Mailer::send(
            $to,
            'MIPS onboarding: documents still needed for ' . ($case['legal_name'] ?: $case['merchant_name']),
            "Hello,\n\nTo complete the onboarding of " . ($case['legal_name'] ?: $case['merchant_name'])
            . " with MIPS, we still need the following documents:\n\n- " . implode("\n- ", $items) . "\n" . $due
            . ($this->portalApplication($caseId) !== null
                ? "\nUpload them on the MIPS merchant portal: " . rtrim((string) $GLOBALS['config']['app']['url'], '/') . "/portal/documents.php\n"
                  . "Never send identity documents by email.\n"
                : "\nReply to this email with the documents attached, or send them to your MIPS account manager.\n")
            . "\nThank you,\nMIPS\n"
        );

        $this->db->prepare('INSERT INTO kyc_reminders (case_id, sent_to, items, sent_by, delivered) VALUES (:c, :t, :i, :u, :d)')
            ->execute([':c' => $caseId, ':t' => $to, ':i' => json_encode($items, JSON_UNESCAPED_UNICODE), ':u' => $userId, ':d' => $sent ? 1 : 0]);
        Audit::log('onboarding.reminder', 'merchant', (int) $case['merchant_id'],
            ['case_id' => $caseId, 'to' => $to, 'items' => count($items), 'delivered' => $sent, 'automatic' => $userId === null],
            $userId === null ? ['id' => null, 'email' => 'scheduler'] : null);

        return ['sent_to' => $to, 'items' => $items, 'delivered' => $sent];
    }

    /**
     * The portal application this case was opened from, with the merchant
     * account behind it (null for cases opened by staff).
     *
     * @return array<string,mixed>|null
     */
    public function portalApplication(int $caseId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT p.id, p.portal_user_id, u.email, u.name, u.is_active, u.totp_enabled_at, u.last_login_at,
                    (SELECT t.version FROM terms_acceptances a JOIN terms_versions t ON t.id = a.terms_version_id
                     WHERE a.portal_user_id = u.id ORDER BY a.terms_version_id DESC LIMIT 1) AS terms_version,
                    (SELECT a.accepted_at FROM terms_acceptances a WHERE a.portal_user_id = u.id ORDER BY a.terms_version_id DESC LIMIT 1) AS terms_accepted_at
             FROM prequalifications p JOIN portal_users u ON u.id = p.portal_user_id
             WHERE p.case_id = :c'
        );
        $stmt->execute([':c' => $caseId]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * Cases due for an automatic reminder: open, collecting, something
     * outstanding, last reminder older than the interval, under the cap.
     *
     * @return list<int>
     */
    public function casesDueForReminder(): array
    {
        $stmt = $this->db->prepare(
            "SELECT c.id FROM onboarding_cases c
             WHERE c.status = 'collecting'
               AND (SELECT COUNT(*) FROM kyc_reminders r WHERE r.case_id = c.id) < :max
               AND COALESCE((SELECT MAX(sent_at) FROM kyc_reminders r WHERE r.case_id = c.id), c.created_at)
                   <= DATE_SUB(NOW(), INTERVAL :days DAY)"
        );
        $stmt->execute([':max' => (int) ($this->cfg['max_reminders'] ?? 5), ':days' => (int) ($this->cfg['reminder_every_days'] ?? 7)]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
}
