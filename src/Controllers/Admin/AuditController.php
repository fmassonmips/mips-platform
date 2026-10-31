<?php
/**
 * GET /api/audit/list?action=&user=&entity_type=&entity_id=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=1
 *
 * Read-only. 50 entries per page, newest first.
 */
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Auth;
use App\Database;
use App\Request;
use App\Response;

final class AuditController
{
    private const PER_PAGE = 50;

    public function list(): void
    {
        Request::require_method('GET');
        Auth::require_access('audit');

        $where  = [];
        $params = [];
        $str = static fn (string $k): string => is_string($_GET[$k] ?? null) ? trim($_GET[$k]) : '';

        if (($v = $str('action')) !== '') {
            $where[] = 'action LIKE :action';
            $params[':action'] = addcslashes($v, '%_\\') . '%';
        }
        if (($v = $str('user')) !== '') {
            $where[] = 'user_email LIKE :user';
            $params[':user'] = '%' . addcslashes($v, '%_\\') . '%';
        }
        if (($v = $str('entity_type')) !== '') {
            $where[] = 'entity_type = :etype';
            $params[':etype'] = $v;
        }
        if (($v = $str('entity_id')) !== '') {
            $where[] = 'entity_id = :eid';
            $params[':eid'] = $v;
        }
        foreach (['from' => '>=', 'to' => '<'] as $k => $op) {
            $v = $str($k);
            if ($v === '') {
                continue;
            }
            $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $v);
            if ($d === false || $d->format('Y-m-d') !== $v) {
                Response::json(['error' => 'Dates must be YYYY-MM-DD.'], 422);
            }
            // 'to' is inclusive of the whole day.
            $where[] = "created_at $op :$k";
            $params[":$k"] = ($k === 'to' ? $d->modify('+1 day') : $d)->format('Y-m-d H:i:s');
        }

        $sqlWhere = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);
        $page     = max(1, (int) ($_GET['page'] ?? 1));
        $offset   = ($page - 1) * self::PER_PAGE;

        $db    = Database::connection();
        $count = $db->prepare("SELECT COUNT(*) FROM audit_log $sqlWhere");
        $count->execute($params);
        $total = (int) $count->fetchColumn();

        $stmt = $db->prepare(
            "SELECT id, created_at, user_id, user_email, action, entity_type, entity_id, details, ip_address
             FROM audit_log $sqlWhere
             ORDER BY id DESC
             LIMIT " . self::PER_PAGE . " OFFSET $offset"
        );
        $stmt->execute($params);
        $rows = array_map(static function (array $r): array {
            $r['details'] = $r['details'] === null ? null : json_decode((string) $r['details'], true);
            return $r;
        }, $stmt->fetchAll());

        Response::json(['entries' => $rows, 'total' => $total, 'page' => $page, 'per_page' => self::PER_PAGE]);
    }
}
