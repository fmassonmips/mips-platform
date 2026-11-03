<?php
/**
 * Closure requests, cancellations and deletions, written to a file OUTSIDE the
 * database (config ops.closure_journal), so that they survive a database restore.
 *
 * A restore puts back the database as it was on the night of the backup: a company
 * deleted since comes back, a closure requested since is forgotten, one cancelled
 * since is due again. tools/replay_closures.php reads this journal after a restore
 * and puts each company back in the state its owner last asked for.
 *
 * One JSON object per line: {"at","event":"request|cancel|purge","org","created","scheduled"}.
 * A company is matched by id AND creation date, so an id reused later is never touched.
 * The journal holds no personal data (ids and dates only).
 */
declare(strict_types=1);

namespace App\Suite;

use App\Database;

final class ClosureJournal
{
    public static function path(): string
    {
        return (string) ($GLOBALS['config']['ops']['closure_journal'] ?? '');
    }

    /** Can the journal be written? (tools/purge_companies.php fails when it cannot, so the supervision alerts.) */
    public static function writable(): bool
    {
        $path = self::path();
        if ($path === '') {
            return false;
        }
        return is_file($path) ? is_writable($path) : is_dir(dirname($path)) && is_writable(dirname($path));
    }

    /**
     * Append one event. Never throws: a journal that cannot be written must not block a
     * closure; the error goes to the PHP log and the daily purge reports it.
     *
     * @param 'request'|'cancel'|'purge' $event
     */
    public static function record(string $event, int $orgId, ?string $created, ?string $scheduled): bool
    {
        $path = self::path();
        if ($path === '') {
            return false;
        }
        $line = json_encode([
            'at' => date('Y-m-d H:i:s'), 'event' => $event, 'org' => $orgId, 'created' => $created, 'scheduled' => $scheduled,
        ], JSON_UNESCAPED_SLASHES) . "\n";
        $ok = @file_put_contents($path, $line, FILE_APPEND | LOCK_EX) === strlen($line);
        if (!$ok) {
            error_log('[ClosureJournal] cannot write ' . $path . ' (' . $event . ' #' . $orgId . ')');
        }
        return $ok;
    }

    /**
     * created_at and deletion_scheduled_at of a company, read before it changes or disappears.
     *
     * @return array{created:?string,scheduled:?string}
     */
    public static function state(int $orgId): array
    {
        $stmt = Database::connection()->prepare('SELECT created_at, deletion_scheduled_at FROM organizations WHERE id = :o');
        $stmt->execute([':o' => $orgId]);
        $row = $stmt->fetch();
        return ['created' => is_array($row) ? (string) $row['created_at'] : null,
                'scheduled' => is_array($row) && $row['deletion_scheduled_at'] !== null ? (string) $row['deletion_scheduled_at'] : null];
    }

    /**
     * After a restore: put every company back in the state of its last journal event,
     * then delete the ones whose date has passed. Returns one line per change.
     *
     * @return list<string>
     */
    public static function replay(bool $dryRun): array
    {
        $path = self::path();
        if ($path === '' || !is_file($path)) {
            return ['Aucun journal des fermetures (' . ($path === '' ? 'ops.closure_journal vide' : $path) . ') : rien à rejouer.'];
        }
        $last = [];
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $e = json_decode($line, true);
            if (is_array($e) && isset($e['event'], $e['org']) && in_array($e['event'], ['request', 'cancel', 'purge'], true)) {
                $last[(int) $e['org']] = $e;   // later lines win
            }
        }
        $pdo = Database::connection();
        $out = [];
        foreach ($last as $orgId => $e) {
            $now = self::state($orgId);
            if ($now['created'] === null || $now['created'] !== ($e['created'] ?? null)) {
                continue;   // not in this database, or another company that reused the id
            }
            $want = $e['event'] === 'cancel' ? null : (is_string($e['scheduled'] ?? null) ? $e['scheduled'] : null);
            if ($e['event'] !== 'cancel' && $want === null) {
                continue;
            }
            if ($want !== $now['scheduled']) {
                $out[] = '#' . $orgId . ' : ' . match ($e['event']) {
                    'cancel'  => 'fermeture annulée le ' . $e['at'] . ', remise à zéro',
                    'request' => 'fermeture demandée le ' . $e['at'] . ', suppression prévue le ' . $want,
                    'purge'   => 'supprimée le ' . $e['at'] . ' après la sauvegarde',
                };
                if (!$dryRun) {
                    $pdo->prepare('UPDATE organizations SET deletion_scheduled_at = :s WHERE id = :o')->execute([':s' => $want, ':o' => $orgId]);
                }
            } elseif ($e['event'] === 'purge') {
                $out[] = '#' . $orgId . ' : supprimée le ' . $e['at'] . ' après la sauvegarde';
            }
        }
        if ($dryRun) {
            return $out;
        }
        $due = $pdo->query('SELECT id FROM organizations WHERE deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at <= NOW()')->fetchAll(\PDO::FETCH_COLUMN);
        foreach ($due as $orgId) {
            if (Closure::purge((int) $orgId, false)) {
                $out[] = '#' . $orgId . ' : supprimée de nouveau.';
            }
        }
        return $out;
    }
}
