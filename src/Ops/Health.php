<?php
/**
 * Is the service healthy? The database answers, every scheduled job ran
 * recently and its last run succeeded, the disk is not full.
 *
 * Jobs report through tools/cron.sh (table ops_jobs). /health.php answers
 * 200 or 503 for an external monitor; tools/ops.php watchdog e-mails the
 * details (App\Ops\Alerts).
 */
declare(strict_types=1);

namespace App\Ops;

use App\Database;

final class Health
{
    /** Job => [longest normal gap between two successful runs (seconds), name in alerts]. */
    public const JOBS = [
        'mra_retry'            => [1800,      'Transmission des factures à la MRA (mra_retry)'],
        'rendezvous_reminders' => [3 * 3600,  'Rappels de rendez-vous (rendezvous_reminders)'],
        'bookora_ical_sync'    => [3 * 3600,  'Synchronisation des calendriers Bookora (bookora_ical_sync)'],
        'reminders'            => [26 * 3600, 'E-mails automatiques du matin (reminders)'],
        'clientbloom_expire'   => [26 * 3600, 'Expiration du cashback ClientBloom (clientbloom_expire)'],
        'purge_companies'      => [26 * 3600, 'Suppression des comptes fermés (purge_companies)'],
        'backup'               => [26 * 3600, 'Sauvegarde de la nuit (backup)'],
        'watchdog'             => [1800,      'Surveillance (watchdog)'],
    ];

    /** Below this share of free space, the disk is a problem. */
    private const MIN_FREE_DISK = 0.10;

    public static function record(string $job, int $exitCode): void
    {
        $now = date('Y-m-d H:i:s');
        Database::connection()->prepare(
            'INSERT INTO ops_jobs (job, last_run_at, last_exit, last_ok_at) VALUES (:j, :r, :e, :ok)
             ON DUPLICATE KEY UPDATE last_run_at = VALUES(last_run_at), last_exit = VALUES(last_exit),
                                     last_ok_at = COALESCE(VALUES(last_ok_at), last_ok_at)'
        )->execute([':j' => $job, ':r' => $now, ':e' => $exitCode, ':ok' => $exitCode === 0 ? $now : null]);
    }

    /**
     * Current problems, key => sentence (French, for the alert e-mail).
     *
     * @return array<string,string>
     */
    public static function problems(): array
    {
        $problems = [];
        try {
            $rows = Database::connection()->query('SELECT job, last_run_at, last_exit, last_ok_at FROM ops_jobs')->fetchAll();
        } catch (\Throwable $e) {
            error_log('[Health] database: ' . $e->getMessage());
            return ['db' => 'La base de données ne répond pas.'];
        }
        $byJob = [];
        foreach ($rows as $r) {
            $byJob[(string) $r['job']] = $r;
        }
        $skip = (array) ($GLOBALS['config']['ops']['skip_jobs'] ?? []);
        $now  = time();
        foreach (self::JOBS as $job => [$maxAge, $name]) {
            if (in_array($job, $skip, true)) {
                continue;
            }
            $r = $byJob[$job] ?? null;
            if ($r === null) {
                $problems['job:' . $job . ':never'] = $name . ' : n’a jamais tourné (tâche planifiée absente ?).';
                continue;
            }
            if ((int) $r['last_exit'] !== 0) {
                $problems['job:' . $job . ':failed'] = $name . ' : la dernière exécution (' . self::when((string) $r['last_run_at'])
                    . ') a échoué, code ' . (int) $r['last_exit'] . '. Voir le journal des tâches planifiées.';
            }
            $ok = $r['last_ok_at'] !== null ? strtotime((string) $r['last_ok_at']) : false;
            if ($ok === false || $now - $ok > $maxAge) {
                $problems['job:' . $job . ':stale'] = $name . ' : aucune exécution réussie depuis '
                    . ($ok === false ? 'le début' : 'le ' . self::when((string) $r['last_ok_at'])) . '.';
            }
        }
        $total = @disk_total_space(ROOT_PATH);
        $free  = @disk_free_space(ROOT_PATH);
        if ($total !== false && $free !== false && $total > 0 && $free / $total < self::MIN_FREE_DISK) {
            $problems['disk'] = sprintf('Disque presque plein : %d %% libre (%.1f Go).', (int) round(100 * $free / $total), $free / 1e9);
        }
        return $problems;
    }

    private static function when(string $dateTime): string
    {
        return date('d/m/Y H:i', (int) strtotime($dateTime));
    }
}
