<?php
/**
 * Bookora e-mails: request received (guest and owner), confirmed / cancelled
 * (guest, or owner when the guest cancels), double booking found by a
 * calendar import (owner). In the company's document language for guests.
 * Never blocks a booking.
 */
declare(strict_types=1);

namespace App\Bookora;

use App\Facturo\Money;
use App\Format;
use App\Mail\SmtpMailer;
use App\Suite\Tenant;

final class Notifier
{
    /**
     * @param array<string,mixed>|null $b
     */
    public static function requested(int $orgId, ?array $b): void
    {
        if ($b === null || !SmtpMailer::isConfigured()) {
            return;
        }
        [$t, $place, $reply] = self::context($orgId);
        if ($b['email'] !== null) {
            self::send((string) $b['email'], sprintf($t['mail_new'], $b['number'], $place),
                implode("\n", [sprintf($t['mail_hello'], $b['guest_name']), '', $t['mail_received'], '', self::summary($orgId, $b, $t), '',
                    self::payment($orgId, $b, $t), '', sprintf($t['mail_link'], self::bookingUrl((string) $b['token'])), '', $t['mail_regards'], $place]),
                $place, $reply);
        }
        self::owner($orgId, 'Demande de réservation n° ' . $b['number'] . ' – ' . $b['guest_name'] . ' – ' . $b['unit_name'],
            implode("\n", ['Nouvelle demande en ligne, à confirmer avant le ' . Format::dateTime((string) $b['hold_until']) . ' :', '',
                self::summary($orgId, $b, Text::for('fr')), '', 'Client : ' . $b['guest_name'] . ' · ' . $b['phone'] . ($b['email'] ? ' · ' . $b['email'] : ''),
                $b['note'] ? 'Message : ' . $b['note'] : '', '', 'Traiter : ' . self::adminUrl((int) $b['id'])]));
    }

    /**
     * @param array<string,mixed>|null $b
     */
    public static function confirmed(int $orgId, ?array $b): void
    {
        if ($b === null || $b['email'] === null || !SmtpMailer::isConfigured()) {
            return;
        }
        [$t, $place, $reply] = self::context($orgId);
        self::send((string) $b['email'], sprintf($t['mail_confirmed'], $b['number'], $place),
            implode("\n", [sprintf($t['mail_hello'], $b['guest_name']), '', $t['mail_is_confirmed'], '', self::summary($orgId, $b, $t), '',
                sprintf($t['mail_link'], self::bookingUrl((string) $b['token'])), '', $t['mail_regards'], $place]), $place, $reply);
    }

    /**
     * @param array<string,mixed>|null $b
     */
    public static function cancelled(int $orgId, ?array $b, bool $byGuest): void
    {
        if ($b === null || !SmtpMailer::isConfigured()) {
            return;
        }
        if ($byGuest) {
            self::owner($orgId, 'Demande n° ' . $b['number'] . ' annulée par le client – ' . $b['guest_name'],
                implode("\n", [$b['guest_name'] . ' a annulé sa demande :', '', self::summary($orgId, $b, Text::for('fr')), '', 'Détail : ' . self::adminUrl((int) $b['id'])]));
            return;
        }
        if ($b['email'] === null) {
            return;
        }
        [$t, $place, $reply] = self::context($orgId);
        self::send((string) $b['email'], sprintf($t['mail_cancelled'], $b['number'], $place),
            implode("\n", [sprintf($t['mail_hello'], $b['guest_name']), '', $t['mail_is_cancelled'], '', self::summary($orgId, $b, $t), '',
                $t['mail_regards'], $place]), $place, $reply);
    }

    public static function doubleBooking(int $orgId, string $unitName, string $warning): void
    {
        if (!SmtpMailer::isConfigured()) {
            return;
        }
        self::owner($orgId, 'Attention : double réservation – ' . $unitName,
            implode("\n", [$unitName . ' :', $warning, '', 'Planning : ' . self::baseUrl() . '/app.php?m=bookora']));
    }

    public static function bookingUrl(string $token): string
    {
        return self::baseUrl() . '/bookora/b.php?t=' . $token;
    }

    public static function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            error_log('[Bookora mail] ' . $e->getMessage());
        }
    }

    /**
     * @param array<string,mixed>  $b
     * @param array<string,string> $t
     */
    public static function payment(int $orgId, array $b, array $t): string
    {
        $s = Settings::get($orgId);
        if ((int) $b['deposit_cents'] <= 0) {
            return $t['no_deposit'];
        }
        $how = [];
        if ($s['bank_details'] !== '') {
            $how[] = sprintf($t['pay_bank'], $s['bank_details'], $b['number']);
        }
        if ($s['juice_number'] !== '') {
            $how[] = sprintf($t['pay_juice'], $s['juice_number'], $b['number']);
        }
        return sprintf($t['deposit'], Money::format((int) $b['deposit_cents'], 'MUR')) . "\n" . ($how !== [] ? implode("\n", $how) : $t['pay_contact']);
    }

    /**
     * @param array<string,mixed>  $b
     * @param array<string,string> $t
     */
    private static function summary(int $orgId, array $b, array $t): string
    {
        $s     = Settings::get($orgId);
        $lines = [(string) $b['unit_name'] . ' · ' . $b['guests'] . ' ' . mb_strtolower($t['guests'])];
        $lines[] = sprintf($t['arrival'], Format::date((string) $b['check_in']), $s['checkin_time'], Format::date((string) $b['check_out']), $s['checkout_time']);
        foreach ($b['lines'] as $l) {
            $lines[] = '• ' . $l['description'] . ' — ' . Money::format((int) $l['line_total_cents'] + (int) $l['line_tax_cents'], 'MUR');
        }
        $lines[] = $t['total'] . ' : ' . Money::format((int) $b['total_cents'], 'MUR');
        return implode("\n", $lines);
    }

    /**
     * @return array{0:array<string,string>,1:string,2:?string} [texts, place name, reply-to]
     */
    private static function context(int $orgId): array
    {
        $p = Tenant::profile($orgId);
        return [Text::for($p['document_language']), $p['name'] !== '' ? $p['name'] : $p['legal_name'], $p['email'] !== '' ? $p['email'] : null];
    }

    private static function owner(int $orgId, string $subject, string $text): void
    {
        $to = Settings::get($orgId)['notify_email'];
        if ($to !== '') {
            self::send($to, $subject, $text, 'Bookora', null);
        }
    }

    private static function send(string $to, string $subject, string $text, string $from, ?string $replyTo): void
    {
        $text = preg_replace("/\n{3,}/", "\n\n", $text) . "\n";
        SmtpMailer::fromConfig()->send($to, str_replace(["\r", "\n"], ' ', $subject), $text,
            '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1f24">' . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>',
            $from, $replyTo);
    }

    private static function adminUrl(int $id): string
    {
        return self::baseUrl() . '/app.php?m=bookora&p=booking&id=' . $id;
    }

    private static function baseUrl(): string
    {
        return rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/');
    }
}
