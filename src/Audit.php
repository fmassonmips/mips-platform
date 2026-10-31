<?php
/**
 * Append-only audit trail.
 *
 * Audit::log('invoice.issue', 'invoice', $id, ['number' => ...]);
 *
 * The acting user is taken from the session unless passed explicitly
 * (e.g. right after login, before the session is fully bound).
 * Logging failures are written to the error log and never break the
 * calling request.
 */
declare(strict_types=1);

namespace App;

final class Audit
{
    /**
     * @param array<string,mixed>      $details
     * @param array<string,mixed>|null $actor   user row with id/email; defaults to the session user
     */
    public static function log(
        string $action,
        ?string $entityType = null,
        int|string|null $entityId = null,
        array $details = [],
        ?array $actor = null
    ): void {
        $userId = $actor !== null
            ? ($actor['id'] === null ? null : (int) $actor['id'])   // id null: system actor (e.g. scheduler)
            : (isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null);
        $email  = $actor !== null ? (string) $actor['email'] : (isset($_SESSION['user_email']) ? (string) $_SESSION['user_email'] : null);

        try {
            $stmt = Database::connection()->prepare(
                'INSERT INTO audit_log
                    (user_id, user_email, action, entity_type, entity_id, details, ip_address, user_agent, created_at)
                 VALUES (:uid, :email, :action, :etype, :eid, :details, :ip, :ua, NOW())'
            );
            $stmt->execute([
                ':uid'     => $userId,
                ':email'   => $email,
                ':action'  => $action,
                ':etype'   => $entityType,
                ':eid'     => $entityId === null ? null : (string) $entityId,
                ':details' => $details === [] ? null : json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ':ip'      => Request::ip(),
                ':ua'      => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]);
        } catch (\Throwable $e) {
            error_log('[Audit] ' . $action . ': ' . $e->getMessage());
        }
    }
}
