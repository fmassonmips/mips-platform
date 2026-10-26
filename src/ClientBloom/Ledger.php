<?php
/**
 * Closed-loop cashback ledger. Append-only: every change of a customer's
 * balance is a row; mistakes are corrected by a reversal row, never by an
 * edit. Each operation locks the customer row, so the stored balance and
 * the ledger always agree and a balance can never go below zero.
 *
 * Cashback is only spendable at the issuing business and never paid out
 * in cash (see docs: closed-loop on purpose).
 */
declare(strict_types=1);

namespace App\ClientBloom;

use App\Database;

final class Ledger
{
    public const LABELS = [
        'purchase' => 'Purchase', 'redeem' => 'Cashback used', 'bonus' => 'Bonus',
        'adjust' => 'Adjustment', 'expire' => 'Expired', 'reversal' => 'Reversal',
    ];

    /**
     * Record a sale at the counter, optionally paid in part with cashback.
     * Cashback is earned on the amount actually paid (amount − redeemed), at the
     * program's counter rate unless $rateBp is given, and never above $capCents (0 = no cap).
     *
     * @return array{0:?array{earned:int,redeemed:int,balance:int,purchase_tx_id:int},1:?string}
     */
    public static function checkout(int $orgId, int $userId, int $customerId, int $amountCents, int $redeemCents, string $reference, ?int $rateBp = null, int $capCents = 0): array
    {
        if ($amountCents <= 0 || $amountCents > 10_000_000_00) {
            return [null, 'Enter the purchase amount.'];
        }
        if ($redeemCents < 0 || $redeemCents > $amountCents) {
            return [null, 'Cashback used cannot exceed the purchase amount.'];
        }
        $rules = Settings::get($orgId);
        if ($redeemCents > 0 && $redeemCents < $rules['min_redeem_cents']) {
            return [null, 'Minimum cashback that can be used: ' . \App\Facturo\Money::format($rules['min_redeem_cents'], 'MUR') . '.'];
        }

        $rate = $rateBp ?? $rules['cashback_bp'];

        return self::inTransaction($orgId, $customerId, static function (array $c) use ($orgId, $userId, $amountCents, $redeemCents, $reference, $rate, $capCents): array {
            $balance = (int) $c['balance_cents'];
            if ($redeemCents > $balance) {
                return [null, 'Not enough cashback (available: ' . \App\Facturo\Money::format($balance, 'MUR') . ').'];
            }
            if ($redeemCents > 0) {
                $balance -= $redeemCents;
                self::insert($orgId, $userId, (int) $c['id'], 'redeem', 0, -$redeemCents, $balance, $reference, null);
            }
            $paid   = $amountCents - $redeemCents;
            $earned = intdiv($paid * $rate, 10000);   // rounded down: never over-credit
            if ($capCents > 0) {
                $earned = min($earned, $capCents);
            }
            $balance += $earned;
            $txId = self::insert($orgId, $userId, (int) $c['id'], 'purchase', $amountCents, $earned, $balance, $reference, null);

            Database::connection()->prepare(
                'UPDATE clientbloom_customers
                 SET balance_cents = :b, total_spent_cents = total_spent_cents + :amt, visits = visits + 1,
                     last_visit_at = NOW(), last_activity_at = NOW()
                 WHERE id = :id'
            )->execute([':b' => $balance, ':amt' => $amountCents, ':id' => (int) $c['id']]);

            return [['earned' => $earned, 'redeemed' => $redeemCents, 'balance' => $balance, 'purchase_tx_id' => $txId], null];
        });
    }

    /** Credit a bonus (welcome, birthday, goodwill). */
    public static function bonus(int $orgId, int $userId, int $customerId, int $cents, string $reason): ?string
    {
        return self::adjust($orgId, $userId, $customerId, $cents, $reason, 'bonus');
    }

    /**
     * Manual correction (owner/admin), positive or negative, with a reason.
     */
    public static function adjust(int $orgId, int $userId, int $customerId, int $cents, string $reason, string $type = 'adjust'): ?string
    {
        $reason = trim($reason);
        if ($cents === 0 || abs($cents) > 100_000_000 || $reason === '' || mb_strlen($reason) > 100) {
            return 'Enter a non-zero amount and a reason (max 100 characters).';
        }
        [, $error] = self::inTransaction($orgId, $customerId, static function (array $c) use ($orgId, $userId, $cents, $reason, $type): array {
            $balance = (int) $c['balance_cents'] + $cents;
            if ($balance < 0) {
                return [null, 'The balance cannot go below zero.'];
            }
            self::insert($orgId, $userId, (int) $c['id'], $type, 0, $cents, $balance, $reason, null);
            Database::connection()->prepare(
                'UPDATE clientbloom_customers SET balance_cents = :b, last_activity_at = NOW() WHERE id = :id'
            )->execute([':b' => $balance, ':id' => (int) $c['id']]);
            return [[], null];
        });
        return $error;
    }

    /**
     * Cancel a transaction with an opposite entry (owner/admin). A purchase
     * reversal also removes it from the customer's spend and visit count.
     */
    public static function reverse(int $orgId, int $userId, int $transactionId): ?string
    {
        $stmt = Database::connection()->prepare(
            'SELECT t.id, t.customer_id, t.type, t.amount_cents, t.cashback_cents,
                    (SELECT COUNT(*) FROM clientbloom_transactions r WHERE r.reversal_of = t.id) AS reversed
             FROM clientbloom_transactions t WHERE t.organization_id = :oid AND t.id = :id'
        );
        $stmt->execute([':oid' => $orgId, ':id' => $transactionId]);
        $tx = $stmt->fetch();
        if (!is_array($tx)) {
            return 'Transaction not found.';
        }
        if ($tx['type'] === 'reversal' || $tx['type'] === 'expire' || (int) $tx['reversed'] > 0) {
            return 'This transaction cannot be reversed.';
        }

        [, $error] = self::inTransaction($orgId, (int) $tx['customer_id'], static function (array $c) use ($orgId, $userId, $tx): array {
            $delta   = -(int) $tx['cashback_cents'];
            $balance = (int) $c['balance_cents'] + $delta;
            if ($balance < 0) {
                return [null, 'The customer has already used this cashback; reverse that use first or adjust manually.'];
            }
            self::insert($orgId, $userId, (int) $c['id'], 'reversal', -(int) $tx['amount_cents'], $delta, $balance,
                'Reversal of #' . $tx['id'], (int) $tx['id']);
            $isPurchase = $tx['type'] === 'purchase';
            Database::connection()->prepare(
                'UPDATE clientbloom_customers
                 SET balance_cents = :b,
                     total_spent_cents = total_spent_cents - :amt,
                     visits = GREATEST(visits - :v, 0)
                 WHERE id = :id'
            )->execute([':b' => $balance, ':amt' => $isPurchase ? (int) $tx['amount_cents'] : 0, ':v' => $isPurchase ? 1 : 0, ':id' => (int) $c['id']]);
            return [[], null];
        });
        return $error;
    }

    /**
     * After a refund: take back up to $cents of cashback (never below zero) and
     * remove $refundedCents from the customer's spend. The entry is recorded
     * even when no cashback is left, so sales figures stay net of refunds.
     * Returns [cashback actually taken back, error|null, ledger entry id|null].
     *
     * @return array{0:int,1:?string,2:?int}
     */
    public static function clawback(int $orgId, ?int $userId, int $customerId, int $cents, string $reason, int $refundedCents = 0): array
    {
        if ($cents <= 0 && $refundedCents <= 0) {
            return [0, null, null];
        }
        [$result, $error] = self::inTransaction($orgId, $customerId, static function (array $c) use ($orgId, $userId, $cents, $reason, $refundedCents): array {
            $take    = max(0, min($cents, (int) $c['balance_cents']));
            $balance = (int) $c['balance_cents'] - $take;
            $txId    = self::insert($orgId, $userId, (int) $c['id'], 'adjust', -$refundedCents, -$take, $balance, $reason, null);
            Database::connection()->prepare(
                'UPDATE clientbloom_customers
                 SET balance_cents = :b, total_spent_cents = GREATEST(total_spent_cents - :r, 0) WHERE id = :id'
            )->execute([':b' => $balance, ':r' => $refundedCents, ':id' => (int) $c['id']]);
            return [[$take, $txId], null];
        });
        return $error !== null ? [0, $error, null] : [(int) $result[0], null, $result[1]];
    }

    /**
     * @return array{type:string,amount_cents:int,cashback_cents:int,customer_id:int,reversed:bool}|null
     */
    public static function transaction(int $orgId, int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT t.type, t.amount_cents, t.cashback_cents, t.customer_id,
                    (SELECT COUNT(*) FROM clientbloom_transactions r WHERE r.reversal_of = t.id) AS reversed
             FROM clientbloom_transactions t WHERE t.organization_id = :oid AND t.id = :id'
        );
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        $t = $stmt->fetch();
        return is_array($t) ? [
            'type' => (string) $t['type'], 'amount_cents' => (int) $t['amount_cents'],
            'cashback_cents' => (int) $t['cashback_cents'], 'customer_id' => (int) $t['customer_id'],
            'reversed' => (int) $t['reversed'] > 0,
        ] : null;
    }

    /**
     * @return list<array<string,mixed>>
     */
    public static function history(int $orgId, int $customerId, int $limit = 100): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT t.id, t.type, t.amount_cents, t.cashback_cents, t.balance_after, t.reference, t.reversal_of,
                    t.created_at, u.name AS author,
                    (SELECT COUNT(*) FROM clientbloom_transactions r WHERE r.reversal_of = t.id) AS reversed
             FROM clientbloom_transactions t LEFT JOIN users u ON u.id = t.created_by
             WHERE t.organization_id = :oid AND t.customer_id = :cid
             ORDER BY t.id DESC LIMIT ' . max(1, min($limit, 1000))
        );
        $stmt->execute([':oid' => $orgId, ':cid' => $customerId]);
        return $stmt->fetchAll();
    }

    /**
     * Expire balances of customers without activity for the program's expiry period.
     * Returns the number of customers expired. Run daily (tools/clientbloom_expire.php).
     */
    public static function expire(int $orgId): int
    {
        $months = Settings::get($orgId)['expiry_months'];
        if ($months === 0) {
            return 0;
        }
        $stmt = Database::connection()->prepare(
            'SELECT id FROM clientbloom_customers
             WHERE organization_id = :oid AND balance_cents > 0
               AND last_activity_at < DATE_SUB(NOW(), INTERVAL :m MONTH)'
        );
        $stmt->execute([':oid' => $orgId, ':m' => $months]);

        $n = 0;
        foreach ($stmt->fetchAll(\PDO::FETCH_COLUMN) as $id) {
            [, $error] = self::inTransaction($orgId, (int) $id, static function (array $c) use ($orgId, $months): array {
                $balance = (int) $c['balance_cents'];
                if ($balance <= 0) {
                    return [[], null];
                }
                self::insert($orgId, null, (int) $c['id'], 'expire', 0, -$balance, 0, "No activity for $months months", null);
                Database::connection()->prepare('UPDATE clientbloom_customers SET balance_cents = 0 WHERE id = :id')
                    ->execute([':id' => (int) $c['id']]);
                return [[], null];
            });
            $n += $error === null ? 1 : 0;
        }
        return $n;
    }

    /**
     * Run $fn with the customer row locked, inside a transaction.
     *
     * @param callable(array<string,mixed>):array{0:mixed,1:?string} $fn
     * @return array{0:mixed,1:?string}
     */
    private static function inTransaction(int $orgId, int $customerId, callable $fn): array
    {
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'SELECT id, balance_cents FROM clientbloom_customers
                 WHERE organization_id = :oid AND id = :id AND erased_at IS NULL FOR UPDATE'
            );
            $stmt->execute([':oid' => $orgId, ':id' => $customerId]);
            $c = $stmt->fetch();
            if (!is_array($c)) {
                $pdo->rollBack();
                return [null, 'Customer not found.'];
            }
            [$result, $error] = $fn($c);
            if ($error !== null) {
                $pdo->rollBack();
                return [null, $error];
            }
            $pdo->commit();
            return [$result, null];
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    private static function insert(int $orgId, ?int $userId, int $customerId, string $type, int $amount, int $cashback, int $balanceAfter, string $reference, ?int $reversalOf): int
    {
        $pdo = Database::connection();
        $pdo->prepare(
            'INSERT INTO clientbloom_transactions
                (organization_id, customer_id, type, amount_cents, cashback_cents, balance_after, reference, reversal_of, created_by)
             VALUES (:oid, :cid, :type, :amt, :cb, :bal, :ref, :rev, :by)'
        )->execute([
            ':oid' => $orgId, ':cid' => $customerId, ':type' => $type, ':amt' => $amount, ':cb' => $cashback,
            ':bal' => $balanceAfter, ':ref' => $reference !== '' ? mb_substr($reference, 0, 100) : null,
            ':rev' => $reversalOf, ':by' => $userId,
        ]);
        return (int) $pdo->lastInsertId();
    }
}
