<?php
/**
 * Staff side of the merchant portal: pre-qualification applications and
 * merchant portal accounts. Module 'onboarding'.
 *
 *   GET  /api/applications/list?status=submitted|accepted|declined|all
 *   GET  /api/applications/get?id=
 *   POST /api/applications/accept          { id, merchant_id?, note }   creates (or links) the merchant, opens the case
 *   POST /api/applications/decline         { id, note }
 *   POST /api/applications/account-status  { portal_user_id, active }  switch a merchant account off / on
 */
declare(strict_types=1);

namespace App\Controllers\Portal;

use App\Audit;
use App\Auth;
use App\Database;
use App\Portal\Prequalification;
use App\Portal\Terms;
use App\Request;
use App\Response;
use PDO;

final class ApplicationsController
{
    private PDO $db;
    private Prequalification $pq;

    public function __construct()
    {
        $this->db = Database::connection();
        $this->pq = new Prequalification();
    }

    public function list(): void
    {
        Request::require_method('GET');
        Auth::require_access('onboarding');

        $status = is_string($_GET['status'] ?? null) ? (string) $_GET['status'] : 'submitted';
        $where  = in_array($status, ['submitted', 'accepted', 'declined'], true) ? 'WHERE p.status = :s' : '';
        $stmt   = $this->db->prepare(
            "SELECT p.id, p.status, p.legal_name, p.trading_name, p.brn, p.sector, p.monthly_volume_band, p.payment_methods,
                    p.flags, p.submitted_at, p.decided_at, p.case_id, u.email AS portal_email
             FROM prequalifications p JOIN portal_users u ON u.id = p.portal_user_id $where
             ORDER BY p.status = 'submitted' DESC, p.submitted_at DESC LIMIT 300"
        );
        $stmt->execute($where === '' ? [] : [':s' => $status]);
        $opt = $this->pq->options();
        Response::json(['applications' => array_map(static function (array $r) use ($opt): array {
            $r['flags']        = json_decode((string) $r['flags'], true) ?: [];
            $r['sector_label'] = $opt['sectors'][$r['sector']] ?? $r['sector'];
            $r['volume_label'] = $opt['volume_bands'][$r['monthly_volume_band']] ?? $r['monthly_volume_band'];
            return $r;
        }, $stmt->fetchAll())]);
    }

    public function get(): void
    {
        Request::require_method('GET');
        Auth::require_access('onboarding');
        try {
            $p = $this->pq->get((int) ($_GET['id'] ?? 0));
        } catch (\RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], 404);
        }

        // Existing merchants that may be the same business (to link instead of creating a duplicate).
        $m = $this->db->prepare(
            "SELECT id, name, legal_name, brn, status FROM merchants
             WHERE (brn IS NOT NULL AND brn = :brn) OR name = :tn OR legal_name = :ln ORDER BY id LIMIT 10"
        );
        $m->execute([':brn' => $p['brn'], ':tn' => $p['trading_name'], ':ln' => $p['legal_name']]);

        $acc = $this->db->prepare(
            'SELECT u.id, u.email, u.name, u.phone, u.is_active, u.email_verified_at, u.totp_enabled_at, u.last_login_at, u.created_at
             FROM portal_users u WHERE u.id = :u'
        );
        $acc->execute([':u' => $p['portal_user_id']]);
        $consents = $this->db->prepare(
            'SELECT t.version, a.accepted_at, a.ip_address, a.body_sha256 FROM terms_acceptances a
             JOIN terms_versions t ON t.id = a.terms_version_id WHERE a.portal_user_id = :u ORDER BY a.id'
        );
        $consents->execute([':u' => $p['portal_user_id']]);
        $current = Terms::current();

        Response::json([
            'application' => $p,
            'options'     => $this->pq->options(),
            'candidates'  => $m->fetchAll(),
            'account'     => $acc->fetch() ?: null,
            'consents'    => $consents->fetchAll(),
            'current_terms_version' => $current['version'] ?? null,
        ]);
    }

    public function accept(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('onboarding');
        Request::require_csrf();
        $d = Request::body();
        try {
            $r = $this->pq->accept((int) ($d['id'] ?? 0), $user,
                isset($d['merchant_id']) && (string) $d['merchant_id'] !== '' ? (int) $d['merchant_id'] : null,
                is_string($d['note'] ?? null) ? mb_substr(trim($d['note']), 0, 1000) : '');
        } catch (\RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], in_array($e->getCode(), [404, 409, 422], true) ? (int) $e->getCode() : 422);
        }
        Response::json(['success' => true] + $r);
    }

    public function decline(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('onboarding');
        Request::require_csrf();
        $d = Request::body();
        try {
            $this->pq->decline((int) ($d['id'] ?? 0), $user, is_string($d['note'] ?? null) ? $d['note'] : '');
        } catch (\RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], in_array($e->getCode(), [404, 409, 422], true) ? (int) $e->getCode() : 422);
        }
        Response::json(['success' => true]);
    }

    public function accountStatus(): void
    {
        Request::require_method('POST');
        Auth::require_access('onboarding');
        Request::require_csrf();
        $d      = Request::body();
        $id     = (int) ($d['portal_user_id'] ?? 0);
        $active = !empty($d['active']) ? 1 : 0;
        $upd    = $this->db->prepare('UPDATE portal_users SET is_active = :a WHERE id = :id');
        $upd->execute([':a' => $active, ':id' => $id]);
        $chk = $this->db->prepare('SELECT email FROM portal_users WHERE id = :id');
        $chk->execute([':id' => $id]);
        $email = $chk->fetchColumn();
        if ($email === false) {
            Response::json(['error' => 'Account not found.'], 404);
        }
        // A switched-off account loses its sessions at once (PortalAuth::current checks is_active).
        Audit::log($active ? 'portal.account_enable' : 'portal.account_disable', 'portal_user', $id, ['email' => $email]);
        Response::json(['success' => true]);
    }
}
