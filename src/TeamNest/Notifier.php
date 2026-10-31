<?php
/**
 * TeamNest e-mail: tell a member a task was assigned to them by someone else.
 */
declare(strict_types=1);

namespace App\TeamNest;

use App\Database;
use App\Format;
use App\Mail\SmtpMailer;

final class Notifier
{
    /**
     * @param array<string,mixed>|null $task
     */
    public static function assigned(int $orgId, int $byUserId, ?array $task): void
    {
        if ($task === null || $task['assignee_id'] === null || !SmtpMailer::isConfigured()) {
            return;
        }
        $stmt = Database::connection()->prepare('SELECT id, email, COALESCE(NULLIF(name, \'\'), email) AS name FROM users WHERE id IN (:a, :b)');
        $stmt->execute([':a' => (int) $task['assignee_id'], ':b' => $byUserId]);
        $users = [];
        foreach ($stmt->fetchAll() as $u) {
            $users[(int) $u['id']] = $u;
        }
        $to = $users[(int) $task['assignee_id']] ?? null;
        if ($to === null) {
            return;
        }
        $by   = $users[$byUserId]['name'] ?? 'Un membre de l\'équipe';
        $url  = rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/') . '/app.php?m=teamnest&p=task&id=' . (int) $task['id'];
        $text = $by . ' vous a assigné une tâche :' . "\n\n" . $task['title'] . "\n" . 'Projet : ' . $task['project_name'] . "\n"
              . ($task['due_date'] !== null ? 'Échéance : ' . Format::date((string) $task['due_date']) . "\n" : '')
              . "\n" . $url . "\n";
        SmtpMailer::fromConfig()->send((string) $to['email'], 'Tâche assignée : ' . str_replace(["\r", "\n"], ' ', (string) $task['title']),
            $text, '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">' . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>',
            'TeamNest', null);
    }

    public static function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            error_log('[TeamNest mail] ' . $e->getMessage());
        }
    }
}
