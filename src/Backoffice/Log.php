<?php
/**
 * Back-office action log: who in the MIPS team did what to which company,
 * and the notes they leave on a company. Append-only.
 */
declare(strict_types=1);

namespace App\Backoffice;

use App\Database;

final class Log
{
    public const ACTIONS = [
        'subscribe' => 'Abonnement',
        'end'       => 'Fin d’abonnement',
        'extend'    => 'Essai prolongé',
        'suspend'   => 'Suspension',
        'unsuspend' => 'Réactivation',
        'note'      => 'Note',
        'export'    => 'Export des données',
        'reopen'    => 'Fermeture annulée',
        'purge'     => 'Entreprise supprimée',
    ];

    public static function add(?int $staffId, ?int $orgId, string $action, string $detail): void   // staff null: automatic
    {
        Database::connection()->prepare(
            'INSERT INTO backoffice_log (staff_user_id, organization_id, action, detail, created_at) VALUES (:s, :o, :a, :d, NOW())'
        )->execute([':s' => $staffId, ':o' => $orgId, ':a' => $action, ':d' => mb_substr($detail, 0, 1000)]);
    }

    /**
     * Latest entries, for one company or all.
     *
     * @return list<array<string,mixed>>
     */
    public static function recent(?int $orgId, int $limit = 50): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT l.action, l.detail, l.created_at, l.organization_id, o.name AS organization_name,
                    COALESCE(NULLIF(u.name, \'\'), u.email, \'Automatique\') AS staff_name
             FROM backoffice_log l
             LEFT JOIN users u ON u.id = l.staff_user_id
             LEFT JOIN organizations o ON o.id = l.organization_id'
            . ($orgId !== null ? ' WHERE l.organization_id = :o' : '')
            . ' ORDER BY l.id DESC LIMIT ' . max(1, min(200, $limit))
        );
        $stmt->execute($orgId !== null ? [':o' => $orgId] : []);
        return $stmt->fetchAll();
    }
}
