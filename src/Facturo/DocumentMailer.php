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
use App\Format;
use App\Mail\SmtpMailer;
use App\Suite\Tenant;

final class DocumentMailer
{
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
        // Written in the document's language, like the document itself.
        $t      = Documents::text($doc);
        $amount = Money::format((int) $doc['total_cents'], (string) $doc['currency']);

        $line = sprintf($t['mail_' . $doc['type']], $doc['number'], $amount) . match (true) {
            $doc['type'] === 'quote' && $doc['due_date'] !== null   => sprintf($t['mail_valid_until'], Format::date($doc['due_date'])),
            $doc['type'] === 'invoice' && $doc['due_date'] !== null => sprintf($t['mail_due'], Format::date($doc['due_date'])),
            $doc['type'] === 'credit_note' && isset($doc['source']['number']) => sprintf($t['mail_relates_to'], $doc['source']['number']),
            default => '.',
        };

        return [
            'to'      => (string) ($doc['client']['email'] ?? ''),
            'subject' => "{$t[$doc['type']]} {$doc['number']} – $seller",
            'message' => "{$t['mail_hello']}\n\n$line\n\n{$t['mail_regards']}\n$seller",
        ];
    }

    /**
     * @return list<array<string,mixed>>
     */
    public static function history(int $orgId, int $documentId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT recipient, status, error, created_at, sent_by IS NULL AS automatic FROM facturo_document_emails
             WHERE organization_id = :oid AND document_id = :id ORDER BY id DESC'
        );
        $stmt->execute([':oid' => $orgId, ':id' => $documentId]);
        return $stmt->fetchAll();
    }

    /**
     * Send the document. Returns an error message, or null on success.
     * $userId null: automatic reminder (Facturo\Reminders).
     */
    public static function send(int $orgId, ?int $userId, int $documentId, string $to, string $subject, string $message): ?string
    {
        $doc = Documents::find($orgId, $documentId);
        if ($doc === null || $doc['status'] === 'draft') {
            return 'Seuls les documents émis peuvent être envoyés.';
        }
        if (in_array($doc['mra_status'], ['pending', 'rejected'], true)) {
            return 'Ce document n\'est pas encore fiscalisé par la MRA : il ne peut pas être envoyé avant de porter son QR code.';
        }
        if (!filter_var($to, FILTER_VALIDATE_EMAIL) || strlen($to) > 254) {
            return 'L\'e-mail du destinataire est invalide.';
        }
        $subject = trim(preg_replace('/[\r\n]+/', ' ', $subject) ?? '');
        if ($subject === '' || mb_strlen($subject) > 250) {
            return 'L\'objet est obligatoire (250 caractères max.).';
        }
        if (mb_strlen($message) > 5000) {
            return 'Le message est trop long.';
        }
        if (!SmtpMailer::isConfigured()) {
            return 'L\'envoi d\'e-mails n\'est pas configuré sur ce serveur.';
        }

        $profile = Tenant::profile($orgId);
        $seller  = $profile['legal_name'] !== '' ? $profile['legal_name'] : $profile['name'];
        $link    = rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/')
                 . '/facturo/view.php?t=' . Documents::publicToken($orgId, $documentId);
        $t       = Documents::text($doc);
        $title   = $t[$doc['type']] . ' ' . $doc['number'];

        $text = $message . "\n\n" . sprintf($t['mail_link'], $title) . "\n" . $link . "\n";
        $e    = static fn (string $v): string => htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
        $html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1f24">'
              . nl2br($e($message))
              . '<p style="margin:24px 0"><a href="' . $e($link) . '" style="background:#2b6cb0;color:#fff;'
              . 'padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">'
              . $e(sprintf($t['mail_button'], $title)) . '</a></p></div>';

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
            $error  = 'L\'e-mail n\'a pas pu être envoyé. Réessayez plus tard.';
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
