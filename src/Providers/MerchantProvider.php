<?php
/**
 * Regulated merchant lifecycle capability. Implemented ONLY by the regulated
 * entity's adapter (PassPass), because merchant onboarding approval and KYC
 * decisions are regulated activities that MIPSIT (technology provider) cannot
 * perform on its own.
 */
declare(strict_types=1);

namespace App\Providers;

interface MerchantProvider
{
    /**
     * @param array<string,mixed> $merchant
     */
    public function createMerchant(array $merchant): ProviderResult;

    /**
     * @param array<string,mixed> $changes
     */
    public function updateMerchant(string $regulatedMerchantId, array $changes): ProviderResult;

    /**
     * @param array<string,mixed> $kycPayload
     */
    public function submitKyc(string $regulatedMerchantId, array $kycPayload): ProviderResult;

    public function approveMerchant(string $regulatedMerchantId): ProviderResult;
}
