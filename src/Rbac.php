<?php
/**
 * Role-Based Access Control.
 *
 * Central permission table mapping roles -> permissions. Controllers call
 * Rbac::require($user, 'permission.name') to gate actions. Permissions are
 * coarse-grained verbs on resources; the regulated/technology separation is
 * expressed by *which* role owns *which* permission.
 *
 * Owner notes:
 *  - compliance.* and merchant.approve are PassPass (regulated) responsibilities.
 *  - settlement.* execution is supervised by PassPass; finance ops by MIPSIT.
 *  - platform.* (routing, providers, fees config) is MIPSIT (technology) ops.
 */
declare(strict_types=1);

namespace App;

use App\Domain\Role;

final class Rbac
{
    /**
     * Permission grants per role. SuperAdmin implicitly gets everything.
     *
     * @var array<string, list<string>>
     */
    private const GRANTS = [
        'consumer' => [
            'consumer.self.read', 'consumer.self.update',
            'payment.initiate', 'payment.self.read',
            'credential.self.manage',
        ],
        'merchant' => [
            'merchant.self.read', 'merchant.self.update',
            'merchant.kyc.submit', 'merchant.bank.manage',
            'paymentlink.manage', 'qr.manage', 'paymentrequest.manage',
            'transaction.self.read', 'settlement.self.read',
            'report.self.read', 'apikey.self.manage',
        ],
        'merchant_operator' => [
            'merchant.self.read',
            'paymentlink.manage', 'qr.manage', 'paymentrequest.manage',
            'transaction.self.read', 'report.self.read',
        ],
        'compliance_officer' => [
            'merchant.read.all', 'merchant.approve', 'merchant.suspend',
            'compliance.review', 'compliance.risk.score', 'compliance.aml.note',
            'kyc.read.all', 'kyc.decide', 'audit.read',
        ],
        'finance_officer' => [
            'settlement.read.all', 'settlement.batch.manage',
            'reconciliation.manage', 'fee.read', 'transaction.read.all',
            'report.read.all',
        ],
        'admin' => [
            'merchant.read.all', 'consumer.read.all', 'transaction.read.all',
            'settlement.read.all', 'compliance.review', 'fee.manage',
            'platform.routing.manage', 'platform.provider.manage',
            'report.read.all', 'audit.read', 'notification.manage',
        ],
    ];

    /**
     * Does the given user row hold the permission?
     *
     * @param array<string,mixed> $user A user row with a 'role' key.
     */
    public static function can(array $user, string $permission): bool
    {
        $role = Role::fromRaw((string) ($user['role'] ?? 'consumer'));

        if ($role === Role::SuperAdmin) {
            return true;
        }

        $grants = self::GRANTS[$role->value] ?? [];
        return in_array($permission, $grants, true);
    }

    /**
     * Enforce a permission or terminate the request (403 JSON / redirect).
     *
     * @param array<string,mixed> $user
     */
    public static function require(array $user, string $permission): void
    {
        if (self::can($user, $permission)) {
            return;
        }

        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
        if (str_starts_with($uri, '/api/')) {
            Response::json(['error' => 'Forbidden', 'permission' => $permission], 403);
        }

        http_response_code(403);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Forbidden';
        exit;
    }
}
