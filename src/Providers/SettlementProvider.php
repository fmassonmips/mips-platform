<?php
/**
 * Settlement capability — moving collected funds to a merchant's settlement
 * account via the partner bank. Settlement execution is supervised by the
 * regulated entity (PassPass).
 */
declare(strict_types=1);

namespace App\Providers;

interface SettlementProvider
{
    /**
     * @param array<string,mixed> $settlement
     */
    public function createSettlement(array $settlement): ProviderResult;
}
