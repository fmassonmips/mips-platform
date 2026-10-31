<?php
/**
 * Fee rule resolution.
 *
 * A rule matches a transaction when every non-NULL criterion equals the
 * transaction's value and the transaction date is inside the validity
 * window. Among matches, the most specific wins:
 *
 *   merchant (8) > sof_proc_nickname (4) > rail_type (2) > channel (1)
 *
 * Ties go to the latest valid_from, then the highest id. A transaction with
 * no matching rule bills at 0 and is flagged on the invoice line.
 */
declare(strict_types=1);

namespace App\Billing;

use App\Database;

final class FeeRules
{
    /** @var list<array<string,mixed>> */
    private array $rules;

    public function __construct(string $periodStart, string $periodEnd)
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM fee_rules
             WHERE is_active = 1 AND valid_from <= :end AND (valid_to IS NULL OR valid_to >= :start)'
        );
        $stmt->execute([':start' => $periodStart, ':end' => $periodEnd]);
        $this->rules = $stmt->fetchAll();
    }

    /** @return array<string,mixed>|null */
    public function resolve(int $merchantId, string $nickname, string $rail, string $channel, string $date): ?array
    {
        $best      = null;
        $bestScore = -1;
        foreach ($this->rules as $r) {
            if ($r['valid_from'] > $date || ($r['valid_to'] !== null && $r['valid_to'] < $date)) {
                continue;
            }
            if ($r['merchant_id'] !== null && (int) $r['merchant_id'] !== $merchantId) {
                continue;
            }
            if ($r['sof_proc_nickname'] !== null && $r['sof_proc_nickname'] !== $nickname) {
                continue;
            }
            if ($r['rail_type'] !== null && $r['rail_type'] !== $rail) {
                continue;
            }
            if ($r['channel'] !== null && $r['channel'] !== $channel) {
                continue;
            }

            $score = ($r['merchant_id'] !== null ? 8 : 0)
                + ($r['sof_proc_nickname'] !== null ? 4 : 0)
                + ($r['rail_type'] !== null ? 2 : 0)
                + ($r['channel'] !== null ? 1 : 0);

            if ($score > $bestScore
                || ($score === $bestScore && ($r['valid_from'] > $best['valid_from']
                    || ($r['valid_from'] === $best['valid_from'] && (int) $r['id'] > (int) $best['id'])))) {
                $best      = $r;
                $bestScore = $score;
            }
        }
        return $best;
    }
}
