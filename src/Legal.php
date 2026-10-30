<?php
/**
 * Terms of use (CGU) and privacy policy: the version in force, the
 * publisher's details (config legal.*) and the acceptance of each user.
 *
 * Bump VERSION when either text changes in substance: every user who
 * accepted an older version sees « Nos conditions ont changé » on the
 * dashboard until they accept the new one. Details left empty in the config
 * print as a bracketed placeholder, so a missing fact is visible, never
 * invented. config legal.draft = true shows a « version provisoire » banner
 * on both pages until the texts are validated by a lawyer.
 */
declare(strict_types=1);

namespace App;

final class Legal
{
    public const VERSION = '2026-10-30';

    private const LABELS = [
        'company'        => 'raison sociale de l’éditeur',
        'address'        => 'adresse du siège',
        'brn'            => 'BRN',
        'contact_email'  => 'e-mail de contact',
        'privacy_email'  => 'e-mail pour les données personnelles',
        'host'           => 'hébergeur et pays d’hébergement',
        'mail_provider'  => 'service d’envoi d’e-mails',
    ];

    /** A publisher detail from the config, or « [label à compléter] ». */
    public static function get(string $key): string
    {
        $v = trim((string) ($GLOBALS['config']['legal'][$key] ?? ''));
        return $v !== '' ? $v : '[' . (self::LABELS[$key] ?? $key) . ' à compléter]';
    }

    public static function isDraft(): bool
    {
        return ($GLOBALS['config']['legal']['draft'] ?? true) !== false;
    }

    /** True when the user accepted the version in force. */
    public static function accepted(array $user): bool
    {
        return ($user['terms_version'] ?? null) === self::VERSION;
    }

    /** Record that the user accepts the version in force. */
    public static function accept(int $userId): void
    {
        Database::connection()->prepare('UPDATE users SET terms_version = :v, terms_accepted_at = NOW() WHERE id = :id')
            ->execute([':v' => self::VERSION, ':id' => $userId]);
    }
}
