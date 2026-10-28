<?php
/**
 * Staff side: merchant portal terms of use. Module 'terms' (admin).
 *
 *   GET  /api/terms/list                versions, with the number of acceptances
 *   POST /api/terms/publish             { version, title, body }   new version; every merchant must accept it
 */
declare(strict_types=1);

namespace App\Controllers\Portal;

use App\Audit;
use App\Auth;
use App\Database;
use App\Portal\Terms;
use App\Request;
use App\Response;

final class TermsController
{
    public function list(): void
    {
        Request::require_method('GET');
        Auth::require_access('terms');
        $rows = Database::connection()->query(
            'SELECT t.id, t.version, t.title, t.body, t.body_sha256, t.published_at, u.email AS published_by_email,
                    (SELECT COUNT(*) FROM terms_acceptances a WHERE a.terms_version_id = t.id) AS acceptances
             FROM terms_versions t LEFT JOIN users u ON u.id = t.published_by ORDER BY t.id DESC'
        )->fetchAll();
        $accounts = (int) Database::connection()->query('SELECT COUNT(*) FROM portal_users WHERE is_active = 1 AND email_verified_at IS NOT NULL')->fetchColumn();
        Response::json(['versions' => $rows, 'active_accounts' => $accounts]);
    }

    public function publish(): void
    {
        Request::require_method('POST');
        $user = Auth::require_access('terms');
        Request::require_csrf();
        $d = Request::body();
        try {
            $t = Terms::publish((string) ($d['version'] ?? ''), (string) ($d['title'] ?? ''), (string) ($d['body'] ?? ''), (int) $user['id']);
        } catch (\RuntimeException $e) {
            Response::json(['error' => $e->getMessage()], in_array($e->getCode(), [409, 422], true) ? (int) $e->getCode() : 422);
        }
        Audit::log('terms.publish', 'terms', (int) $t['id'], ['version' => $t['version'], 'sha256' => $t['body_sha256']]);
        Response::json(['success' => true, 'id' => (int) $t['id']], 201);
    }
}
