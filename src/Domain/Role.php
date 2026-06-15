<?php
/**
 * Platform roles. These extend the existing users.role column (which currently
 * holds 'user' / 'admin') without breaking it: legacy 'user' is treated as a
 * consumer and 'admin' keeps full access.
 *
 * The regulated vs. technology split is enforced at the data/permission layer,
 * not by role alone: e.g. only ComplianceOfficer (acting for PassPass) can
 * approve KYC, regardless of which company employs them.
 */
declare(strict_types=1);

namespace App\Domain;

enum Role: string
{
    case Consumer          = 'consumer';
    case Merchant          = 'merchant';
    case MerchantOperator  = 'merchant_operator';
    case ComplianceOfficer = 'compliance_officer';
    case FinanceOfficer    = 'finance_officer';
    case Admin             = 'admin';
    case SuperAdmin        = 'super_admin';

    /**
     * Normalise a raw role string from the DB, mapping the legacy 'user' value.
     */
    public static function fromRaw(string $raw): self
    {
        if ($raw === 'user') {
            return self::Consumer;
        }
        return self::tryFrom($raw) ?? self::Consumer;
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $c): string => $c->value, self::cases());
    }
}
