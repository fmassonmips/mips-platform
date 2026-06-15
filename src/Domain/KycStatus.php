<?php
/**
 * KYC review lifecycle for a merchant (and, where applicable, a consumer).
 * Owned by the regulated entity (PassPass) via the Compliance portal.
 */
declare(strict_types=1);

namespace App\Domain;

enum KycStatus: string
{
    case Draft     = 'DRAFT';
    case Submitted = 'SUBMITTED';
    case Review    = 'REVIEW';
    case Approved  = 'APPROVED';
    case Rejected  = 'REJECTED';

    /** A merchant may only transact once KYC is approved. */
    public function allowsTransacting(): bool
    {
        return $this === self::Approved;
    }
}
