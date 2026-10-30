<?php
/**
 * Back-office view of the companies: follow-up of trials and subscriptions,
 * usage, suspension. Every change is written to the back-office log.
 *
 * Subscriptions stay manual until online billing exists: "subscribe" makes an
 * app fully usable with no end date, "end" turns it read-only (data kept),
 * "extend" gives a trial more days (also reopens a read-only app as a trial).
 */
declare(strict_types=1);

namespace App\Backoffice;

use App\Database;
use App\Suite\Catalog;

final class Companies
{
    public const FILTERS = [
        'all'       => 'Toutes',
        'ending'    => 'Essai finissant sous 7 jours',
        'read_only' => 'En lecture seule',
        'customers' => 'Abonnées',
        'inactive'  => 'Sans connexion depuis 14 jours',
        'suspended' => 'Suspendues',
        'closing'   => 'Fermeture demandée',
    ];

    public const MAX_EXTEND_DAYS = 90;

    /** Main record of each app, to show activity: table, label (singular, plural). */
    private const USAGE = [
        'facturo'     => ['facturo_documents', 'document', 'documents'],
        'clientbloom' => ['clientbloom_transactions', 'opération de caisse', 'opérations de caisse'],
        'rendezvous'  => ['rendezvous_appointments', 'rendez-vous', 'rendez-vous'],
        'formelio'    => ['formelio_responses', 'réponse', 'réponses'],
        'flowdesk'    => ['flowdesk_tickets', 'ticket', 'tickets'],
        'teamnest'    => ['teamnest_tasks', 'tâche', 'tâches'],
        'shoplokal'   => ['shoplokal_orders', 'commande', 'commandes'],
        'staffzen'    => ['staffzen_requests', 'demande de congé', 'demandes de congé'],
        'bookora'     => ['bookora_bookings', 'réservation', 'réservations'],
    ];

    /**
     * Headline figures for the back-office home.
     *
     * @return array<string,int>
     */
    public static function kpis(): array
    {
        $row = Database::connection()->query(
            'SELECT
               (SELECT COUNT(*) FROM organizations) AS companies,
               (SELECT COUNT(*) FROM organizations WHERE created_at >= NOW() - INTERVAL 30 DAY) AS new_30d,
               (SELECT COUNT(DISTINCT ou.organization_id) FROM organization_users ou JOIN users u ON u.id = ou.user_id
                 WHERE u.last_login_at >= NOW() - INTERVAL 7 DAY) AS active_7d,
               (SELECT COUNT(*) FROM organization_modules WHERE status = \'trial\' AND trial_ends_at > NOW()) AS trials,
               (SELECT COUNT(*) FROM organization_modules WHERE status = \'trial\' AND trial_ends_at > NOW()
                 AND trial_ends_at <= NOW() + INTERVAL 7 DAY) AS ending_7d,
               (SELECT COUNT(*) FROM organization_modules WHERE status = \'active\') AS subscriptions,
               (SELECT COUNT(DISTINCT organization_id) FROM organization_modules WHERE status = \'active\') AS customers'
        )->fetch();
        return array_map('intval', (array) $row);
    }

    /**
     * @return list<array<string,mixed>>
     */
    public static function list(string $filter, string $search): array
    {
        $having = match ($filter) {
            'ending'    => 'HAVING next_trial_end IS NOT NULL AND next_trial_end <= NOW() + INTERVAL 7 DAY',
            'read_only' => 'HAVING read_only > 0',
            'customers' => 'HAVING subscribed > 0',
            'inactive'  => 'HAVING last_login_at IS NULL OR last_login_at < NOW() - INTERVAL 14 DAY',
            'suspended' => 'HAVING suspended_at IS NOT NULL',
            'closing'   => 'HAVING deletion_scheduled_at IS NOT NULL',
            default     => '',
        };
        $where  = '';
        $params = [];
        if ($search !== '') {
            $where = 'WHERE o.name LIKE :q1 OR o.legal_name LIKE :q2 OR o.brn LIKE :q3
                      OR EXISTS (SELECT 1 FROM organization_users x JOIN users xu ON xu.id = x.user_id WHERE x.organization_id = o.id AND xu.email LIKE :q4)';
            $like   = '%' . addcslashes($search, '%_\\') . '%';
            $params = [':q1' => $like, ':q2' => $like, ':q3' => $like, ':q4' => $like];
        }
        $stmt = Database::connection()->prepare(
            'SELECT o.id, o.name, o.created_at, o.suspended_at, o.deletion_scheduled_at,
                    (SELECT u.email FROM organization_users ou JOIN users u ON u.id = ou.user_id
                      WHERE ou.organization_id = o.id ORDER BY ou.role = \'owner\' DESC, ou.created_at LIMIT 1) AS owner_email,
                    (SELECT COUNT(*) FROM organization_users ou WHERE ou.organization_id = o.id) AS members,
                    (SELECT MAX(u.last_login_at) FROM organization_users ou JOIN users u ON u.id = ou.user_id
                      WHERE ou.organization_id = o.id) AS last_login_at,
                    COALESCE(SUM(m.status = \'trial\' AND m.trial_ends_at > NOW()), 0) AS trials,
                    COALESCE(SUM(m.status = \'trial\' AND m.trial_ends_at <= NOW()), 0) AS read_only,
                    COALESCE(SUM(m.status = \'active\'), 0) AS subscribed,
                    MIN(CASE WHEN m.status = \'trial\' AND m.trial_ends_at > NOW() THEN m.trial_ends_at END) AS next_trial_end
             FROM organizations o
             LEFT JOIN organization_modules m ON m.organization_id = o.id
             ' . $where . '
             GROUP BY o.id ' . $having . '
             ORDER BY o.created_at DESC
             LIMIT 500'
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function find(int $orgId): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, name, legal_name, brn, vat_number, address, email, phone, created_at, suspended_at, suspended_reason, mra_enabled, deletion_scheduled_at
             FROM organizations WHERE id = :id'
        );
        $stmt->execute([':id' => $orgId]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * @return list<array<string,mixed>>
     */
    public static function members(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT u.id, u.name, u.email, u.is_active, u.last_login_at, ou.role, ou.created_at AS joined_at
             FROM organization_users ou JOIN users u ON u.id = ou.user_id
             WHERE ou.organization_id = :o
             ORDER BY FIELD(ou.role, \'owner\', \'admin\', \'member\'), ou.created_at'
        );
        $stmt->execute([':o' => $orgId]);
        return $stmt->fetchAll();
    }

    /**
     * Every app of the catalogue with its state for the company and its usage.
     *
     * @return list<array{slug:string,name:string,state:string,activated_at:?string,trial_ends_at:?string,usage_label:?string,total:int,last_30d:int}>
     */
    public static function apps(int $orgId): array
    {
        $pdo  = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT module_slug, status, activated_at, trial_ends_at, trial_ends_at <= NOW() AS ended
             FROM organization_modules WHERE organization_id = :o'
        );
        $stmt->execute([':o' => $orgId]);
        $rows = [];
        foreach ($stmt->fetchAll() as $r) {
            $rows[(string) $r['module_slug']] = $r;
        }
        $out = [];
        foreach (Catalog::all() as $slug => $meta) {
            $r     = $rows[$slug] ?? null;
            $state = match (true) {
                $r === null                 => 'off',
                $r['status'] === 'active'   => 'subscribed',
                $r['status'] === 'disabled' => 'disabled',
                (int) $r['ended'] === 1     => 'read_only',
                default                     => 'trial',
            };
            $total = 0;
            $last  = 0;
            if (isset(self::USAGE[$slug]) && $r !== null) {
                $table = self::USAGE[$slug][0];   // constant table name, never input
                $u = $pdo->prepare("SELECT COUNT(*) AS total, COALESCE(SUM(created_at >= NOW() - INTERVAL 30 DAY), 0) AS last_30d FROM $table WHERE organization_id = :o");
                $u->execute([':o' => $orgId]);
                $c     = $u->fetch();
                $total = (int) $c['total'];
                $last  = (int) $c['last_30d'];
            }
            $out[] = [
                'slug' => $slug, 'name' => (string) $meta['name'], 'state' => $state,
                'activated_at' => $r['activated_at'] ?? null, 'trial_ends_at' => $r['trial_ends_at'] ?? null,
                'usage_label' => isset(self::USAGE[$slug]) ? self::USAGE[$slug][$last > 1 ? 2 : 1] : null, 'total' => $total, 'last_30d' => $last,
            ];
        }
        return $out;
    }

    /**
     * Subscribe the company to an app (or all its switched-on apps): fully usable, no end date.
     *
     * @return ?string error
     */
    public static function subscribe(int $staffId, int $orgId, string $slug): ?string
    {
        $slugs = self::slugs($orgId, $slug, false);
        if (is_string($slugs)) {
            return $slugs;
        }
        $stmt = Database::connection()->prepare(
            'INSERT INTO organization_modules (organization_id, module_slug, status, trial_ends_at) VALUES (:o, :s, \'active\', NULL)
             ON DUPLICATE KEY UPDATE status = \'active\', trial_ends_at = NULL'
        );
        foreach ($slugs as $s) {
            $stmt->execute([':o' => $orgId, ':s' => $s]);
        }
        Log::add($staffId, $orgId, 'subscribe', self::names($slugs));
        return null;
    }

    /**
     * End a subscription: the app turns read-only at once, its data is kept.
     *
     * @return ?string error
     */
    public static function end(int $staffId, int $orgId, string $slug): ?string
    {
        $slugs = self::slugs($orgId, $slug, true);
        if (is_string($slugs)) {
            return $slugs;
        }
        $stmt = Database::connection()->prepare(
            'UPDATE organization_modules SET status = \'trial\', trial_ends_at = NOW()
             WHERE organization_id = :o AND module_slug = :s AND status = \'active\''
        );
        $done = [];
        foreach ($slugs as $s) {
            $stmt->execute([':o' => $orgId, ':s' => $s]);
            if ($stmt->rowCount() === 1) {
                $done[] = $s;
            }
        }
        if ($done === []) {
            return 'Aucun abonnement en cours pour cette app.';
        }
        Log::add($staffId, $orgId, 'end', self::names($done));
        return null;
    }

    /**
     * More trial days for an app in trial or read-only (counted from today when the trial is over).
     *
     * @return ?string error
     */
    public static function extend(int $staffId, int $orgId, string $slug, int $days, string $reason): ?string
    {
        if ($days < 1 || $days > self::MAX_EXTEND_DAYS) {
            return 'Entre 1 et ' . self::MAX_EXTEND_DAYS . ' jours.';
        }
        if (Catalog::get($slug) === null) {
            return 'App inconnue.';
        }
        $stmt = Database::connection()->prepare(
            'UPDATE organization_modules
             SET trial_ends_at = DATE_ADD(GREATEST(COALESCE(trial_ends_at, NOW()), NOW()), INTERVAL :d DAY)
             WHERE organization_id = :o AND module_slug = :s AND status = \'trial\''
        );
        $stmt->execute([':d' => $days, ':o' => $orgId, ':s' => $slug]);
        if ($stmt->rowCount() !== 1) {
            return 'Seul un essai en cours ou terminé se prolonge (app abonnée, éteinte ou jamais activée).';
        }
        Log::add($staffId, $orgId, 'extend', self::names([$slug]) . ' : +' . $days . ' j' . ($reason !== '' ? ' — ' . $reason : ''));
        return null;
    }

    /**
     * Members can no longer log in (open sessions end), public pages close; data is kept.
     *
     * @param array<string,mixed> $staff
     * @return ?string error
     */
    public static function suspend(array $staff, int $orgId, string $reason): ?string
    {
        if ($reason === '') {
            return 'Indiquez la raison (elle est montrée aux membres à la connexion).';
        }
        $mine = Database::connection()->prepare('SELECT COUNT(*) FROM organization_users WHERE organization_id = :o AND user_id = :u');
        $mine->execute([':o' => $orgId, ':u' => (int) $staff['id']]);
        if ((int) $mine->fetchColumn() > 0) {
            return 'Vous êtes membre de cette entreprise : vous vous couperiez l’accès.';
        }
        $stmt = Database::connection()->prepare(
            'UPDATE organizations SET suspended_at = NOW(), suspended_reason = :r WHERE id = :o AND suspended_at IS NULL'
        );
        $stmt->execute([':r' => mb_substr($reason, 0, 300), ':o' => $orgId]);
        if ($stmt->rowCount() !== 1) {
            return 'Entreprise introuvable ou déjà suspendue.';
        }
        Log::add((int) $staff['id'], $orgId, 'suspend', $reason);
        return null;
    }

    public static function unsuspend(int $staffId, int $orgId): ?string
    {
        $stmt = Database::connection()->prepare(
            'UPDATE organizations SET suspended_at = NULL, suspended_reason = NULL WHERE id = :o AND suspended_at IS NOT NULL'
        );
        $stmt->execute([':o' => $orgId]);
        if ($stmt->rowCount() !== 1) {
            return 'Cette entreprise n’est pas suspendue.';
        }
        Log::add($staffId, $orgId, 'unsuspend', '');
        return null;
    }

    /** Cancel a closing requested by the owner (they asked by phone, wrong click…). */
    public static function reopen(int $staffId, int $orgId): ?string
    {
        $error = \App\Suite\Closure::cancel($orgId);
        if ($error === null) {
            Log::add($staffId, $orgId, 'reopen', '');
        }
        return $error;
    }

    public static function note(int $staffId, int $orgId, string $text): ?string
    {
        if ($text === '') {
            return 'Note vide.';
        }
        Log::add($staffId, $orgId, 'note', $text);
        return null;
    }

    /**
     * Slugs targeted by an action: one app, or "all" = every app switched on for the company.
     *
     * @return list<string>|string slugs or error
     */
    private static function slugs(int $orgId, string $slug, bool $subscribedOnly): array|string
    {
        if ($slug !== 'all') {
            return Catalog::get($slug) === null ? 'App inconnue.' : [$slug];
        }
        $stmt = Database::connection()->prepare(
            'SELECT module_slug FROM organization_modules WHERE organization_id = :o AND '
            . ($subscribedOnly ? 'status = \'active\'' : 'status <> \'disabled\'')
        );
        $stmt->execute([':o' => $orgId]);
        $slugs = array_values(array_filter(array_map('strval', $stmt->fetchAll(\PDO::FETCH_COLUMN)), static fn (string $s): bool => Catalog::get($s) !== null));
        return $slugs === [] ? 'Aucune app concernée.' : $slugs;
    }

    /**
     * @param list<string> $slugs
     */
    private static function names(array $slugs): string
    {
        return implode(', ', array_map(static fn (string $s): string => (string) (Catalog::get($s)['name'] ?? $s), $slugs));
    }
}
