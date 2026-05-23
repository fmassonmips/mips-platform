<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use InvalidArgumentException;
use RuntimeException;

/**
 * Core quote comparison engine for the InsurLink MU marketplace.
 *
 * Given a risk profile (vehicle, property, etc.) and a product type,
 * this engine:
 *   1. Fetches all active rate tables for the product type.
 *   2. Checks acceptance criteria for each product.
 *   3. Applies rating factors sequentially to compute the premium.
 *   4. Applies eligible discounts.
 *   5. Computes coverage_score and value_score.
 *   6. Persists QuoteResult rows.
 *   7. Records lead events for billing.
 *
 * All monetary values are in MUR (Mauritian Rupees).
 */
class QuoteEngine
{
    private const QUOTE_REF_PREFIX = 'QR';
    private const QUOTE_TTL_HOURS  = 72;

    public function __construct(private readonly Database $db) {}

    /**
     * Generate a full comparison for a given risk profile.
     *
     * @param array $riskProfile    Validated risk data (see risk_profile_json schema)
     * @param string $productType   'motor'|'property'|'health'|'liability'|'marine'|'fleet'|'other'
     * @param int|null $consumerId  Logged-in consumer ID (null for anonymous)
     * @param int|null $agentId     Broker agent ID (null for consumer/public flow)
     * @param int|null $clientId    Broker's CRM client ID (null if not a broker flow)
     * @param string $portal        'consumer'|'broker'|'public'
     * @return array QuoteRequest row + results array
     */
    public function calculate(
        array   $riskProfile,
        string  $productType,
        ?int    $consumerId = null,
        ?int    $agentId    = null,
        ?int    $clientId   = null,
        string  $portal     = 'public'
    ): array {
        $this->validateProductType($productType);

        // Create the QuoteRequest record
        $reference = $this->generateReference();
        $this->db->execute(
            "INSERT INTO quote_requests
                (reference, portal_origin, consumer_id, broker_agent_id, client_id,
                 product_type, risk_profile_json, status, expires_at, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL ? HOUR), ?)",
            [
                $reference,
                $portal,
                $consumerId,
                $agentId,
                $clientId,
                $productType,
                json_encode($riskProfile),
                self::QUOTE_TTL_HOURS,
                $_SERVER['REMOTE_ADDR'] ?? null,
            ]
        );
        $quoteRequestId = (int) $this->db->lastInsertId();

        // Fetch all active rate tables for this product type
        $rateTables = $this->db->fetchAll(
            "SELECT rt.*, ip.id AS product_id, ip.insurer_id, ip.product_name,
                    i.name AS insurer_name, i.short_code AS insurer_code
             FROM insurer_rate_tables rt
             JOIN insurer_products ip ON ip.id = rt.insurer_product_id
             JOIN insurers i          ON i.id  = ip.insurer_id
             WHERE ip.product_type = ?
               AND ip.is_active    = 1
               AND rt.is_active    = 1
               AND rt.valid_from  <= CURDATE()
               AND (rt.valid_to IS NULL OR rt.valid_to >= CURDATE())
               AND rt.approved_at IS NOT NULL",
            [$productType]
        );

        if (empty($rateTables)) {
            $this->db->execute(
                "UPDATE quote_requests SET status = 'quoted' WHERE id = ?",
                [$quoteRequestId]
            );
            return ['quote_request_id' => $quoteRequestId, 'reference' => $reference, 'results' => []];
        }

        // Calculate a quote for each rate table
        $results = [];
        $availablePremiums = [];

        foreach ($rateTables as $table) {
            $result = $this->calculateForRateTable($table, $riskProfile, $quoteRequestId);
            $results[] = $result;
            if ($result['is_available']) {
                $availablePremiums[] = $result['premium_annual'];
            }
        }

        // Compute value scores now that we have the full premium distribution
        $medianPremium = $this->median($availablePremiums);
        $results = $this->enrichScores($results, $medianPremium);

        // Persist all QuoteResult rows
        foreach ($results as &$result) {
            $this->db->execute(
                "INSERT INTO quote_results
                    (quote_request_id, insurer_id, insurer_product_id, rate_table_id,
                     premium_annual, premium_monthly, sum_insured, excess_amount,
                     cover_highlights_json, exclusions_json, calculation_breakdown_json,
                     discounts_applied_json, coverage_score, value_score,
                     is_available, unavailability_reason)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    $quoteRequestId,
                    $result['insurer_id'],
                    $result['product_id'],
                    $result['rate_table_id'],
                    $result['premium_annual'],
                    $result['premium_monthly'],
                    $result['sum_insured'],
                    $result['excess_amount'],
                    json_encode($result['cover_highlights']),
                    json_encode($result['exclusions']),
                    json_encode($result['calculation_breakdown']),
                    json_encode($result['discounts_applied']),
                    $result['coverage_score'],
                    $result['value_score'],
                    $result['is_available'] ? 1 : 0,
                    $result['unavailability_reason'],
                ]
            );
            $result['id'] = (int) $this->db->lastInsertId();

            // Record 'quote_shown' lead for available quotes
            if ($result['is_available']) {
                $this->recordLead($result['insurer_id'], $result['id'], $quoteRequestId, 'quote_shown');
            }
        }

        // Sort: available first, then by premium ASC
        usort($results, static function (array $a, array $b): int {
            if ($a['is_available'] !== $b['is_available']) {
                return $b['is_available'] <=> $a['is_available'];
            }
            return ($a['premium_annual'] ?? PHP_INT_MAX) <=> ($b['premium_annual'] ?? PHP_INT_MAX);
        });

        // Mark request as quoted
        $this->db->execute(
            "UPDATE quote_requests SET status = 'quoted' WHERE id = ?",
            [$quoteRequestId]
        );

        // Analytics event
        $this->trackEvent('quote_completed', $portal, null, $productType, null, $consumerId ?? $agentId);

        return [
            'quote_request_id' => $quoteRequestId,
            'reference'        => $reference,
            'product_type'     => $productType,
            'results'          => $results,
            'result_count'     => count($results),
            'available_count'  => count(array_filter($results, fn($r) => $r['is_available'])),
            'expires_at'       => date('Y-m-d H:i:s', strtotime('+' . self::QUOTE_TTL_HOURS . ' hours')),
        ];
    }

    /**
     * Mark a quote as selected by the user (before payment).
     */
    public function selectQuote(int $quoteResultId, int $userId, ?string $reason = null): int
    {
        $result = $this->db->fetchOne(
            'SELECT qr.id AS request_id, qr.product_type, qres.insurer_id
             FROM quote_results qres
             JOIN quote_requests qr ON qr.id = qres.quote_request_id
             WHERE qres.id = ?',
            [$quoteResultId]
        );

        if (!$result) {
            throw new InvalidArgumentException('Quote result not found: ' . $quoteResultId);
        }

        $this->db->execute(
            "INSERT INTO selected_quotes
                (quote_request_id, quote_result_id, selected_by_user_id, selection_reason, status)
             VALUES (?, ?, ?, ?, 'selected')",
            [$result['request_id'], $quoteResultId, $userId, $reason]
        );
        $selectedId = (int) $this->db->lastInsertId();

        // Update quote request status
        $this->db->execute(
            "UPDATE quote_requests SET status = 'selected' WHERE id = ?",
            [$result['request_id']]
        );

        // Record 'quote_selected' lead
        $this->recordLead($result['insurer_id'], $quoteResultId, $result['request_id'], 'quote_selected');

        return $selectedId;
    }

    /**
     * Mark a selected quote as paid (called by WebhookController after MIPS confirmation).
     */
    public function markPaid(int $selectedQuoteId, string $coverNotePath = ''): void
    {
        $sq = $this->db->fetchOne(
            'SELECT sq.*, qres.insurer_id, qr.product_type
             FROM selected_quotes sq
             JOIN quote_results   qres ON qres.id = sq.quote_result_id
             JOIN quote_requests  qr   ON qr.id   = sq.quote_request_id
             WHERE sq.id = ?',
            [$selectedQuoteId]
        );

        if (!$sq) {
            return;
        }

        $this->db->execute(
            "UPDATE selected_quotes
             SET status = 'paid', cover_note_path = ?, cover_note_sent_at = NOW()
             WHERE id = ?",
            [$coverNotePath, $selectedQuoteId]
        );

        $this->db->execute(
            "UPDATE quote_requests SET status = 'paid' WHERE id = ?",
            [$sq['quote_request_id']]
        );

        // Record 'payment_made' lead
        $this->recordLead($sq['insurer_id'], $sq['quote_result_id'], $sq['quote_request_id'], 'payment_made');

        $this->trackEvent('payment_made', 'consumer', $sq['insurer_id'], $sq['product_type']);
    }

    // -----------------------------------------------------------------------
    // Private calculation methods
    // -----------------------------------------------------------------------

    private function calculateForRateTable(array $table, array $riskProfile, int $quoteRequestId): array
    {
        $base = [
            'rate_table_id'          => (int) $table['id'],
            'insurer_id'             => (int) $table['insurer_id'],
            'product_id'             => (int) $table['product_id'],
            'insurer_name'           => $table['insurer_name'],
            'insurer_code'           => $table['insurer_code'],
            'product_name'           => $table['product_name'],
            'is_available'           => true,
            'unavailability_reason'  => null,
            'premium_annual'         => null,
            'premium_monthly'        => null,
            'sum_insured'            => null,
            'excess_amount'          => null,
            'coverage_score'         => null,
            'value_score'            => null,
            'cover_highlights'       => [],
            'exclusions'             => [],
            'calculation_breakdown'  => [],
            'discounts_applied'      => [],
        ];

        // Check acceptance criteria
        $acceptanceRules = json_decode($table['acceptance_rules_json'] ?? '{}', true) ?? [];
        $rejection = $this->checkAcceptance($acceptanceRules, $riskProfile);
        if ($rejection !== null) {
            $base['is_available']          = false;
            $base['unavailability_reason'] = $rejection;
            return $base;
        }

        // Fetch rating factors ordered by apply_order
        $factors = $this->db->fetchAll(
            'SELECT * FROM rating_factors WHERE rate_table_id = ? AND is_active = 1 ORDER BY apply_order ASC',
            [(int) $table['id']]
        );

        // Start from base premium
        $premium   = (float) $table['base_premium_annual'];
        $breakdown = [['step' => 'base_premium', 'value' => $premium, 'running_total' => $premium]];

        foreach ($factors as $factor) {
            $rules      = json_decode($factor['rules_json'], true);
            $adjustment = $this->applyFactor($factor['factor_type'], $rules, $riskProfile, $premium);
            $premium   += $adjustment;  // additive delta (can be 0 for pure multipliers)
            $breakdown[] = [
                'step'          => $factor['factor_name'],
                'type'          => $factor['factor_type'],
                'adjustment'    => $adjustment,
                'running_total' => round($premium, 2),
            ];
        }

        // Apply discounts
        $discounts = $this->db->fetchAll(
            'SELECT * FROM rating_discounts WHERE rate_table_id = ? AND is_active = 1',
            [(int) $table['id']]
        );

        $totalDiscountPct   = 0.0;
        $appliedDiscounts   = [];

        foreach ($discounts as $discount) {
            $condition = json_decode($discount['condition_json'] ?? '{}', true) ?? [];
            if (!$this->meetsCondition($condition, $riskProfile)) {
                continue;
            }

            $maxCap = (float) ($discount['max_cumulative_pct'] ?? 100);
            if ($totalDiscountPct >= $maxCap) {
                break;
            }

            $discountAmt = $discount['discount_type'] === 'percentage'
                ? $premium * ((float) $discount['discount_value'] / 100)
                : (float) $discount['discount_value'];

            $premium         -= $discountAmt;
            $totalDiscountPct += (float) $discount['discount_value'];
            $appliedDiscounts[] = [
                'name'   => $discount['discount_name'],
                'amount' => round($discountAmt, 2),
            ];
            $breakdown[] = [
                'step'          => 'discount_' . $discount['discount_name'],
                'amount'        => -round($discountAmt, 2),
                'running_total' => round($premium, 2),
            ];
        }

        // Apply minimum premium floor
        $minPremium = (float) $table['minimum_premium'];
        if ($premium < $minPremium) {
            $premium = $minPremium;
        }

        $premium = round($premium, 2);

        $base['premium_annual']         = $premium;
        $base['premium_monthly']        = round($premium / 12, 2);
        $base['sum_insured']            = $riskProfile['vehicle']['value'] ?? $riskProfile['property']['value'] ?? null;
        $base['excess_amount']          = $riskProfile['cover']['excess_preference'] ?? null;
        $base['calculation_breakdown']  = $breakdown;
        $base['discounts_applied']      = $appliedDiscounts;
        $base['coverage_score']         = $this->computeCoverageScore($table, $riskProfile);

        return $base;
    }

    /**
     * Apply a single rating factor and return the delta to add to premium.
     */
    private function applyFactor(string $type, array $rules, array $riskProfile, float $currentPremium): float
    {
        $inputValue = $this->extractNestedValue($riskProfile, $rules['input_field'] ?? '');

        return match ($type) {
            'lookup' => $this->applyLookup($rules, $inputValue, $currentPremium),
            'multiplier' => $currentPremium * ($rules['multiplier'] ?? 1.0) - $currentPremium,
            'additive' => (float) ($rules['amount'] ?? 0),
            'percentage' => $currentPremium * ((float) ($rules['percentage'] ?? 0) / 100),
            default => 0.0,
        };
    }

    /**
     * Lookup table: find the bracket containing $inputValue and return premium delta.
     */
    private function applyLookup(array $rules, mixed $inputValue, float $currentPremium): float
    {
        $brackets = $rules['brackets'] ?? [];
        foreach ($brackets as $bracket) {
            if ($inputValue >= $bracket['min'] && $inputValue <= $bracket['max']) {
                $factorValue = (float) $bracket['value'];
                return match ($rules['apply_as'] ?? 'multiplier') {
                    'multiplier' => $currentPremium * $factorValue - $currentPremium,
                    'rate_per_1000' => ($currentPremium / 1000) * $factorValue,
                    'fixed' => $factorValue,
                    default => $currentPremium * $factorValue - $currentPremium,
                };
            }
        }
        return 0.0;
    }

    /**
     * Coverage score (0–100): measures quality of coverage independent of price.
     * Based on included guarantees vs. a standard checklist for the product type.
     */
    private function computeCoverageScore(array $table, array $riskProfile): int
    {
        // Standard checklist varies by product type — motor example
        $productType = $riskProfile['product_type'] ?? 'motor';
        $scoreMap    = $this->getCoverageChecklist($productType);
        $highlights  = json_decode($table['cover_highlights_json'] ?? '[]', true) ?? [];

        $totalWeight = 0;
        $earned      = 0;

        foreach ($scoreMap as $item) {
            $totalWeight += $item['weight'];
            foreach ($highlights as $h) {
                if (isset($h['key']) && $h['key'] === $item['key'] && ($h['included'] ?? false)) {
                    $earned += $item['weight'];
                    break;
                }
            }
        }

        return $totalWeight > 0 ? (int) round(($earned / $totalWeight) * 100) : 50;
    }

    private function getCoverageChecklist(string $productType): array
    {
        return match ($productType) {
            'motor' => [
                ['key' => 'own_damage',        'weight' => 20],
                ['key' => 'third_party',        'weight' => 15],
                ['key' => 'fire_theft',         'weight' => 15],
                ['key' => 'windscreen',         'weight' => 10],
                ['key' => 'personal_accident',  'weight' => 10],
                ['key' => 'roadside_assistance','weight' => 10],
                ['key' => 'no_claims_bonus',    'weight' => 10],
                ['key' => 'courtesy_car',       'weight' => 10],
            ],
            'property' => [
                ['key' => 'fire',               'weight' => 20],
                ['key' => 'flood',              'weight' => 15],
                ['key' => 'cyclone',            'weight' => 20],
                ['key' => 'theft',              'weight' => 15],
                ['key' => 'liability',          'weight' => 10],
                ['key' => 'contents',           'weight' => 10],
                ['key' => 'temporary_housing',  'weight' => 10],
            ],
            default => [
                ['key' => 'basic_cover',        'weight' => 50],
                ['key' => 'extended_cover',     'weight' => 50],
            ],
        };
    }

    /**
     * After collecting all premiums, compute value_score for each result.
     * value_score = (coverage_score / premium_normalized) × 100
     */
    private function enrichScores(array $results, ?float $medianPremium): array
    {
        foreach ($results as &$r) {
            if (!$r['is_available'] || $r['premium_annual'] === null) {
                continue;
            }
            $normalized = $medianPremium > 0
                ? $r['premium_annual'] / $medianPremium
                : 1.0;
            $coverage = $r['coverage_score'] ?? 50;
            $r['value_score'] = (int) min(100, round(($coverage / ($normalized * 100)) * 100));
        }
        return $results;
    }

    /**
     * Check acceptance criteria against the risk profile.
     * Returns a rejection reason string, or null if the risk is acceptable.
     */
    private function checkAcceptance(array $rules, array $riskProfile): ?string
    {
        $vehicleAge = isset($riskProfile['vehicle']['year'])
            ? (int) date('Y') - (int) $riskProfile['vehicle']['year']
            : null;

        if (isset($rules['max_vehicle_age_years']) && $vehicleAge !== null) {
            if ($vehicleAge > (int) $rules['max_vehicle_age_years']) {
                return sprintf(
                    'Vehicle age (%d years) exceeds maximum accepted (%d years).',
                    $vehicleAge,
                    $rules['max_vehicle_age_years']
                );
            }
        }

        if (isset($rules['min_sum_insured']) && isset($riskProfile['vehicle']['value'])) {
            if ((float) $riskProfile['vehicle']['value'] < (float) $rules['min_sum_insured']) {
                return sprintf(
                    'Vehicle value (MUR %s) is below minimum insurable value (MUR %s).',
                    number_format($riskProfile['vehicle']['value']),
                    number_format($rules['min_sum_insured'])
                );
            }
        }

        if (isset($rules['max_sum_insured']) && isset($riskProfile['vehicle']['value'])) {
            if ((float) $riskProfile['vehicle']['value'] > (float) $rules['max_sum_insured']) {
                return 'Vehicle value exceeds maximum sum insured for this product.';
            }
        }

        if (isset($rules['min_driver_age']) && isset($riskProfile['driver']['age'])) {
            if ((int) $riskProfile['driver']['age'] < (int) $rules['min_driver_age']) {
                return sprintf(
                    'Driver age (%d) is below minimum accepted age (%d).',
                    $riskProfile['driver']['age'],
                    $rules['min_driver_age']
                );
            }
        }

        return null;
    }

    /**
     * Evaluate discount eligibility conditions against the risk profile.
     */
    private function meetsCondition(array $condition, array $riskProfile): bool
    {
        if (empty($condition)) {
            return true;
        }

        // Example: {"field": "driver.claims_last_3_years", "operator": "eq", "value": 0}
        $fieldValue = $this->extractNestedValue($riskProfile, $condition['field'] ?? '');
        $threshold  = $condition['value'] ?? null;

        return match ($condition['operator'] ?? 'eq') {
            'eq'  => $fieldValue == $threshold,
            'lt'  => $fieldValue <  $threshold,
            'lte' => $fieldValue <= $threshold,
            'gt'  => $fieldValue >  $threshold,
            'gte' => $fieldValue >= $threshold,
            'in'  => in_array($fieldValue, (array) $threshold, true),
            default => false,
        };
    }

    /**
     * Extract a dot-notation field from a nested array.
     * e.g. "driver.age" → $risk['driver']['age']
     */
    private function extractNestedValue(array $data, string $path): mixed
    {
        $keys = explode('.', $path);
        $current = $data;
        foreach ($keys as $key) {
            if (!is_array($current) || !array_key_exists($key, $current)) {
                return null;
            }
            $current = $current[$key];
        }
        return $current;
    }

    private function recordLead(int $insurerId, int $quoteResultId, int $quoteRequestId, string $leadType): void
    {
        // Determine billable value from active commission rules
        $commission = $this->db->fetchOne(
            "SELECT commission_value, value_type
             FROM platform_commissions
             WHERE insurer_id = ?
               AND commission_type = ?
               AND is_active = 1
               AND effective_from <= CURDATE()
               AND (effective_to IS NULL OR effective_to >= CURDATE())
             LIMIT 1",
            [$insurerId, 'per_' . str_replace('quote_', 'lead_', $leadType)]
        );

        $leadValue = null;
        if ($commission) {
            $leadValue = $commission['value_type'] === 'percentage' ? null : (float) $commission['commission_value'];
        }

        $this->db->execute(
            "INSERT INTO leads (insurer_id, quote_result_id, quote_request_id, lead_type, lead_value_mur)
             VALUES (?, ?, ?, ?, ?)",
            [$insurerId, $quoteResultId, $quoteRequestId, $leadType, $leadValue]
        );
    }

    private function trackEvent(
        string  $eventType,
        string  $portal,
        ?int    $insurerId   = null,
        ?string $productType = null,
        ?float  $premium     = null,
        ?int    $userId      = null
    ): void {
        $this->db->execute(
            "INSERT INTO marketplace_analytics
                (event_type, portal_origin, insurer_id, product_type, premium_amount, session_id, user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                $eventType,
                $portal,
                $insurerId,
                $productType,
                $premium,
                session_id() ?: null,
                $userId,
            ]
        );
    }

    private function generateReference(): string
    {
        return self::QUOTE_REF_PREFIX . '-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -5));
    }

    private function validateProductType(string $type): void
    {
        $valid = ['motor', 'property', 'health', 'liability', 'marine', 'fleet', 'other'];
        if (!in_array($type, $valid, true)) {
            throw new InvalidArgumentException("Invalid product type: $type");
        }
    }

    private function median(array $values): ?float
    {
        if (empty($values)) {
            return null;
        }
        sort($values);
        $count = count($values);
        $mid   = (int) floor($count / 2);
        return $count % 2 === 0
            ? ($values[$mid - 1] + $values[$mid]) / 2
            : $values[$mid];
    }
}
