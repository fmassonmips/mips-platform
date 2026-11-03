<?php
/**
 * Client statement: every invoice and credit note issued to one client, what is
 * still due and what is late, printable to send with a reminder. Read only.
 *
 * Rules (Facturo has no partial payments):
 *  - an invoice marked paid owes nothing; otherwise it owes its total minus the
 *    credit notes issued against it;
 *  - an invoice is late when it still owes something and its due date has passed;
 *  - totals are kept per currency, never added across currencies;
 *  - drafts and quotes are left out.
 */
declare(strict_types=1);

namespace App\Facturo;

use App\Database;

final class Statement
{
    /** Wording of the printed statement, in the client's document language. */
    public const TEXT = [
        'fr' => [
            'title' => 'Relevé de compte', 'client' => 'Client', 'as_of' => 'Situation au', 'date' => 'Date',
            'document' => 'Document', 'due' => 'Échéance', 'amount' => 'Montant TTC', 'credited' => 'Avoirs',
            'outstanding' => 'Reste dû', 'status' => 'État', 'paid' => 'Payée', 'open' => 'À régler', 'late' => 'En retard de %d j',
            'credited_full' => 'Annulée par avoir', 'credit_note' => 'Avoir sur %s', 'invoice' => 'Facture',
            'total_due' => 'Total restant dû', 'of_which_late' => 'dont en retard', 'nothing_due' => 'Aucune somme due à ce jour. Merci.',
            'none' => 'Aucune facture émise pour ce client.', 'print' => 'Imprimer / Enregistrer en PDF',
            'footer' => 'Merci de régler les sommes en retard ou de nous signaler toute erreur.',
        ],
        'en' => [
            'title' => 'Statement of account', 'client' => 'Client', 'as_of' => 'As of', 'date' => 'Date',
            'document' => 'Document', 'due' => 'Due date', 'amount' => 'Amount incl. VAT', 'credited' => 'Credits',
            'outstanding' => 'Outstanding', 'status' => 'Status', 'paid' => 'Paid', 'open' => 'Open', 'late' => '%d days overdue',
            'credited_full' => 'Cancelled by credit note', 'credit_note' => 'Credit note on %s', 'invoice' => 'Invoice',
            'total_due' => 'Total outstanding', 'of_which_late' => 'of which overdue', 'nothing_due' => 'Nothing is due at this date. Thank you.',
            'none' => 'No invoice issued to this client.', 'print' => 'Print / Save as PDF',
            'footer' => 'Please settle the overdue amounts or tell us about any mistake.',
        ],
    ];

    /**
     * @return array{rows:list<array<string,mixed>>, totals:array<string,array{invoiced:int,credited:int,outstanding:int,late:int}>}
     */
    public static function build(int $orgId, int $clientId, string $today): array
    {
        $pdo = Database::connection();
        $docs = $pdo->prepare(
            "SELECT id, type, number, status, issue_date, due_date, currency, total_cents, source_document_id
             FROM facturo_documents
             WHERE organization_id = :o AND client_id = :c AND type IN ('invoice', 'credit_note') AND status <> 'draft'
             ORDER BY issue_date, type DESC, number"
        );
        $docs->execute([':o' => $orgId, ':c' => $clientId]);
        $all = $docs->fetchAll();

        $credited = [];   // invoice id => credit notes issued against it
        $numbers  = [];
        foreach ($all as $d) {
            $numbers[(int) $d['id']] = (string) $d['number'];
            if ($d['type'] === 'credit_note' && $d['source_document_id'] !== null) {
                $credited[(int) $d['source_document_id']] = ($credited[(int) $d['source_document_id']] ?? 0) + (int) $d['total_cents'];
            }
        }

        $rows = [];
        $totals = [];
        foreach ($all as $d) {
            $cur = (string) $d['currency'];
            $totals[$cur] ??= ['invoiced' => 0, 'credited' => 0, 'outstanding' => 0, 'late' => 0];
            if ($d['type'] === 'credit_note') {
                $totals[$cur]['credited'] += (int) $d['total_cents'];
                $rows[] = ['type' => 'credit_note', 'date' => (string) $d['issue_date'], 'number' => (string) $d['number'],
                           'source' => $numbers[(int) $d['source_document_id']] ?? '', 'currency' => $cur,
                           'amount_cents' => -(int) $d['total_cents'], 'credited_cents' => 0, 'outstanding_cents' => 0,
                           'state' => 'credit_note', 'days_late' => 0, 'due_date' => null];
                continue;
            }
            $total       = (int) $d['total_cents'];
            $credit      = $credited[(int) $d['id']] ?? 0;
            $outstanding = $d['status'] === 'paid' ? 0 : max(0, $total - $credit);
            $due         = $d['due_date'] !== null ? (string) $d['due_date'] : null;
            $daysLate    = $outstanding > 0 && $due !== null && $due < $today
                ? (int) (new \DateTimeImmutable($due))->diff(new \DateTimeImmutable($today))->days : 0;
            $state = match (true) {
                $d['status'] === 'paid'   => 'paid',
                $outstanding === 0        => 'credited_full',
                $daysLate > 0             => 'late',
                default                   => 'open',
            };
            $totals[$cur]['invoiced']    += $total;
            $totals[$cur]['outstanding'] += $outstanding;
            $totals[$cur]['late']        += $daysLate > 0 ? $outstanding : 0;
            $rows[] = ['type' => 'invoice', 'date' => (string) $d['issue_date'], 'number' => (string) $d['number'], 'source' => '',
                       'currency' => $cur, 'amount_cents' => $total, 'credited_cents' => $credit, 'outstanding_cents' => $outstanding,
                       'state' => $state, 'days_late' => $daysLate, 'due_date' => $due];
        }
        ksort($totals);
        return ['rows' => $rows, 'totals' => $totals];
    }
}
