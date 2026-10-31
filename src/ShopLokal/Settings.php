<?php
/**
 * Per-organization shop settings; the row (and the shop link) is created on
 * first read. The shop stays closed until the owner opens it.
 */
declare(strict_types=1);

namespace App\ShopLokal;

use App\Database;
use App\Facturo\Money;

final class Settings
{
    /**
     * @return array<string,mixed>
     */
    public static function get(int $orgId): array
    {
        $pdo = Database::connection();
        $pdo->prepare('INSERT IGNORE INTO shoplokal_settings (organization_id, public_token) VALUES (:oid, :t)')
            ->execute([':oid' => $orgId, ':t' => bin2hex(random_bytes(16))]);
        $stmt = $pdo->prepare('SELECT * FROM shoplokal_settings WHERE organization_id = :oid');
        $stmt->execute([':oid' => $orgId]);
        $r = $stmt->fetch();
        foreach (['shop_open', 'pay_cod', 'pay_bank', 'pay_juice', 'delivery_enabled', 'pickup_enabled'] as $flag) {
            $r[$flag] = (int) $r[$flag] === 1;
        }
        foreach (['intro', 'bank_details', 'juice_number', 'pickup_address', 'notify_email'] as $text) {
            $r[$text] = (string) ($r[$text] ?? '');
        }
        $r['delivery_fee_cents']       = (int) $r['delivery_fee_cents'];
        $r['free_delivery_from_cents'] = $r['free_delivery_from_cents'] !== null ? (int) $r['free_delivery_from_cents'] : null;
        return $r;
    }

    public static function orgByToken(string $token): ?int
    {
        if (!preg_match('/^[0-9a-f]{32}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare('SELECT organization_id FROM shoplokal_settings WHERE public_token = :t');
        $stmt->execute([':t' => $token]);
        $id = $stmt->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    /**
     * @param array<string,mixed> $in
     */
    public static function save(int $orgId, array $in): ?string
    {
        $b = static fn (string $k): bool => ($in[$k] ?? false) === true;
        $t = static fn (string $k, int $max): string => mb_substr(trim((string) ($in[$k] ?? '')), 0, $max + 1);
        $intro = $t('intro', 500);
        $bank  = $t('bank_details', 300);
        $juice = $t('juice_number', 40);
        $pick  = $t('pickup_address', 300);
        $email = $t('notify_email', 254);
        $feeIn = $t('delivery_fee', 15);
        $freeIn = $t('free_delivery_from', 15);
        $fee   = $feeIn === '' ? 0 : Money::parseCents($feeIn);
        $free  = $freeIn === '' ? null : Money::parseCents($freeIn);

        if (mb_strlen($intro) > 500 || mb_strlen($bank) > 300 || mb_strlen($juice) > 40 || mb_strlen($pick) > 300) {
            return 'Un des textes est trop long.';
        }
        if (!$b('pay_cod') && !$b('pay_bank') && !$b('pay_juice')) {
            return 'Proposez au moins un moyen de paiement.';
        }
        if ($b('pay_bank') && $bank === '') {
            return 'Indiquez vos coordonnées bancaires pour le paiement par virement.';
        }
        if ($b('pay_juice') && $juice === '') {
            return 'Indiquez le numéro qui reçoit les paiements Juice.';
        }
        if (!$b('delivery_enabled') && !$b('pickup_enabled')) {
            return 'Proposez la livraison, le retrait, ou les deux.';
        }
        if ($b('pickup_enabled') && $pick === '') {
            return 'Indiquez l\'adresse de retrait.';
        }
        if ($fee === null || $fee < 0 || ($freeIn !== '' && ($free === null || $free < 0))) {
            return 'Frais de livraison invalides.';
        }
        if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254)) {
            return 'E-mail de notification invalide.';
        }
        self::get($orgId);
        Database::connection()->prepare(
            'UPDATE shoplokal_settings SET shop_open = :open, intro = :intro, pay_cod = :cod, pay_bank = :bank, bank_details = :bd,
                    pay_juice = :juice, juice_number = :jn, delivery_enabled = :de, delivery_fee_cents = :fee,
                    free_delivery_from_cents = :free, pickup_enabled = :pe, pickup_address = :pa, notify_email = :ne
             WHERE organization_id = :oid'
        )->execute([
            ':open' => $b('shop_open') ? 1 : 0, ':intro' => $intro !== '' ? $intro : null, ':cod' => $b('pay_cod') ? 1 : 0,
            ':bank' => $b('pay_bank') ? 1 : 0, ':bd' => $bank !== '' ? $bank : null, ':juice' => $b('pay_juice') ? 1 : 0,
            ':jn' => $juice !== '' ? $juice : null, ':de' => $b('delivery_enabled') ? 1 : 0, ':fee' => $fee, ':free' => $free,
            ':pe' => $b('pickup_enabled') ? 1 : 0, ':pa' => $pick !== '' ? $pick : null, ':ne' => $email !== '' ? $email : null,
            ':oid' => $orgId,
        ]);
        return null;
    }

    public static function newLink(int $orgId): void
    {
        self::get($orgId);
        Database::connection()->prepare('UPDATE shoplokal_settings SET public_token = :t WHERE organization_id = :oid')
            ->execute([':t' => bin2hex(random_bytes(16)), ':oid' => $orgId]);
    }
}
