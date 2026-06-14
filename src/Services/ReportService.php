<?php
/**
 * Aggregated KPIs for the admin dashboard. All figures are derived live from the
 * operational tables; money figures are integer MINOR units in the base currency.
 */
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Support\Money;
use PDO;

final class ReportService
{
    public function __construct(private readonly PDO $db)
    {
    }

    public static function make(): self
    {
        return new self(Database::connection());
    }

    /** @return array<string,mixed> */
    public function kpis(): array
    {
        $currency = (string) ($GLOBALS['config']['platform']['base_currency'] ?? Money::DEFAULT_CURRENCY);

        $merchants = $this->row(
            "SELECT
                COUNT(*) AS total,
                SUM(status = 'ACTIVE') AS active,
                SUM(kyc_status IN ('SUBMITTED','REVIEW')) AS pending_kyc,
                SUM(kyc_status = 'APPROVED') AS approved
             FROM merchants"
        );

        $txns = $this->row(
            "SELECT
                COUNT(*) AS total,
                SUM(status IN ('PAID','SETTLED','RECONCILED')) AS successful,
                SUM(status = 'FAILED') AS failed,
                COALESCE(SUM(CASE WHEN status IN ('PAID','SETTLED','RECONCILED') THEN amount_minor ELSE 0 END), 0) AS volume_minor
             FROM transactions"
        );

        $settlements = $this->row(
            "SELECT COUNT(*) AS total,
                    COALESCE(SUM(net_minor), 0) AS net_minor,
                    SUM(status = 'SETTLED') AS pending_reconciliation
             FROM settlements"
        );

        $fees = $this->row('SELECT COALESCE(SUM(amount_minor), 0) AS total_minor FROM fees');

        $exceptions = $this->row(
            "SELECT COUNT(*) AS total FROM reconciliation_items WHERE status = 'EXCEPTION'"
        );

        $volume = (int) $txns['volume_minor'];
        $settledNet = (int) $settlements['net_minor'];
        $feesTotal = (int) $fees['total_minor'];

        return [
            'currency'                => $currency,
            'merchants_total'         => (int) $merchants['total'],
            'merchants_active'        => (int) $merchants['active'],
            'merchants_pending_kyc'   => (int) $merchants['pending_kyc'],
            'merchants_approved'      => (int) $merchants['approved'],
            'transactions_total'      => (int) $txns['total'],
            'transactions_successful' => (int) $txns['successful'],
            'transactions_failed'     => (int) $txns['failed'],
            'volume_minor'            => $volume,
            'volume_display'          => Money::format($volume, $currency),
            'settlements_total'       => (int) $settlements['total'],
            'settlements_net_minor'   => $settledNet,
            'settlements_net_display' => Money::format($settledNet, $currency),
            'fees_generated_minor'    => $feesTotal,
            'fees_generated_display'  => Money::format($feesTotal, $currency),
            'pending_reconciliation'  => (int) $settlements['pending_reconciliation'],
            'settlement_exceptions'   => (int) $exceptions['total'],
        ];
    }

    /** @return array<string,mixed> */
    private function row(string $sql): array
    {
        $r = $this->db->query($sql)->fetch();
        return is_array($r) ? $r : [];
    }
}
