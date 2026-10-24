<?php
/**
 * Facturo quotes and invoices, always scoped to one organization.
 *
 * Lifecycle:
 *   quote   : draft → sent → accepted | declined   (accepted/sent → converted to an invoice)
 *   invoice : draft → issued ⇄ paid
 *
 * Only drafts can be edited or deleted. Issuing assigns the next gap-free
 * number for (organization, type, year) and freezes seller and client
 * details, so later profile edits never alter an issued document.
 */
declare(strict_types=1);

namespace App\Facturo;

use App\Database;
use App\Suite\Tenant;

final class Documents
{
    public const TYPES = ['quote', 'invoice'];

    private const PREFIX = ['quote' => 'DEV', 'invoice' => 'FAC'];

    /** Status the document takes when issued. */
    private const ISSUED_STATUS = ['quote' => 'sent', 'invoice' => 'issued'];

    /** Allowed manual status changes after issue: type => from => [to]. */
    private const TRANSITIONS = [
        'quote'   => ['sent' => ['accepted', 'declined'], 'accepted' => ['sent'], 'declined' => ['sent']],
        'invoice' => ['issued' => ['paid'], 'paid' => ['issued']],
    ];

    public const MAX_LINES = 200;

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
            'SELECT description, quantity, unit_price_cents, tax_rate, line_total_cents, line_tax_cents
             FROM facturo_document_lines WHERE document_id = :id ORDER BY position'
        );
        $lines->execute([':id' => $id]);
        $doc['lines'] = array_map(static function (array $l): array {
            return [
                'description'      => (string) $l['description'],
                'quantity_milli'   => (int) Money::parseQuantity((string) $l['quantity']),
                'unit_price_cents' => (int) $l['unit_price_cents'],
                'tax_rate_bp'      => (int) Money::parseRate((string) $l['tax_rate']),
                'line_total_cents' => (int) $l['line_total_cents'],
                'line_tax_cents'   => (int) $l['line_tax_cents'],
            ];
        }, $lines->fetchAll());

        $doc['seller'] = $doc['seller_snapshot'] !== null ? json_decode((string) $doc['seller_snapshot'], true) : null;
        $doc['client'] = $doc['client_snapshot'] !== null ? json_decode((string) $doc['client_snapshot'], true) : null;
        return $doc;
    }

    /**
     * Validate a draft payload. Returns [clean draft, error|null].
     *
     * @param array<string,mixed> $input
     * @return array{0:array<string,mixed>,1:?string}
     */
    public static function validate(int $orgId, array $input): array
    {
        $type = is_string($input['type'] ?? null) ? $input['type'] : '';
        if (!in_array($type, self::TYPES, true)) {
            return [[], 'Invalid document type.'];
        }

        $clientId = is_int($input['client_id'] ?? null) || ctype_digit((string) ($input['client_id'] ?? ''))
            ? (int) $input['client_id'] : 0;
        if ($clientId === 0 || Clients::find($orgId, $clientId) === null) {
            return [[], 'Choose a client.'];
        }

        $issueDate = self::date($input['issue_date'] ?? null);
        if ($issueDate === null) {
            return [[], 'Issue date is invalid.'];
        }
        $dueRaw  = is_string($input['due_date'] ?? null) ? trim($input['due_date']) : '';
        $dueDate = $dueRaw === '' ? null : self::date($dueRaw);
        if ($dueRaw !== '' && ($dueDate === null || $dueDate < $issueDate)) {
            return [[], $type === 'quote' ? 'Valid-until date is invalid.' : 'Due date is invalid.'];
        }

        $currency = is_string($input['currency'] ?? null) ? $input['currency'] : '';
        if (!in_array($currency, Money::CURRENCIES, true)) {
            return [[], 'Invalid currency.'];
        }

        $notes = is_string($input['notes'] ?? null) ? trim($input['notes']) : '';
        if (mb_strlen($notes) > 5000) {
            return [[], 'Notes are too long.'];
        }

        $rawLines = is_array($input['lines'] ?? null) ? array_values($input['lines']) : [];
        if ($rawLines === []) {
            return [[], 'Add at least one line.'];
        }
        if (count($rawLines) > self::MAX_LINES) {
            return [[], 'Too many lines (max ' . self::MAX_LINES . ').'];
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
            $rate        = Money::parseRate(trim((string) ($raw['tax_rate'] ?? '')));

            if ($description === '' || mb_strlen($description) > 500) {
                return [[], "Line $n: description is required (max 500 characters)."];
            }
            if ($quantity === null || $quantity === 0 || $quantity > Money::MAX_QUANTITY_MILLI) {
                return [[], "Line $n: quantity must be a positive number (max 3 decimals)."];
            }
            if ($unit === null || abs($unit) > Money::MAX_UNIT_CENTS) {
                return [[], "Line $n: unit price is invalid (max 2 decimals)."];
            }
            if ($rate === null) {
                return [[], "Line $n: tax rate must be between 0 and 100."];
            }

            [$lineTotal, $lineTax] = Money::line($quantity, $unit, $rate);
            $subtotal += $lineTotal;
            $tax      += $lineTax;
            $lines[] = [
                'description'      => $description,
                'quantity_milli'   => $quantity,
                'unit_price_cents' => $unit,
                'tax_rate_bp'      => $rate,
                'line_total_cents' => $lineTotal,
                'line_tax_cents'   => $lineTax,
            ];
        }

        if ($subtotal + $tax < 0) {
            return [[], 'The total cannot be negative.'];
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
                    return [0, 'Only drafts can be edited.'];
                }
                if ($current['type'] !== $draft['type']) {
                    $pdo->rollBack();
                    return [0, 'Document type cannot change.'];
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
                     line_total_cents, line_tax_cents)
                 VALUES (:doc, :pos, :descr, :qty, :unit, :rate, :lt, :ltax)'
            );
            foreach ($draft['lines'] as $pos => $line) {
                $insert->execute([
                    ':doc'   => $id,
                    ':pos'   => $pos + 1,
                    ':descr' => $line['description'],
                    ':qty'   => Money::quantityToInput($line['quantity_milli']),
                    ':unit'  => $line['unit_price_cents'],
                    ':rate'  => Money::rateToInput($line['tax_rate_bp']),
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
                return 'Only drafts can be issued.';
            }

            $seller = Tenant::profile($orgId);
            if ($doc['type'] === 'invoice' && ($seller['legal_name'] === '' || $seller['brn'] === '')) {
                $pdo->rollBack();
                return 'Fill in your company details (legal name, BRN) before issuing an invoice.';
            }
            $client = Clients::find($orgId, (int) $doc['client_id']);

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
                     seller_snapshot = :seller, client_snapshot = :client
                 WHERE organization_id = :oid AND id = :id'
            )->execute([
                ':number' => $number,
                ':status' => self::ISSUED_STATUS[$type],
                ':seller' => json_encode($seller, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                ':client' => json_encode($client, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                ':oid'    => $orgId,
                ':id'     => $id,
            ]);

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
            return 'Document not found.';
        }
        $allowed = self::TRANSITIONS[$doc['type']][$doc['status']] ?? [];
        if (!in_array($status, $allowed, true)) {
            return 'This status change is not allowed.';
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
            return [0, 'Only a sent or accepted quote can be converted.'];
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

    public static function delete(int $orgId, int $id): ?string
    {
        $stmt = Database::connection()->prepare(
            'DELETE FROM facturo_documents WHERE organization_id = :oid AND id = :id AND status = \'draft\''
        );
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        return $stmt->rowCount() === 1 ? null : 'Only drafts can be deleted.';
    }

    /**
     * Lock a draft row for update inside the caller's transaction.
     *
     * @return array<string,mixed>|null
     */
    private static function lockDraft(int $orgId, int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, type, client_id, issue_date FROM facturo_documents
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
