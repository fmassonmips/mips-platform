<?php
/**
 * Virtual payment profiles, aliases and credentials.
 *
 * A virtual credential is an opaque identifier that can represent a bank-routing
 * instruction, a payment alias, a QR profile, or a future card/wallet token. It
 * is NOT a real card and stores NO PAN/CVV — only opaque references.
 */
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Support\Reference;
use PDO;
use RuntimeException;

final class VirtualCredentialService
{
    private const CRED_TYPES  = ['BANK_ROUTING', 'PAYMENT_ALIAS', 'QR_PROFILE', 'CARD_TOKEN', 'WALLET'];
    private const ALIAS_TYPES = ['HANDLE', 'PHONE', 'EMAIL', 'VPA'];

    public function __construct(private readonly PDO $db)
    {
    }

    public static function make(): self
    {
        return new self(Database::connection());
    }

    /** Get or lazily create the user's virtual payment profile. @return array<string,mixed> */
    public function ensureProfile(int $userId, ?string $label = null): array
    {
        $stmt = $this->db->prepare('SELECT * FROM virtual_payment_profiles WHERE owner_user_id = :u ORDER BY id LIMIT 1');
        $stmt->execute([':u' => $userId]);
        $profile = $stmt->fetch();
        if (is_array($profile)) {
            return $profile;
        }

        $reference = Reference::generate('VPP');
        $ins = $this->db->prepare(
            'INSERT INTO virtual_payment_profiles (owner_user_id, profile_reference, label, created_at)
             VALUES (:u, :ref, :label, NOW())'
        );
        $ins->execute([':u' => $userId, ':ref' => $reference, ':label' => $label ?? 'Default profile']);

        $stmt->execute([':u' => $userId]);
        $profile = $stmt->fetch();
        return is_array($profile) ? $profile : throw new RuntimeException('Profile missing after insert.');
    }

    /** @return array<string,mixed> The created alias row. */
    public function createAlias(int $userId, string $alias, string $aliasType = 'HANDLE'): array
    {
        $alias = trim($alias);
        if ($alias === '') {
            throw new RuntimeException('alias is required.');
        }
        $aliasType = strtoupper($aliasType);
        if (!in_array($aliasType, self::ALIAS_TYPES, true)) {
            throw new RuntimeException('alias_type must be one of: ' . implode(', ', self::ALIAS_TYPES));
        }
        $profile = $this->ensureProfile($userId);

        try {
            $ins = $this->db->prepare(
                'INSERT INTO payment_aliases (profile_id, alias, alias_type, created_at)
                 VALUES (:p, :a, :t, NOW())'
            );
            $ins->execute([':p' => (int) $profile['id'], ':a' => $alias, ':t' => $aliasType]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new RuntimeException('That alias is already taken.');
            }
            throw $e;
        }

        return ['id' => (int) $this->db->lastInsertId(), 'alias' => $alias, 'alias_type' => $aliasType];
    }

    /** @return array<string,mixed> The created credential row. */
    public function createCredential(int $userId, string $type, ?string $tokenReference = null, ?string $expiresAt = null): array
    {
        $type = strtoupper($type);
        if (!in_array($type, self::CRED_TYPES, true)) {
            throw new RuntimeException('type must be one of: ' . implode(', ', self::CRED_TYPES));
        }
        $profile   = $this->ensureProfile($userId);
        $reference = Reference::generate('VPC');

        $ins = $this->db->prepare(
            'INSERT INTO virtual_credentials (profile_id, credential_reference, type, token_reference, expires_at, created_at)
             VALUES (:p, :ref, :type, :token, :exp, NOW())'
        );
        $ins->execute([
            ':p'     => (int) $profile['id'],
            ':ref'   => $reference,
            ':type'  => $type,
            ':token' => $tokenReference, // opaque only — never a PAN
            ':exp'   => $expiresAt,
        ]);

        return ['credential_reference' => $reference, 'type' => $type];
    }

    /** @return array<string,mixed> Profile with aliases + credentials. */
    public function overview(int $userId): array
    {
        $profile = $this->ensureProfile($userId);

        $a = $this->db->prepare('SELECT alias, alias_type, is_active FROM payment_aliases WHERE profile_id = :p ORDER BY id');
        $a->execute([':p' => (int) $profile['id']]);

        $c = $this->db->prepare('SELECT credential_reference, type, is_active, expires_at FROM virtual_credentials WHERE profile_id = :p ORDER BY id');
        $c->execute([':p' => (int) $profile['id']]);

        return [
            'profile_reference' => $profile['profile_reference'],
            'aliases'           => $a->fetchAll(),
            'credentials'       => $c->fetchAll(),
        ];
    }
}
