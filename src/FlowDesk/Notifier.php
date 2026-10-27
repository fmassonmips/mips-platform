<?php
/**
 * FlowDesk e-mails. Customers: acknowledgement and each reply, with the link
 * to their ticket page (replies are made there, no inbound mail parsing).
 * Business: new tickets and customer replies, to the assignee or else the
 * notification address. Never blocks the ticket.
 */
declare(strict_types=1);

namespace App\FlowDesk;

use App\Mail\SmtpMailer;
use App\Suite\Tenant;

final class Notifier
{
    /**
     * @param array<string,mixed>|null $ticket
     */
    public static function created(int $orgId, ?array $ticket, string $body): void
    {
        if ($ticket === null) {
            return;
        }
        $t = self::text($orgId);
        self::toCustomer($orgId, $ticket, sprintf($t['mail_new_subject'], $ticket['number'], $ticket['subject']), $t['mail_received'], null);
        if ($ticket['source'] !== 'staff') {
            self::toTeam($orgId, $ticket, 'Nouveau ticket', $body);
        }
    }

    /**
     * @param array<string,mixed>|null $ticket
     */
    public static function replied(int $orgId, ?array $ticket, string $body): void
    {
        if ($ticket === null) {
            return;
        }
        $t = self::text($orgId);
        self::toCustomer($orgId, $ticket, sprintf($t['mail_reply_subject'], $ticket['number'], $ticket['subject']), $t['mail_replied'], $body);
    }

    /**
     * @param array<string,mixed>|null $ticket
     */
    public static function customerReplied(int $orgId, ?array $ticket, string $body): void
    {
        if ($ticket !== null) {
            self::toTeam($orgId, $ticket, 'Réponse du client', $body);
        }
    }

    public static function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            error_log('[FlowDesk mail] ' . $e->getMessage());
        }
    }

    public static function ticketUrl(string $token): string
    {
        return self::baseUrl() . '/flowdesk/t.php?t=' . $token;
    }

    /**
     * @param array<string,mixed> $ticket
     */
    private static function toCustomer(int $orgId, array $ticket, string $subject, string $intro, ?string $quoted): void
    {
        if (empty($ticket['email']) || !SmtpMailer::isConfigured()) {
            return;
        }
        $profile = Tenant::profile($orgId);
        $t       = Text::for($profile['document_language']);
        $company = $profile['name'] !== '' ? $profile['name'] : $profile['legal_name'];
        $lines   = [sprintf($t['mail_hello'], $ticket['customer_name']), '', $intro];
        if ($quoted !== null) {
            $lines[] = '';
            $lines[] = $quoted;
        }
        array_push($lines, '', sprintf($t['mail_link'], self::ticketUrl((string) $ticket['token'])), $t['mail_no_reply'], '',
            $t['mail_regards'], $company);
        self::send((string) $ticket['email'], $subject, implode("\n", $lines) . "\n", $company,
            $profile['email'] !== '' ? $profile['email'] : null);
    }

    /**
     * @param array<string,mixed> $ticket
     */
    private static function toTeam(int $orgId, array $ticket, string $title, string $body): void
    {
        $to = '';
        if ($ticket['assignee_id'] !== null) {
            $stmt = \App\Database::connection()->prepare('SELECT email FROM users WHERE id = :id AND is_active = 1');
            $stmt->execute([':id' => (int) $ticket['assignee_id']]);
            $to = (string) ($stmt->fetchColumn() ?: '');
        }
        if ($to === '') {
            $to = Settings::get($orgId)['notify_email'];
        }
        if ($to === '') {
            return;
        }
        $text = $title . ' — #' . $ticket['number'] . ' ' . $ticket['subject'] . "\n"
              . 'De : ' . $ticket['customer_name'] . ($ticket['email'] ? ' <' . $ticket['email'] . '>' : '')
              . ($ticket['phone'] ? ' · ' . $ticket['phone'] : '') . "\n\n" . $body . "\n\n"
              . 'Répondre : ' . self::baseUrl() . '/app.php?m=flowdesk&p=ticket&id=' . (int) $ticket['id'] . "\n";
        self::send($to, '[#' . $ticket['number'] . '] ' . $title . ' : ' . $ticket['subject'], $text, 'FlowDesk', null);
    }

    private static function send(string $to, string $subject, string $text, string $fromName, ?string $replyTo): void
    {
        if (!SmtpMailer::isConfigured()) {
            return;
        }
        $subject = str_replace(["\r", "\n"], ' ', $subject);
        $html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1f24">'
              . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>';
        SmtpMailer::fromConfig()->send($to, $subject, $text, $html, $fromName, $replyTo);
    }

    /** @return array<string,string> */
    private static function text(int $orgId): array
    {
        return Text::for(Tenant::profile($orgId)['document_language']);
    }

    private static function baseUrl(): string
    {
        return rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/');
    }
}
