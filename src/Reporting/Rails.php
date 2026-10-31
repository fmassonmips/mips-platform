<?php
/**
 * Frozen classification rules for Commission_Data rows.
 * Source of truth: the MIPS monthly analytics rules. Do not change a set
 * without an explicit business decision; reports compare month to month.
 */
declare(strict_types=1);

namespace App\Reporting;

final class Rails
{
    public const CARD = ['MPGS', 'MPGS_SBM', 'Cybersource', 'PowerCard', 'PowerCardCIM', 'CIM', 'ApplePay'];
    public const QR   = ['IDP_API_JUICE', 'IDP_API_BLINK', 'blink', 'MyT_money_v2', 'IDP_API_POP'];
    // Push-to-phone is its own category, never folded into QR.
    public const PUSH = ['JUICE_auto', 'POP'];

    // Strict e-commerce gateways (counted on non-till rows only).
    public const ECOM_GATEWAYS = ['Cybersource', 'MPGS', 'MPGS_SBM'];

    public const TYPES = ['CARD', 'QR', 'PUSH', 'OTHER'];

    /** Classify by rail (sof_proc_nickname), never by card brand. */
    public static function type(string $nickname): string
    {
        if (in_array($nickname, self::CARD, true)) {
            return 'CARD';
        }
        if (in_array($nickname, self::QR, true)) {
            return 'QR';
        }
        if (in_array($nickname, self::PUSH, true)) {
            return 'PUSH';
        }
        return 'OTHER';
    }
}
