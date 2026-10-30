<?php
/**
 * Automatic e-mails of the suite, each sent once (notification_log):
 *  - end of trial: 7 days before, the day before, and the day the app turns
 *    read-only, to the owner and administrators; one e-mail per company and
 *    step, listing the apps concerned. A trial extended from the back-office
 *    gets its reminders again for its new end;
 *  - welcome, when a self-service account is confirmed.
 * A suspended company gets nothing.
 */
declare(strict_types=1);

namespace App\Suite;

use App\Database;
use App\Format;
use App\Mail\SmtpMailer;

final class Notifications
{
    /** Steps, most urgent first: [kind, SQL condition on trial_ends_at, subject]. */
    private const TRIAL_STEPS = [
        ['trial_end', 'm.trial_ends_at <= NOW() AND m.trial_ends_at > NOW() - INTERVAL 2 DAY', 'Votre essai est terminé : %s en lecture seule'],
        ['trial_1',   'm.trial_ends_at > NOW() AND m.trial_ends_at <= NOW() + INTERVAL 1 DAY', 'Dernier jour d’essai : %s'],
        ['trial_7',   'm.trial_ends_at > NOW() + INTERVAL 1 DAY AND m.trial_ends_at <= NOW() + INTERVAL 7 DAY', 'Plus que quelques jours d’essai : %s'],
    ];

    /**
     * Send the due end-of-trial reminders. Returns the number of e-mails sent.
     */
    public static function trialReminders(): int
    {
        if (!SmtpMailer::isConfigured()) {
            return 0;
        }
        $pdo  = Database::connection();
        $sent = 0;
        $done = [];   // org|slug already reminded in this run: one step per app at a time
        foreach (self::TRIAL_STEPS as [$kind, $when, $subject]) {
            $rows = $pdo->query(
                'SELECT m.organization_id, m.module_slug, m.trial_ends_at
                 FROM organization_modules m JOIN organizations o ON o.id = m.organization_id
                 WHERE m.status = \'trial\' AND m.trial_ends_at IS NOT NULL AND o.suspended_at IS NULL AND o.deletion_scheduled_at IS NULL AND ' . $when . '
                 ORDER BY m.organization_id, m.trial_ends_at'
            )->fetchAll();
            $byOrg = [];
            foreach ($rows as $r) {
                $key = $r['organization_id'] . '|' . $r['module_slug'];
                if (isset($done[$key])) {
                    continue;
                }
                $done[$key] = true;
                if (self::claim((int) $r['organization_id'], $kind, $r['module_slug'] . '@' . substr((string) $r['trial_ends_at'], 0, 10))) {
                    $byOrg[(int) $r['organization_id']][] = $r;
                }
            }
            foreach ($byOrg as $orgId => $apps) {
                try {
                    $sent += self::sendTrial($orgId, $kind, $subject, $apps);
                } catch (\Throwable $e) {
                    error_log('[Notifications] trial ' . $orgId . ': ' . $e->getMessage());
                    foreach ($apps as $a) {   // not sent: try again next run
                        self::release($orgId, $kind, $a['module_slug'] . '@' . substr((string) $a['trial_ends_at'], 0, 10));
                    }
                }
            }
        }
        return $sent;
    }

    /**
     * Welcome e-mail after a self-service sign-up is confirmed (once per user).
     *
     * @param array<string,mixed> $user
     */
    public static function welcome(array $user): void
    {
        if (!SmtpMailer::isConfigured()) {
            return;
        }
        $org = Tenant::forUser($user);
        if (!self::claim($org['id'], 'welcome', (string) $user['id'])) {
            return;
        }
        $name = trim((string) ($user['name'] ?? ''));
        $text = 'Bonjour' . ($name !== '' ? ' ' . $name : '') . ",\n\n"
              . "Bienvenue sur MIPS ! Votre compte est actif. Pour bien démarrer, comptez dix minutes :\n\n"
              . '1. Complétez le profil de votre entreprise (raison sociale, BRN : ils figurent sur vos documents).' . "\n"
              . '2. Choisissez vos apps : chacune est gratuite 30 jours, sans engagement.' . "\n"
              . '3. Importez vos clients ou vos produits depuis Excel, et invitez votre équipe.' . "\n\n"
              . 'Commencer : ' . self::url('/welcome.php') . "\n\n"
              . self::contactLine()
              . "\nL’équipe MIPS\n";
        self::send((string) $user['email'], 'Bienvenue sur MIPS', $text);
    }

    /**
     * Record that an e-mail is being sent; false when it already was (or another run is sending it).
     */
    public static function claim(int $orgId, string $kind, string $ref): bool
    {
        $stmt = Database::connection()->prepare(
            'INSERT IGNORE INTO notification_log (organization_id, kind, ref, sent_at) VALUES (:o, :k, :r, NOW())'
        );
        $stmt->execute([':o' => $orgId, ':k' => $kind, ':r' => mb_substr($ref, 0, 80)]);
        return $stmt->rowCount() === 1;
    }

    /** Forget a claim whose e-mail could not be sent, so the next run tries again. */
    public static function release(int $orgId, string $kind, string $ref): void
    {
        Database::connection()->prepare('DELETE FROM notification_log WHERE organization_id = :o AND kind = :k AND ref = :r')
            ->execute([':o' => $orgId, ':k' => $kind, ':r' => mb_substr($ref, 0, 80)]);
    }

    /**
     * @param list<array<string,mixed>> $apps
     */
    private static function sendTrial(int $orgId, string $kind, string $subject, array $apps): int
    {
        $names = array_map(static fn (array $a): string => (string) (Catalog::get((string) $a['module_slug'])['name'] ?? $a['module_slug']), $apps);
        $list  = implode("\n", array_map(
            static fn (array $a, string $n): string => '- ' . $n . ' : ' . ($kind === 'trial_end' ? 'en lecture seule depuis le ' : 'essai jusqu’au ') . Format::dateTime((string) $a['trial_ends_at']),
            $apps, $names
        ));
        $intro = match ($kind) {
            'trial_end' => "L’essai gratuit de ces apps est terminé :\n\n" . $list . "\n\n"
                . "Rien n’est perdu : vos données restent consultables, imprimables et exportables. Pour continuer à les utiliser (créer, modifier, recevoir des commandes ou des réservations en ligne), passez à l’abonnement.",
            'trial_1'   => "Votre essai gratuit se termine demain :\n\n" . $list . "\n\n"
                . "Ensuite, l’app passe en lecture seule : vos données restent consultables, mais plus rien ne peut être créé ni modifié, et vos pages publiques (réservation, boutique, formulaires) ferment.",
            default     => "Votre essai gratuit se termine bientôt :\n\n" . $list . "\n\n"
                . "Pour continuer sans interruption, passez à l’abonnement avant la fin de l’essai. Une question, un besoin de plus de temps pour tester ? Répondez à cet e-mail.",
        };
        $text = "Bonjour,\n\n" . $intro . "\n\n" . self::contactLine() . "\nVotre tableau de bord : " . self::url('/dashboard.php') . "\n\nL’équipe MIPS\n";
        $title = sprintf($subject, implode(', ', $names));
        $sent = 0;
        foreach (self::managers($orgId) as $email) {
            self::send($email, $title, $text, true);
            $sent++;
        }
        return $sent;
    }

    /**
     * Active owner and administrators of the company.
     *
     * @return list<string>
     */
    private static function managers(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT u.email FROM organization_users ou JOIN users u ON u.id = ou.user_id
             WHERE ou.organization_id = :o AND ou.role IN (\'owner\', \'admin\') AND u.is_active = 1'
        );
        $stmt->execute([':o' => $orgId]);
        return array_map('strval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    }

    private static function contactLine(): string
    {
        $contact = trim((string) ($GLOBALS['config']['billing']['contact_email'] ?? ''));
        return $contact !== '' ? 'Abonnement ou question : ' . $contact . "\n" : '';
    }

    /**
     * @param bool $throw true: errors go to the caller (the claim is released); false: logged
     */
    private static function send(string $to, string $subject, string $text, bool $throw = false): void
    {
        $contact = trim((string) ($GLOBALS['config']['billing']['contact_email'] ?? ''));
        try {
            SmtpMailer::fromConfig()->send($to, str_replace(["\r", "\n"], ' ', $subject), $text,
                '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">' . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>',
                'MIPS', $contact !== '' && filter_var($contact, FILTER_VALIDATE_EMAIL) ? $contact : null);
        } catch (\Throwable $e) {
            if ($throw) {
                throw $e;
            }
            error_log('[Notifications] ' . $e->getMessage());
        }
    }

    private static function url(string $path): string
    {
        return rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/') . $path;
    }
}
