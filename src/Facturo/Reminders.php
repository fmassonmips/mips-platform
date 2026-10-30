<?php
/**
 * Automatic reminders of overdue invoices, to the client, when the company
 * has switched them on (organizations.facturo_reminders_since): 7 days after
 * the due date, then 30 days. Only invoices falling due after the switch-on
 * date, issued and still unpaid, fiscalised when MRA is on, not fully
 * credited, with a client e-mail. Written in the invoice's language, sent
 * from the company like a manual e-mail (reply to its address) and listed in
 * the invoice's e-mail history. Each reminder is sent once.
 */
declare(strict_types=1);

namespace App\Facturo;

use App\Database;
use App\Format;
use App\Mail\SmtpMailer;
use App\RendezVous\Booking;
use App\Suite\Modules;
use App\Suite\Notifications;
use App\Suite\Tenant;

final class Reminders
{
    /** Stage => days after the due date. */
    public const STAGES = [1 => 7, 2 => 30];

    private const TEXT = [
        'fr' => [
            'subject' => [1 => 'Rappel : facture %s – %s', 2 => 'Second rappel : facture %s – %s'],
            'body'    => [
                1 => "Sauf erreur de notre part, la facture %s d'un montant de %s, arrivée à échéance le %s, n'a pas encore été réglée.\n\nSi le paiement est en cours, merci de ne pas tenir compte de ce message.",
                2 => "Nous revenons vers vous au sujet de la facture %s d'un montant de %s, échue depuis le %s et toujours impayée à ce jour.\n\nMerci de procéder au règlement ou de nous indiquer la date de paiement prévue.",
            ],
        ],
        'en' => [
            'subject' => [1 => 'Reminder: invoice %s – %s', 2 => 'Second reminder: invoice %s – %s'],
            'body'    => [
                1 => "According to our records, invoice %s for %s, due on %s, has not been paid yet.\n\nIf payment is already on its way, please disregard this message.",
                2 => "We are following up on invoice %s for %s, due since %s and still unpaid.\n\nPlease settle it or let us know when payment will be made.",
            ],
        ],
    ];

    /**
     * Send the due reminders of every company. Returns [sent, failed].
     *
     * @return array{0:int,1:int}
     */
    public static function run(): array
    {
        if (!SmtpMailer::isConfigured()) {
            return [0, 0];
        }
        $today = Booking::now()->format('Y-m-d');
        $sent = 0;
        $failed = 0;
        foreach ([2, 1] as $stage) {   // most overdue first: an invoice gets one reminder per run
            $stmt = Database::connection()->prepare(
                'SELECT d.organization_id, d.id
                 FROM facturo_documents d JOIN organizations o ON o.id = d.organization_id
                 WHERE o.facturo_reminders_since IS NOT NULL AND o.suspended_at IS NULL
                   AND d.type = \'invoice\' AND d.status = \'issued\' AND d.due_date IS NOT NULL
                   AND d.due_date >= DATE(o.facturo_reminders_since)
                   AND d.due_date <= DATE_SUB(:today, INTERVAL ' . self::STAGES[$stage] . ' DAY)
                   AND (d.mra_status IS NULL OR d.mra_status = \'fiscalised\')
                   AND NOT EXISTS (SELECT 1 FROM notification_log n WHERE n.organization_id = d.organization_id
                                   AND n.kind = :kind AND n.ref = CAST(d.id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci)
                 ORDER BY d.organization_id, d.id'
            );
            $stmt->execute([':today' => $today, ':kind' => 'invoice_' . $stage]);
            foreach ($stmt->fetchAll() as $r) {
                $orgId = (int) $r['organization_id'];
                $docId = (int) $r['id'];
                if (!Modules::isEnabled($orgId, 'facturo') || !Notifications::claim($orgId, 'invoice_' . $stage, (string) $docId)) {
                    continue;   // trial over (read-only): no automatic sending; or already sent / being sent
                }
                // Past 30 days without a first reminder (cron down, e-mail added late): one reminder, worded as
                // the first, and the first is marked done so that it never comes after.
                $first = $stage === 2 && Notifications::claim($orgId, 'invoice_1', (string) $docId);
                $error = self::send($orgId, $docId, $first ? 1 : $stage);
                if ($error === null) {
                    $sent++;
                    continue;
                }
                if ($error !== 'skip') {
                    $failed++;
                }
                Notifications::release($orgId, 'invoice_' . $stage, (string) $docId);   // try again tomorrow
                if ($first) {
                    Notifications::release($orgId, 'invoice_1', (string) $docId);
                }
            }
        }
        return [$sent, $failed];
    }

    /**
     * Switch on (from now) or off. Owner/admin, checked by the caller.
     */
    public static function setEnabled(int $orgId, bool $on): void
    {
        Database::connection()->prepare(
            'UPDATE organizations SET facturo_reminders_since = ' . ($on ? 'COALESCE(facturo_reminders_since, NOW())' : 'NULL') . ' WHERE id = :o'
        )->execute([':o' => $orgId]);
    }

    public static function since(int $orgId): ?string
    {
        $stmt = Database::connection()->prepare('SELECT facturo_reminders_since FROM organizations WHERE id = :o');
        $stmt->execute([':o' => $orgId]);
        $v = $stmt->fetchColumn();
        return is_string($v) ? $v : null;
    }

    /**
     * @return ?string null when sent, 'skip' when nothing is owed or no e-mail, else the error
     */
    private static function send(int $orgId, int $docId, int $wording): ?string
    {
        $doc = Documents::find($orgId, $docId);
        $to  = (string) ($doc['client']['email'] ?? '');
        $due = Documents::creditableCents($orgId, $docId);   // total minus credit notes
        if ($doc === null || $to === '' || $due <= 0) {
            return 'skip';
        }
        $lang    = Documents::language($doc) === 'en' ? 'en' : 'fr';
        $t       = Documents::text($doc);
        $profile = Tenant::profile($orgId);
        $seller  = $profile['legal_name'] !== '' ? $profile['legal_name'] : $profile['name'];
        $body    = sprintf(self::TEXT[$lang]['body'][$wording], $doc['number'], Money::format($due, (string) $doc['currency']), Format::date((string) $doc['due_date']));
        return DocumentMailer::send($orgId, null, $docId, $to,
            sprintf(self::TEXT[$lang]['subject'][$wording], $doc['number'], $seller),
            $t['mail_hello'] . "\n\n" . $body . "\n\n" . $t['mail_regards'] . "\n" . $seller);
    }
}
