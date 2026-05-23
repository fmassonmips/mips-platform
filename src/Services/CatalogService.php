<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use InvalidArgumentException;

/**
 * Manages the insurance product catalog for the marketplace.
 *
 * Handles:
 *   - Insurer product creation and lifecycle
 *   - Rate table submission and admin approval workflow
 *   - Rating factor and discount management
 *   - Cover note template management
 *   - Catalog read queries for the quote engine and public display
 */
class CatalogService
{
    public function __construct(private readonly Database $db) {}

    // -----------------------------------------------------------------------
    // Product management (Insurer portal)
    // -----------------------------------------------------------------------

    /**
     * Create a new insurer product (status: inactive until rate table approved).
     */
    public function createProduct(int $insurerId, array $data): int
    {
        $this->validateProductData($data);

        $this->db->execute(
            "INSERT INTO insurer_products
                (insurer_id, product_type, product_name, description, is_active)
             VALUES (?, ?, ?, ?, 0)",
            [
                $insurerId,
                $data['product_type'],
                $data['product_name'],
                $data['description'] ?? null,
            ]
        );

        return (int) $this->db->lastInsertId();
    }

    /**
     * Submit a rate table for admin approval.
     * The rate table is inactive until an admin calls approveRateTable().
     */
    public function submitRateTable(int $insurerId, int $productId, array $data): int
    {
        // Verify product belongs to this insurer
        $product = $this->db->fetchOne(
            'SELECT id FROM insurer_products WHERE id = ? AND insurer_id = ?',
            [$productId, $insurerId]
        );

        if (!$product) {
            throw new InvalidArgumentException('Product not found or does not belong to this insurer.');
        }

        $this->db->execute(
            "INSERT INTO insurer_rate_tables
                (insurer_product_id, name, base_premium_annual, minimum_premium,
                 acceptance_rules_json, valid_from, valid_to, is_active,
                 submitted_by_insurer_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
            [
                $productId,
                $data['name'],
                $data['base_premium_annual'],
                $data['minimum_premium'] ?? 0,
                json_encode($data['acceptance_rules'] ?? []),
                $data['valid_from'],
                $data['valid_to'] ?? null,
                $insurerId,
            ]
        );

        $tableId = (int) $this->db->lastInsertId();

        // Attach rating factors if provided
        if (!empty($data['rating_factors'])) {
            foreach ($data['rating_factors'] as $order => $factor) {
                $this->addRatingFactor($tableId, $factor, $order + 1);
            }
        }

        // Attach discounts if provided
        if (!empty($data['discounts'])) {
            foreach ($data['discounts'] as $discount) {
                $this->addDiscount($tableId, $discount);
            }
        }

        return $tableId;
    }

    public function addRatingFactor(int $tableId, array $factor, int $order): int
    {
        $this->db->execute(
            "INSERT INTO rating_factors
                (rate_table_id, factor_name, factor_label_en, factor_label_fr,
                 factor_type, apply_order, rules_json, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
            [
                $tableId,
                $factor['factor_name'],
                $factor['label_en'] ?? $factor['factor_name'],
                $factor['label_fr'] ?? null,
                $factor['factor_type'],
                $order,
                json_encode($factor['rules']),
            ]
        );

        return (int) $this->db->lastInsertId();
    }

    public function addDiscount(int $tableId, array $discount): int
    {
        $this->db->execute(
            "INSERT INTO rating_discounts
                (rate_table_id, discount_name, discount_label_en, discount_label_fr,
                 discount_type, discount_value, condition_json, max_cumulative_pct, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
            [
                $tableId,
                $discount['discount_name'],
                $discount['label_en'] ?? $discount['discount_name'],
                $discount['label_fr'] ?? null,
                $discount['discount_type'],
                $discount['discount_value'],
                json_encode($discount['condition'] ?? []),
                $discount['max_cumulative_pct'] ?? 50,
            ]
        );

        return (int) $this->db->lastInsertId();
    }

    // -----------------------------------------------------------------------
    // Admin approval workflow
    // -----------------------------------------------------------------------

    /**
     * Approve a rate table (admin only).
     * Activates the table, deactivates previous active table for same product.
     */
    public function approveRateTable(int $tableId, int $adminUserId): void
    {
        $table = $this->db->fetchOne(
            'SELECT insurer_product_id FROM insurer_rate_tables WHERE id = ?',
            [$tableId]
        );

        if (!$table) {
            throw new InvalidArgumentException('Rate table not found: ' . $tableId);
        }

        // Deactivate previous active tables for the same product
        $this->db->execute(
            'UPDATE insurer_rate_tables SET is_active = 0 WHERE insurer_product_id = ? AND id != ?',
            [$table['insurer_product_id'], $tableId]
        );

        // Approve and activate
        $this->db->execute(
            'UPDATE insurer_rate_tables
             SET is_active = 1, approved_by_user_id = ?, approved_at = NOW()
             WHERE id = ?',
            [$adminUserId, $tableId]
        );

        // Activate the product itself if it was inactive
        $this->db->execute(
            'UPDATE insurer_products SET is_active = 1 WHERE id = ?',
            [$table['insurer_product_id']]
        );
    }

    /**
     * Reject a rate table submission (admin only).
     */
    public function rejectRateTable(int $tableId, int $adminUserId, string $reason): void
    {
        $this->db->execute(
            'UPDATE insurer_rate_tables
             SET rejection_reason = ?, approved_by_user_id = ?, approved_at = NOW()
             WHERE id = ?',
            [$reason, $adminUserId, $tableId]
        );
    }

    // -----------------------------------------------------------------------
    // Catalog read queries (used by QuoteEngine and public UI)
    // -----------------------------------------------------------------------

    /**
     * Get all active products for a given type, with insurer info.
     */
    public function getActiveProducts(string $productType): array
    {
        return $this->db->fetchAll(
            "SELECT ip.*, i.name AS insurer_name, i.short_code,
                    rt.id AS rate_table_id, rt.base_premium_annual
             FROM insurer_products ip
             JOIN insurers i               ON i.id  = ip.insurer_id
             JOIN insurer_rate_tables rt   ON rt.insurer_product_id = ip.id
             WHERE ip.product_type = ?
               AND ip.is_active    = 1
               AND rt.is_active    = 1
               AND rt.approved_at IS NOT NULL
             ORDER BY i.name ASC",
            [$productType]
        );
    }

    /**
     * Get full product detail including rating factors and discounts.
     */
    public function getProductDetail(int $productId): ?array
    {
        $product = $this->db->fetchOne(
            "SELECT ip.*, i.name AS insurer_name, i.short_code
             FROM insurer_products ip
             JOIN insurers i ON i.id = ip.insurer_id
             WHERE ip.id = ?",
            [$productId]
        );

        if (!$product) {
            return null;
        }

        $activeTable = $this->db->fetchOne(
            'SELECT * FROM insurer_rate_tables
             WHERE insurer_product_id = ? AND is_active = 1
             LIMIT 1',
            [$productId]
        );

        if ($activeTable) {
            $product['rate_table']      = $activeTable;
            $product['rating_factors']  = $this->db->fetchAll(
                'SELECT * FROM rating_factors WHERE rate_table_id = ? AND is_active = 1 ORDER BY apply_order',
                [(int) $activeTable['id']]
            );
            $product['discounts']       = $this->db->fetchAll(
                'SELECT * FROM rating_discounts WHERE rate_table_id = ? AND is_active = 1',
                [(int) $activeTable['id']]
            );
        }

        return $product;
    }

    /**
     * Get all rate tables pending admin approval.
     */
    public function getPendingRateTables(): array
    {
        return $this->db->fetchAll(
            "SELECT rt.*, ip.product_name, ip.product_type, i.name AS insurer_name
             FROM insurer_rate_tables rt
             JOIN insurer_products ip ON ip.id = rt.insurer_product_id
             JOIN insurers i          ON i.id  = ip.insurer_id
             WHERE rt.is_active     = 0
               AND rt.approved_at  IS NULL
               AND rt.rejection_reason IS NULL
             ORDER BY rt.submitted_at ASC"
        );
    }

    /**
     * Returns a marketplace summary for the admin dashboard.
     */
    public function getMarketplaceSummary(): array
    {
        $productCount = $this->db->fetchOne(
            'SELECT COUNT(*) AS cnt FROM insurer_products WHERE is_active = 1'
        )['cnt'] ?? 0;

        $insurerCount = $this->db->fetchOne(
            'SELECT COUNT(DISTINCT insurer_id) AS cnt FROM insurer_products WHERE is_active = 1'
        )['cnt'] ?? 0;

        $quoteCount30d = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM quote_requests
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
        )['cnt'] ?? 0;

        $paidCount30d = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM quote_requests
             WHERE status = 'paid' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
        )['cnt'] ?? 0;

        $pendingTables = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM insurer_rate_tables
             WHERE is_active = 0 AND approved_at IS NULL AND rejection_reason IS NULL"
        )['cnt'] ?? 0;

        return [
            'active_products'      => (int) $productCount,
            'active_insurers'      => (int) $insurerCount,
            'quotes_last_30d'      => (int) $quoteCount30d,
            'policies_last_30d'    => (int) $paidCount30d,
            'pending_rate_tables'  => (int) $pendingTables,
            'conversion_rate_30d'  => $quoteCount30d > 0
                ? round(($paidCount30d / $quoteCount30d) * 100, 1)
                : 0.0,
        ];
    }

    // -----------------------------------------------------------------------
    // Insurer analytics
    // -----------------------------------------------------------------------

    /**
     * Get lead stats for an insurer over the last N days.
     */
    public function getInsurerLeadStats(int $insurerId, int $days = 30): array
    {
        return $this->db->fetchAll(
            "SELECT
                DATE(l.created_at)   AS date,
                l.lead_type,
                COUNT(*)             AS count,
                SUM(l.lead_value_mur) AS total_value_mur
             FROM leads l
             WHERE l.insurer_id = ?
               AND l.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY DATE(l.created_at), l.lead_type
             ORDER BY date DESC, l.lead_type",
            [$insurerId, $days]
        );
    }

    /**
     * Anonymised market positioning: how does this insurer's premium
     * compare to the market median for each product type?
     */
    public function getMarketPositioning(int $insurerId): array
    {
        return $this->db->fetchAll(
            "SELECT
                qr.product_type,
                AVG(CASE WHEN qres.insurer_id = ? THEN qres.premium_annual END) AS own_avg_premium,
                AVG(qres.premium_annual)                                          AS market_avg_premium,
                COUNT(DISTINCT qres.quote_request_id)                            AS quote_count
             FROM quote_results qres
             JOIN quote_requests qr ON qr.id = qres.quote_request_id
             WHERE qres.is_available = 1
               AND qres.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
             GROUP BY qr.product_type
             ORDER BY qr.product_type",
            [$insurerId]
        );
    }

    // -----------------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------------

    private function validateProductData(array $data): void
    {
        $required = ['product_type', 'product_name'];
        foreach ($required as $field) {
            if (empty($data[$field])) {
                throw new InvalidArgumentException("Field '$field' is required.");
            }
        }

        $validTypes = ['motor','property','health','liability','marine','fleet','other'];
        if (!in_array($data['product_type'], $validTypes, true)) {
            throw new InvalidArgumentException("Invalid product_type: {$data['product_type']}");
        }
    }
}
