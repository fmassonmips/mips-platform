<?php
/**
 * E-mails the MIPS team (config ops.alert_email) about App\Ops\Health
 * problems: when one appears, every 24 hours while it lasts, and when it is
 * resolved. Run by tools/ops.php watchdog every 10 minutes.
 */
declare(strict_types=1);

namespace App\Ops;

use App\Database;
use App\Mail\SmtpMailer;

final class Alerts
{
    private const REPEAT_SECONDS = 24 * 3600;
    /** Database down: no table to remember what was sent, so at most one e-mail per hour (file stamp). */
    private const DB_DOWN_REPEAT = 3600;

    /** @return int exit code: 1 only when the alert could not be delivered */
    public static function run(): int
    {
        $problems = Health::problems();
        $to = trim((string) ($GLOBALS['config']['ops']['alert_email'] ?? ''));
        foreach ($problems as $text) {
            echo 'PROBLEM ', $text, "\n";
        }
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL) || !SmtpMailer::isConfigured()) {
            echo "ops.alert_email or e-mail not configured: no alert sent.\n";
            return $problems === [] ? 0 : 1;   // cron's own MAILTO is the only alert left
        }
        if (isset($problems['db'])) {
            return self::databaseDown($to, $problems['db']);
        }

        $pdo  = Database::connection();
        $open = [];
        foreach ($pdo->query('SELECT problem, notified_at FROM ops_alerts')->fetchAll() as $r) {
            $open[(string) $r['problem']] = $r['notified_at'] !== null ? (int) strtotime((string) $r['notified_at']) : null;
        }
        $now = date('Y-m-d H:i:s');
        $add = $pdo->prepare('INSERT IGNORE INTO ops_alerts (problem, since, notified_at) VALUES (:p, :s, NULL)');
        foreach (array_diff_key($problems, $open) as $key => $_) {
            $add->execute([':p' => $key, ':s' => $now]);
            $open[$key] = null;
        }
        $resolved = array_keys(array_diff_key($open, $problems));
        $due = array_filter($problems, static fn (string $k): bool => $open[$k] === null || time() - $open[$k] >= self::REPEAT_SECONDS, ARRAY_FILTER_USE_KEY);
        if ($due === [] && $resolved === []) {
            echo count($problems) . " problem(s), already reported.\n";
            return 0;
        }

        $lines = [];
        if ($problems !== []) {
            $lines[] = count($problems) === 1 ? 'Un problème en cours :' : count($problems) . ' problèmes en cours :';
            foreach ($problems as $key => $text) {
                $lines[] = '- ' . $text . ($open[$key] !== null && isset($due[$key]) ? ' (rappel : toujours en cours)' : '');
            }
            $lines[] = '';
        }
        if ($resolved !== []) {
            $lines[] = 'Résolu :';
            foreach ($resolved as $key) {
                $lines[] = '- ' . self::label($key);
            }
            $lines[] = '';
        }
        $subject = $problems !== []
            ? '[my.mips.mu] ' . (count($problems) === 1 ? '1 problème' : count($problems) . ' problèmes') . ' : ' . self::label((string) array_key_first($problems))
            : '[my.mips.mu] Résolu : ' . implode(', ', array_map([self::class, 'label'], $resolved));
        $body = implode("\n", $lines)
            . "Détail : php tools/ops.php status sur le serveur, et le journal des tâches planifiées (/var/log/mips/cron.log).\n";
        if (!self::send($to, $subject, $body)) {
            return 1;   // nothing marked as sent: the next run tries again
        }
        if ($due !== []) {
            $mark = $pdo->prepare('UPDATE ops_alerts SET notified_at = :n WHERE problem = :p');
            foreach (array_keys($due) as $key) {
                $mark->execute([':n' => $now, ':p' => $key]);
            }
        }
        if ($resolved !== []) {
            $del = $pdo->prepare('DELETE FROM ops_alerts WHERE problem = :p');
            foreach ($resolved as $key) {
                $del->execute([':p' => $key]);
            }
        }
        echo 'Alert sent to ' . $to . ': ' . count($due) . ' problem(s), ' . count($resolved) . " resolved.\n";
        return 0;
    }

    /** Short name of a problem key, for subjects and the "resolved" list. */
    public static function label(string $key): string
    {
        if ($key === 'db') {
            return 'base de données';
        }
        if ($key === 'disk') {
            return 'espace disque';
        }
        return explode(':', $key)[1] ?? $key;   // job:<name>:<what>
    }

    private static function databaseDown(string $to, string $text): int
    {
        $stamp = sys_get_temp_dir() . '/mips-ops-db-down';
        if (is_file($stamp) && time() - (int) filemtime($stamp) < self::DB_DOWN_REPEAT) {
            echo "Database down, already reported within the hour.\n";
            return 0;
        }
        if (!self::send($to, '[my.mips.mu] Base de données injoignable', $text . "\nLe site ne fonctionne pas tant qu’elle ne répond pas.\n")) {
            return 1;
        }
        touch($stamp);
        return 0;
    }

    private static function send(string $to, string $subject, string $text): bool
    {
        try {
            SmtpMailer::fromConfig()->send($to, $subject, $text,
                '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">' . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>',
                'my.mips.mu');
            return true;
        } catch (\Throwable $e) {
            error_log('[Alerts] ' . $e->getMessage());
            echo 'Alert e-mail failed: ', $e->getMessage(), "\n";
            return false;
        }
    }
}
