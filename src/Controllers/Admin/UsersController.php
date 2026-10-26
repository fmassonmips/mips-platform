<?php
/**
 * User administration (admin only).
 *
 *   GET  /api/admin/users?status=pending|active|deactivated|all&q=
 *   POST /api/admin/user-update   { id, is_active?: bool, role?: string }
 *
 * Safeguards:
 *  - an administrator cannot deactivate or demote their own account;
 *  - the last active administrator can never be deactivated or demoted.
 * Changes apply on the target's next request: Auth::current_user()
 * re-reads is_active and role from the database every time.
 */
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Audit;
use App\Auth;
use App\Database;
use App\Request;
use App\Response;

final class UsersController
{
    public function list(): void
    {
        Request::require_method('GET');
        Auth::require_access('users');

        $status = (string) ($_GET['status'] ?? 'all');
        $where  = match ($status) {
            'pending'     => ['is_active = 0 AND activated_at IS NULL'],
            'active'      => ['is_active = 1'],
            'deactivated' => ['is_active = 0 AND activated_at IS NOT NULL'],
            'all'         => [],
            default       => null,
        };
        if ($where === null) {
            Response::json(['error' => 'Invalid status filter.'], 422);
        }

        $params = [];
        $q = is_string($_GET['q'] ?? null) ? trim($_GET['q']) : '';
        if ($q !== '') {
            $where[] = '(email LIKE :q1 OR name LIKE :q2)';
            $params[':q1'] = $params[':q2'] = '%' . addcslashes($q, '%_\\') . '%';
        }

        $db   = Database::connection();
        $stmt = $db->prepare(
            'SELECT id, email, name, role, is_active, activated_at, created_at,
                    (SELECT MAX(created_at) FROM audit_log a WHERE a.user_id = u.id AND a.action = \'auth.login\') AS last_login_at
             FROM users u ' . ($where === [] ? '' : 'WHERE ' . implode(' AND ', $where)) . '
             ORDER BY (is_active = 0 AND activated_at IS NULL) DESC, created_at DESC
             LIMIT 500'
        );
        $stmt->execute($params);

        $pending = (int) $db->query('SELECT COUNT(*) FROM users WHERE is_active = 0 AND activated_at IS NULL')->fetchColumn();

        Response::json([
            'users'   => array_map(static fn (array $u) => $u + [
                'status' => (int) $u['is_active'] === 1 ? 'active' : ($u['activated_at'] === null ? 'pending' : 'deactivated'),
            ], $stmt->fetchAll()),
            'pending' => $pending,
            'roles'   => $GLOBALS['config']['roles'] ?? ['user', 'admin'],
        ]);
    }

    public function update(): void
    {
        Request::require_method('POST');
        $admin = Auth::require_access('users');
        Request::require_csrf();

        $data  = Request::body();
        $id    = (int) ($data['id'] ?? 0);
        $roles = $GLOBALS['config']['roles'] ?? ['user', 'admin'];

        $setActive = array_key_exists('is_active', $data) ? (bool) $data['is_active'] : null;
        $setRole   = array_key_exists('role', $data) ? (string) $data['role'] : null;
        if ($setActive === null && $setRole === null) {
            Response::json(['error' => 'Nothing to update.'], 422);
        }
        if ($setRole !== null && !in_array($setRole, $roles, true)) {
            Response::json(['error' => 'Invalid role.'], 422);
        }

        $db = Database::connection();
        $db->beginTransaction();
        try {
            $stmt = $db->prepare('SELECT id, email, role, is_active, activated_at FROM users WHERE id = :id FOR UPDATE');
            $stmt->execute([':id' => $id]);
            $user = $stmt->fetch();
            if (!is_array($user)) {
                $db->rollBack();
                Response::json(['error' => 'User not found.'], 404);
            }

            $newActive = $setActive ?? ((int) $user['is_active'] === 1);
            $newRole   = $setRole ?? (string) $user['role'];
            $loses     = ($user['role'] === 'admin' && (int) $user['is_active'] === 1) && ($newRole !== 'admin' || !$newActive);

            if ($loses && $id === (int) $admin['id']) {
                $db->rollBack();
                Response::json(['error' => 'You cannot deactivate or demote your own account.'], 409);
            }
            if ($loses) {
                // Lock all active admins so two concurrent demotions cannot both pass.
                $count = count($db->query("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 FOR UPDATE")->fetchAll());
                if ($count <= 1) {
                    $db->rollBack();
                    Response::json(['error' => 'At least one active administrator must remain.'], 409);
                }
            }

            $db->prepare(
                'UPDATE users
                 SET is_active = :a, role = :r,
                     activated_at = CASE WHEN :a2 = 1 AND activated_at IS NULL THEN NOW() ELSE activated_at END
                 WHERE id = :id'
            )->execute([':a' => $newActive ? 1 : 0, ':a2' => $newActive ? 1 : 0, ':r' => $newRole, ':id' => $id]);
            $db->commit();
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }

        $wasActive = (int) $user['is_active'] === 1;
        if ($newActive !== $wasActive) {
            $action = $newActive ? ($user['activated_at'] === null ? 'user.activate' : 'user.reactivate') : 'user.deactivate';
            Audit::log($action, 'user', $id, ['email' => $user['email']]);
        }
        if ($newRole !== $user['role']) {
            Audit::log('user.role_change', 'user', $id, ['email' => $user['email'], 'from' => $user['role'], 'to' => $newRole]);
        }

        Response::json(['success' => true]);
    }
}
