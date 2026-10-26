<?php
/**
 * Fiscalisation of Facturo invoices and credit notes with the MRA
 * e-Invoicing System, for organizations that switched it on.
 *
 * Issuing a document marks it 'pending' with the next EBS counter value.
 * processPending() then transmits pending documents in counter order, one
 * per request; MRA's answer turns each one into 'fiscalised' (IRN + QR code
 * stored) or 'rejected' (error stored). Network/server failures leave it
 * pending: the next attempt (manual retry, next issue, or the cron script
 * tools/mra_retry.php) resumes from there, as the MRA functional specs
 * require when the connection is down.
 *
 * Payload follows the MRA "Data Structure of an e-Invoice" v1.0 and the
 * samples of the MRA Developer Portal test cases.
 */
declare(strict_types=1);

namespace App\Facturo;

use App\Database;
use App\Mra\Client;
use App\Mra\MraException;
use App\Mra\Settings;
use App\Secrets;

final class Fiscalisation
{
    /** Document types sent to MRA, with their MRA invoice type. */
    public const MRA_TYPES = ['invoice' => 'STD', 'credit_note' => 'CRN'];

    /** Stop retrying a document automatically after this many transient failures. */
    private const MAX_ATTEMPTS = 50;

    /**
     * Requirements checked when issuing a document that will be fiscalised.
     *
     * @param array<string,mixed> $doc   document row (type, currency, notes)
     * @param array<string,string> $seller company profile
     */
    public static function issueBlocker(array $doc, array $seller): ?string
    {
        if ($seller['vat_number'] === '' || $seller['address'] === '') {
            return 'La facturation électronique MRA exige votre n° TVA et votre adresse (page Entreprise).';
        }
        if ($doc['currency'] !== 'MUR') {
            return 'Facturation électronique MRA : seuls les documents en MUR sont pris en charge pour l\'instant.';
        }
        if ($doc['type'] === 'credit_note' && trim((string) ($doc['notes'] ?? '')) === '') {
            return 'La MRA exige le motif de l\'avoir : indiquez-le dans le champ Notes.';
        }
        return null;
    }

    /**
     * Next value of the organization's EBS counter (never reset). Call inside the issue transaction.
     */
    public static function nextCounter(int $orgId): int
    {
        $pdo = Database::connection();
        $pdo->prepare(
            'INSERT INTO facturo_sequences (organization_id, type, year, last_value) VALUES (:oid, \'mra\', 0, 0)
             ON DUPLICATE KEY UPDATE last_value = last_value'
        )->execute([':oid' => $orgId]);
        $pdo->prepare(
            'UPDATE facturo_sequences SET last_value = last_value + 1 WHERE organization_id = :oid AND type = \'mra\' AND year = 0'
        )->execute([':oid' => $orgId]);
        $stmt = $pdo->prepare(
            'SELECT last_value FROM facturo_sequences WHERE organization_id = :oid AND type = \'mra\' AND year = 0'
        );
        $stmt->execute([':oid' => $orgId]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Transmit the organization's pending documents, oldest first.
     * Returns the number fiscalised. Never throws: failures are stored on the documents.
     */
    public static function processPending(int $orgId): int
    {
        $pdo = Database::connection();
        // One sender per organization at a time: keeps counter order and avoids double transmission.
        $lock = $pdo->prepare('SELECT GET_LOCK(:name, 0)');
        $lock->execute([':name' => 'mra_org_' . $orgId]);
        if ((int) $lock->fetchColumn() !== 1) {
            return 0;
        }

        $done = 0;
        try {
            $ids = $pdo->prepare(
                'SELECT id FROM facturo_documents
                 WHERE organization_id = :oid AND mra_status = \'pending\' AND mra_attempts < :max
                 ORDER BY mra_counter'
            );
            $ids->execute([':oid' => $orgId, ':max' => self::MAX_ATTEMPTS]);
            foreach ($ids->fetchAll(\PDO::FETCH_COLUMN) as $id) {
                $result = self::transmitOne($orgId, (int) $id);
                if ($result === 'fiscalised') {
                    $done++;
                } elseif ($result === 'transient') {
                    break;   // MRA unreachable: keep the rest in order for the next attempt
                }
            }
        } finally {
            $pdo->prepare('SELECT RELEASE_LOCK(:name)')->execute([':name' => 'mra_org_' . $orgId]);
        }
        return $done;
    }

    /**
     * Build the MRA invoice object for an issued document.
     *
     * @param array<string,mixed> $doc from Documents::find()
     * @return array<string,mixed>
     */
    public static function payload(int $orgId, array $doc): array
    {
        $seller = is_array($doc['seller']) ? $doc['seller'] : [];
        $client = is_array($doc['client']) ? $doc['client'] : [];
        $amt    = static fn (int $cents): string => Money::toInput($cents);

        $items = [];
        foreach ($doc['lines'] as $i => $l) {
            $items[] = [
                'itemNo'         => (string) ($i + 1),
                'taxCode'        => (string) $l['tax_code'],
                'nature'         => (string) $l['nature'],
                'productCodeMra' => '',
                'productCodeOwn' => '',
                'itemDesc'       => mb_substr((string) $l['description'], 0, 100),
                'quantity'       => Money::quantityToInput((int) $l['quantity_milli']),
                'unitPrice'      => $amt((int) $l['unit_price_cents']),
                'discount'       => '0',
                'discountedValue'=> $amt((int) $l['line_total_cents']),
                'amtWoVatCur'    => $amt((int) $l['line_total_cents']),
                'vatAmt'         => $amt((int) $l['line_tax_cents']),
                'totalPrice'     => $amt((int) $l['line_total_cents'] + (int) $l['line_tax_cents']),
            ];
        }

        $buyerVat = (string) ($client['vat_number'] ?? '');
        $buyerBrn = (string) ($client['brn'] ?? '');

        $invoice = [
            'invoiceCounter'        => (string) $doc['mra_counter'],
            'transactionType'       => $buyerBrn !== '' ? 'B2B' : 'B2C',
            'personType'            => ($seller['vat_number'] ?? '') !== '' ? 'VATR' : 'NVTR',
            'invoiceTypeDesc'       => self::MRA_TYPES[$doc['type']],
            'currency'              => (string) $doc['currency'],
            'invoiceIdentifier'     => (string) $doc['number'],
            'invoiceRefIdentifier'  => $doc['type'] === 'credit_note' ? (string) ($doc['source']['number'] ?? '') : '',
            'previousNoteHash'      => self::previousHash($orgId, $doc),
            'totalVatAmount'        => $amt((int) $doc['tax_cents']),
            'totalAmtWoVatCur'      => $amt((int) $doc['subtotal_cents']),
            'totalAmtPaid'          => $amt((int) $doc['total_cents']),
            'invoiceTotal'          => $amt((int) $doc['total_cents']),
            'discountTotalAmount'   => '0',
            'dateTimeInvoiceIssued' => self::mraDateTime((string) $doc['issued_at']),
            'seller' => [
                'name'            => mb_substr((string) (($seller['legal_name'] ?? '') !== '' ? $seller['legal_name'] : ($seller['name'] ?? '')), 0, 100),
                'tradeName'       => mb_substr((string) ($seller['name'] ?? ''), 0, 100),
                'tan'             => (string) ($seller['vat_number'] ?? ''),
                'brn'             => (string) ($seller['brn'] ?? ''),
                'businessAddr'    => mb_substr(preg_replace('/\s+/', ' ', (string) ($seller['address'] ?? '')) ?? '', 0, 250),
                'businessPhoneNo' => mb_substr(preg_replace('/[^0-9+ ]/', '', (string) ($seller['phone'] ?? '')) ?? '', 0, 20),
                'ebsCounterNo'    => '',
            ],
            'buyer' => [
                'name'         => mb_substr((string) ($client['name'] ?? ''), 0, 100),
                'tan'          => $buyerVat,
                'brn'          => $buyerBrn,
                'businessAddr' => mb_substr(preg_replace('/\s+/', ' ', (string) ($client['address'] ?? '')) ?? '', 0, 100),
                'buyerType'    => $buyerVat !== '' ? 'VATR' : 'NVTR',
                'nic'          => '',
            ],
            'itemList'          => $items,
            'salesTransactions' => 'CREDIT',
        ];
        if ($doc['type'] === 'credit_note') {
            $invoice['reasonStated'] = mb_substr(trim((string) $doc['notes']), 0, 100);
        }
        return $invoice;
    }

    /**
     * MRA spec: hash of (date & time + amount + BRN + number) of the previous
     * document of the same MRA type. SHA-256, hex. "0" for the very first one.
     *
     * @param array<string,mixed> $doc
     */
    private static function previousHash(int $orgId, array $doc): string
    {
        $stmt = Database::connection()->prepare(
            'SELECT number, issued_at, total_cents, seller_snapshot FROM facturo_documents
             WHERE organization_id = :oid AND type = :type AND mra_counter < :counter
             ORDER BY mra_counter DESC LIMIT 1'
        );
        $stmt->execute([':oid' => $orgId, ':type' => $doc['type'], ':counter' => (int) $doc['mra_counter']]);
        $prev = $stmt->fetch();
        if (!is_array($prev)) {
            return '0';
        }
        $seller = json_decode((string) $prev['seller_snapshot'], true) ?: [];
        return hash('sha256', self::mraDateTime((string) $prev['issued_at'])
            . Money::toInput((int) $prev['total_cents'])
            . (string) ($seller['brn'] ?? '')
            . (string) $prev['number']);
    }

    /**
     * @return 'fiscalised'|'rejected'|'transient'
     */
    private static function transmitOne(int $orgId, int $id): string
    {
        $doc = Documents::find($orgId, $id);
        if ($doc === null || $doc['mra_status'] !== 'pending') {
            return 'rejected';
        }

        try {
            $creds   = Settings::credentials($orgId);
            $payload = self::payload($orgId, $doc);
            try {
                $response = self::send($orgId, $creds, $payload, false);
            } catch (MraException $e) {
                if (!$e->isTokenRejected()) {
                    throw $e;
                }
                $response = self::send($orgId, $creds, $payload, true);   // token expired early: re-authenticate once
            }
        } catch (MraException | \RuntimeException $e) {
            $transient = $e instanceof MraException && $e->isTransient();
            self::record($id, $transient ? 'pending' : 'rejected', null, null, $e->getMessage());
            return $transient ? 'transient' : 'rejected';
        }

        $result = $response['fiscalisedInvoices'][0] ?? null;
        if (is_array($result) && ($result['status'] ?? '') === 'SUCCESS'
            && is_string($result['qrCode'] ?? null) && base64_decode($result['qrCode'], true) !== false) {
            self::record($id, 'fiscalised', (string) ($result['uuid'] ?? $result['irn'] ?? ''), $result['qrCode'], null);
            return 'fiscalised';
        }

        $errors = is_array($result) ? Client::errors(['errorMessages' => $result['errorMessages'] ?? []]) : '';
        self::record($id, 'rejected', null, null, 'Document rejeté par la MRA : ' . ($errors !== '' && !str_starts_with($errors, 'status') ? $errors : Client::errors($response)));
        return 'rejected';
    }

    /**
     * @param array{username:string,password:string,ebs_id:string} $creds
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function send(int $orgId, array $creds, array $payload, bool $freshToken): array
    {
        [$token, $key] = self::token($orgId, $creds, $freshToken);
        return Client::fromConfig()->transmit($creds['username'], $creds['ebs_id'], $token, $key, [$payload]);
    }

    /**
     * Cached token + session key for the organization (one authentication per day).
     *
     * @param array{username:string,password:string,ebs_id:string} $creds
     * @return array{0:string,1:string}
     */
    private static function token(int $orgId, array $creds, bool $fresh): array
    {
        $pdo = Database::connection();
        if (!$fresh) {
            $stmt = $pdo->prepare(
                'SELECT token, session_key_enc FROM mra_tokens
                 WHERE organization_id = :oid AND expires_at > DATE_ADD(NOW(), INTERVAL 10 MINUTE)'
            );
            $stmt->execute([':oid' => $orgId]);
            $row = $stmt->fetch();
            if (is_array($row)) {
                return [(string) $row['token'], Secrets::decrypt((string) $row['session_key_enc'])];
            }
        }

        $auth = Client::fromConfig()->authenticate($creds['username'], $creds['password'], $creds['ebs_id']);
        $pdo->prepare(
            'INSERT INTO mra_tokens (organization_id, token, session_key_enc, expires_at) VALUES (:oid, :t, :k, :e)
             ON DUPLICATE KEY UPDATE token = VALUES(token), session_key_enc = VALUES(session_key_enc), expires_at = VALUES(expires_at)'
        )->execute([':oid' => $orgId, ':t' => $auth['token'], ':k' => Secrets::encrypt($auth['key']), ':e' => $auth['expires_at']]);
        return [$auth['token'], $auth['key']];
    }

    private static function record(int $id, string $status, ?string $irn, ?string $qr, ?string $error): void
    {
        Database::connection()->prepare(
            'UPDATE facturo_documents
             SET mra_status = :status, mra_irn = :irn, mra_qr = :qr, mra_error = :error,
                 mra_attempts = mra_attempts + 1,
                 mra_fiscalised_at = IF(:fisc = 1, NOW(), mra_fiscalised_at)
             WHERE id = :id AND mra_status = \'pending\''
        )->execute([
            ':status' => $status,
            ':irn'    => $irn,
            ':qr'     => $qr,
            ':error'  => $error !== null ? mb_substr($error, 0, 1000) : null,
            ':fisc'   => $status === 'fiscalised' ? 1 : 0,
            ':id'     => $id,
        ]);
    }

    /**
     * Re-queue a rejected document after the settings were fixed (same counter, same data).
     */
    public static function requeue(int $orgId, int $id): ?string
    {
        $stmt = Database::connection()->prepare(
            'UPDATE facturo_documents SET mra_status = \'pending\', mra_attempts = 0
             WHERE organization_id = :oid AND id = :id AND mra_status IN (\'pending\', \'rejected\')'
        );
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        return $stmt->rowCount() === 1 ? null : 'Ce document n\'est pas en attente de la MRA.';
    }

    private static function mraDateTime(string $mysqlDateTime): string
    {
        $d = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $mysqlDateTime);
        return $d !== false ? $d->format('Ymd H:i:s') : date('Ymd H:i:s');
    }
}
