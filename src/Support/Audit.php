<?php
/**
 * Append-only audit logging. Every regulated/admin action should call this so
 * there is a tamper-evident trail (who did what, to which entity, when).
 */
declare(strict_types=1);

namespace App\Support;

use App\Database;

final class Audit
{
    /**
     * @param array<string,mixed>|null $before
     * @param array<string,mixed>|null $after
     */
    public static function log(
        ?int $actorUserId,
        ?string $actorRole,
        string $action,
        ?string $entityType = null,
        ?string $entityId = null,
        ?array $before = null,
        ?array $after = null,
    ): void {
        $stmt = Database::connection()->prepare(
            'INSERT INTO audit_logs
                (actor_user_id, actor_role, action, entity_type, entity_id,
                 ip_address, user_agent, before_state, after_state, created_at)
             VALUES (:uid, :role, :action, :etype, :eid, :ip, :ua, :before, :after, NOW())'
        );
        $stmt->execute([
            ':uid'    => $actorUserId,
            ':role'   => $actorRole,
            ':action' => $action,
            ':etype'  => $entityType,
            ':eid'    => $entityId,
            ':ip'     => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
            ':ua'     => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ':before' => $before !== null ? json_encode($before, JSON_UNESCAPED_SLASHES) : null,
            ':after'  => $after !== null ? json_encode($after, JSON_UNESCAPED_SLASHES) : null,
        ]);
    }
}
