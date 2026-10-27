<?php
/**
 * E-mails around an appointment: confirmation, cancellation and reminder to
 * the customer (in the company's document language), and a copy of online
 * bookings and cancellations to the business. Never blocks a booking.
 */
declare(strict_types=1);

namespace App\RendezVous;

use App\Database;
use App\Format;
use App\Mail\SmtpMailer;
use App\Suite\Tenant;

final class Notifier
{
    /**
     * @param array<string,mixed>|null $appt
     */
    public static function booked(int $orgId, ?array $appt): void
    {
        if ($appt === null) {
            return;
        }
        self::toCustomer($orgId, $appt, 'confirm');
        if ($appt['source'] === 'online') {
            self::toBusiness($orgId, $appt, 'Nouveau rendez-vous en ligne');
        }
    }

    /**
     * @param array<string,mixed>|null $appt
     */
    public static function cancelled(int $orgId, ?array $appt, bool $byCustomer): void
    {
        if ($appt === null) {
            return;
        }
        self::toCustomer($orgId, $appt, 'cancel');
        if ($byCustomer) {
            self::toBusiness($orgId, $appt, 'Rendez-vous annulé en ligne');
        }
    }

    /**
     * Send the reminders due: booked appointments starting in the next 24 hours,
     * booked more than 12 hours ahead, with an e-mail, not yet reminded.
     * Returns the number of e-mails sent.
     */
    public static function sendReminders(): int
    {
        if (!SmtpMailer::isConfigured()) {
            return 0;
        }
        $now  = Booking::now();
        $stmt = Database::connection()->prepare(
            'SELECT organization_id, id FROM rendezvous_appointments
             WHERE status = \'booked\' AND email IS NOT NULL AND reminder_sent_at IS NULL
               AND starts_at > :now AND starts_at <= :limit
               AND starts_at > created_at + INTERVAL 12 HOUR'
        );
        $stmt->execute([':now' => $now->format('Y-m-d H:i:s'), ':limit' => $now->modify('+24 hours')->format('Y-m-d H:i:s')]);
        $sent = 0;
        foreach ($stmt->fetchAll() as $r) {
            $appt = Booking::find((int) $r['organization_id'], (int) $r['id']);
            if ($appt !== null && self::toCustomer((int) $r['organization_id'], $appt, 'reminder')) {
                Database::connection()->prepare('UPDATE rendezvous_appointments SET reminder_sent_at = :now WHERE id = :id')
                    ->execute([':id' => (int) $r['id'], ':now' => Booking::now()->format('Y-m-d H:i:s')]);
                $sent++;
            }
        }
        return $sent;
    }

    public static function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            error_log('[RendezVous mail] ' . $e->getMessage());
        }
    }

    /**
     * @param array<string,mixed> $appt
     */
    private static function toCustomer(int $orgId, array $appt, string $kind): bool
    {
        if (empty($appt['email']) || !SmtpMailer::isConfigured()) {
            return false;
        }
        $profile = Tenant::profile($orgId);
        $t       = Text::for($profile['document_language']);
        // The shop name customers know (as on the booking page), not the legal name.
        $company = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
        $link    = self::manageUrl((string) $appt['token']);
        $intro   = ['confirm' => $t['mail_confirm'], 'cancel' => $t['mail_cancel'], 'reminder' => $t['mail_reminder']][$kind];
        $subject = sprintf(['confirm' => $t['mail_confirm_subject'], 'cancel' => $t['mail_cancel_subject'],
                            'reminder' => $t['mail_reminder_subject']][$kind], $company);

        $lines = [sprintf($t['mail_hello'], $appt['customer_name']), '', $intro, '', ...self::details($appt, $t, $profile['address'])];
        if ($kind !== 'cancel') {
            $lines[] = '';
            $lines[] = sprintf($t['mail_manage'], $link);
        }
        $lines[] = '';
        $lines[] = $t['mail_regards'];
        $lines[] = $company;
        $text = implode("\n", $lines) . "\n";
        $e    = static fn (string $v): string => htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
        $html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1f24">' . nl2br($e($text)) . '</div>';

        try {
            SmtpMailer::fromConfig()->send((string) $appt['email'], $subject, $text, $html, $company,
                $profile['email'] !== '' ? $profile['email'] : null);
            return true;
        } catch (\RuntimeException $ex) {
            error_log('[RendezVous mail] ' . $ex->getMessage());
            return false;
        }
    }

    /**
     * @param array<string,mixed> $appt
     */
    private static function toBusiness(int $orgId, array $appt, string $title): void
    {
        $to = Settings::get($orgId)['notify_email'];
        if ($to === '' || !SmtpMailer::isConfigured()) {
            return;
        }
        $t     = Text::for('fr');
        $lines = [$title . ' :', '', ...self::details($appt, $t, ''), 'Client : ' . $appt['customer_name']];
        if (!empty($appt['phone'])) {
            $lines[] = 'Téléphone : ' . $appt['phone'];
        }
        if (!empty($appt['email'])) {
            $lines[] = 'E-mail : ' . $appt['email'];
        }
        if (!empty($appt['note'])) {
            $lines[] = 'Message : ' . $appt['note'];
        }
        $lines[] = '';
        $lines[] = 'Agenda : ' . self::baseUrl() . '/app.php?m=rendezvous&d=' . substr((string) $appt['starts_at'], 0, 10);
        $text = implode("\n", $lines) . "\n";
        try {
            SmtpMailer::fromConfig()->send($to, $title . ' – ' . $appt['customer_name'] . ' – '
                . Format::dateTime((string) $appt['starts_at']), $text,
                '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">' . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>',
                'RendezVous', null);
        } catch (\RuntimeException $ex) {
            error_log('[RendezVous mail] ' . $ex->getMessage());
        }
    }

    /**
     * @param array<string,mixed>  $appt
     * @param array<string,string> $t
     * @return list<string>
     */
    private static function details(array $appt, array $t, string $address): array
    {
        $lines = [
            '• ' . $appt['service_name'] . ' (' . (int) $appt['duration_min'] . ' ' . $t['min'] . ')',
            '• ' . Format::date((string) $appt['starts_at']) . ' ' . $t['at'] . ' ' . substr((string) $appt['starts_at'], 11, 5),
            '• ' . $t['with'] . ' ' . $appt['staff_name'],
        ];
        if ($address !== '') {
            $lines[] = '• ' . str_replace(["\r\n", "\n"], ', ', $address);
        }
        return $lines;
    }

    public static function manageUrl(string $token): string
    {
        return self::baseUrl() . '/rendezvous/manage.php?t=' . $token;
    }

    private static function baseUrl(): string
    {
        return rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/');
    }
}
