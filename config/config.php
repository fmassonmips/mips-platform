<?php
/**
 * Application configuration.
 * Copy and edit this file per environment. Never commit real credentials.
 */
declare(strict_types=1);

return [
    'app' => [
        'name'    => 'MIPS Dashboard',
        // 'development' enables error display. Use 'production' on live servers.
        'env'     => 'production',
        // Public base URL, used to build links in emails (password reset).
        // Never derived from the request Host header (host header injection).
        'url'     => 'https://dashboard.example.com',
    ],

    'db' => [
        'host'    => '127.0.0.1',
        'port'    => 3306,
        'name'    => 'mips_platform',
        'user'    => 'mips_user',
        'pass'    => 'change_me_in_production',
        'charset' => 'utf8mb4',
    ],

    'session' => [
        'name'         => 'MIPSSESSID',
        'lifetime'     => 0,        // 0 = until browser closes (cookie is session-scoped)
        'idle_timeout' => 1800,     // 30 min of inactivity = auto logout
        'path'         => '/',
        'domain'       => '',
        // MUST be true over HTTPS in production.
        'secure'       => true,
        'httponly'     => true,
        'samesite'     => 'Lax',    // 'Strict' is even safer if you don't use cross-site links
    ],

    'security' => [
        'password_min_length' => 8,
        // 32 random bytes, base64. Encrypts 2FA secrets. Generate with
        // tools/make_app_key.php. Changing it invalidates every enrolled 2FA.
        'app_key'             => '',
        // Roles that must enrol in two-factor authentication before using
        // any module. Users in these roles are sent to their account page.
        'require_2fa_roles'   => ['admin', 'finance'],
        'totp_issuer'         => 'MIPS Dashboard',
        'reset_token_minutes' => 60,
    ],

    'mail' => [
        // 'smtp' (recommended), 'mail' (PHP mail()), or 'log' (writes the
        // message to the PHP error log: development only, never in production).
        'transport'  => 'log',
        'from'       => 'no-reply@example.com',
        'from_name'  => 'MIPS Dashboard',
        'smtp' => [
            'host'       => 'localhost',
            'port'       => 587,
            'encryption' => 'tls',   // 'tls' (STARTTLS), 'ssl' (implicit TLS) or 'none'
            'username'   => '',
            'password'   => '',
            'timeout'    => 10,
        ],
    ],

    'rate_limit' => [
        'max_attempts'   => 5,     // failed attempts before blocking
        'window_seconds' => 900,   // sliding window = 15 minutes
    ],

    // Roles allowed on each module. 'admin' always passes.
    'access' => [
        'reporting' => ['admin', 'finance'],
        'billing'   => ['admin', 'finance'],
        'audit'     => ['admin'],
        'users'     => ['admin'],
        'merchants' => ['admin', 'finance'],
        'recon'     => ['admin', 'finance'],
        'onboarding' => ['admin', 'finance'],
    ],

    'storage' => [
        // Must be outside the public web root and writable by PHP.
        'path'               => dirname(__DIR__) . '/storage',
        'max_document_bytes' => 20 * 1024 * 1024,
    ],

    // MCB vs MIPS e-commerce reconciliation. Column names are matched
    // against these candidates (first match wins, case-insensitive).
    'recon' => [
        'mcb_columns' => [
            'mid'      => ['Outlet_Number'],
            'currency' => ['currency_code_Alpha'],
            'amount'   => ['trx_amt'],
            'date'     => ['trx_date', 'transaction_date', 'Trx_Date', 'date'],
            'type'     => ['trx_type', 'transaction_type', 'Trx_Type'],   // optional: only PURCHASE is kept
            'name'     => ['Outlet_Name', 'Merchant_Name', 'merchant_name'], // optional, for MCB-only lines
        ],
        'mips_columns' => [
            'mid'       => ['card_merchant_id'],
            'currency'  => ['symbole_monnaie'],
            'amount'    => ['somme_totale'],
            'date'      => ['date_transaction', 'transaction_date', 'created_at', 'date_creation', 'last_transaction_date', 'date'],
            'bundled'   => ['order_is_bundled'],
            'last_mid'  => ['last_merchant_mid'],
            'merchant'  => ['form_name', 'form_nickname'],
            'reference' => ['transaction_reference', 'order_reference', 'id_order', 'order_id', 'reference'],
            'network'   => ['last_card_brand', 'card_brand'],
            'status'    => ['last_transaction_status'],   // optional: only SUCCESS is kept
        ],
        // Card verifications: MCB books them as PURCHASE, MIPS at 0.
        'verification_amount' => ['MUR' => 10.0, 'default' => 1.0],
        // Days at the end of the month treated as clearing lag.
        'month_end_days'      => 2,
        // Merchants that must appear in a full extraction (scope check).
        'sentinel_merchants'  => ['CEB'],
    ],

    // Merchant onboarding / KYC. The checklist below is a starting point:
    // have it validated by the compliance officer against the current
    // AML/CFT obligations before relying on it.
    'kyc' => [
        'requirements' => [
            // scope 'case': one per onboarding case; 'party': one per director / UBO / signatory.
            ['code' => 'incorporation',   'label' => 'Certificate of incorporation',                        'scope' => 'case',  'required' => true],
            ['code' => 'brn',             'label' => 'BRN certificate',                                     'scope' => 'case',  'required' => true],
            ['code' => 'constitution',    'label' => 'Constitution',                                        'scope' => 'case',  'required' => false],
            ['code' => 'registers',       'label' => 'Registers of directors and shareholders',             'scope' => 'case',  'required' => true],
            ['code' => 'bank_proof',      'label' => 'Bank account proof (bank letter or statement)',       'scope' => 'case',  'required' => true],
            ['code' => 'business_address','label' => 'Proof of business address',                           'scope' => 'case',  'required' => true],
            ['code' => 'vat',             'label' => 'VAT registration certificate (if registered)',        'scope' => 'case',  'required' => false],
            ['code' => 'website',         'label' => 'Website terms, refund and privacy policies (e-commerce)', 'scope' => 'case', 'required' => false],
            // Satisfied automatically by a signed contract with a PDF on the merchant record.
            ['code' => 'contract',        'label' => 'Signed MIPS merchant agreement',                      'scope' => 'case',  'required' => true],
            ['code' => 'id',              'label' => 'Identity document (passport or national ID)',         'scope' => 'party', 'required' => true, 'expires' => true],
            ['code' => 'address_proof',   'label' => 'Proof of residential address (less than 3 months)',   'scope' => 'party', 'required' => true],
        ],
        // Parties that must provide the 'party' documents and a screening result.
        'party_roles_requiring_docs' => ['director', 'ubo', 'signatory'],
        // Shareholders at or above this % must also be recorded as beneficial owners.
        'ubo_threshold_pct'   => 25,
        // Periodic review interval by risk rating, in years.
        'review_years'        => ['low' => 3, 'medium' => 2, 'high' => 1],
        'default_due_days'    => 30,
        'reminder_every_days' => 7,
        'max_reminders'       => 5,
        // Roles allowed to approve or reject a case (four eyes: never the assigned analyst).
        'approver_roles'      => ['admin'],
        'max_document_bytes'  => 20 * 1024 * 1024,
    ],

    'merchants' => [
        // Contracts ending (or whose notice deadline falls) within this many days are flagged.
        'contract_alert_days' => 90,
    ],

    // Roles an administrator can assign, in display order.
    'roles' => ['user', 'finance', 'admin'],

    'reporting' => [
        // Upload size is also capped by PHP's upload_max_filesize / post_max_size.
        'max_upload_bytes' => 64 * 1024 * 1024,
    ],

    'billing' => [
        // Mauritius standard VAT rate. Check whether commissions are VAT-able
        // for each merchant before issuing invoices.
        'vat_rate'       => 15.00,
        'invoice_prefix' => 'MIPS',
        'issuer' => [
            'name'    => 'MIPS',
            'address' => '',
            'brn'     => '',   // Business Registration Number
            'vat_no'  => '',
        ],
    ],
];
