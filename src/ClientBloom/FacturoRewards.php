<?php
/**
 * Facturo → ClientBloom: paid invoices earn loyalty cashback.
 *
 * Active when both apps are enabled and the program's "Reward paid Facturo
 * invoices" option is on. Rules:
 *  - invoice marked paid → a ClientBloom purchase for its total net of issued
 *    credit notes (MUR only), once per payment, at the program's invoice rate
 *    (separate from the counter rate) and within its per-invoice cap; the Facturo client is matched to a loyalty customer
 *    by link, phone, then email, or created (without marketing consent);
 *  - invoice no longer paid → that purchase is reversed; if the cashback was
 *    already spent the payment change still goes through and the invoice
 *    shows a warning (loyalty never blocks accounting);
 *  - credit note on a rewarded invoice → the matching share of cashback is
 *    taken back, within the customer's balance.
 * The outcome is stored on the document (clientbloom_note) and shown there.
 * Never throws: a loyalty failure must not break invoicing.
 */
declare(strict_types=1);

namespace App\ClientBloom;

use App\Database;
use App\Facturo\Clients as FacturoClients;
use App\Facturo\Documents;
use App\Facturo\Money;
use App\Suite\Modules;

final class FacturoRewards
{
    public static function isActive(int $orgId): bool
    {
        return Modules::isEnabled($orgId, 'clientbloom')
            && Modules::isEnabled($orgId, 'facturo')
            && Settings::get($orgId)['facturo_rewards'] === 1;
    }

    /** Call after any status change of an invoice. */
    public static function onInvoiceStatusChanged(int $orgId, int $userId, int $invoiceId): void
    {
        self::safely(static function () use ($orgId, $userId, $invoiceId): void {
            $doc = Documents::find($orgId, $invoiceId);
            if ($doc === null || $doc['type'] !== 'invoice') {
                return;
            }
            if ($doc['status'] === 'paid' && $doc['clientbloom_tx_id'] === null && self::isActive($orgId)) {
                self::reward($orgId, $userId, $doc);
            } elseif ($doc['status'] !== 'paid' && $doc['clientbloom_tx_id'] !== null) {
                self::revoke($orgId, $userId, $doc);
            }
        });
    }

    /** Call after a credit note is issued. */
    public static function onCreditNoteIssued(int $orgId, int $userId, int $creditNoteId): void
    {
        self::safely(static function () use ($orgId, $userId, $creditNoteId): void {
            $cn = Documents::find($orgId, $creditNoteId);
            if ($cn === null || $cn['type'] !== 'credit_note' || $cn['source_document_id'] === null) {
                return;
            }
            $invoice = Documents::find($orgId, (int) $cn['source_document_id']);
            $tx = $invoice !== null && $invoice['clientbloom_tx_id'] !== null
                ? Ledger::transaction($orgId, (int) $invoice['clientbloom_tx_id']) : null;
            if ($tx === null || $tx['reversed'] || $tx['amount_cents'] <= 0) {
                return;
            }

            // Same share of cashback as the share of the invoice refunded, rounded down.
            $due = intdiv($tx['cashback_cents'] * (int) $cn['total_cents'], $tx['amount_cents']);
            [$taken, $error, $clawTx] = Ledger::clawback($orgId, $userId, $tx['customer_id'], $due, 'Avoir ' . $cn['number'],
                min((int) $cn['total_cents'], $tx['amount_cents']));
            if ($error !== null) {
                self::note($creditNoteId, null, 'Fidélité : ' . $error);
                return;
            }
            self::note($creditNoteId, $clawTx,
                'Fidélité : ' . self::mur($taken) . ' de cashback repris'
                . ($taken < $due ? ' (' . self::mur($due) . ' dus, solde du client insuffisant)' : '') . '.');
        });
    }

    /**
     * @param array<string,mixed> $doc
     */
    private static function reward(int $orgId, int $userId, array $doc): void
    {
        if ($doc['currency'] !== 'MUR') {
            self::note((int) $doc['id'], null, 'Fidélité : non récompensée, le cashback ne s\'applique qu\'aux factures en MUR.');
            return;
        }
        $net = (int) $doc['total_cents'] - (int) $doc['credited_cents'];
        if ($net <= 0) {
            self::note((int) $doc['id'], null, 'Fidélité : non récompensée, la facture est entièrement créditée.');
            return;
        }
        $customer = self::customerFor($orgId, $userId, (int) $doc['client_id']);
        if ($customer === null) {
            self::note((int) $doc['id'], null, 'Fidélité : non récompensée, le client n\'a ni téléphone ni e-mail valide.');
            return;
        }
        $rules = Settings::get($orgId);
        [$result, $error] = Ledger::checkout($orgId, $userId, (int) $customer['id'], $net, 0, (string) $doc['number'],
            $rules['invoice_cashback_bp'], $rules['invoice_cap_cents']);
        if ($error !== null) {
            self::note((int) $doc['id'], null, 'Fidélité : non récompensée, ' . lcfirst($error));
            return;
        }
        self::note((int) $doc['id'], $result['purchase_tx_id'],
            'Fidélité : ' . self::mur($result['earned']) . ' de cashback crédités à ' . $customer['name']
            . ' (' . Money::rateToInput($rules['invoice_cashback_bp']) . ' %'
            . ($rules['invoice_cap_cents'] > 0 && $result['earned'] === $rules['invoice_cap_cents'] ? ', plafonné' : '') . ').');
    }

    /**
     * @param array<string,mixed> $doc
     */
    private static function revoke(int $orgId, int $userId, array $doc): void
    {
        $txId = (int) $doc['clientbloom_tx_id'];
        $tx   = Ledger::transaction($orgId, $txId);
        if ($tx === null || $tx['reversed']) {
            self::note((int) $doc['id'], null, null);
            return;
        }

        // Cashback and spend already taken back by credit notes issued since this purchase must not be removed twice.
        $stmt = Database::connection()->prepare(
            'SELECT COALESCE(-SUM(t.cashback_cents), 0), COALESCE(-SUM(t.amount_cents), 0) FROM facturo_documents d
             JOIN clientbloom_transactions t ON t.id = d.clientbloom_tx_id
             WHERE d.organization_id = :oid AND d.type = \'credit_note\' AND d.source_document_id = :id
               AND t.id > :tx'
        );
        $stmt->execute([':oid' => $orgId, ':id' => (int) $doc['id'], ':tx' => $txId]);
        [$alreadyTaken, $alreadyRefunded] = array_map('intval', $stmt->fetch(\PDO::FETCH_NUM) ?: [0, 0]);

        if ($alreadyTaken === 0 && $alreadyRefunded === 0) {
            $error = Ledger::reverse($orgId, $userId, $txId);
            if ($error === null) {
                self::note((int) $doc['id'], null, 'Fidélité : cashback retiré, la facture n\'est plus payée.');
            } else {
                self::note((int) $doc['id'], $txId, 'Fidélité : le cashback n\'a pas pu être retiré automatiquement (' . $error
                    . ') — ajustez-le dans ClientBloom si nécessaire.');
            }
            return;
        }

        $remaining = max(0, $tx['cashback_cents'] - $alreadyTaken);
        $unrefunded = max(0, $tx['amount_cents'] - $alreadyRefunded);
        [$taken] = Ledger::clawback($orgId, $userId, $tx['customer_id'], $remaining, 'Facture ' . $doc['number'] . ' plus payée', $unrefunded);
        self::note((int) $doc['id'], null, $taken > 0
            ? 'Fidélité : ' . self::mur($taken) . ' de cashback restant retirés, la facture n\'est plus payée.'
            : 'Fidélité : aucun cashback restant à retirer, la facture n\'est plus payée.');
    }

    /**
     * Loyalty customer of a Facturo client: existing link, then phone, then email, else created.
     *
     * @return array<string,mixed>|null
     */
    private static function customerFor(int $orgId, int $userId, int $clientId): ?array
    {
        $client = FacturoClients::find($orgId, $clientId);
        if ($client === null) {
            return null;
        }

        $stmt = Database::connection()->prepare('SELECT clientbloom_customer_id FROM facturo_clients WHERE id = :id');
        $stmt->execute([':id' => $clientId]);
        $linked = $stmt->fetchColumn();
        if ($linked !== false && $linked !== null) {
            $c = Customers::find($orgId, (int) $linked);
            if ($c !== null && $c['erased_at'] === null) {
                return $c;
            }
        }

        $customer = Customers::findByPhone($orgId, (string) ($client['phone'] ?? ''))
            ?? Customers::findByEmail($orgId, (string) ($client['email'] ?? ''));

        if ($customer === null) {
            $input = ['name' => mb_substr((string) $client['name'], 0, 120), 'phone' => (string) ($client['phone'] ?? ''),
                      'email' => (string) ($client['email'] ?? ''), 'tags' => 'facturo', 'marketing_consent' => false];
            [$fields, $error] = Customers::validate($input);
            if ($error !== null && $input['phone'] !== '') {
                // Unusable phone: retry with the email alone.
                [$fields, $error] = Customers::validate(['phone' => ''] + $input);
            }
            if ($error !== null) {
                return null;
            }
            [$id, $error] = Customers::save($orgId, $userId, 0, $fields);
            $customer = $error === null ? Customers::find($orgId, $id) : null;
            if ($customer === null) {
                return null;
            }
        }

        Database::connection()->prepare(
            'UPDATE facturo_clients SET clientbloom_customer_id = :cid WHERE organization_id = :oid AND id = :id'
        )->execute([':cid' => (int) $customer['id'], ':oid' => $orgId, ':id' => $clientId]);
        return $customer;
    }

    private static function note(int $documentId, ?int $txId, ?string $note): void
    {
        Database::connection()->prepare(
            'UPDATE facturo_documents SET clientbloom_tx_id = :tx, clientbloom_note = :note WHERE id = :id'
        )->execute([':tx' => $txId, ':note' => $note !== null ? mb_substr($note, 0, 255) : null, ':id' => $documentId]);
    }

    private static function mur(int $cents): string
    {
        return Money::format($cents, 'MUR');
    }

    private static function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            error_log('[Facturo→ClientBloom] ' . $e->getMessage());
        }
    }
}
