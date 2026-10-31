<?php
/**
 * Module activation per organization.
 *
 * Public API:
 *  - Modules::enabledFor(orgId)          : slug => row for every non-expired activation
 *  - Modules::isEnabled(orgId, slug)     : true when the module is usable by the org (it can write)
 *  - Modules::readOnlyFor(orgId)         : slug => trial end, for modules whose trial is over (read-only)
 *  - Modules::isReadable(orgId, slug)    : enabled or read-only: its pages open, its data can be viewed and exported
 *  - Modules::trialEndedFor(orgId)       : slugs whose free trial is over (cannot be restarted)
 *  - Modules::activate(orgId, slug)      : start a trial; a module whose trial is over comes back read-only
 *  - Modules::deactivate(orgId, slug)    : switch the module off
 *  - Modules::require(user, slug)        : enforce access to a module page, returns the org or exits
 *
 * When a trial ends the module turns read-only, it is not switched off: pages,
 * printing and exports keep working; every write goes through ModuleApi or
 * isEnabled() and is refused; public pages that take orders or bookings close.
 */
declare(strict_types=1);

namespace App\Suite;

use App\Database;

final class Modules
{
    /**
     * @return array<string,array{status:string,activated_at:string,trial_ends_at:?string}>
     */
    public static function enabledFor(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT module_slug, status, activated_at, trial_ends_at
             FROM organization_modules
             WHERE organization_id = :oid
               AND status <> \'disabled\'
               AND (status = \'active\' OR trial_ends_at IS NULL OR trial_ends_at > NOW())'
        );
        $stmt->execute([':oid' => $orgId]);

        $enabled = [];
        foreach ($stmt->fetchAll() as $row) {
            $enabled[(string) $row['module_slug']] = [
                'status'        => (string) $row['status'],
                'activated_at'  => (string) $row['activated_at'],
                'trial_ends_at' => $row['trial_ends_at'] !== null ? (string) $row['trial_ends_at'] : null,
            ];
        }
        return $enabled;
    }

    public static function isEnabled(int $orgId, string $slug): bool
    {
        return isset(self::enabledFor($orgId)[$slug]);
    }

    /**
     * Modules switched on whose trial is over and that are not subscribed.
     *
     * @return array<string,string> slug => trial end
     */
    public static function readOnlyFor(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT module_slug, trial_ends_at FROM organization_modules
             WHERE organization_id = :oid AND status = \'trial\' AND trial_ends_at IS NOT NULL AND trial_ends_at <= NOW()'
        );
        $stmt->execute([':oid' => $orgId]);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(string) $r['module_slug']] = (string) $r['trial_ends_at'];
        }
        return $out;
    }

    public static function isReadOnly(int $orgId, string $slug): bool
    {
        return isset(self::readOnlyFor($orgId)[$slug]);
    }

    public static function isReadable(int $orgId, string $slug): bool
    {
        return self::isEnabled($orgId, $slug) || self::isReadOnly($orgId, $slug);
    }

    /**
     * @return list<string>
     */
    public static function trialEndedFor(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT module_slug FROM organization_modules
             WHERE organization_id = :oid AND status <> \'active\'
               AND trial_ends_at IS NOT NULL AND trial_ends_at <= NOW()'
        );
        $stmt->execute([':oid' => $orgId]);
        return array_map('strval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    }

    public static function activate(int $orgId, string $slug): void
    {
        // Re-activating restores the existing row: a trial is never reset or extended.
        Database::connection()->prepare(
            'INSERT INTO organization_modules (organization_id, module_slug, status, trial_ends_at)
             VALUES (:oid, :slug, \'trial\', DATE_ADD(NOW(), INTERVAL :days DAY))
             ON DUPLICATE KEY UPDATE status = IF(trial_ends_at IS NULL, \'active\', \'trial\')'
        )->execute([':oid' => $orgId, ':slug' => $slug, ':days' => Catalog::TRIAL_DAYS]);
    }

    public static function deactivate(int $orgId, string $slug): void
    {
        Database::connection()->prepare(
            'UPDATE organization_modules SET status = \'disabled\' WHERE organization_id = :oid AND module_slug = :slug'
        )->execute([':oid' => $orgId, ':slug' => $slug]);
    }

    /**
     * Enforce that the user's organization can open the module (enabled or read-only).
     * Unknown or disabled modules send the user back to the launcher.
     *
     * @param array<string,mixed> $user
     * @return array{id:int,name:string,role:string}
     */
    public static function require(array $user, string $slug): array
    {
        $org = Tenant::forUser($user);

        if (Catalog::get($slug) === null || !self::isReadable($org['id'], $slug)) {
            header('Location: /dashboard.php');
            exit;
        }

        return $org;
    }
}
