<?php
/**
 * Payment product types supported by the platform.
 *
 * These values feed the routing engine (see App\Routing\PaymentRouter) and are
 * persisted on transactions.payment_type. They are intentionally provider-agnostic:
 * a payment TYPE is routed to a provider by configuration, never hard-coded.
 */
declare(strict_types=1);

namespace App\Domain;

enum PaymentType: string
{
    case BankTransfer       = 'BANK_TRANSFER';       // Pay by Bank (A2A)
    case Qr                 = 'QR';                  // Merchant QR (static/dynamic)
    case PaymentLink        = 'PAYMENT_LINK';        // Hosted payment link
    case VirtualCredential  = 'VIRTUAL_CREDENTIAL';  // Virtual payment credential / alias
    case PaypumpTransfer    = 'PAYPUMP_TRANSFER';    // Payout / transfer via Paypump
    case Workflow           = 'WORKFLOW';            // Orchestrated workflow via Inflow
    case Card               = 'CARD';               // Card rails (stubbed in MVP)

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $c): string => $c->value, self::cases());
    }
}
