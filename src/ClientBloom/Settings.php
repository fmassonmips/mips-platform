<?php
/**
 * Loyalty program rules of an organization (defaults until saved once).
 */
declare(strict_types=1);

namespace App\ClientBloom;

use App\Database;

final class Settings
{
    /**
     * @return array{cashback_bp:int,min_redeem_cents:int,welcome_bonus_cents:int,expiry_months:int,facturo_rewards:int}
     */
    public static function get(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT cashback_bp, min_redeem_cents, welcome_bonus_cents, expiry_months, facturo_rewards
             FROM clientbloom_settings WHERE organization_id = :oid'
        );
        $stmt->execute([':oid' => $orgId]);
        $row = $stmt->fetch() ?: [
            'cashback_bp' => 500, 'min_redeem_cents' => 10000, 'welcome_bonus_cents' => 0,
            'expiry_months' => 12, 'facturo_rewards' => 0,
        ];
        return array_map('intval', $row);
    }

    /**
     * @param array{cashback_bp:int,min_redeem_cents:int,welcome_bonus_cents:int,expiry_months:int} $s
     */
    public static function validate(array $s): ?string
    {
        if ($s['cashback_bp'] < 0 || $s['cashback_bp'] > 5000) {
            return 'Cashback rate must be between 0 and 50%.';
        }
        if ($s['min_redeem_cents'] < 0 || $s['welcome_bonus_cents'] < 0
            || $s['min_redeem_cents'] > 100_000_000 || $s['welcome_bonus_cents'] > 100_000_000) {
            return 'Amounts must be positive.';
        }
        if ($s['expiry_months'] < 0 || $s['expiry_months'] > 120) {
            return 'Expiry must be between 0 (never) and 120 months.';
        }
        return null;
    }

    /**
     * @param array{cashback_bp:int,min_redeem_cents:int,welcome_bonus_cents:int,expiry_months:int,facturo_rewards:int} $s
     */
    public static function save(int $orgId, array $s): void
    {
        Database::connection()->prepare(
            'INSERT INTO clientbloom_settings
                (organization_id, cashback_bp, min_redeem_cents, welcome_bonus_cents, expiry_months, facturo_rewards)
             VALUES (:oid, :bp, :min, :bonus, :exp, :fr)
             ON DUPLICATE KEY UPDATE cashback_bp = VALUES(cashback_bp), min_redeem_cents = VALUES(min_redeem_cents),
                 welcome_bonus_cents = VALUES(welcome_bonus_cents), expiry_months = VALUES(expiry_months),
                 facturo_rewards = VALUES(facturo_rewards)'
        )->execute([
            ':oid' => $orgId, ':bp' => $s['cashback_bp'], ':min' => $s['min_redeem_cents'],
            ':bonus' => $s['welcome_bonus_cents'], ':exp' => $s['expiry_months'], ':fr' => $s['facturo_rewards'] ? 1 : 0,
        ]);
    }
}
