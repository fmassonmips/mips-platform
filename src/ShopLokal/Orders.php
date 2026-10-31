<?php
/**
 * Shop orders. Placing an order locks the shop's numbering row and the
 * products it takes, re-checks availability and stock, then reserves the
 * stock; cancelling gives it back. Totals use the same per-line VAT rounding
 * as Facturo. Times are Mauritius local time, written by the application.
 */
declare(strict_types=1);

namespace App\ShopLokal;

use App\ClientBloom\Customers;
use App\Database;
use App\Facturo\Clients;
use App\Facturo\Documents;
use App\Facturo\Money;
use App\RendezVous\Booking;
use App\Suite\Tenant;

final class Orders
{
    public const STATUSES = ['new' => 'Nouvelle', 'confirmed' => 'Confirmée', 'shipped' => 'Expédiée / prête', 'completed' => 'Terminée', 'cancelled' => 'Annulée'];
    public const PAYMENTS = ['cod' => 'À la livraison', 'bank' => 'Virement', 'juice' => 'Juice'];

    private const NEXT = [
        'new'       => ['confirmed', 'cancelled'],
        'confirmed' => ['shipped', 'completed', 'cancelled'],
        'shipped'   => ['completed', 'cancelled'],
    ];
    private const IP_ORDERS_PER_HOUR = 5;
    private const MAX_LINES = 50;

    /**
     * @param list<array{product_id:int,quantity:int}> $cart
     * @param array<string,string>                    $in  name, phone, email, address, delivery_method, payment_method, note
     * @param array<string,string>                    $t   Text::for()
     * @return array{0:?array<string,mixed>,1:?string}
     */
    public static function place(int $orgId, array $cart, array $in, ?string $ip, array $t): array
    {
        $s       = Settings::get($orgId);
        $name    = trim(preg_replace('/\s+/u', ' ', $in['name'] ?? '') ?? '');
        $phone   = Customers::normalizePhone($in['phone'] ?? '');
        $email   = trim($in['email'] ?? '');
        $address = trim($in['address'] ?? '');
        $how     = $in['delivery_method'] ?? '';
        $pay     = $in['payment_method'] ?? '';
        $note    = mb_substr(trim($in['note'] ?? ''), 0, 500);

        $qty = [];
        foreach ($cart as $c) {
            $pid = (int) ($c['product_id'] ?? 0);
            $q   = (int) ($c['quantity'] ?? 0);
            if ($pid > 0 && $q > 0) {
                $qty[$pid] = min(999, ($qty[$pid] ?? 0) + $q);
            }
        }
        if ($qty === [] || count($qty) > self::MAX_LINES) {
            return [null, $t['err_cart']];
        }
        if ($name === '' || mb_strlen($name) > 120) {
            return [null, $t['err_name']];
        }
        if ($phone === null) {
            return [null, $t['err_phone']];
        }
        if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254)) {
            return [null, $t['err_email']];
        }
        $howOk = ($how === 'delivery' && $s['delivery_enabled']) || ($how === 'pickup' && $s['pickup_enabled']);
        $payOk = ($pay === 'cod' && $s['pay_cod']) || ($pay === 'bank' && $s['pay_bank']) || ($pay === 'juice' && $s['pay_juice']);
        if (!$howOk || !$payOk) {
            return [null, $t['err_choice']];
        }
        if ($how === 'delivery' && ($address === '' || mb_strlen($address) > 500)) {
            return [null, $t['err_address']];
        }

        $pdo = Database::connection();
        $now = Booking::now();
        $rate = $pdo->prepare('SELECT COUNT(*) FROM shoplokal_orders WHERE created_ip = :ip AND created_at >= :since');
        $rate->execute([':ip' => (string) $ip, ':since' => $now->modify('-1 hour')->format('Y-m-d H:i:s')]);
        if ((int) $rate->fetchColumn() >= self::IP_ORDERS_PER_HOUR) {
            return [null, $t['err_limit']];
        }

        $pdo->beginTransaction();
        try {
            $num = $pdo->prepare('SELECT last_number FROM shoplokal_settings WHERE organization_id = :oid FOR UPDATE');
            $num->execute([':oid' => $orgId]);
            $number = (int) $num->fetchColumn() + 1;

            $ids  = implode(',', array_map('intval', array_keys($qty)));
            $prod = $pdo->prepare("SELECT * FROM shoplokal_products WHERE organization_id = :oid AND id IN ($ids) ORDER BY id FOR UPDATE");
            $prod->execute([':oid' => $orgId]);
            $products = [];
            foreach ($prod->fetchAll() as $p) {
                $products[(int) $p['id']] = $p;
            }

            $lines = [];
            $sub = $tax = $itemsTtc = 0;
            foreach ($qty as $pid => $q) {
                $p = $products[$pid] ?? null;
                if ($p === null || (int) $p['active'] !== 1) {
                    $pdo->rollBack();
                    return [null, sprintf($t['err_product'], $p['name'] ?? '#' . $pid)];
                }
                if ($p['stock'] !== null && (int) $p['stock'] < $q) {
                    $pdo->rollBack();
                    return [null, (int) $p['stock'] <= 0 ? sprintf($t['err_product'], $p['name']) : sprintf($t['err_stock'], $p['name'], (int) $p['stock'])];
                }
                [$lt, $lx] = Money::line($q * 1000, (int) $p['price_cents'], Products::rate((string) $p['tax_code']));
                $lines[] = [$pid, (string) $p['name'], (int) $p['price_cents'], (string) $p['tax_code'], $q, $lt, $lx];
                $sub += $lt;
                $tax += $lx;
                $itemsTtc += $lt + $lx;
            }

            $delivery = 0;
            if ($how === 'delivery' && $s['delivery_fee_cents'] > 0
                && ($s['free_delivery_from_cents'] === null || $itemsTtc < $s['free_delivery_from_cents'])) {
                $delivery = $s['delivery_fee_cents'];
                [$dt, $dx] = Money::line(1000, $delivery, Products::rate(self::serviceTaxCode($orgId)));
                $sub += $dt;
                $tax += $dx;
            }

            $pdo->prepare('UPDATE shoplokal_settings SET last_number = :n WHERE organization_id = :oid')->execute([':n' => $number, ':oid' => $orgId]);
            $at = $now->format('Y-m-d H:i:s');
            $pdo->prepare(
                'INSERT INTO shoplokal_orders (organization_id, number, customer_name, phone, email, address, delivery_method, payment_method,
                                               note, subtotal_cents, tax_cents, total_cents, delivery_cents, token, created_ip, created_at, updated_at)
                 VALUES (:oid, :n, :name, :phone, :email, :addr, :how, :pay, :note, :sub, :tax, :total, :del, :tok, :ip, :at, :at2)'
            )->execute([
                ':oid' => $orgId, ':n' => $number, ':name' => $name, ':phone' => $phone, ':email' => $email !== '' ? $email : null,
                ':addr' => $how === 'delivery' ? $address : null, ':how' => $how, ':pay' => $pay, ':note' => $note !== '' ? $note : null,
                ':sub' => $sub, ':tax' => $tax, ':total' => $sub + $tax, ':del' => $delivery, ':tok' => bin2hex(random_bytes(24)),
                ':ip' => $ip, ':at' => $at, ':at2' => $at,
            ]);
            $orderId = (int) $pdo->lastInsertId();
            $ins = $pdo->prepare(
                'INSERT INTO shoplokal_order_lines (order_id, product_id, name, unit_price_cents, tax_code, quantity, line_total_cents, line_tax_cents)
                 VALUES (:o, :p, :n, :u, :tc, :q, :lt, :lx)'
            );
            $dec = $pdo->prepare('UPDATE shoplokal_products SET stock = stock - :q WHERE id = :id AND stock IS NOT NULL');
            foreach ($lines as [$pid, $pname, $unit, $code, $q, $lt, $lx]) {
                $ins->execute([':o' => $orderId, ':p' => $pid, ':n' => $pname, ':u' => $unit, ':tc' => $code, ':q' => $q, ':lt' => $lt, ':lx' => $lx]);
                $dec->execute([':q' => $q, ':id' => $pid]);
            }
            $pdo->commit();
        } catch (\Throwable $ex) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $ex;
        }
        $order = self::find($orgId, $orderId);
        Notifier::safely(static fn () => Notifier::placed($orgId, $order));
        return [$order, null];
    }

    /**
     * @return array<string,mixed>|null with lines
     */
    public static function find(int $orgId, int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT o.*, d.number AS invoice_number, d.status AS invoice_status
             FROM shoplokal_orders o LEFT JOIN facturo_documents d ON d.id = o.facturo_invoice_id
             WHERE o.organization_id = :oid AND o.id = :id'
        );
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        $o = $stmt->fetch();
        return is_array($o) ? self::withLines($o) : null;
    }

    /**
     * @return array{0:int,1:array<string,mixed>}|null
     */
    public static function findByToken(string $token): ?array
    {
        if (!preg_match('/^[0-9a-f]{48}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare('SELECT organization_id, id FROM shoplokal_orders WHERE token = :t');
        $stmt->execute([':t' => $token]);
        $r = $stmt->fetch();
        return $r ? [(int) $r['organization_id'], self::find((int) $r['organization_id'], (int) $r['id'])] : null;
    }

    /**
     * @return list<array<string,mixed>>
     */
    public static function list(int $orgId, string $filter): array
    {
        $where = match ($filter) {
            'todo'   => 'o.status IN (\'new\', \'confirmed\', \'shipped\')',
            'unpaid' => 'o.paid_at IS NULL AND o.status <> \'cancelled\'',
            'done'   => 'o.status IN (\'completed\', \'cancelled\')',
            default  => '1 = 1',
        };
        $stmt = Database::connection()->prepare(
            'SELECT o.*, (SELECT SUM(quantity) FROM shoplokal_order_lines l WHERE l.order_id = o.id) AS items
             FROM shoplokal_orders o WHERE o.organization_id = :oid AND ' . $where . ' ORDER BY o.id DESC LIMIT 300'
        );
        $stmt->execute([':oid' => $orgId]);
        return $stmt->fetchAll();
    }

    /**
     * @return array<string,int>
     */
    public static function counts(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT COUNT(CASE WHEN status IN (\'new\', \'confirmed\', \'shipped\') THEN 1 END) AS todo,
                    COUNT(CASE WHEN status = \'new\' THEN 1 END) AS new,
                    COUNT(CASE WHEN paid_at IS NULL AND status <> \'cancelled\' THEN 1 END) AS unpaid,
                    COUNT(CASE WHEN status IN (\'completed\', \'cancelled\') THEN 1 END) AS done, COUNT(*) AS all_
             FROM shoplokal_orders WHERE organization_id = :oid'
        );
        $stmt->execute([':oid' => $orgId]);
        $r = array_map('intval', $stmt->fetch() ?: []);
        $r['all'] = $r['all_'];
        return $r;
    }

    public static function setStatus(int $orgId, int $id, string $status): ?string
    {
        $o = self::find($orgId, $id);
        if ($o === null) {
            return 'Commande introuvable.';
        }
        if (!in_array($status, self::NEXT[$o['status']] ?? [], true)) {
            return 'Changement de statut impossible.';
        }
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $upd = $pdo->prepare('UPDATE shoplokal_orders SET status = :s, updated_at = :now WHERE organization_id = :oid AND id = :id AND status = :old');
            $upd->execute([':s' => $status, ':now' => Booking::now()->format('Y-m-d H:i:s'), ':oid' => $orgId, ':id' => $id, ':old' => $o['status']]);
            if ($upd->rowCount() === 1 && $status === 'cancelled') {
                $back = $pdo->prepare('UPDATE shoplokal_products SET stock = stock + :q WHERE id = :p AND stock IS NOT NULL');
                foreach ($o['lines'] as $l) {
                    if ($l['product_id'] !== null) {
                        $back->execute([':q' => (int) $l['quantity'], ':p' => (int) $l['product_id']]);
                    }
                }
            }
            $pdo->commit();
        } catch (\Throwable $ex) {
            $pdo->rollBack();
            throw $ex;
        }
        if (in_array($status, ['confirmed', 'shipped', 'cancelled'], true)) {
            Notifier::safely(static fn () => Notifier::statusChanged($orgId, self::find($orgId, $id)));
        }
        return null;
    }

    public static function setPaid(int $orgId, int $id, bool $paid): ?string
    {
        $o = self::find($orgId, $id);
        if ($o === null) {
            return 'Commande introuvable.';
        }
        if ($o['status'] === 'cancelled') {
            return 'Commande annulée.';
        }
        Database::connection()->prepare('UPDATE shoplokal_orders SET paid_at = :p, updated_at = :now WHERE organization_id = :oid AND id = :id')
            ->execute([':p' => $paid ? Booking::now()->format('Y-m-d H:i:s') : null, ':now' => Booking::now()->format('Y-m-d H:i:s'), ':oid' => $orgId, ':id' => $id]);
        return null;
    }

    /**
     * Draft Facturo invoice from the order (one per order): the customer becomes
     * (or is matched to) a Facturo client by e-mail, then phone.
     *
     * @return array{0:?int,1:?string}
     */
    public static function createInvoice(int $orgId, int $userId, int $id): array
    {
        $o = self::find($orgId, $id);
        if ($o === null) {
            return [null, 'Commande introuvable.'];
        }
        if ($o['status'] === 'cancelled') {
            return [null, 'Commande annulée.'];
        }
        if ($o['facturo_invoice_id'] !== null) {
            return [null, 'Une facture existe déjà pour cette commande.'];
        }
        $clientId = self::facturoClient($orgId, $o);
        $lines = [];
        foreach ($o['lines'] as $l) {
            $lines[] = ['description' => $l['name'], 'quantity' => (string) $l['quantity'], 'unit_price' => Money::toInput((int) $l['unit_price_cents']),
                        'tax_code' => $l['tax_code'], 'nature' => 'GOODS'];
        }
        if ((int) $o['delivery_cents'] > 0) {
            $lines[] = ['description' => 'Livraison', 'quantity' => '1', 'unit_price' => Money::toInput((int) $o['delivery_cents']),
                        'tax_code' => self::serviceTaxCode($orgId), 'nature' => 'SERVICES'];
        }
        [$draft, $error] = Documents::validate($orgId, [
            'type' => 'invoice', 'client_id' => $clientId, 'issue_date' => Booking::now()->format('Y-m-d'), 'due_date' => '',
            'currency' => 'MUR', 'notes' => 'Commande en ligne n° ' . $o['number'] . '.', 'lines' => $lines,
        ]);
        if ($error !== null) {
            return [null, $error];
        }
        [$invoiceId, $error] = Documents::saveDraft($orgId, $userId, 0, $draft);
        if ($error !== null) {
            return [null, $error];
        }
        $set = Database::connection()->prepare(
            'UPDATE shoplokal_orders SET facturo_invoice_id = :inv WHERE organization_id = :oid AND id = :id AND facturo_invoice_id IS NULL'
        );
        $set->execute([':inv' => $invoiceId, ':oid' => $orgId, ':id' => $id]);
        if ($set->rowCount() !== 1) {
            Documents::delete($orgId, $invoiceId);
            return [null, 'Une facture vient d\'être créée pour cette commande. Rechargez la page.'];
        }
        return [$invoiceId, null];
    }

    /**
     * @return array{revenue_cents:int,orders:int,paid_cents:int}
     */
    public static function sales(int $orgId, string $from, string $to): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT COALESCE(SUM(total_cents), 0) AS revenue_cents, COUNT(*) AS orders,
                    COALESCE(SUM(CASE WHEN paid_at IS NOT NULL THEN total_cents END), 0) AS paid_cents
             FROM shoplokal_orders WHERE organization_id = :oid AND status <> \'cancelled\' AND created_at >= :f AND created_at < :t'
        );
        $stmt->execute([':oid' => $orgId, ':f' => $from . ' 00:00:00', ':t' => $to . ' 00:00:00']);
        return array_map('intval', $stmt->fetch() ?: ['revenue_cents' => 0, 'orders' => 0, 'paid_cents' => 0]);
    }

    /** VAT of delivery: standard rate when the company is VAT-registered. */
    public static function serviceTaxCode(int $orgId): string
    {
        return Tenant::profile($orgId)['vat_number'] !== '' ? 'TC01' : 'TC03';
    }

    /**
     * @param array<string,mixed> $o
     */
    private static function facturoClient(int $orgId, array $o): int
    {
        $pdo = Database::connection();
        if ($o['email'] !== null) {
            $stmt = $pdo->prepare('SELECT id FROM facturo_clients WHERE organization_id = :oid AND email = :e ORDER BY id LIMIT 1');
            $stmt->execute([':oid' => $orgId, ':e' => $o['email']]);
            if ($id = $stmt->fetchColumn()) {
                return (int) $id;
            }
        }
        $stmt = $pdo->prepare('SELECT id, phone FROM facturo_clients WHERE organization_id = :oid AND phone IS NOT NULL');
        $stmt->execute([':oid' => $orgId]);
        foreach ($stmt->fetchAll() as $c) {
            if (Customers::normalizePhone((string) $c['phone']) === $o['phone']) {
                return (int) $c['id'];
            }
        }
        [$fields] = Clients::validate(['name' => (string) $o['customer_name'], 'email' => (string) ($o['email'] ?? ''),
            'phone' => (string) $o['phone'], 'address' => (string) ($o['address'] ?? ''), 'brn' => '', 'vat_number' => '']);
        return (int) Clients::save($orgId, 0, $fields);
    }

    /**
     * @param array<string,mixed> $o
     * @return array<string,mixed>
     */
    private static function withLines(array $o): array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM shoplokal_order_lines WHERE order_id = :o ORDER BY id');
        $stmt->execute([':o' => (int) $o['id']]);
        $o['lines'] = $stmt->fetchAll();
        return $o;
    }
}
