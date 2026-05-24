<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\View;

class DashboardController
{
    public static function index(): void
    {
        $db = Database::getInstance();

        $agent       = $_SESSION['agent'] ?? [];
        $brokerageId = (int) ($agent['brokerage_id'] ?? 0);
        $agentId     = (int) ($agent['id'] ?? 0);
        $isAdmin     = ($agent['role'] ?? '') === 'admin';

        // KPIs
        $scope = $isAdmin
            ? ['brokerage_id = ?', [$brokerageId]]
            : ['brokerage_id = ? AND agent_id = ?', [$brokerageId, $agentId]];

        $activeCount = $db->fetchOne(
            "SELECT COUNT(*) c FROM policies WHERE status = 'active' AND {$scope[0]}",
            $scope[1]
        )['c'] ?? 0;

        $due30 = $db->fetchAll(
            "SELECT p.*, c.first_name, c.last_name, c.email, c.phone_whatsapp,
                    i.name AS insurer_name, ip.product_name
             FROM policies p
             JOIN clients c  ON c.id = p.client_id
             JOIN insurers i ON i.id = p.insurer_id
             LEFT JOIN insurer_products ip ON ip.id = p.insurer_product_id
             WHERE p.status = 'active'
               AND p.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
               AND p.{$scope[0]}
             ORDER BY p.end_date ASC
             LIMIT 20",
            $scope[1]
        );

        $revenueAtRisk = $db->fetchOne(
            "SELECT COALESCE(SUM(p.premium_amount), 0) total
             FROM policies p
             JOIN renewals r ON r.policy_id = p.id
             WHERE p.status = 'active'
               AND p.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 45 DAY)
               AND r.status NOT IN ('paid', 'cancelled')
               AND p.{$scope[0]}",
            $scope[1]
        )['total'] ?? 0;

        $pendingPayments = $db->fetchOne(
            "SELECT COUNT(*) c FROM payment_links pl
             JOIN policies p ON p.id = pl.policy_id
             WHERE pl.status = 'pending'
               AND p.{$scope[0]}",
            $scope[1]
        )['c'] ?? 0;

        // Recent clients
        $recentClients = $db->fetchAll(
            "SELECT * FROM clients WHERE {$scope[0]} ORDER BY created_at DESC LIMIT 5",
            $scope[1]
        );

        // Renewal pipeline summary
        $pipeline = $db->fetchAll(
            "SELECT r.status, COUNT(*) cnt, COALESCE(SUM(p.premium_amount), 0) total
             FROM renewals r
             JOIN policies p ON p.id = r.policy_id
             WHERE p.status IN ('active','lapsed')
               AND r.renewal_year = YEAR(CURDATE())
               AND p.{$scope[0]}
             GROUP BY r.status",
            $scope[1]
        );

        $pipelineMap = array_column($pipeline, null, 'status');

        View::render('dashboard/index', compact(
            'activeCount', 'due30', 'revenueAtRisk',
            'pendingPayments', 'recentClients', 'pipelineMap', 'isAdmin'
        ));
    }
}
