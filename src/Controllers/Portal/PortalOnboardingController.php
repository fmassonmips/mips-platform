<?php
/**
 * Merchant portal: pre-qualification, KYC documents and progress.
 *
 *   GET  /api/portal/application        own application + form options
 *   POST /api/portal/application        submit the pre-qualification (once)
 *   GET  /api/portal/case               progress, checklist, people
 *   POST /api/portal/party-save         { id?, full_name, roles[], ownership_pct, nationality, date_of_birth, is_pep }
 *   POST /api/portal/party-delete       { id }
 *   POST /api/portal/upload             multipart: requirement, party_id?, expires_at?, file
 *   POST /api/portal/document-delete    { id }   own uploads still pending review
 *   POST /api/portal/submit             tell MIPS the file is complete
 *
 * Object-level access: the case is never taken from the request. It is the
 * case opened from the signed-in account's own application, and every id
 * received (person, document) is checked against that case.
 *
 * What the merchant sees is limited on purpose: no risk rating, screening
 * result, internal notes, approval blockers or staff names.
 */
declare(strict_types=1);

namespace App\Controllers\Portal;

use App\Audit;
use App\Database;
use App\Mailer;
use App\Onboarding\DocumentStore;
use App\Onboarding\Kyc;
use App\Portal\PortalAuth;
use App\Portal\Prequalification;
use App\Request;
use App\Response;
use PDO;

final class PortalOnboardingController
{
    private const ROLES          = ['director', 'ubo', 'signatory', 'shareholder'];
    /** Case statuses in which the merchant can still add documents and people. */
    private const EDITABLE       = ['collecting', 'on_hold'];
    private const PUBLIC_FIELDS  = ['id', 'status', 'legal_name', 'trading_name', 'brn', 'vat_number', 'country_of_incorporation',
        'registered_address', 'sector', 'products_services', 'website', 'countries_of_operation', 'monthly_volume_band',
        'average_ticket_mur', 'payment_methods', 'contact_name', 'contact_role', 'contact_phone', 'is_regulated', 'regulator', 'submitted_at'];

    private PDO $db;
    private Kyc $kyc;
    private Prequalification $pq;

    public function __construct()
    {
        $this->db  = Database::connection();
        $this->kyc = new Kyc();
        $this->pq  = new Prequalification();
    }

    public function application(): void
    {
        $user = PortalAuth::require();
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
            Request::require_csrf();
            try {
                $this->pq->submit($user, $this->pq->validate(Request::body()));
            } catch (\RuntimeException $e) {
                Response::json(['error' => $e->getMessage()], in_array($e->getCode(), [409, 422], true) ? (int) $e->getCode() : 422);
            }
            Response::json(['success' => true], 201);
        }
        Request::require_method('GET');

        $app = $this->pq->forUser((int) $user['id']);
        if ($app !== null) {
            $app = array_intersect_key($app, array_flip(self::PUBLIC_FIELDS));
            $app['payment_methods'] = $app['payment_methods'] === '' ? [] : explode(',', (string) $app['payment_methods']);
        }
        Response::json(['application' => $app, 'options' => $this->pq->options()]);
    }

    public function caseView(): void
    {
        Request::require_method('GET');
        $user = PortalAuth::require();
        $app  = $this->pq->forUser((int) $user['id']);
        $case = $app !== null && $app['case_id'] !== null ? $this->kyc->getCase((int) $app['case_id']) : null;

        $out = [
            'stage'       => $this->stage($app, $case),
            'application' => $app === null ? null : ['status' => $app['status'], 'submitted_at' => $app['submitted_at'], 'legal_name' => $app['legal_name']],
            'case'        => null,
        ];
        if ($case !== null) {
            $me        = (int) $user['id'];
            $editable  = in_array($case['status'], self::EDITABLE, true);
            $checklist = $this->kyc->checklist($case);
            $parties   = $this->kyc->parties((int) $case['id']);
            $docCount  = $this->docCountsByParty((int) $case['id']);

            $out['case'] = [
                'status'                => $case['status'],
                'merchant_submitted_at' => $case['merchant_submitted_at'],
                'decided_at'            => in_array($case['status'], ['approved', 'rejected'], true) ? $case['decided_at'] : null,
                'due_date'              => $case['due_date'],
                'editable'              => $editable,
                'can_submit'            => $case['status'] === 'collecting' && $case['merchant_submitted_at'] === null,
                'missing'               => $this->missing($case, $checklist, $parties),
                'ubo_threshold_pct'     => (float) ($GLOBALS['config']['kyc']['ubo_threshold_pct'] ?? 25),
                'checklist'             => array_map(function (array $i) use ($me, $editable): array {
                    $d    = $i['document'];
                    $mine = $d !== null && (int) ($d['uploaded_by_portal'] ?? 0) === $me;
                    return [
                        'requirement' => $i['requirement'], 'label' => $i['label'], 'expires' => $i['expires'],
                        'required' => $i['required'] && !$this->portalOptional($i['requirement']),
                        'from_mips' => $this->portalOptional($i['requirement']),
                        'party_id' => $i['party_id'], 'party_name' => $i['party_name'], 'status' => $i['status'],
                        'provided_by' => $i['via'] !== null ? 'mips' : ($d === null ? null : ($mine ? 'you' : 'mips')),
                        'document' => $d === null ? null : [
                            'id' => (int) $d['id'], 'name' => $mine ? $d['original_name'] : null, 'uploaded_at' => $d['uploaded_at'],
                            'expires_at' => $d['expires_at'], 'rejection_reason' => $d['status'] === 'rejected' ? $d['rejection_reason'] : null,
                            'can_remove' => $mine && $editable && $d['status'] === 'pending',
                        ],
                        'can_upload' => $editable && $i['via'] === null && ($i['status'] !== 'accepted' || $i['expires']),
                    ];
                }, $checklist),
                'parties' => array_map(function (array $p) use ($me, $editable, $docCount): array {
                    $mine = (int) ($p['declared_by_portal'] ?? 0) === $me;
                    $docs = $docCount[(int) $p['id']] ?? ['all' => 0, 'accepted' => 0];
                    return [
                        'id' => (int) $p['id'], 'full_name' => $p['full_name'], 'roles' => $p['roles'], 'ownership_pct' => $p['ownership_pct'],
                        'nationality' => $mine ? $p['nationality'] : null, 'date_of_birth' => $mine ? $p['date_of_birth'] : null,
                        'needs_docs' => $p['needs_docs'], 'declared_by_you' => $mine,
                        'can_edit' => $mine && $editable && $docs['accepted'] === 0,
                        'can_delete' => $mine && $editable && $docs['all'] === 0,
                    ];
                }, $parties),
            ];
        }
        Response::json($out);
    }

    public function partySave(): void
    {
        Request::require_method('POST');
        $user = PortalAuth::require();
        Request::require_csrf();
        $case = $this->editableCase($user);

        $d      = Request::body();
        $id     = (int) ($d['id'] ?? 0);
        $before = null;
        if ($id > 0) {
            $before = $this->ownParty($user, $case, $id);
            if ($this->docCountsByParty((int) $case['id'])[$id]['accepted'] ?? 0) {
                Response::json(['error' => 'Documents for this person have already been accepted. Contact MIPS to change their details.'], 409);
            }
        }

        $name  = is_string($d['full_name'] ?? null) ? trim($d['full_name']) : '';
        $roles = array_values(array_intersect(self::ROLES, is_array($d['roles'] ?? null) ? $d['roles'] : []));
        $pct   = isset($d['ownership_pct']) && (string) $d['ownership_pct'] !== '' ? $d['ownership_pct'] : null;
        $nat   = is_string($d['nationality'] ?? null) ? mb_substr(trim($d['nationality']), 0, 60) : '';
        $dobIn = is_string($d['date_of_birth'] ?? null) ? trim($d['date_of_birth']) : '';
        $dob   = \DateTimeImmutable::createFromFormat('!Y-m-d', $dobIn);
        $pep   = !empty($d['is_pep']) ? 1 : 0;

        $err = [];
        if ($name === '' || mb_strlen($name) > 160) {
            $err[] = 'Full name is required (max 160 characters).';
        }
        if ($roles === []) {
            $err[] = 'Select at least one role.';
        }
        if ($pct !== null && (!is_numeric($pct) || (float) $pct < 0 || (float) $pct > 100)) {
            $err[] = 'Ownership must be between 0 and 100%.';
        }
        if ($nat === '') {
            $err[] = 'Nationality is required.';
        }
        if ($dob === false || $dob->format('Y-m-d') !== $dobIn || $dobIn > date('Y-m-d', strtotime('-16 years'))) {
            $err[] = 'Enter a valid date of birth.';
        }
        if ($err !== []) {
            Response::json(['error' => implode(' ', $err)], 422);
        }
        $pct = $pct === null ? null : round((float) $pct, 2);

        if ($before === null) {
            $this->db->prepare(
                "INSERT INTO kyc_parties (case_id, full_name, roles, ownership_pct, nationality, date_of_birth, is_pep, screening_result, declared_by_portal)
                 VALUES (:c, :n, :r, :pct, :nat, :dob, :pep, 'pending', :u)"
            )->execute([':c' => $case['id'], ':n' => $name, ':r' => implode(',', $roles), ':pct' => $pct, ':nat' => $nat, ':dob' => $dobIn,
                ':pep' => $pep, ':u' => (int) $user['id']]);
            $id = (int) $this->db->lastInsertId();
        } else {
            // Changing who the person is invalidates any screening already done.
            $identityChanged = $before['full_name'] !== $name || (string) $before['nationality'] !== $nat || (string) $before['date_of_birth'] !== $dobIn;
            $this->db->prepare(
                "UPDATE kyc_parties SET full_name = :n, roles = :r, ownership_pct = :pct, nationality = :nat, date_of_birth = :dob,
                    is_pep = GREATEST(is_pep, :pep),
                    screening_result = IF(:changed = 1, 'pending', screening_result),
                    screened_at = IF(:changed2 = 1, NULL, screened_at)
                 WHERE id = :id"
            )->execute([':n' => $name, ':r' => implode(',', $roles), ':pct' => $pct, ':nat' => $nat, ':dob' => $dobIn, ':pep' => $pep,
                ':changed' => $identityChanged ? 1 : 0, ':changed2' => $identityChanged ? 1 : 0, ':id' => $id]);
        }
        // A merchant can declare a PEP but never clear a PEP flag (GREATEST above).
        Audit::log('onboarding.portal_party_save', 'merchant', (int) $case['merchant_id'], [
            'case_id' => (int) $case['id'], 'party_id' => $id, 'name' => $name, 'roles' => $roles, 'pep_declared' => (bool) $pep,
        ], PortalAuth::actor($user));
        Response::json(['success' => true, 'id' => $id]);
    }

    public function partyDelete(): void
    {
        Request::require_method('POST');
        $user = PortalAuth::require();
        Request::require_csrf();
        $case  = $this->editableCase($user);
        $id    = (int) (Request::body()['id'] ?? 0);
        $party = $this->ownParty($user, $case, $id);
        if (($this->docCountsByParty((int) $case['id'])[$id]['all'] ?? 0) > 0) {
            Response::json(['error' => 'Documents were uploaded for this person. Contact MIPS to remove them.'], 409);
        }
        $this->db->prepare('DELETE FROM kyc_parties WHERE id = :id')->execute([':id' => $id]);
        Audit::log('onboarding.portal_party_delete', 'merchant', (int) $case['merchant_id'],
            ['case_id' => (int) $case['id'], 'party_id' => $id, 'name' => $party['full_name']], PortalAuth::actor($user));
        Response::json(['success' => true]);
    }

    public function upload(): void
    {
        Request::require_method('POST');
        $user = PortalAuth::require();
        Request::require_csrf();
        $case = $this->editableCase($user);
        $cfg  = $GLOBALS['config']['portal'] ?? [];

        $recent = $this->db->prepare('SELECT COUNT(*) FROM kyc_documents WHERE uploaded_by_portal = :u AND uploaded_at >= :since');
        $recent->execute([':u' => (int) $user['id'], ':since' => date('Y-m-d H:i:s', time() - 3600)]);
        if ((int) $recent->fetchColumn() >= (int) ($cfg['max_uploads_per_hour'] ?? 30)) {
            Audit::log('onboarding.portal_upload_limited', 'merchant', (int) $case['merchant_id'], ['case_id' => (int) $case['id']], PortalAuth::actor($user));
            Response::json(['error' => 'Too many uploads in the last hour. Please try again later.'], 429);
        }
        $total = $this->db->prepare('SELECT COUNT(*) FROM kyc_documents WHERE case_id = :c');
        $total->execute([':c' => $case['id']]);
        if ((int) $total->fetchColumn() >= (int) ($cfg['max_documents_per_case'] ?? 200)) {
            Response::json(['error' => 'This file already holds the maximum number of documents. Contact MIPS.'], 409);
        }

        try {
            $t = $this->kyc->uploadTarget($case, (string) ($_POST['requirement'] ?? ''), $_POST['party_id'] ?? null, $_POST['expires_at'] ?? null);
        } catch (\RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 422);
        }
        foreach ($this->kyc->checklist($case) as $i) {
            if ($i['requirement'] === $t['requirement']['code'] && (int) ($i['party_id'] ?? 0) === (int) ($t['party_id'] ?? 0)
                && ($i['via'] !== null || ($i['status'] === 'accepted' && !$i['expires']))) {
                Response::json(['error' => 'This document has already been accepted.'], 409);
            }
        }

        try {
            $stored = (new DocumentStore())->store($case, $t['requirement']['code'], $t['party_id'], $t['expires'],
                is_array($_FILES['file'] ?? null) ? $_FILES['file'] : [], null, (int) $user['id'], !empty($cfg['require_antivirus']));
        } catch (\RuntimeException $e) {
            if (str_contains($e->getMessage(), 'antivirus check')) {
                Audit::log('onboarding.portal_upload_infected', 'merchant', (int) $case['merchant_id'],
                    ['case_id' => (int) $case['id'], 'requirement' => $t['requirement']['code']], PortalAuth::actor($user));
            }
            Response::json(['error' => $e->getMessage()], in_array($e->getCode(), [422, 500, 503], true) ? (int) $e->getCode() : 422);
        }
        Audit::log('onboarding.portal_upload', 'merchant', (int) $case['merchant_id'], [
            'case_id' => (int) $case['id'], 'document_id' => $stored['id'], 'requirement' => $t['requirement']['code'],
            'party_id' => $t['party_id'], 'sha256' => $stored['sha256'], 'scan' => $stored['scan_status'],
        ], PortalAuth::actor($user));
        Response::json(['success' => true, 'id' => $stored['id']], 201);
    }

    public function deleteDocument(): void
    {
        Request::require_method('POST');
        $user = PortalAuth::require();
        Request::require_csrf();
        $case = $this->editableCase($user);
        $stmt = $this->db->prepare('SELECT * FROM kyc_documents WHERE id = :id AND case_id = :c AND uploaded_by_portal = :u');
        $stmt->execute([':id' => (int) (Request::body()['id'] ?? 0), ':c' => $case['id'], ':u' => (int) $user['id']]);
        $doc = $stmt->fetch();
        if (!is_array($doc)) {
            Response::json(['error' => 'Document not found.'], 404);
        }
        if ($doc['status'] !== 'pending') {
            Response::json(['error' => 'MIPS has already checked this document: it stays on record.'], 409);
        }
        (new DocumentStore())->delete($doc);
        Audit::log('onboarding.portal_document_delete', 'merchant', (int) $case['merchant_id'],
            ['case_id' => (int) $case['id'], 'document_id' => (int) $doc['id'], 'sha256' => $doc['sha256']], PortalAuth::actor($user));
        Response::json(['success' => true]);
    }

    public function submit(): void
    {
        Request::require_method('POST');
        $user = PortalAuth::require();
        Request::require_csrf();
        $case = $this->ownCase($user);
        if ($case['status'] !== 'collecting' || $case['merchant_submitted_at'] !== null) {
            Response::json(['error' => 'Your file has already been sent to MIPS.'], 409);
        }
        $missing = $this->missing($case, $this->kyc->checklist($case), $this->kyc->parties((int) $case['id']));
        if ($missing !== []) {
            Response::json(['error' => "Your file is not complete yet:\n- " . implode("\n- ", $missing)], 422);
        }
        $this->db->prepare('UPDATE onboarding_cases SET merchant_submitted_at = NOW() WHERE id = :id AND merchant_submitted_at IS NULL')
            ->execute([':id' => $case['id']]);
        Audit::log('onboarding.portal_submit', 'merchant', (int) $case['merchant_id'], ['case_id' => (int) $case['id']], PortalAuth::actor($user));
        if (!empty($case['assigned_email'])) {
            Mailer::send((string) $case['assigned_email'], 'Portal: ' . ($case['legal_name'] ?: $case['merchant_name']) . ' says its KYC file is complete',
                "The merchant has sent its onboarding file for review on the portal.\n\n"
                . rtrim((string) $GLOBALS['config']['app']['url'], '/') . '/onboarding-case.php?id=' . $case['id'] . "\n");
        }
        Response::json(['success' => true]);
    }

    /**
     * What the merchant still has to provide before sending the file.
     *
     * @param array<string,mixed> $case
     * @param list<array<string,mixed>> $checklist
     * @param list<array<string,mixed>> $parties
     * @return list<string>
     */
    private function missing(array $case, array $checklist, array $parties): array
    {
        $out   = [];
        $roles = array_merge([], ...array_map(static fn ($p) => $p['roles'], $parties));
        if (!in_array('director', $roles, true)) {
            $out[] = 'Add at least one director.';
        }
        if (!in_array('ubo', $roles, true)) {
            $out[] = 'Add the beneficial owner(s).';
        }
        foreach ($checklist as $i) {
            if ($i['required'] && !$this->portalOptional($i['requirement']) && in_array($i['status'], ['missing', 'rejected', 'expired'], true)) {
                $out[] = $i['label'] . ($i['party_name'] ? ' — ' . $i['party_name'] : '')
                    . ($i['status'] === 'rejected' ? ' (not accepted: upload a new one)' : ($i['status'] === 'expired' ? ' (expired)' : ''));
            }
        }
        return $out;
    }

    /**
     * Where the merchant stands, in its own words.
     *
     * @param array<string,mixed>|null $app
     * @param array<string,mixed>|null $case
     */
    private function stage(?array $app, ?array $case): string
    {
        if ($app === null) {
            return 'application';
        }
        if ($app['status'] === 'submitted') {
            return 'application_review';
        }
        if ($app['status'] === 'declined') {
            return 'declined';
        }
        return match ($case['status'] ?? '') {
            'collecting'   => $case['merchant_submitted_at'] === null ? 'documents' : 'submitted',
            'under_review' => 'review',
            'on_hold'      => 'on_hold',
            'approved'     => 'approved',
            'rejected'     => 'not_approved',
            default        => 'application_review',
        };
    }

    /** @return array<string,mixed> the case opened from this account's application */
    private function ownCase(array $user): array
    {
        $app = $this->pq->forUser((int) $user['id']);
        if ($app === null || $app['case_id'] === null) {
            Response::json(['error' => 'Your application has not been accepted yet: documents can be sent once it is.'], 409);
        }
        return $this->kyc->getCase((int) $app['case_id']);
    }

    /** @return array<string,mixed> */
    private function editableCase(array $user): array
    {
        $case = $this->ownCase($user);
        if (!in_array($case['status'], self::EDITABLE, true)) {
            Response::json(['error' => $case['status'] === 'under_review'
                ? 'MIPS is reviewing your file. Contact MIPS if you need to change something.'
                : 'Your file is closed.'], 409);
        }
        return $case;
    }

    /** @return array<string,mixed> a person this account declared on its case */
    private function ownParty(array $user, array $case, int $id): array
    {
        $stmt = $this->db->prepare('SELECT * FROM kyc_parties WHERE id = :id AND case_id = :c AND declared_by_portal = :u');
        $stmt->execute([':id' => $id, ':c' => $case['id'], ':u' => (int) $user['id']]);
        $p = $stmt->fetch();
        if (!is_array($p)) {
            Response::json(['error' => 'You can only change the people you added yourself.'], 404);
        }
        return $p;
    }

    /** Requirement MIPS usually provides itself (e.g. the agreement it issues). */
    private function portalOptional(string $code): bool
    {
        return !empty($this->kyc->requirement($code)['portal_optional']);
    }

    /** @return array<int, array{all:int, accepted:int}> */
    private function docCountsByParty(int $caseId): array
    {
        $stmt = $this->db->prepare(
            "SELECT party_id, COUNT(*) AS n, SUM(status = 'accepted') AS acc FROM kyc_documents WHERE case_id = :c AND party_id IS NOT NULL GROUP BY party_id"
        );
        $stmt->execute([':c' => $caseId]);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(int) $r['party_id']] = ['all' => (int) $r['n'], 'accepted' => (int) $r['acc']];
        }
        return $out;
    }
}
