<?php
/**
 * StaffZen e-mails (back office, in French): new request → managers; decision,
 * leave recorded or cancelled by a manager → the person; approved leave
 * cancelled by the person → managers.
 */
declare(strict_types=1);

namespace App\StaffZen;

use App\Database;
use App\Mail\SmtpMailer;

final class Notifier
{
    /**
     * @param array<string,mixed>|null $r
     */
    public static function requested(int $orgId, ?array $r): void
    {
        if ($r === null) {
            return;
        }
        $text = $r['user_name'] . ' demande un congé :' . "\n\n" . self::summary($r)
              . ($r['note'] !== null ? 'Message : ' . $r['note'] . "\n" : '') . "\n" . 'À valider : ' . self::url('approvals') . "\n";
        foreach (self::managers($orgId, (int) $r['user_id']) as $email) {
            self::send($email, 'Demande de congé : ' . $r['user_name'], $text);
        }
    }

    /**
     * @param array<string,mixed>|null $r
     */
    public static function recorded(int $orgId, ?array $r): void
    {
        if ($r === null || (int) $r['created_by'] === (int) $r['user_id']) {
            return;
        }
        $text = 'Bonjour ' . $r['user_name'] . ',' . "\n\n" . ($r['decided_by_name'] ?? 'Un responsable') . ' a enregistré une absence pour vous :' . "\n\n"
              . self::summary($r) . "\n" . 'Vos congés : ' . self::url('mine') . "\n";
        self::send((string) $r['user_email'], 'Absence enregistrée : ' . $r['type_name'], $text);
    }

    /**
     * @param array<string,mixed>|null $r
     */
    public static function decided(int $orgId, ?array $r): void
    {
        if ($r === null) {
            return;
        }
        $ok   = $r['status'] === 'approved';
        $text = 'Bonjour ' . $r['user_name'] . ',' . "\n\n" . 'Votre demande de congé est ' . ($ok ? 'accordée' : 'refusée')
              . ' par ' . ($r['decided_by_name'] ?? 'un responsable') . ' :' . "\n\n" . self::summary($r)
              . ($r['decision_note'] !== null ? 'Commentaire : ' . $r['decision_note'] . "\n" : '') . "\n" . 'Vos congés : ' . self::url('mine') . "\n";
        self::send((string) $r['user_email'], 'Congé ' . ($ok ? 'accordé' : 'refusé') . ' : ' . Leaves::period((string) $r['start_date'], (string) $r['end_date'], $r['half_day']), $text);
    }

    /**
     * @param array<string,mixed>|null $r approved leave just cancelled
     */
    public static function cancelled(int $orgId, int $actorId, ?array $r): void
    {
        if ($r === null) {
            return;
        }
        if ($actorId === (int) $r['user_id']) {
            $text = $r['user_name'] . ' a annulé un congé accordé :' . "\n\n" . self::summary($r) . "\n" . 'Planning : ' . self::url('planning') . "\n";
            foreach (self::managers($orgId, $actorId) as $email) {
                self::send($email, 'Congé annulé : ' . $r['user_name'], $text);
            }
            return;
        }
        $text = 'Bonjour ' . $r['user_name'] . ',' . "\n\n" . ($r['decided_by_name'] ?? 'Un responsable') . ' a annulé ce congé :' . "\n\n"
              . self::summary($r) . "\n" . 'Vos congés : ' . self::url('mine') . "\n";
        self::send((string) $r['user_email'], 'Congé annulé : ' . Leaves::period((string) $r['start_date'], (string) $r['end_date'], $r['half_day']), $text);
    }

    public static function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            error_log('[StaffZen mail] ' . $e->getMessage());
        }
    }

    /**
     * @param array<string,mixed> $r
     */
    private static function summary(array $r): string
    {
        return $r['type_name'] . ' · ' . Leaves::period((string) $r['start_date'], (string) $r['end_date'], $r['half_day'])
             . ' · ' . Leaves::days((int) $r['halfdays']) . ' ouvré' . ((int) $r['halfdays'] > 2 ? 's' : '') . "\n";
    }

    /**
     * Owners and admins' e-mails, except one person.
     *
     * @return list<string>
     */
    private static function managers(int $orgId, int $except): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT u.email FROM organization_users ou JOIN users u ON u.id = ou.user_id
             WHERE ou.organization_id = :oid AND ou.role IN (\'owner\', \'admin\') AND u.is_active = 1 AND u.id <> :x'
        );
        $stmt->execute([':oid' => $orgId, ':x' => $except]);
        return array_map('strval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    }

    private static function url(string $page): string
    {
        return rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/') . '/app.php?m=staffzen&p=' . $page;
    }

    private static function send(string $to, string $subject, string $text): void
    {
        if (!SmtpMailer::isConfigured()) {
            return;
        }
        SmtpMailer::fromConfig()->send($to, str_replace(["\r", "\n"], ' ', $subject), $text,
            '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">' . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>',
            'StaffZen', null);
    }
}
