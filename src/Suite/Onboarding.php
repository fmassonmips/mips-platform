<?php
/**
 * First steps of a new company: the « Bien démarrer » checklist on the
 * dashboard (owner/admin), until every step is done or it is hidden. Each
 * step is read from the data, never ticked by hand.
 */
declare(strict_types=1);

namespace App\Suite;

use App\Database;

final class Onboarding
{
    /**
     * The checklist, or null when it is not shown (done, hidden, or a member).
     *
     * @param array{id:int,name:string,role:string} $org
     * @return list<array{label:string,done:bool,url:string,cta:string}>|null
     */
    public static function checklist(array $org): ?array
    {
        if (!Tenant::canManage($org)) {
            return null;
        }
        $row = Database::connection()->prepare(
            'SELECT o.onboarded_at,
                    (o.legal_name IS NOT NULL AND o.legal_name <> \'\' AND o.brn IS NOT NULL AND o.brn <> \'\') AS profile,
                    (SELECT COUNT(*) FROM organization_modules m WHERE m.organization_id = o.id AND m.status <> \'disabled\') AS apps,
                    (SELECT COUNT(*) FROM organization_users u WHERE u.organization_id = o.id)
                      + (SELECT COUNT(*) FROM organization_invitations i WHERE i.organization_id = o.id) AS people,
                    (SELECT COUNT(*) FROM facturo_clients c WHERE c.organization_id = o.id)
                      + (SELECT COUNT(*) FROM clientbloom_customers b WHERE b.organization_id = o.id)
                      + (SELECT COUNT(*) FROM shoplokal_products p WHERE p.organization_id = o.id) AS data
             FROM organizations o WHERE o.id = :o'
        );
        $row->execute([':o' => $org['id']]);
        $r = $row->fetch();
        if (!is_array($r) || $r['onboarded_at'] !== null) {
            return null;
        }
        $import = self::importUrl($org['id']);
        $steps = [
            ['label' => 'Compléter le profil de l’entreprise (raison sociale, BRN : imprimés sur vos documents)', 'done' => (int) $r['profile'] === 1, 'url' => '/welcome.php', 'cta' => 'Compléter'],
            ['label' => 'Choisir vos apps (30 jours d’essai gratuit chacune)', 'done' => (int) $r['apps'] > 0, 'url' => '/welcome.php?step=2', 'cta' => 'Choisir'],
            ['label' => 'Inviter votre équipe', 'done' => (int) $r['people'] > 1, 'url' => '/team.php', 'cta' => 'Inviter'],
            ['label' => 'Importer vos clients ou vos produits depuis Excel', 'done' => (int) $r['data'] > 0, 'url' => $import ?? '/welcome.php?step=2', 'cta' => $import !== null ? 'Importer' : 'Activer une app d’abord'],
        ];
        if (!in_array(false, array_column($steps, 'done'), true)) {
            self::complete($org['id']);   // all done: the checklist goes away for good
            return null;
        }
        return $steps;
    }

    /** Hide the checklist (all done, or « Masquer »). */
    public static function complete(int $orgId): void
    {
        Database::connection()->prepare('UPDATE organizations SET onboarded_at = NOW() WHERE id = :o AND onboarded_at IS NULL')
            ->execute([':o' => $orgId]);
    }

    /** Import page of the first app that takes an import and is usable, or null. */
    private static function importUrl(int $orgId): ?string
    {
        foreach (Import::TYPES as $type => $def) {
            if (Modules::isEnabled($orgId, $def['app'])) {
                return '/import.php?type=' . $type;
            }
        }
        return null;
    }
}
