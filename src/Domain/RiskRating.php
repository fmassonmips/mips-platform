<?php
/**
 * Merchant risk rating produced by the compliance/risk-scoring engine.
 */
declare(strict_types=1);

namespace App\Domain;

enum RiskRating: string
{
    case Low    = 'LOW';
    case Medium = 'MEDIUM';
    case High   = 'HIGH';

    /**
     * Map a numeric score (0-100) to a band. Higher score = higher risk.
     */
    public static function fromScore(int $score): self
    {
        return match (true) {
            $score >= 70 => self::High,
            $score >= 40 => self::Medium,
            default      => self::Low,
        };
    }
}
