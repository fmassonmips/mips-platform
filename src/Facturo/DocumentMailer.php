<?php
/**
 * Sends an issued quote / invoice / credit note to a client by e-mail.
 *
 * The e-mail carries a short message and a private link to the document
 * (public_token), where the client can view, print or save it as PDF.
 * Every attempt, successful or not, is logged in facturo_document_emails.
 */
declare(strict_types=1);

namespace App\Facturo;

use App\Database;
use App\Mail\SmtpMailer;
use App\Suite\Tenant;

final class DocumentMailer
{
    private const TITLES = ['quote' => 'Quotation', 'invoice' => 'Invoice', 'credit_note' => 'Credit note'];

    /**
     * Pre-filled recipient, subject and message for the send form.
     *
     * @param array<string,mixed> $doc
     * @return array{to:string,subject:string,message:string}
     */
    public static function defaults(int $orgId, array $doc): array
    {
        $profile = Tenant::profile($orgId);
        $seller  = $profile['legal_name'] !== '' ? $profile['legal_name'] : $profile['name'];
        $title   = self::TITLES[$doc['type']];
        $amount  = Money::format((int) $doc['total_cents'], (string) $doc['currency']);

        $line = match ($doc['type']) {
            'quote'       => "Please find our quotation {$doc['number']} for {$amount}"
                             . ($doc['due_date'] !== null ? ", valid until {$doc['due_date']}." : '.'),
            'invoice'     => "Please find invoice {$doc['number']} for {$amount}"
                             . ($doc['due_date'] !== null ? ", due on {$doc['due_date']}." : '.'),
            'credit_note' => "Please find credit note {$doc['number']} for {$amount}"
                             . (isset($doc['source']['number']) ? ", relating to invoice {$doc['source']['number']}." : '.'),
        };

        return [
            'to'      => (string) ($doc['client']['email'] ?? ''),
            'subject' => "$title {$doc['number']} from $seller",
            'message' => "Hello,\n\n$line\n\nKind regards,\n$seller",
        ];
    }

    /**
     * @return list<array<string,mixed>>
     */
    public static function history(int $orgId, int $documentId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT recipient, status, error, created_at FROM facturo_document_emails
             WHERE organization_id = :oid AND document_id = :id ORDER BY id DESC'
        );
        $stmt->execute([':oid' => $orgId, ':id' => $documentId]);
        return $stmt->fetchAll();
    }

    /**
     * Send the document. Returns an error message, or null on success.
     */
    public static function send(int $orgId, int $userId, int $documentId, string $to, string $subject, string $message): ?string
    {
        $doc = Documents::find($orgId, $documentId);
        if ($doc === null || $doc['status'] === 'draft') {
            return 'Only issued documents can be sent.';
        }
        if (in_array($doc['mra_status'], ['pending', 'rejected'], true)) {
            return 'This document is not fiscalised by MRA yet; it cannot be sent before it carries its QR code.';
        }
        if (!filter_var($to, FILTER_VALIDATE_EMAIL) || strlen($to) > 254) {
            return 'Recipient e-mail is invalid.';
        }
        $subject = trim(preg_replace('/[\r\n]+/', ' ', $subject) ?? '');
        if ($subject === '' || mb_strlen($subject) > 250) {
            return 'Subject is required (max 250 characters).';
        }
        if (mb_strlen($message) > 5000) {
            return 'Message is too long.';
        }
        if (!SmtpMailer::isConfigured()) {
            return 'E-mail sending is not configured on this server.';
        }

        $profile = Tenant::profile($orgId);
        $seller  = $profile['legal_name'] !== '' ? $profile['legal_name'] : $profile['name'];
        $link    = rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/')
                 . '/facturo/view.php?t=' . Documents::publicToken($orgId, $documentId);
        $title   = self::TITLES[$doc['type']] . ' ' . $doc['number'];

        $text = $message . "\n\nView, print or download " . $title . ":\n" . $link . "\n";
        $e    = static fn (string $v): string => htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
        $html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1f24">'
              . nl2br($e($message))
              . '<p style="margin:24px 0"><a href="' . $e($link) . '" style="background:#2b6cb0;color:#fff;'
              . 'padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">View '
              . $e($title) . '</a></p></div>';

        $error  = null;
        $detail = null;
        try {
            SmtpMailer::fromConfig()->send(
                $to,
                $subject,
                $text,
                $html,
                $seller,
                $profile['email'] !== '' ? $profile['email'] : null
            );
        } catch (\RuntimeException $ex) {
            $detail = mb_substr($ex->getMessage(), 0, 500);
            $error  = 'The e-mail could not be sent. Please try again later.';
            error_log('[Facturo mail] ' . $detail);
        }

        Database::connection()->prepare(
            'INSERT INTO facturo_document_emails (organization_id, document_id, recipient, subject, status, error, sent_by)
             VALUES (:oid, :doc, :to, :subject, :status, :error, :by)'
        )->execute([
            ':oid'     => $orgId,
            ':doc'     => $documentId,
            ':to'      => $to,
            ':subject' => $subject,
            ':status'  => $error === null ? 'sent' : 'failed',
            ':error'   => $detail,
            ':by'      => $userId,
        ]);

        return $error;
    }
}
