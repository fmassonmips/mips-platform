<?php
/**
 * Self-service accounts: e-mail confirmation at sign-up, password reset.
 *
 * Links carry a random token whose SHA-256 alone is stored; a link works
 * once, within its lifetime, and a new one replaces the previous ones. The
 * answers never tell whether an e-mail has an account (no enumeration):
 * sign-up and "forgot password" always reply the same, the e-mail says the
 * rest. Each address gets at most 3 links per hour. Without SMTP, sign-up
 * falls back to manual activation by an administrator.
 */
declare(strict_types=1);

namespace App;

use App\Mail\SmtpMailer;

final class Accounts
{
    private const LIFETIME = ['verify' => '+48 hours', 'reset' => '+1 hour', 'notice' => '+1 hour'];   // notice: counts "already registered" e-mails, never a link
    private const LINKS_PER_HOUR = 3;

    /**
     * After a valid sign-up form: create the (inactive) account and send the
     * confirmation link, or tell the owner of an existing address by e-mail.
     */
    public static function register(string $email, string $name, string $password): void
    {
        $pdo  = Database::connection();
        $stmt = $pdo->prepare('SELECT id, name, is_active FROM users WHERE email = :e');
        $stmt->execute([':e' => $email]);
        $user = $stmt->fetch();
        if (!is_array($user)) {
            $now = self::now();
            $pdo->prepare(
                'INSERT INTO users (email, password_hash, name, role, is_active, created_at, updated_at) VALUES (:e, :h, :n, \'user\', 0, :at, :at2)'
            )->execute([':e' => $email, ':h' => password_hash($password, PASSWORD_DEFAULT), ':n' => $name, ':at' => $now, ':at2' => $now]);
            self::sendVerification((int) $pdo->lastInsertId(), $email, $name);
            return;
        }
        // Existing address: never touch its password here (anyone can type an e-mail).
        if ((int) $user['is_active'] === 0 && self::hasTokens((int) $user['id'], 'verify')) {
            self::sendVerification((int) $user['id'], $email, (string) $user['name']);
        } elseif ((int) $user['is_active'] === 1 && self::underLimit((int) $user['id'], 'notice')) {
            self::issue((int) $user['id'], 'notice');
            self::send($email, 'Votre compte MIPS existe déjà',
                "Bonjour,\n\nQuelqu'un (sans doute vous) a voulu créer un compte MIPS avec cette adresse, qui en a déjà un.\n\n"
                . 'Se connecter : ' . self::url('/login.php') . "\nMot de passe oublié : " . self::url('/forgot.php')
                . "\n\nSi ce n'était pas vous, ignorez ce message : rien n'a changé.\n");
        }
    }

    /**
     * Correct password on an account never confirmed: send the link again.
     * Returns whether the account is such a pending sign-up.
     */
    public static function resendIfPending(string $email, string $password): bool
    {
        $stmt = Database::connection()->prepare('SELECT id, name, password_hash, is_active FROM users WHERE email = :e');
        $stmt->execute([':e' => $email]);
        $u = $stmt->fetch();
        if (!is_array($u) || (int) $u['is_active'] === 1 || !self::hasTokens((int) $u['id'], 'verify')
            || !password_verify($password, (string) $u['password_hash'])) {
            return false;
        }
        self::sendVerification((int) $u['id'], $email, (string) $u['name']);
        return true;
    }

    /**
     * Confirm the address: activates the account. Returns the user row to log in.
     *
     * @return array<string,mixed>|null
     */
    public static function verify(string $token): ?array
    {
        $userId = self::consume($token, 'verify');
        if ($userId === null) {
            return null;
        }
        $pdo = Database::connection();
        $pdo->prepare('UPDATE users SET is_active = 1, updated_at = :at WHERE id = :id')->execute([':at' => self::now(), ':id' => $userId]);
        return self::user($userId);
    }

    /** "Forgot password": a reset link for an active account; silent otherwise. */
    public static function forgot(string $email): void
    {
        $stmt = Database::connection()->prepare('SELECT id, name FROM users WHERE email = :e AND is_active = 1');
        $stmt->execute([':e' => $email]);
        $u = $stmt->fetch();
        if (!is_array($u) || !self::underLimit((int) $u['id'], 'reset')) {
            return;
        }
        $token = self::issue((int) $u['id'], 'reset');
        self::send($email, 'Réinitialiser votre mot de passe MIPS',
            'Bonjour ' . ($u['name'] ?: '') . ",\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure, une seule fois) :\n"
            . self::url('/reset.php?t=' . $token) . "\n\nSi vous n'avez rien demandé, ignorez ce message : votre mot de passe ne change pas.\n");
    }

    /** True when a reset link can still be used (to show the form). */
    public static function resetLinkValid(string $token): bool
    {
        return self::find($token, 'reset') !== null;
    }

    /**
     * New password from a reset link. Logs out the account's other sessions.
     *
     * @return array{0:?array<string,mixed>,1:?string} [user row to log in, error]
     */
    public static function reset(string $token, string $password): array
    {
        $minLen = (int) ($GLOBALS['config']['security']['password_min_length'] ?? 8);
        if (($err = Validator::password($password, $minLen)) !== null) {
            return [null, $err];
        }
        $userId = self::consume($token, 'reset');
        if ($userId === null) {
            return [null, 'Ce lien n\'est plus valable. Demandez-en un nouveau.'];
        }
        $now = self::now();
        Database::connection()->prepare('UPDATE users SET password_hash = :h, password_changed_at = :at, updated_at = :at2 WHERE id = :id AND is_active = 1')
            ->execute([':h' => password_hash($password, PASSWORD_DEFAULT), ':at' => $now, ':at2' => $now, ':id' => $userId]);
        $user = self::user($userId);
        return $user !== null && (int) $user['is_active'] === 1 ? [$user, null] : [null, 'Ce compte est désactivé.'];
    }

    private static function sendVerification(int $userId, string $email, string $name): void
    {
        if (!self::underLimit($userId, 'verify')) {
            return;
        }
        $token = self::issue($userId, 'verify');
        self::send($email, 'Confirmez votre adresse pour MIPS',
            'Bonjour ' . $name . ",\n\nPour activer votre compte MIPS, confirmez votre adresse (lien valable 48 heures) :\n"
            . self::url('/verify.php?t=' . $token) . "\n\nSi vous n'avez pas créé de compte, ignorez ce message.\n");
    }

    /** New link; the previous unused links of the same kind stop working. */
    private static function issue(int $userId, string $purpose): string
    {
        $pdo = Database::connection();
        $now = self::now();
        $pdo->prepare('UPDATE user_tokens SET used_at = :at WHERE user_id = :u AND purpose = :p AND used_at IS NULL')
            ->execute([':at' => $now, ':u' => $userId, ':p' => $purpose]);
        $token = bin2hex(random_bytes(32));
        $pdo->prepare('INSERT INTO user_tokens (user_id, purpose, token_hash, created_at, expires_at) VALUES (:u, :p, :h, :at, :exp)')
            ->execute([':u' => $userId, ':p' => $purpose, ':h' => hash('sha256', $token), ':at' => $now,
                ':exp' => (new \DateTimeImmutable($now))->modify(self::LIFETIME[$purpose])->format('Y-m-d H:i:s')]);
        return $token;
    }

    /** The user of a valid link, which is used up (one use, even with two clicks at once). */
    private static function consume(string $token, string $purpose): ?int
    {
        if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
            return null;
        }
        $pdo = Database::connection();
        $now = self::now();
        $upd = $pdo->prepare(
            'UPDATE user_tokens SET used_at = :at WHERE token_hash = :h AND purpose = :p AND used_at IS NULL AND expires_at > :now'
        );
        $upd->execute([':at' => $now, ':h' => hash('sha256', $token), ':p' => $purpose, ':now' => $now]);
        if ($upd->rowCount() !== 1) {
            return null;
        }
        $stmt = $pdo->prepare('SELECT user_id FROM user_tokens WHERE token_hash = :h');
        $stmt->execute([':h' => hash('sha256', $token)]);
        return (int) $stmt->fetchColumn();
    }

    private static function find(string $token, string $purpose): ?int
    {
        if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare(
            'SELECT t.user_id FROM user_tokens t JOIN users u ON u.id = t.user_id
             WHERE t.token_hash = :h AND t.purpose = :p AND t.used_at IS NULL AND t.expires_at > :now AND (t.purpose = \'verify\' OR u.is_active = 1)'
        );
        $stmt->execute([':h' => hash('sha256', $token), ':p' => $purpose, ':now' => self::now()]);
        $id = $stmt->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    private static function hasTokens(int $userId, string $purpose): bool
    {
        $stmt = Database::connection()->prepare('SELECT COUNT(*) FROM user_tokens WHERE user_id = :u AND purpose = :p');
        $stmt->execute([':u' => $userId, ':p' => $purpose]);
        return (int) $stmt->fetchColumn() > 0;
    }

    private static function underLimit(int $userId, string $purpose): bool
    {
        $stmt = Database::connection()->prepare('SELECT COUNT(*) FROM user_tokens WHERE user_id = :u AND purpose = :p AND created_at > :since');
        $stmt->execute([':u' => $userId, ':p' => $purpose, ':since' => (new \DateTimeImmutable(self::now()))->modify('-1 hour')->format('Y-m-d H:i:s')]);
        return (int) $stmt->fetchColumn() < self::LINKS_PER_HOUR;
    }

    /**
     * @return array<string,mixed>|null
     */
    private static function user(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT id, email, name, role, is_active FROM users WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $u = $stmt->fetch();
        return is_array($u) ? $u : null;
    }

    private static function send(string $to, string $subject, string $text): void
    {
        try {
            SmtpMailer::fromConfig()->send($to, $subject, $text,
                '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">' . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>', 'MIPS', null);
        } catch (\Throwable $e) {
            error_log('[Accounts mail] ' . $e->getMessage());
        }
    }

    private static function url(string $path): string
    {
        return rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/') . $path;
    }

    /** Server-side clock in PHP, so token times and password_changed_at compare with session times. */
    private static function now(): string
    {
        return date('Y-m-d H:i:s');
    }
}
