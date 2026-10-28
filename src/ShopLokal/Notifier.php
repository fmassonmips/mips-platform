<?php
/**
 * ShopLokal e-mails: order received (customer and shop), status changes
 * (customer). In the company's document language for the customer.
 * Never blocks an order.
 */
declare(strict_types=1);

namespace App\ShopLokal;

use App\Facturo\Money;
use App\Mail\SmtpMailer;
use App\Suite\Tenant;

final class Notifier
{
    /**
     * @param array<string,mixed>|null $o
     */
    public static function placed(int $orgId, ?array $o): void
    {
        if ($o === null || !SmtpMailer::isConfigured()) {
            return;
        }
        $profile = Tenant::profile($orgId);
        $t       = Text::for($profile['document_language']);
        $shop    = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
        $summary = self::summary($orgId, $o, $t);
        if ($o['email'] !== null) {
            self::send((string) $o['email'], sprintf($t['mail_new'], $o['number'], $shop),
                implode("\n", [sprintf($t['mail_hello'], $o['customer_name']), '', $t['mail_received'], '', $summary, '',
                    sprintf($t['mail_link'], self::orderUrl((string) $o['token'])), '', $t['mail_regards'], $shop]), $shop,
                $profile['email'] !== '' ? $profile['email'] : null);
        }
        $to = Settings::get($orgId)['notify_email'];
        if ($to !== '') {
            $fr = Text::for('fr');
            self::send($to, 'Nouvelle commande n° ' . $o['number'] . ' – ' . $o['customer_name'] . ' – ' . Money::format((int) $o['total_cents'], 'MUR'),
                implode("\n", ['Nouvelle commande en ligne :', '', self::summary($orgId, $o, $fr), '',
                    'Client : ' . $o['customer_name'] . ' · ' . $o['phone'] . ($o['email'] ? ' · ' . $o['email'] : ''),
                    $o['note'] ? 'Message : ' . $o['note'] : '', '',
                    'Traiter : ' . self::baseUrl() . '/app.php?m=shoplokal&p=order&id=' . (int) $o['id']]), 'ShopLokal', null);
        }
    }

    /**
     * @param array<string,mixed>|null $o
     */
    public static function statusChanged(int $orgId, ?array $o): void
    {
        if ($o === null || $o['email'] === null || !SmtpMailer::isConfigured()) {
            return;
        }
        $profile = Tenant::profile($orgId);
        $t       = Text::for($profile['document_language']);
        $shop    = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
        $status  = $t['st_' . $o['status']];
        self::send((string) $o['email'], sprintf($t['mail_status'], $o['number'], $status, $shop),
            implode("\n", [sprintf($t['mail_hello'], $o['customer_name']), '', sprintf($t['mail_changed'], mb_strtolower($status)), '',
                sprintf($t['mail_link'], self::orderUrl((string) $o['token'])), '', $t['mail_regards'], $shop]), $shop,
            $profile['email'] !== '' ? $profile['email'] : null);
    }

    public static function orderUrl(string $token): string
    {
        return self::baseUrl() . '/shoplokal/o.php?t=' . $token;
    }

    public static function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            error_log('[ShopLokal mail] ' . $e->getMessage());
        }
    }

    /**
     * @param array<string,mixed>  $o
     * @param array<string,string> $t
     */
    private static function summary(int $orgId, array $o, array $t): string
    {
        $lines = [];
        foreach ($o['lines'] as $l) {
            $lines[] = '• ' . $l['quantity'] . ' × ' . $l['name'] . ' — ' . Money::format((int) $l['line_total_cents'] + (int) $l['line_tax_cents'], 'MUR');
        }
        if ((int) $o['delivery_cents'] > 0) {
            $lines[] = '• ' . $t['delivery'] . ' — ' . Money::format(Products::ttc((int) $o['delivery_cents'], Orders::serviceTaxCode($orgId)), 'MUR');
        }
        $lines[] = $t['total'] . ' : ' . Money::format((int) $o['total_cents'], 'MUR');
        $s = Settings::get($orgId);
        $lines[] = $o['delivery_method'] === 'pickup' ? sprintf($t['pickup_at'], $s['pickup_address']) : sprintf($t['deliver_to'], $o['address']);
        $lines[] = match ($o['payment_method']) {
            'bank'  => sprintf($t['pay_bank_how'], $s['bank_details'], $o['number']),
            'juice' => sprintf($t['pay_juice_how'], $s['juice_number'], $o['number']),
            default => $t['pay_cod_how'],
        };
        return implode("\n", $lines);
    }

    private static function send(string $to, string $subject, string $text, string $from, ?string $replyTo): void
    {
        $text = preg_replace("/\n{3,}/", "\n\n", $text) . "\n";
        SmtpMailer::fromConfig()->send($to, str_replace(["\r", "\n"], ' ', $subject), $text,
            '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1f24">' . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>',
            $from, $replyTo);
    }

    private static function baseUrl(): string
    {
        return rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/');
    }
}
