<?php
/**
 * Company team: invite colleagues by e-mail, change roles, remove members.
 *
 * A person belongs to one company for now (Tenant::forUser takes the first),
 * so an e-mail whose account already belongs to a company cannot be invited.
 * The owner manages admins; admins manage members. The invitation link holds
 * a random token whose SHA-256 alone is stored. Removing someone deactivates
 * their account (their name stays on past work) and unassigns their open
 * tasks and tickets. Times are Mauritius local time, written by the application.
 */
declare(strict_types=1);

namespace App\Suite;

use App\Database;
use App\Mail\SmtpMailer;
use App\RendezVous\Booking;
use App\Validator;

final class Team
{
    public const ROLES = ['owner' => 'Propriétaire', 'admin' => 'Administrateur', 'member' => 'Membre'];

    private const VALID_DAYS         = 7;
    private const INVITES_PER_DAY    = 20;
    private const RESEND_AFTER_MIN   = 10;

    /**
     * @return list<array{id:int,name:string,email:string,role:string,joined_at:string}>
     */
    public static function members(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT u.id, COALESCE(NULLIF(u.name, \'\'), u.email) AS name, u.email, ou.role, ou.created_at AS joined_at
             FROM organization_users ou JOIN users u ON u.id = ou.user_id
             WHERE ou.organization_id = :oid AND u.is_active = 1
             ORDER BY FIELD(ou.role, \'owner\', \'admin\', \'member\'), name'
        );
        $stmt->execute([':oid' => $orgId]);
        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'], 'name' => (string) $r['name'], 'email' => (string) $r['email'],
            'role' => (string) $r['role'], 'joined_at' => (string) $r['joined_at'],
        ], $stmt->fetchAll());
    }

    /**
     * Pending invitations (not accepted, not expired).
     *
     * @return list<array<string,mixed>>
     */
    public static function invitations(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT i.id, i.email, i.role, i.created_at, i.expires_at, COALESCE(NULLIF(u.name, \'\'), u.email) AS invited_by
             FROM organization_invitations i LEFT JOIN users u ON u.id = i.invited_by
             WHERE i.organization_id = :oid AND i.accepted_at IS NULL AND i.expires_at > :now ORDER BY i.created_at DESC'
        );
        $stmt->execute([':oid' => $orgId, ':now' => Booking::now()->format('Y-m-d H:i:s')]);
        return $stmt->fetchAll();
    }

    /**
     * @param array{id:int,name:string,role:string} $org   the inviter's company and role
     * @param array<string,mixed>                   $user  the inviter
     * @return array{0:?string,1:?string} [invitation URL, error]
     */
    public static function invite(array $org, array $user, string $email, string $role): array
    {
        $email = mb_strtolower(trim($email));
        if (($err = Validator::email($email)) !== null) {
            return [null, $err];
        }
        if (!in_array($role, ['admin', 'member'], true)) {
            return [null, 'Rôle invalide.'];
        }
        if ($role === 'admin' && $org['role'] !== 'owner') {
            return [null, 'Seul le propriétaire peut inviter un administrateur.'];
        }

        $pdo  = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT ou.organization_id FROM users u LEFT JOIN organization_users ou ON ou.user_id = u.id WHERE u.email = :e'
        );
        $stmt->execute([':e' => $email]);
        foreach ($stmt->fetchAll() as $r) {
            if ($r['organization_id'] === null) {
                continue;
            }
            return [null, (int) $r['organization_id'] === $org['id']
                ? 'Cette personne fait déjà partie de l\'équipe.'
                : 'Cette adresse a déjà un compte MIPS rattaché à une autre entreprise. Pour l\'instant, un compte ne peut appartenir qu\'à une entreprise : demandez-lui une autre adresse.'];
        }

        $now = Booking::now();
        $pdo->beginTransaction();
        try {
            // Serialise invitations of one company: the daily cap and the resend delay hold under double clicks.
            $pdo->prepare('SELECT id FROM organizations WHERE id = :oid FOR UPDATE')->execute([':oid' => $org['id']]);
            $count = $pdo->prepare('SELECT COUNT(*) FROM organization_invitations WHERE organization_id = :oid AND created_at >= :since');
            $count->execute([':oid' => $org['id'], ':since' => $now->modify('-1 day')->format('Y-m-d H:i:s')]);
            if ((int) $count->fetchColumn() >= self::INVITES_PER_DAY) {
                $pdo->rollBack();
                return [null, 'Limite de ' . self::INVITES_PER_DAY . ' invitations par jour atteinte. Réessayez demain.'];
            }
            $prev = $pdo->prepare('SELECT created_at, accepted_at FROM organization_invitations WHERE organization_id = :oid AND email = :e');
            $prev->execute([':oid' => $org['id'], ':e' => $email]);
            $p = $prev->fetch();
            if (is_array($p) && $p['accepted_at'] === null
                && $p['created_at'] > $now->modify('-' . self::RESEND_AFTER_MIN . ' minutes')->format('Y-m-d H:i:s')) {
                $pdo->rollBack();
                return [null, 'Une invitation vient d\'être envoyée à cette adresse. Attendez ' . self::RESEND_AFTER_MIN . ' minutes avant de la renvoyer.'];
            }
            // A new invitation replaces the previous one (its link stops working).
            $pdo->prepare('DELETE FROM organization_invitations WHERE organization_id = :oid AND email = :e')
                ->execute([':oid' => $org['id'], ':e' => $email]);
            $token = bin2hex(random_bytes(32));
            $pdo->prepare(
                'INSERT INTO organization_invitations (organization_id, email, role, token_hash, invited_by, created_at, expires_at)
                 VALUES (:oid, :e, :r, :h, :by, :at, :exp)'
            )->execute([
                ':oid' => $org['id'], ':e' => $email, ':r' => $role, ':h' => hash('sha256', $token), ':by' => (int) $user['id'],
                ':at' => $now->format('Y-m-d H:i:s'), ':exp' => $now->modify('+' . self::VALID_DAYS . ' days')->format('Y-m-d H:i:s'),
            ]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        $url = self::url($token);
        self::safely(static fn () => self::mailInvitation($org, $user, $email, $role, $url));
        return [$url, null];
    }

    public static function revoke(int $orgId, int $id): ?string
    {
        $stmt = Database::connection()->prepare('DELETE FROM organization_invitations WHERE organization_id = :oid AND id = :id AND accepted_at IS NULL');
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        return $stmt->rowCount() === 1 ? null : 'Invitation introuvable.';
    }

    /**
     * A valid (pending, unexpired) invitation with its company name.
     *
     * @return array<string,mixed>|null
     */
    public static function findByToken(string $token): ?array
    {
        if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare(
            'SELECT i.*, o.name AS organization_name, COALESCE(NULLIF(u.name, \'\'), u.email) AS invited_by_name,
                    (SELECT COUNT(*) FROM users x WHERE x.email = i.email) AS has_account
             FROM organization_invitations i JOIN organizations o ON o.id = i.organization_id
             LEFT JOIN users u ON u.id = i.invited_by
             WHERE i.token_hash = :h AND i.accepted_at IS NULL AND i.expires_at > :now'
        );
        $stmt->execute([':h' => hash('sha256', $token), ':now' => Booking::now()->format('Y-m-d H:i:s')]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * Create (or reactivate) the account and join the company.
     *
     * @return array{0:?array<string,mixed>,1:?string} [user row for Auth::login_user, error]
     */
    public static function accept(string $token, string $name, string $password): array
    {
        $name = trim(preg_replace('/\s+/u', ' ', $name) ?? '');
        if (($err = Validator::name($name)) !== null) {
            return [null, $err];
        }
        if (($err = Validator::password($password, (int) ($GLOBALS['config']['security']['password_min_length'] ?? 8))) !== null) {
            return [null, $err];
        }
        $pdo = Database::connection();
        $now = Booking::now()->format('Y-m-d H:i:s');
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT * FROM organization_invitations WHERE token_hash = :h FOR UPDATE');
            $stmt->execute([':h' => hash('sha256', $token)]);
            $inv = $stmt->fetch();
            if (!is_array($inv) || $inv['accepted_at'] !== null || $inv['expires_at'] <= $now) {
                $pdo->rollBack();
                return [null, 'Cette invitation n\'est plus valable. Demandez-en une nouvelle.'];
            }
            $u = $pdo->prepare('SELECT id FROM users WHERE email = :e FOR UPDATE');
            $u->execute([':e' => $inv['email']]);
            $userId = $u->fetchColumn();
            $hash   = password_hash($password, PASSWORD_DEFAULT);
            if ($userId === false) {
                $pdo->prepare(
                    'INSERT INTO users (email, password_hash, name, role, is_active, created_at, updated_at) VALUES (:e, :h, :n, \'user\', 1, :at, :at2)'
                )->execute([':e' => $inv['email'], ':h' => $hash, ':n' => $name, ':at' => $now, ':at2' => $now]);
                $userId = (int) $pdo->lastInsertId();
            } else {
                $userId = (int) $userId;
                $m = $pdo->prepare('SELECT COUNT(*) FROM organization_users WHERE user_id = :u');
                $m->execute([':u' => $userId]);
                if ((int) $m->fetchColumn() > 0) {
                    $pdo->rollBack();
                    return [null, 'Ce compte appartient déjà à une entreprise. Connectez-vous avec votre mot de passe habituel.'];
                }
                // Account without a company (never activated, or removed from a team): the link proves the e-mail.
                $pdo->prepare('UPDATE users SET password_hash = :h, name = :n, is_active = 1, updated_at = :at WHERE id = :id')
                    ->execute([':h' => $hash, ':n' => $name, ':at' => $now, ':id' => $userId]);
            }
            $pdo->prepare('INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES (:oid, :u, :r, :at)')
                ->execute([':oid' => (int) $inv['organization_id'], ':u' => $userId, ':r' => $inv['role'], ':at' => $now]);
            $pdo->prepare('UPDATE organization_invitations SET accepted_at = :at WHERE id = :id')->execute([':at' => $now, ':id' => (int) $inv['id']]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        $row = $pdo->prepare('SELECT id, email, name, role, is_active FROM users WHERE id = :id');
        $row->execute([':id' => $userId]);
        return [$row->fetch(), null];
    }

    /**
     * @param array{id:int,name:string,role:string} $org
     */
    public static function setRole(array $org, int $actorId, int $userId, string $role): ?string
    {
        if ($org['role'] !== 'owner') {
            return 'Seul le propriétaire peut changer les rôles.';
        }
        if (!in_array($role, ['admin', 'member'], true)) {
            return 'Rôle invalide.';
        }
        $target = self::memberRole($org['id'], $userId);
        if ($target === null) {
            return 'Membre introuvable.';
        }
        if ($userId === $actorId || $target === 'owner') {
            return 'Le rôle du propriétaire ne se change pas.';
        }
        Database::connection()->prepare('UPDATE organization_users SET role = :r WHERE organization_id = :oid AND user_id = :u')
            ->execute([':r' => $role, ':oid' => $org['id'], ':u' => $userId]);
        return null;
    }

    /**
     * @param array{id:int,name:string,role:string} $org
     */
    public static function remove(array $org, int $actorId, int $userId): ?string
    {
        $target = self::memberRole($org['id'], $userId);
        if ($target === null) {
            return 'Membre introuvable.';
        }
        if ($userId === $actorId) {
            return 'Vous ne pouvez pas vous retirer vous-même.';
        }
        if ($target === 'owner') {
            return 'Le propriétaire ne peut pas être retiré.';
        }
        if ($target === 'admin' && $org['role'] !== 'owner') {
            return 'Seul le propriétaire peut retirer un administrateur.';
        }
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM organization_users WHERE organization_id = :oid AND user_id = :u')->execute([':oid' => $org['id'], ':u' => $userId]);
            $left = $pdo->prepare('SELECT COUNT(*) FROM organization_users WHERE user_id = :u');
            $left->execute([':u' => $userId]);
            if ((int) $left->fetchColumn() === 0) {
                // Single-company accounts: without a company the account would get an empty one at next login.
                $pdo->prepare('UPDATE users SET is_active = 0 WHERE id = :u')->execute([':u' => $userId]);
            }
            $pdo->prepare('UPDATE teamnest_tasks SET assignee_id = NULL WHERE organization_id = :oid AND assignee_id = :u AND status <> \'done\'')
                ->execute([':oid' => $org['id'], ':u' => $userId]);
            $pdo->prepare('UPDATE flowdesk_tickets SET assignee_id = NULL WHERE organization_id = :oid AND assignee_id = :u AND status IN (\'open\', \'pending\')')
                ->execute([':oid' => $org['id'], ':u' => $userId]);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        return null;
    }

    public static function url(string $token): string
    {
        return rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/') . '/invite.php?t=' . $token;
    }

    private static function memberRole(int $orgId, int $userId): ?string
    {
        $stmt = Database::connection()->prepare('SELECT role FROM organization_users WHERE organization_id = :oid AND user_id = :u');
        $stmt->execute([':oid' => $orgId, ':u' => $userId]);
        $r = $stmt->fetchColumn();
        return $r === false ? null : (string) $r;
    }

    /**
     * @param array{id:int,name:string,role:string} $org
     * @param array<string,mixed>                   $user
     */
    private static function mailInvitation(array $org, array $user, string $email, string $role, string $url): void
    {
        if (!SmtpMailer::isConfigured()) {
            return;
        }
        $by   = (string) ($user['name'] ?? '') !== '' ? (string) $user['name'] : (string) $user['email'];
        $text = 'Bonjour,' . "\n\n" . $by . ' vous invite à rejoindre ' . $org['name'] . ' sur MIPS, en tant que '
              . mb_strtolower(self::ROLES[$role]) . '.' . "\n\n" . 'Pour accepter, choisissez votre mot de passe ici (lien valable '
              . self::VALID_DAYS . ' jours) :' . "\n" . $url . "\n\n" . 'Si vous ne connaissez pas cette entreprise, ignorez ce message.' . "\n";
        SmtpMailer::fromConfig()->send($email, 'Invitation à rejoindre ' . str_replace(["\r", "\n"], ' ', $org['name']) . ' sur MIPS',
            $text, '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">' . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>',
            'MIPS', null);
    }

    private static function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            error_log('[Team mail] ' . $e->getMessage());
        }
    }
}
