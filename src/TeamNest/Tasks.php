<?php
/**
 * TeamNest tasks (to do / in progress / done) and the time spent on them.
 * Times are Mauritius local time, written by the application.
 */
declare(strict_types=1);

namespace App\TeamNest;

use App\Database;
use App\RendezVous\Booking;
use App\Suite\Tenant;

final class Tasks
{
    public const STATUSES   = ['todo' => 'À faire', 'doing' => 'En cours', 'done' => 'Fait'];
    public const PRIORITIES = ['normal' => 'Normale', 'high' => 'Haute'];

    /**
     * Tasks of a project grouped by status; done tasks newest first, others by due date.
     *
     * @return array<string,list<array<string,mixed>>>
     */
    public static function board(int $orgId, int $projectId): array
    {
        $out = array_fill_keys(array_keys(self::STATUSES), []);
        foreach (self::query('t.organization_id = ? AND t.project_id = ?', [$orgId, $projectId],
            'ORDER BY t.status = \'done\', CASE WHEN t.status = \'done\' THEN t.done_at END DESC,
                      t.priority = \'high\' DESC, t.due_date IS NULL, t.due_date, t.id') as $t) {
            $out[$t['status']][] = $t;
        }
        return $out;
    }

    /**
     * Open tasks assigned to a member, across active projects, by due date.
     *
     * @return list<array<string,mixed>>
     */
    public static function mine(int $orgId, int $userId): array
    {
        return self::query(
            't.organization_id = ? AND t.assignee_id = ? AND t.status <> \'done\' AND p.status = \'active\'', [$orgId, $userId],
            'ORDER BY t.due_date IS NULL, t.due_date, t.priority = \'high\' DESC, t.id'
        );
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function find(int $orgId, int $id): ?array
    {
        return self::query('t.organization_id = ? AND t.id = ?', [$orgId, $id])[0] ?? null;
    }

    /**
     * @return list<array<string,mixed>> tasks created from this support ticket
     */
    public static function forTicket(int $orgId, int $ticketId): array
    {
        return self::query('t.organization_id = ? AND t.flowdesk_ticket_id = ?', [$orgId, $ticketId]);
    }

    /** Open tasks past their due date, in active projects. */
    public static function overdueCount(int $orgId): int
    {
        $stmt = Database::connection()->prepare(
            'SELECT COUNT(*) FROM teamnest_tasks t JOIN teamnest_projects p ON p.id = t.project_id
             WHERE t.organization_id = :oid AND t.status <> \'done\' AND p.status = \'active\' AND t.due_date < :today'
        );
        $stmt->execute([':oid' => $orgId, ':today' => Booking::now()->format('Y-m-d')]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Create (id = 0) or update. Returns [id, error].
     *
     * @param array<string,mixed> $in project_id, title, description, status, priority, assignee_id, due_date, flowdesk_ticket_id
     * @return array{0:int,1:?string}
     */
    public static function save(int $orgId, int $userId, int $id, array $in): array
    {
        $current = $id > 0 ? self::find($orgId, $id) : null;
        if ($id > 0 && $current === null) {
            return [0, 'Tâche introuvable.'];
        }
        $projectId = (int) ($in['project_id'] ?? ($current['project_id'] ?? 0));
        $project   = Projects::find($orgId, $projectId);
        $title     = trim(preg_replace('/\s+/u', ' ', (string) ($in['title'] ?? '')) ?? '');
        $desc      = trim((string) ($in['description'] ?? ''));
        $status    = (string) ($in['status'] ?? ($current['status'] ?? 'todo'));
        $priority  = (string) ($in['priority'] ?? 'normal');
        $assignee  = (int) ($in['assignee_id'] ?? 0);
        $due       = trim((string) ($in['due_date'] ?? ''));
        $ticket    = $current !== null ? $current['flowdesk_ticket_id'] : ((int) ($in['flowdesk_ticket_id'] ?? 0) ?: null);

        if ($project === null) {
            return [0, 'Choisissez un projet.'];
        }
        if ($title === '' || mb_strlen($title) > 200) {
            return [0, 'L\'intitulé est obligatoire (200 caractères max.).'];
        }
        if (mb_strlen($desc) > 10000) {
            return [0, 'La description est trop longue.'];
        }
        if (!isset(self::STATUSES[$status]) || !isset(self::PRIORITIES[$priority])) {
            return [0, 'Statut ou priorité invalide.'];
        }
        if ($assignee > 0 && !isset(Tenant::members($orgId)[$assignee])) {
            return [0, 'Cette personne ne fait pas partie de l\'entreprise.'];
        }
        if ($due !== '' && !Booking::validDate($due)) {
            return [0, 'Échéance invalide.'];
        }
        $now    = Booking::now()->format('Y-m-d H:i:s');
        $params = [
            ':oid' => $orgId, ':p' => $projectId, ':t' => $title, ':d' => $desc !== '' ? $desc : null, ':s' => $status,
            ':pr' => $priority, ':a' => $assignee > 0 ? $assignee : null, ':due' => $due !== '' ? $due : null, ':now' => $now,
            ':done' => $status === 'done' ? ($current['done_at'] ?? $now) : null,
        ];
        $pdo = Database::connection();
        if ($current === null) {
            $pdo->prepare(
                'INSERT INTO teamnest_tasks (organization_id, project_id, title, description, status, priority, assignee_id, due_date,
                                             flowdesk_ticket_id, created_by, created_at, updated_at, done_at)
                 VALUES (:oid, :p, :t, :d, :s, :pr, :a, :due, :tk, :by, :now, :now2, :done)'
            )->execute($params + [':tk' => $ticket, ':by' => $userId, ':now2' => $now]);
            $id = (int) $pdo->lastInsertId();
        } else {
            $pdo->prepare(
                'UPDATE teamnest_tasks SET project_id = :p, title = :t, description = :d, status = :s, priority = :pr,
                        assignee_id = :a, due_date = :due, updated_at = :now, done_at = :done
                 WHERE organization_id = :oid AND id = :id'
            )->execute($params + [':id' => $id]);
        }
        if ($assignee > 0 && $assignee !== $userId && (int) ($current['assignee_id'] ?? 0) !== $assignee) {
            Notifier::safely(static fn () => Notifier::assigned($orgId, $userId, self::find($orgId, $id)));
        }
        return [$id, null];
    }

    /** Status change from the board. */
    public static function move(int $orgId, int $id, string $status): ?string
    {
        $t = self::find($orgId, $id);
        if ($t === null) {
            return 'Tâche introuvable.';
        }
        if (!isset(self::STATUSES[$status])) {
            return 'Statut invalide.';
        }
        $now = Booking::now()->format('Y-m-d H:i:s');
        Database::connection()->prepare(
            'UPDATE teamnest_tasks SET status = :s, updated_at = :now,
                    done_at = IF(:s2 = \'done\', COALESCE(done_at, :now2), NULL)
             WHERE organization_id = :oid AND id = :id'
        )->execute([':s' => $status, ':s2' => $status, ':now' => $now, ':now2' => $now, ':oid' => $orgId, ':id' => $id]);
        return null;
    }

    /** Refused while some of its time is billed: delete the invoice draft first. */
    public static function delete(int $orgId, int $id): ?string
    {
        if (self::find($orgId, $id) === null) {
            return 'Tâche introuvable.';
        }
        $billed = Database::connection()->prepare('SELECT 1 FROM teamnest_time WHERE task_id = :id AND billed_invoice_id IS NOT NULL LIMIT 1');
        $billed->execute([':id' => $id]);
        if ($billed->fetchColumn() !== false) {
            return 'Du temps de cette tâche a été facturé : elle ne peut pas être supprimée.';
        }
        Database::connection()->prepare('DELETE FROM teamnest_tasks WHERE organization_id = :oid AND id = :id')
            ->execute([':oid' => $orgId, ':id' => $id]);
        return null;
    }

    /**
     * @return list<array<string,mixed>> newest first, with user name and invoice number
     */
    public static function time(int $taskId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT tt.*, COALESCE(NULLIF(u.name, \'\'), u.email) AS user_name, d.number AS invoice_number, d.status AS invoice_status
             FROM teamnest_time tt LEFT JOIN users u ON u.id = tt.user_id
             LEFT JOIN facturo_documents d ON d.id = tt.billed_invoice_id
             WHERE tt.task_id = :t ORDER BY tt.spent_on DESC, tt.id DESC'
        );
        $stmt->execute([':t' => $taskId]);
        return $stmt->fetchAll();
    }

    /**
     * Log time: "1h30", "1:30", "90" (minutes), "1.5" (hours).
     */
    public static function addTime(int $orgId, int $userId, int $taskId, string $duration, string $date, string $note): ?string
    {
        if (self::find($orgId, $taskId) === null) {
            return 'Tâche introuvable.';
        }
        $minutes = self::parseDuration($duration);
        if ($minutes === null || $minutes < 1 || $minutes > 24 * 60) {
            return 'Durée invalide (ex. 45, 1h30, 1.5).';
        }
        if (!Booking::validDate($date) || $date > Booking::now()->format('Y-m-d')) {
            return 'Date invalide (pas dans le futur).';
        }
        Database::connection()->prepare(
            'INSERT INTO teamnest_time (task_id, user_id, minutes, spent_on, note, created_at) VALUES (:t, :u, :m, :d, :n, :now)'
        )->execute([':t' => $taskId, ':u' => $userId, ':m' => $minutes, ':d' => $date,
                    ':n' => trim($note) !== '' ? mb_substr(trim($note), 0, 200) : null, ':now' => Booking::now()->format('Y-m-d H:i:s')]);
        return null;
    }

    /** Unbilled entries only. */
    public static function deleteTime(int $orgId, int $entryId): ?string
    {
        $pdo  = Database::connection();
        $find = $pdo->prepare(
            'SELECT tt.billed_invoice_id FROM teamnest_time tt JOIN teamnest_tasks t ON t.id = tt.task_id
             WHERE tt.id = :id AND t.organization_id = :oid'
        );
        $find->execute([':id' => $entryId, ':oid' => $orgId]);
        $row = $find->fetch();
        if ($row === false) {
            return 'Temps introuvable.';
        }
        if ($row['billed_invoice_id'] !== null) {
            return 'Ce temps est déjà facturé : supprimez d\'abord le brouillon de facture.';
        }
        $pdo->prepare('DELETE FROM teamnest_time WHERE id = :id AND billed_invoice_id IS NULL')->execute([':id' => $entryId]);
        return null;
    }

    public static function parseDuration(string $raw): ?int
    {
        $raw = strtolower(str_replace(' ', '', trim($raw)));
        if (preg_match('/^(\d{1,2})[h:](\d{1,2})?(?:min|m)?$/', $raw, $m)) {
            return (int) $m[1] * 60 + (int) ($m[2] ?? 0);
        }
        if (preg_match('/^(\d{1,4})(?:min|m)?$/', $raw, $m)) {
            return (int) $m[1];
        }
        if (preg_match('/^(\d{1,2})[.,](\d{1,2})h?$/', $raw, $m)) {
            return (int) round(((float) ($m[1] . '.' . $m[2])) * 60);
        }
        return null;
    }

    public static function formatMinutes(int $min): string
    {
        return intdiv($min, 60) > 0 ? intdiv($min, 60) . ' h ' . str_pad((string) ($min % 60), 2, '0', STR_PAD_LEFT) : $min . ' min';
    }

    /**
     * @param list<mixed> $params
     * @return list<array<string,mixed>>
     */
    private static function query(string $where, array $params, string $order = 'ORDER BY t.id'): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT t.*, p.name AS project_name, COALESCE(NULLIF(u.name, \'\'), u.email) AS assignee_name,
                    (SELECT COALESCE(SUM(minutes), 0) FROM teamnest_time tt WHERE tt.task_id = t.id) AS minutes,
                    fd.number AS ticket_number
             FROM teamnest_tasks t JOIN teamnest_projects p ON p.id = t.project_id
             LEFT JOIN users u ON u.id = t.assignee_id
             LEFT JOIN flowdesk_tickets fd ON fd.id = t.flowdesk_ticket_id
             WHERE ' . $where . ' ' . $order
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}
