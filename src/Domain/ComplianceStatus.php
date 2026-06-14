<?php
/**
 * Compliance standing of a merchant, independent of KYC progress.
 * A merchant can be KYC-approved yet later suspended for AML reasons.
 */
declare(strict_types=1);

namespace App\Domain;

enum ComplianceStatus: string
{
    case Pending   = 'PENDING';
    case Cleared   = 'CLEARED';
    case Flagged   = 'FLAGGED';
    case Suspended = 'SUSPENDED';
    case Closed    = 'CLOSED';

    public function allowsTransacting(): bool
    {
        return $this === self::Cleared;
    }
}
