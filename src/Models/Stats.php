<?php
/**
 * Dashboard aggregates.
 * Read-only summary queries for the overview page.
 */
declare(strict_types=1);

namespace App\Models;

use App\Database;

final class Stats
{
    /**
     * @return array<string,mixed>
     */
    public static function overview(): array
    {
        $db = Database::connection();

        $clientsCount   = (int) $db->query('SELECT COUNT(*) FROM clients')->fetchColumn();
        $activeContracts = (int) $db->query("SELECT COUNT(*) FROM contracts WHERE status = 'active'")->fetchColumn();

        $row = $db->query(
            "SELECT
                COALESCE(SUM(premium), 0) AS total_premium,
                COALESCE(SUM(premium * commission_rate / 100), 0) AS est_commission
             FROM contracts WHERE status = 'active'"
        )->fetch();

        $openQuotes = (int) $db->query(
            "SELECT COUNT(*) FROM quotes WHERE status IN ('new','in_progress')"
        )->fetchColumn();

        // Quotes grouped by status.
        $byStatus = ['new' => 0, 'in_progress' => 0, 'converted' => 0, 'declined' => 0];
        foreach ($db->query('SELECT status, COUNT(*) AS n FROM quotes GROUP BY status')->fetchAll() as $r) {
            $byStatus[(string) $r['status']] = (int) $r['n'];
        }

        return [
            'clients_count'    => $clientsCount,
            'active_contracts' => $activeContracts,
            'total_premium'    => (float) $row['total_premium'],
            'est_commission'   => (float) $row['est_commission'],
            'open_quotes'      => $openQuotes,
            'quotes_by_status' => $byStatus,
            'upcoming'         => self::upcomingExpirations(),
            'recent_quotes'    => self::recentQuotes(),
        ];
    }

    /**
     * Active policies expiring within the next 60 days (and any overdue ones),
     * soonest first — feeds the renewal/expiry alerts panel.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function upcomingExpirations(int $days = 60): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT ct.id, ct.policy_number, ct.insurer, ct.type, ct.end_date, ct.premium,
                    c.name AS client_name,
                    DATEDIFF(ct.end_date, CURDATE()) AS days_left
               FROM contracts ct
               JOIN clients c ON c.id = ct.client_id
              WHERE ct.status = 'active'
                AND ct.end_date <= DATE_ADD(CURDATE(), INTERVAL :days DAY)
              ORDER BY ct.end_date ASC
              LIMIT 50"
        );
        $stmt->bindValue(':days', $days, \PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /**
     * @return array<int,array<string,mixed>>
     */
    public static function recentQuotes(int $limit = 8): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT q.id, q.reference, q.type, q.status, q.estimated_premium, q.created_at,
                    c.name AS client_name
               FROM quotes q
               JOIN clients c ON c.id = q.client_id
              ORDER BY q.created_at DESC
              LIMIT :lim'
        );
        $stmt->bindValue(':lim', $limit, \PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }
}
