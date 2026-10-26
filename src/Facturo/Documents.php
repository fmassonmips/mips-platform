<?php
/**
 * Facturo quotes, invoices and credit notes, always scoped to one organization.
 *
 * Lifecycle:
 *   quote       : draft → sent → accepted | declined   (accepted/sent → converted to an invoice)
 *   invoice     : draft → issued ⇄ paid; issued → credited once fully covered by credit notes
 *   credit_note : draft → issued   (always created from an issued/paid invoice, never above
 *                                   what remains to be credited on it)
 *
 * Only drafts can be edited or deleted. Issuing assigns the next gap-free
 * number for (organization, type, year) and freezes seller and client
 * details, so later profile edits never alter an issued document.
 */
declare(strict_types=1);

namespace App\Facturo;

use App\Database;
use App\Mra\Settings;
use App\Suite\Tenant;

final class Documents
{
    public const TYPES = ['quote', 'invoice', 'credit_note'];

    public const LABELS = ['quote' => 'devis', 'invoice' => 'facture', 'credit_note' => 'avoir'];

    /** French labels for statuses shown in the UI (codes stay in the database and CSS classes). */
    public const STATUS_LABELS = [
        'draft' => 'Brouillon', 'issued' => 'Émise', 'paid' => 'Payée', 'sent' => 'Envoyé',
        'accepted' => 'Accepté', 'declined' => 'Refusé', 'credited' => 'Créditée',
    ];

    /** French label of a status, agreed with the document's gender (une facture, un avoir). */
    public static function statusLabel(string $type, string $status): string
    {
        if ($type === 'credit_note' && $status === 'issued') {
            return 'Émis';
        }
        return self::STATUS_LABELS[$status] ?? $status;
    }

    private const PREFIX = ['quote' => 'DEV', 'invoice' => 'FAC', 'credit_note' => 'AVO'];

    /** Status the document takes when issued. */
    private const ISSUED_STATUS = ['quote' => 'sent', 'invoice' => 'issued', 'credit_note' => 'issued'];

    /** Invoice statuses a credit note can be raised against. */
    private const CREDITABLE_STATUSES = ['issued', 'paid'];

    /** Allowed manual status changes after issue: type => from => [to]. */
    private const TRANSITIONS = [
        'quote'   => ['sent' => ['accepted', 'declined'], 'accepted' => ['sent'], 'declined' => ['sent']],
        'invoice' => ['issued' => ['paid'], 'paid' => ['issued']],
    ];

    public const MAX_LINES = 200;

    /** VAT treatment per line (MRA tax codes) and the rate each one applies, in basis points. */
    public const TAX_CODES = [
        'TC01' => ['label' => 'TVA 15 %',            'rate_bp' => 1500],
        'TC02' => ['label' => 'Taux zéro (0 %)',     'rate_bp' => 0],
        'TC03' => ['label' => 'Exonéré / sans TVA',  'rate_bp' => 0],
    ];

    public const NATURES = ['SERVICES' => 'Service', 'GOODS' => 'Bien'];

    /**
     * @return list<array<string,mixed>>
     */
    public static function all(int $orgId, string $type): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT d.id, d.number, d.status, d.issue_date, d.due_date, d.currency, d.total_cents,
                    c.name AS client_name
             FROM facturo_documents d
             JOIN facturo_clients c ON c.id = d.client_id
             WHERE d.organization_id = :oid AND d.type = :type
             ORDER BY d.issue_date DESC, d.id DESC'
        );
        $stmt->execute([':oid' => $orgId, ':type' => $type]);
        return $stmt->fetchAll();
    }

    /**
     * Document with its lines and decoded snapshots.
     *
     * @return array<string,mixed>|null
     */
    public static function find(int $orgId, int $id): ?array
    {
        $pdo  = Database::connection();
        $stmt = $pdo->prepare('SELECT * FROM facturo_documents WHERE organization_id = :oid AND id = :id');
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        $doc = $stmt->fetch();
        if (!is_array($doc)) {
            return null;
        }

        $lines = $pdo->prepare(
            'SELECT description, quantity, unit_price_cents, tax_rate, tax_code, nature, line_total_cents, line_tax_cents
             FROM facturo_document_lines WHERE document_id = :id ORDER BY position'
        );
        $lines->execute([':id' => $id]);
        $doc['lines'] = array_map(static function (array $l): array {
            return [
                'description'      => (string) $l['description'],
                'quantity_milli'   => (int) Money::parseQuantity((string) $l['quantity']),
                'unit_price_cents' => (int) $l['unit_price_cents'],
                'tax_rate_bp'      => (int) Money::parseRate((string) $l['tax_rate']),
                // Lines saved before tax codes existed: 15% → standard, anything else → zero-rated.
                'tax_code'         => $l['tax_code'] !== null ? (string) $l['tax_code']
                                      : ((string) $l['tax_rate'] === '15.00' ? 'TC01' : 'TC02'),
                'nature'           => (string) ($l['nature'] ?? 'SERVICES'),
                'line_total_cents' => (int) $l['line_total_cents'],
                'line_tax_cents'   => (int) $l['line_tax_cents'],
            ];
        }, $lines->fetchAll());

        $doc['seller'] = $doc['seller_snapshot'] !== null ? json_decode((string) $doc['seller_snapshot'], true) : null;
        $doc['client'] = $doc['client_snapshot'] !== null ? json_decode((string) $doc['client_snapshot'], true) : null;

        // Credit note ↔ invoice links.
        $doc['source']       = null;
        $doc['credit_notes'] = [];
        if ($doc['type'] === 'credit_note' && $doc['source_document_id'] !== null) {
            $src = $pdo->prepare('SELECT id, number, total_cents FROM facturo_documents WHERE organization_id = :oid AND id = :id');
            $src->execute([':oid' => $orgId, ':id' => (int) $doc['source_document_id']]);
            $doc['source'] = $src->fetch() ?: null;
        }
        if ($doc['type'] === 'invoice') {
            $cn = $pdo->prepare(
                'SELECT id, number, status, total_cents FROM facturo_documents
                 WHERE organization_id = :oid AND type = \'credit_note\' AND source_document_id = :id
                 ORDER BY id'
            );
            $cn->execute([':oid' => $orgId, ':id' => $id]);
            $doc['credit_notes'] = $cn->fetchAll();
        }
        $doc['credited_cents'] = array_sum(array_map(
            static fn (array $c): int => $c['status'] === 'issued' ? (int) $c['total_cents'] : 0,
            $doc['credit_notes']
        ));
        return $doc;
    }

    /**
     * Amount still creditable on an invoice: its total minus issued credit notes.
     */
    public static function creditableCents(int $orgId, int $invoiceId): int
    {
        $stmt = Database::connection()->prepare(
            'SELECT i.total_cents - COALESCE((
                 SELECT SUM(c.total_cents) FROM facturo_documents c
                 WHERE c.organization_id = i.organization_id AND c.type = \'credit_note\'
                   AND c.status = \'issued\' AND c.source_document_id = i.id
             ), 0)
             FROM facturo_documents i
             WHERE i.organization_id = :oid AND i.id = :id AND i.type = \'invoice\''
        );
        $stmt->execute([':oid' => $orgId, ':id' => $invoiceId]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Validate a draft payload for document $id (0 = new). Returns [clean draft, error|null].
     *
     * @param array<string,mixed> $input
     * @return array{0:array<string,mixed>,1:?string}
     */
    public static function validate(int $orgId, array $input, int $id = 0): array
    {
        $type = is_string($input['type'] ?? null) ? $input['type'] : '';
        if (!in_array($type, self::TYPES, true)) {
            return [[], 'Type de document invalide.'];
        }

        // A credit note is bound to its invoice: same client and currency, never dated before it.
        $invoice = null;
        if ($type === 'credit_note') {
            $current = $id > 0 ? self::find($orgId, $id) : null;
            if ($current === null || $current['type'] !== 'credit_note' || $current['source_document_id'] === null) {
                return [[], 'Les avoirs se créent à partir d\'une facture émise.'];
            }
            $invoice = self::find($orgId, (int) $current['source_document_id']);
            if ($invoice === null) {
                return [[], 'La facture créditée n\'existe plus.'];
            }
            $input['client_id'] = (int) $invoice['client_id'];
            $input['currency']  = (string) $invoice['currency'];
            $input['due_date']  = '';
        }

        $clientId = is_int($input['client_id'] ?? null) || ctype_digit((string) ($input['client_id'] ?? ''))
            ? (int) $input['client_id'] : 0;
        if ($clientId === 0 || Clients::find($orgId, $clientId) === null) {
            return [[], 'Choisissez un client.'];
        }

        $issueDate = self::date($input['issue_date'] ?? null);
        if ($issueDate === null) {
            return [[], 'La date est invalide.'];
        }
        $dueRaw  = is_string($input['due_date'] ?? null) ? trim($input['due_date']) : '';
        $dueDate = $dueRaw === '' ? null : self::date($dueRaw);
        if ($dueRaw !== '' && ($dueDate === null || $dueDate < $issueDate)) {
            return [[], $type === 'quote' ? 'La date de validité est invalide.' : 'La date d\'échéance est invalide.'];
        }

        $currency = is_string($input['currency'] ?? null) ? $input['currency'] : '';
        if (!in_array($currency, Money::CURRENCIES, true)) {
            return [[], 'Devise invalide.'];
        }

        $notes = is_string($input['notes'] ?? null) ? trim($input['notes']) : '';
        if (mb_strlen($notes) > 5000) {
            return [[], 'Les notes sont trop longues.'];
        }

        $rawLines = is_array($input['lines'] ?? null) ? array_values($input['lines']) : [];
        if ($rawLines === []) {
            return [[], 'Ajoutez au moins une ligne.'];
        }
        if (count($rawLines) > self::MAX_LINES) {
            return [[], 'Trop de lignes (max. ' . self::MAX_LINES . ').'];
        }

        $lines = [];
        $subtotal = 0;
        $tax = 0;
        foreach ($rawLines as $i => $raw) {
            $n           = $i + 1;
            $raw         = is_array($raw) ? $raw : [];
            $description = is_string($raw['description'] ?? null) ? trim($raw['description']) : '';
            $quantity    = Money::parseQuantity(trim((string) ($raw['quantity'] ?? '')));
            $unit        = Money::parseCents(trim((string) ($raw['unit_price'] ?? '')));
            $taxCode     = is_string($raw['tax_code'] ?? null) ? $raw['tax_code'] : '';
            $nature      = is_string($raw['nature'] ?? null) ? $raw['nature'] : 'SERVICES';

            if ($description === '' || mb_strlen($description) > 500) {
                return [[], "Ligne $n : la description est obligatoire (500 caractères max.)."];
            }
            if ($quantity === null || $quantity === 0 || $quantity > Money::MAX_QUANTITY_MILLI) {
                return [[], "Ligne $n : la quantité doit être un nombre positif (3 décimales max.)."];
            }
            if ($unit === null || abs($unit) > Money::MAX_UNIT_CENTS) {
                return [[], "Ligne $n : le prix unitaire est invalide (2 décimales max.)."];
            }
            if (!isset(self::TAX_CODES[$taxCode])) {
                return [[], "Ligne $n : choisissez le traitement TVA."];
            }
            if (!isset(self::NATURES[$nature])) {
                return [[], "Ligne $n : choisissez bien ou service."];
            }
            $rate = self::TAX_CODES[$taxCode]['rate_bp'];

            [$lineTotal, $lineTax] = Money::line($quantity, $unit, $rate);
            $subtotal += $lineTotal;
            $tax      += $lineTax;
            $lines[] = [
                'description'      => $description,
                'quantity_milli'   => $quantity,
                'unit_price_cents' => $unit,
                'tax_rate_bp'      => $rate,
                'tax_code'         => $taxCode,
                'nature'           => $nature,
                'line_total_cents' => $lineTotal,
                'line_tax_cents'   => $lineTax,
            ];
        }

        if ($subtotal + $tax < 0) {
            return [[], 'Le total ne peut pas être négatif.'];
        }

        if ($invoice !== null) {
            if ($issueDate < (string) $invoice['issue_date']) {
                return [[], 'Un avoir ne peut pas être daté avant sa facture.'];
            }
            if ($subtotal + $tax <= 0) {
                return [[], 'Un avoir doit avoir un total positif.'];
            }
            $creditable = self::creditableCents($orgId, (int) $invoice['id']);
            if ($subtotal + $tax > $creditable) {
                return [[], 'Un avoir ne peut pas dépasser le reste à créditer sur la facture ('
                    . Money::format($creditable, (string) $invoice['currency']) . ').'];
            }
        }

        return [[
            'type'           => $type,
            'client_id'      => $clientId,
            'issue_date'     => $issueDate,
            'due_date'       => $dueDate,
            'currency'       => $currency,
            'notes'          => $notes !== '' ? $notes : null,
            'subtotal_cents' => $subtotal,
            'tax_cents'      => $tax,
            'total_cents'    => $subtotal + $tax,
            'lines'          => $lines,
        ], null];
    }

    /**
     * Create (id = 0) or update a draft. Returns [id, error|null].
     *
     * @param array<string,mixed> $draft validated by validate()
     * @return array{0:int,1:?string}
     */
    public static function saveDraft(int $orgId, int $userId, int $id, array $draft): array
    {
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $params = [
                ':oid'      => $orgId,
                ':client'   => $draft['client_id'],
                ':issue'    => $draft['issue_date'],
                ':due'      => $draft['due_date'],
                ':currency' => $draft['currency'],
                ':notes'    => $draft['notes'],
                ':sub'      => $draft['subtotal_cents'],
                ':tax'      => $draft['tax_cents'],
                ':total'    => $draft['total_cents'],
            ];

            if ($id === 0) {
                $params[':type'] = $draft['type'];
                $params[':by']   = $userId;
                $params[':src']  = $draft['source_document_id'] ?? null;
                $pdo->prepare(
                    'INSERT INTO facturo_documents
                        (organization_id, type, status, client_id, issue_date, due_date, currency, notes,
                         subtotal_cents, tax_cents, total_cents, source_document_id, created_by)
                     VALUES (:oid, :type, \'draft\', :client, :issue, :due, :currency, :notes,
                         :sub, :tax, :total, :src, :by)'
                )->execute($params);
                $id = (int) $pdo->lastInsertId();
            } else {
                $current = self::lockDraft($orgId, $id);
                if ($current === null) {
                    $pdo->rollBack();
                    return [0, 'Seuls les brouillons peuvent être modifiés.'];
                }
                if ($current['type'] !== $draft['type']) {
                    $pdo->rollBack();
                    return [0, 'Le type de document ne peut pas changer.'];
                }
                $params[':id'] = $id;
                $pdo->prepare(
                    'UPDATE facturo_documents
                     SET client_id = :client, issue_date = :issue, due_date = :due, currency = :currency,
                         notes = :notes, subtotal_cents = :sub, tax_cents = :tax, total_cents = :total
                     WHERE organization_id = :oid AND id = :id'
                )->execute($params);
                $pdo->prepare('DELETE FROM facturo_document_lines WHERE document_id = :id')
                    ->execute([':id' => $id]);
            }

            $insert = $pdo->prepare(
                'INSERT INTO facturo_document_lines
                    (document_id, position, description, quantity, unit_price_cents, tax_rate,
                     tax_code, nature, line_total_cents, line_tax_cents)
                 VALUES (:doc, :pos, :descr, :qty, :unit, :rate, :code, :nature, :lt, :ltax)'
            );
            foreach ($draft['lines'] as $pos => $line) {
                $insert->execute([
                    ':doc'   => $id,
                    ':pos'   => $pos + 1,
                    ':descr' => $line['description'],
                    ':qty'   => Money::quantityToInput($line['quantity_milli']),
                    ':unit'  => $line['unit_price_cents'],
                    ':rate'  => Money::rateToInput($line['tax_rate_bp']),
                    ':code'  => $line['tax_code'] ?? null,
                    ':nature'=> $line['nature'] ?? null,
                    ':lt'    => $line['line_total_cents'],
                    ':ltax'  => $line['line_tax_cents'],
                ]);
            }

            $pdo->commit();
            return [$id, null];
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Issue a draft: assign its number and freeze seller/client details.
     */
    public static function issue(int $orgId, int $id): ?string
    {
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $doc = self::lockDraft($orgId, $id);
            if ($doc === null) {
                $pdo->rollBack();
                return 'Seuls les brouillons peuvent être émis.';
            }

            $seller = Tenant::profile($orgId);
            if ($doc['type'] !== 'quote' && ($seller['legal_name'] === '' || $seller['brn'] === '')) {
                $pdo->rollBack();
                return 'Renseignez les coordonnées de l\'entreprise (raison sociale, BRN) avant d\'émettre une facture ou un avoir.';
            }
            $client = Clients::find($orgId, (int) $doc['client_id']);

            // MRA e-invoicing: invoices and credit notes are queued for fiscalisation.
            $fiscalise = isset(Fiscalisation::MRA_TYPES[$doc['type']]) && Settings::isEnabled($orgId);
            if ($fiscalise) {
                $error = Fiscalisation::issueBlocker($doc, $seller);
                if ($error === null && $doc['type'] === 'credit_note') {
                    $src = $pdo->prepare('SELECT mra_status FROM facturo_documents WHERE organization_id = :oid AND id = :id');
                    $src->execute([':oid' => $orgId, ':id' => (int) $doc['source_document_id']]);
                    if (in_array($src->fetchColumn(), ['pending', 'rejected'], true)) {
                        $error = 'La facture doit être fiscalisée par la MRA avant de pouvoir être créditée.';
                    }
                }
                if ($error !== null) {
                    $pdo->rollBack();
                    return $error;
                }
            }

            $remainingAfter = null;
            if ($doc['type'] === 'credit_note') {
                [$remainingAfter, $error] = self::checkCreditOnIssue($orgId, $doc);
                if ($error !== null) {
                    $pdo->rollBack();
                    return $error;
                }
            }

            $type = (string) $doc['type'];
            $year = (int) substr((string) $doc['issue_date'], 0, 4);
            $pdo->prepare(
                'INSERT INTO facturo_sequences (organization_id, type, year, last_value)
                 VALUES (:oid, :type, :year, 0)
                 ON DUPLICATE KEY UPDATE last_value = last_value'
            )->execute([':oid' => $orgId, ':type' => $type, ':year' => $year]);
            $pdo->prepare(
                'UPDATE facturo_sequences SET last_value = last_value + 1
                 WHERE organization_id = :oid AND type = :type AND year = :year'
            )->execute([':oid' => $orgId, ':type' => $type, ':year' => $year]);
            $seq = $pdo->prepare(
                'SELECT last_value FROM facturo_sequences
                 WHERE organization_id = :oid AND type = :type AND year = :year'
            );
            $seq->execute([':oid' => $orgId, ':type' => $type, ':year' => $year]);
            $number = sprintf('%s-%d-%04d', self::PREFIX[$type], $year, (int) $seq->fetchColumn());

            $pdo->prepare(
                'UPDATE facturo_documents
                 SET number = :number, status = :status, issued_at = NOW(),
                     seller_snapshot = :seller, client_snapshot = :client,
                     mra_status = :mra_status, mra_counter = :mra_counter
                 WHERE organization_id = :oid AND id = :id'
            )->execute([
                ':number'      => $number,
                ':mra_status'  => $fiscalise ? 'pending' : null,
                ':mra_counter' => $fiscalise ? Fiscalisation::nextCounter($orgId) : null,
                ':status' => self::ISSUED_STATUS[$type],
                ':seller' => json_encode($seller, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                ':client' => json_encode($client, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                ':oid'    => $orgId,
                ':id'     => $id,
            ]);

            // A fully credited, unpaid invoice is closed. A paid one stays paid (a refund is owed).
            if ($remainingAfter === 0) {
                $pdo->prepare(
                    'UPDATE facturo_documents SET status = \'credited\'
                     WHERE organization_id = :oid AND id = :id AND status = \'issued\''
                )->execute([':oid' => $orgId, ':id' => (int) $doc['source_document_id']]);
            }

            $pdo->commit();
            return null;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Manual status change on an issued document (accept a quote, mark an invoice paid, …).
     */
    public static function setStatus(int $orgId, int $id, string $status): ?string
    {
        $doc = self::find($orgId, $id);
        if ($doc === null) {
            return 'Document introuvable.';
        }
        $allowed = self::TRANSITIONS[$doc['type']][$doc['status']] ?? [];
        if (!in_array($status, $allowed, true)) {
            return 'Ce changement de statut n\'est pas autorisé.';
        }
        // Un-paying a fully credited invoice closes it rather than reopening it.
        if ($doc['type'] === 'invoice' && $status === 'issued' && self::creditableCents($orgId, $id) <= 0) {
            $status = 'credited';
        }

        Database::connection()->prepare(
            'UPDATE facturo_documents
             SET status = :status, paid_at = IF(:paid = 1, NOW(), NULL)
             WHERE organization_id = :oid AND id = :id AND status = :from'
        )->execute([
            ':status' => $status,
            ':paid'   => $status === 'paid' ? 1 : 0,
            ':oid'    => $orgId,
            ':id'     => $id,
            ':from'   => $doc['status'],
        ]);
        return null;
    }

    /**
     * Create a draft invoice from a sent or accepted quote (marking it accepted).
     * Converting the same quote twice returns the invoice created the first time.
     *
     * @return array{0:int,1:?string} [invoice id, error|null]
     */
    public static function convertToInvoice(int $orgId, int $userId, int $quoteId): array
    {
        $quote = self::find($orgId, $quoteId);
        if ($quote === null || $quote['type'] !== 'quote' || !in_array($quote['status'], ['sent', 'accepted'], true)) {
            return [0, 'Seul un devis envoyé ou accepté peut être converti en facture.'];
        }

        $existing = Database::connection()->prepare(
            'SELECT id FROM facturo_documents
             WHERE organization_id = :oid AND type = \'invoice\' AND source_document_id = :qid LIMIT 1'
        );
        $existing->execute([':oid' => $orgId, ':qid' => $quoteId]);
        $existingId = $existing->fetchColumn();
        if ($existingId !== false) {
            return [(int) $existingId, null];
        }

        $draft = [
            'type'               => 'invoice',
            'client_id'          => (int) $quote['client_id'],
            'issue_date'         => date('Y-m-d'),
            'due_date'           => date('Y-m-d', strtotime('+30 days')),
            'currency'           => (string) $quote['currency'],
            'notes'              => $quote['notes'],
            'subtotal_cents'     => (int) $quote['subtotal_cents'],
            'tax_cents'          => (int) $quote['tax_cents'],
            'total_cents'        => (int) $quote['total_cents'],
            'source_document_id' => $quoteId,
            'lines'              => $quote['lines'],
        ];
        [$invoiceId, $error] = self::saveDraft($orgId, $userId, 0, $draft);

        if ($error === null && $quote['status'] === 'sent') {
            self::setStatus($orgId, $quoteId, 'accepted');
        }
        return [$invoiceId, $error];
    }

    /**
     * Create a draft credit note copying the invoice lines (same VAT treatment).
     * The user reduces them for a partial credit; saving refuses any amount
     * above what remains to be credited.
     *
     * @return array{0:int,1:?string} [credit note id, error|null]
     */
    public static function createCreditNote(int $orgId, int $userId, int $invoiceId): array
    {
        $invoice = self::find($orgId, $invoiceId);
        if ($invoice === null || $invoice['type'] !== 'invoice'
            || !in_array($invoice['status'], self::CREDITABLE_STATUSES, true)) {
            return [0, 'Seule une facture émise ou payée peut faire l\'objet d\'un avoir.'];
        }
        if (self::creditableCents($orgId, $invoiceId) <= 0) {
            return [0, 'Cette facture est déjà entièrement créditée.'];
        }
        foreach ($invoice['credit_notes'] as $cn) {
            if ($cn['status'] === 'draft') {
                return [(int) $cn['id'], null];   // finish the pending draft first
            }
        }

        $lines = $invoice['lines'];
        $sub   = array_sum(array_column($lines, 'line_total_cents'));
        $tax = array_sum(array_column($lines, 'line_tax_cents'));

        return self::saveDraft($orgId, $userId, 0, [
            'type'               => 'credit_note',
            'client_id'          => (int) $invoice['client_id'],
            'issue_date'         => max(date('Y-m-d'), (string) $invoice['issue_date']),
            'due_date'           => null,
            'currency'           => (string) $invoice['currency'],
            'notes'              => null,
            'subtotal_cents'     => $sub,
            'tax_cents'          => $tax,
            'total_cents'        => $sub + $tax,
            'source_document_id' => $invoiceId,
            'lines'              => $lines,
        ]);
    }

    /**
     * Unguessable token for the client-facing link of an issued document,
     * created on first use and stable afterwards (so resent links keep working).
     */
    public static function publicToken(int $orgId, int $id): string
    {
        $pdo = Database::connection();
        $pdo->prepare(
            'UPDATE facturo_documents SET public_token = :token
             WHERE organization_id = :oid AND id = :id AND public_token IS NULL AND status <> \'draft\''
        )->execute([':token' => bin2hex(random_bytes(24)), ':oid' => $orgId, ':id' => $id]);

        $stmt = $pdo->prepare('SELECT public_token FROM facturo_documents WHERE organization_id = :oid AND id = :id');
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        return (string) $stmt->fetchColumn();
    }

    /**
     * Issued document reached through its public link, or null.
     *
     * @return array<string,mixed>|null
     */
    public static function findByToken(string $token): ?array
    {
        if (!preg_match('/^[a-f0-9]{48}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare(
            'SELECT organization_id, id FROM facturo_documents WHERE public_token = :token AND status <> \'draft\''
        );
        $stmt->execute([':token' => $token]);
        $row = $stmt->fetch();
        return is_array($row) ? self::find((int) $row['organization_id'], (int) $row['id']) : null;
    }

    public static function delete(int $orgId, int $id): ?string
    {
        $stmt = Database::connection()->prepare(
            'DELETE FROM facturo_documents WHERE organization_id = :oid AND id = :id AND status = \'draft\''
        );
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        return $stmt->rowCount() === 1 ? null : 'Seuls les brouillons peuvent être supprimés.';
    }

    /**
     * Re-check a credit note against its invoice at issue time. Locking reads
     * (FOR UPDATE) serialize concurrent credit notes on the same invoice and
     * see their latest committed state, so the invoice can never be over-credited.
     *
     * @param array<string,mixed> $creditNote locked draft row
     * @return array{0:?int,1:?string} [amount left to credit after this one, error|null]
     */
    private static function checkCreditOnIssue(int $orgId, array $creditNote): array
    {
        $pdo       = Database::connection();
        $invoiceId = (int) $creditNote['source_document_id'];

        $inv = $pdo->prepare(
            'SELECT status, total_cents FROM facturo_documents
             WHERE organization_id = :oid AND id = :id AND type = \'invoice\' FOR UPDATE'
        );
        $inv->execute([':oid' => $orgId, ':id' => $invoiceId]);
        $invoice = $inv->fetch();
        if (!is_array($invoice) || !in_array($invoice['status'], self::CREDITABLE_STATUSES, true)) {
            return [null, 'La facture ne peut plus faire l\'objet d\'un avoir.'];
        }

        $issued = $pdo->prepare(
            'SELECT total_cents FROM facturo_documents
             WHERE organization_id = :oid AND type = \'credit_note\' AND status = \'issued\'
               AND source_document_id = :id FOR UPDATE'
        );
        $issued->execute([':oid' => $orgId, ':id' => $invoiceId]);
        $credited = array_sum(array_map('intval', $issued->fetchAll(\PDO::FETCH_COLUMN)));

        $own = $pdo->prepare('SELECT total_cents FROM facturo_documents WHERE id = :id');
        $own->execute([':id' => (int) $creditNote['id']]);

        $remaining = (int) $invoice['total_cents'] - $credited - (int) $own->fetchColumn();
        if ($remaining < 0) {
            return [null, 'Cet avoir dépasse le reste à créditer sur la facture.'];
        }
        return [$remaining, null];
    }

    /**
     * Lock a draft row for update inside the caller's transaction.
     *
     * @return array<string,mixed>|null
     */
    private static function lockDraft(int $orgId, int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, type, client_id, issue_date, source_document_id, currency, notes FROM facturo_documents
             WHERE organization_id = :oid AND id = :id AND status = \'draft\' FOR UPDATE'
        );
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    private static function date(mixed $value): ?string
    {
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $d !== false && $d->format('Y-m-d') === $value ? $value : null;
    }
}
