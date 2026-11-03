<?php
/**
 * Pre-qualification filled in by a prospect on the portal, and its
 * acceptance or refusal by MIPS staff.
 *
 * Accepting creates the merchant (or links an existing prospect) and opens
 * the onboarding case the merchant then completes on the portal. The
 * eligibility flags are hints for the analyst, never automatic decisions.
 */
declare(strict_types=1);

namespace App\Portal;

use App\Audit;
use App\Database;
use App\Mailer;
use App\Onboarding\Kyc;
use PDO;
use RuntimeException;

final class Prequalification
{
    public const PAYMENT_METHODS = [
        'card' => 'Card payments', 'qr' => 'QR code payments', 'push' => 'Push-to-phone (mobile wallet)',
        'ecommerce' => 'Online payments (e-commerce)', 'pos' => 'Card terminals in store (POS)',
    ];

    private PDO $db;
    /** @var array<string,mixed> */
    private array $cfg;

    public function __construct()
    {
        $this->db  = Database::connection();
        $this->cfg = $GLOBALS['config']['portal'] ?? [];
    }

    /** Lists the form needs. @return array<string,mixed> */
    public function options(): array
    {
        return [
            'sectors'         => $this->cfg['sectors'] ?? [],
            'volume_bands'    => $this->cfg['volume_bands'] ?? [],
            'payment_methods' => self::PAYMENT_METHODS,
            'home_country'    => (string) ($this->cfg['home_country'] ?? 'Mauritius'),
        ];
    }

    /**
     * Validate the form. Returns the clean values, throws with every error.
     *
     * @param array<string,mixed> $d
     * @return array<string,mixed>
     */
    public function validate(array $d): array
    {
        $s = static fn (string $k, int $max): string => is_scalar($d[$k] ?? null) ? mb_substr(trim((string) $d[$k]), 0, $max) : '';
        $v = [
            'legal_name'               => $s('legal_name', 255),
            'trading_name'             => $s('trading_name', 255),
            'brn'                      => strtoupper($s('brn', 32)),
            'vat_number'               => $s('vat_number', 32),
            'country_of_incorporation' => $s('country_of_incorporation', 60),
            'registered_address'       => $s('registered_address', 1000),
            'sector'                   => $s('sector', 40),
            'products_services'        => $s('products_services', 2000),
            'website'                  => $s('website', 255),
            'countries_of_operation'   => $s('countries_of_operation', 255),
            'monthly_volume_band'      => $s('monthly_volume_band', 20),
            'average_ticket_mur'       => $s('average_ticket_mur', 20),
            'contact_name'             => $s('contact_name', 120),
            'contact_role'             => $s('contact_role', 120),
            'contact_phone'            => $s('contact_phone', 40),
            'is_regulated'             => !empty($d['is_regulated']) ? 1 : 0,
            'regulator'                => $s('regulator', 120),
            'payment_methods'          => array_values(array_intersect(array_keys(self::PAYMENT_METHODS), is_array($d['payment_methods'] ?? null) ? $d['payment_methods'] : [])),
        ];

        $err = [];
        foreach (['legal_name' => 'Legal name', 'trading_name' => 'Trading name', 'brn' => 'BRN', 'country_of_incorporation' => 'Country of incorporation',
                  'registered_address' => 'Registered address', 'products_services' => 'Products and services',
                  'countries_of_operation' => 'Countries of operation', 'contact_name' => 'Contact name', 'contact_phone' => 'Contact phone'] as $k => $label) {
            if ($v[$k] === '') {
                $err[] = $label . ' is required.';
            }
        }
        if ($v['brn'] !== '' && !preg_match('/^[A-Z0-9\/-]{4,32}$/', $v['brn'])) {
            $err[] = 'BRN: letters, digits, "/" or "-" only.';
        }
        if (!isset(($this->cfg['sectors'] ?? [])[$v['sector']])) {
            $err[] = 'Choose a business sector.';
        }
        if (!isset(($this->cfg['volume_bands'] ?? [])[$v['monthly_volume_band']])) {
            $err[] = 'Choose the expected monthly volume.';
        }
        if (!is_numeric($v['average_ticket_mur']) || (float) $v['average_ticket_mur'] <= 0 || (float) $v['average_ticket_mur'] > 10000000) {
            $err[] = 'Average ticket: an amount in MUR greater than 0.';
        }
        if ($v['payment_methods'] === []) {
            $err[] = 'Choose at least one payment method.';
        }
        if ($v['website'] !== '' && !preg_match('#^https?://[^\s/$.?\#].[^\s]*$#i', $v['website'])) {
            $err[] = 'Website: a full address starting with https://';
        }
        if (in_array('ecommerce', $v['payment_methods'], true) && $v['website'] === '') {
            $err[] = 'A website is required for online payments.';
        }
        if ($v['is_regulated'] === 1 && $v['regulator'] === '') {
            $err[] = 'Name the regulator (e.g. FSC, Bank of Mauritius).';
        }
        if (empty($d['declaration'])) {
            $err[] = 'Confirm that the information is true and complete.';
        }
        if ($err !== []) {
            throw new RuntimeException(implode(' ', $err), 422);
        }
        $v['average_ticket_mur'] = round((float) $v['average_ticket_mur'], 2);
        return $v;
    }

    /**
     * Points the analyst should look at. Not shown to the merchant.
     *
     * @param array<string,mixed> $v
     * @return list<string>
     */
    public function flags(array $v): array
    {
        $home  = mb_strtolower((string) ($this->cfg['home_country'] ?? 'Mauritius'));
        $flags = [];
        if (in_array($v['sector'], $this->cfg['high_risk_sectors'] ?? [], true)) {
            $flags[] = 'Sector flagged for enhanced review: ' . (($this->cfg['sectors'] ?? [])[$v['sector']] ?? $v['sector']) . '.';
        }
        if (mb_strtolower(trim((string) $v['country_of_incorporation'])) !== $home) {
            $flags[] = 'Incorporated outside ' . $this->cfg['home_country'] . ': ' . $v['country_of_incorporation'] . '.';
        }
        $countries = array_filter(array_map(static fn ($c) => mb_strtolower(trim($c)), preg_split('/[,;\n]+/', (string) $v['countries_of_operation']) ?: []));
        if (array_diff($countries, [$home]) !== []) {
            $flags[] = 'Operates outside ' . $this->cfg['home_country'] . ': ' . $v['countries_of_operation'] . '.';
        }
        if (in_array($v['monthly_volume_band'], $this->cfg['flag_volume_bands'] ?? [], true)) {
            $flags[] = 'High expected volume: ' . (($this->cfg['volume_bands'] ?? [])[$v['monthly_volume_band']] ?? '') . '.';
        }
        if ((int) $v['is_regulated'] === 1) {
            $flags[] = 'Declares being regulated by ' . $v['regulator'] . ': check the licence.';
        }
        return $flags;
    }

    /** @return array<string,mixed>|null the merchant account's application */
    public function forUser(int $userId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM prequalifications WHERE portal_user_id = :u ORDER BY id DESC LIMIT 1');
        $stmt->execute([':u' => $userId]);
        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * @param array<string,mixed> $user portal account
     * @param array<string,mixed> $data validated values
     */
    public function submit(array $user, array $data): int
    {
        if ($this->forUser((int) $user['id']) !== null) {
            throw new RuntimeException('Your application has already been sent. Contact MIPS to change it.', 409);
        }
        $flags = $this->flags($data);
        $this->db->prepare(
            'INSERT INTO prequalifications (portal_user_id, legal_name, trading_name, brn, vat_number, country_of_incorporation,
                registered_address, sector, products_services, website, countries_of_operation, monthly_volume_band,
                average_ticket_mur, payment_methods, contact_name, contact_role, contact_phone, is_regulated, regulator, flags)
             VALUES (:u, :ln, :tn, :brn, :vat, :coi, :addr, :sector, :ps, :web, :coo, :band, :ticket, :pm, :cn, :cr, :cp, :reg, :regulator, :flags)'
        )->execute([
            ':u' => (int) $user['id'], ':ln' => $data['legal_name'], ':tn' => $data['trading_name'], ':brn' => $data['brn'],
            ':vat' => $data['vat_number'] ?: null, ':coi' => $data['country_of_incorporation'], ':addr' => $data['registered_address'],
            ':sector' => $data['sector'], ':ps' => $data['products_services'], ':web' => $data['website'] ?: null,
            ':coo' => $data['countries_of_operation'], ':band' => $data['monthly_volume_band'], ':ticket' => $data['average_ticket_mur'],
            ':pm' => implode(',', $data['payment_methods']), ':cn' => $data['contact_name'], ':cr' => $data['contact_role'] ?: null,
            ':cp' => $data['contact_phone'], ':reg' => $data['is_regulated'], ':regulator' => $data['regulator'] ?: null,
            ':flags' => json_encode($flags, JSON_UNESCAPED_UNICODE),
        ]);
        $id = (int) $this->db->lastInsertId();
        Audit::log('portal.application_submit', 'prequalification', $id,
            ['legal_name' => $data['legal_name'], 'brn' => $data['brn'], 'flags' => count($flags)], PortalAuth::actor($user));
        return $id;
    }

    /** @return array<string,mixed> */
    public function get(int $id): array
    {
        $stmt = $this->db->prepare(
            'SELECT p.*, u.email AS portal_email, u.name AS portal_name, u.is_active AS portal_active, ud.email AS decided_by_email
             FROM prequalifications p JOIN portal_users u ON u.id = p.portal_user_id LEFT JOIN users ud ON ud.id = p.decided_by
             WHERE p.id = :id'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if (!is_array($row)) {
            throw new RuntimeException('Application not found.', 404);
        }
        $row['flags']           = json_decode((string) $row['flags'], true) ?: [];
        $row['payment_methods'] = $row['payment_methods'] === '' ? [] : explode(',', (string) $row['payment_methods']);
        return $row;
    }

    /**
     * Accept: create the merchant (or link an existing prospect) and open
     * the onboarding case, assigned to the accepting analyst.
     *
     * @param array<string,mixed> $staff
     * @return array{merchant_id:int, case_id:int}
     */
    public function accept(int $id, array $staff, ?int $linkMerchantId, string $note): array
    {
        $p = $this->get($id);
        if ($p['status'] !== 'submitted') {
            throw new RuntimeException('This application has already been ' . $p['status'] . '.', 409);
        }

        $this->db->beginTransaction();
        try {
            if ($linkMerchantId !== null) {
                $m = $this->db->prepare('SELECT id, status FROM merchants WHERE id = :id FOR UPDATE');
                $m->execute([':id' => $linkMerchantId]);
                $merchant = $m->fetch();
                if (!is_array($merchant)) {
                    throw new RuntimeException('Merchant not found.', 404);
                }
                $chk = $this->db->prepare("SELECT status FROM onboarding_cases WHERE merchant_id = :m AND status IN ('collecting','under_review','on_hold','approved')");
                $chk->execute([':m' => $linkMerchantId]);
                if (($st = $chk->fetchColumn()) !== false) {
                    throw new RuntimeException($st === 'approved'
                        ? 'This merchant is already approved: start its periodic review from the merchant record instead.'
                        : 'This merchant already has an open onboarding case.', 409);
                }
                $merchantId = $linkMerchantId;
                $this->db->prepare("UPDATE merchants SET status = 'onboarding' WHERE id = :m AND status = 'prospect'")->execute([':m' => $merchantId]);
            } else {
                $merchantId = $this->createMerchant($p, (int) $staff['id']);
            }

            // The applicant becomes the primary contact (reminders go there).
            $has = $this->db->prepare('SELECT 1 FROM merchant_contacts WHERE merchant_id = :m AND email = :e');
            $has->execute([':m' => $merchantId, ':e' => $p['portal_email']]);
            if ($has->fetchColumn() === false) {
                $primary = $this->db->prepare('SELECT 1 FROM merchant_contacts WHERE merchant_id = :m AND is_primary = 1');
                $primary->execute([':m' => $merchantId]);
                $this->db->prepare(
                    'INSERT INTO merchant_contacts (merchant_id, name, job_title, email, phone, is_primary, notes)
                     VALUES (:m, :n, :j, :e, :p, :pr, :notes)'
                )->execute([':m' => $merchantId, ':n' => $p['contact_name'], ':j' => $p['contact_role'], ':e' => $p['portal_email'],
                    ':p' => $p['contact_phone'], ':pr' => $primary->fetchColumn() === false ? 1 : 0, ':notes' => 'Merchant portal account']);
            }

            $due = (new \DateTimeImmutable('today'))->modify('+' . (int) ($GLOBALS['config']['kyc']['default_due_days'] ?? 30) . ' days')->format('Y-m-d');
            $this->db->prepare(
                "INSERT INTO onboarding_cases (merchant_id, kind, assigned_to, due_date, notes, created_by)
                 VALUES (:m, 'initial', :a, :d, :n, :u)"
            )->execute([':m' => $merchantId, ':a' => (int) $staff['id'], ':d' => $due, ':n' => 'Opened from portal application #' . $id, ':u' => (int) $staff['id']]);
            $caseId = (int) $this->db->lastInsertId();
            (new Kyc())->recordHandlers($caseId, [(int) $staff['id']]);

            $this->db->prepare(
                "UPDATE prequalifications SET status = 'accepted', decided_by = :u, decided_at = NOW(), decision_note = :n,
                    merchant_id = :m, case_id = :c WHERE id = :id AND status = 'submitted'"
            )->execute([':u' => (int) $staff['id'], ':n' => $note ?: null, ':m' => $merchantId, ':c' => $caseId, ':id' => $id]);
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        Audit::log('portal.application_accept', 'prequalification', $id, ['merchant_id' => $merchantId, 'case_id' => $caseId, 'linked' => $linkMerchantId !== null]);
        Audit::log('onboarding.open', 'merchant', $merchantId, ['case_id' => $caseId, 'kind' => 'initial', 'source' => 'portal', 'application_id' => $id]);
        Mailer::send((string) $p['portal_email'], 'MIPS: next step for ' . $p['legal_name'],
            "Hello {$p['portal_name']},\n\nThank you for your application. MIPS has reviewed your pre-qualification and you can now "
            . "provide the documents needed to open your merchant account:\n\n" . rtrim((string) $GLOBALS['config']['app']['url'], '/') . "/portal/documents.php\n\n"
            . "This is not yet an approval: MIPS decides once all documents have been checked.\n\nMIPS\n");

        return ['merchant_id' => $merchantId, 'case_id' => $caseId];
    }

    /** @param array<string,mixed> $staff */
    public function decline(int $id, array $staff, string $note): void
    {
        $p = $this->get($id);
        if ($p['status'] !== 'submitted') {
            throw new RuntimeException('This application has already been ' . $p['status'] . '.', 409);
        }
        if (trim($note) === '') {
            throw new RuntimeException('Record the reason (internal note, not sent to the applicant).', 422);
        }
        $this->db->prepare(
            "UPDATE prequalifications SET status = 'declined', decided_by = :u, decided_at = NOW(), decision_note = :n WHERE id = :id AND status = 'submitted'"
        )->execute([':u' => (int) $staff['id'], ':n' => mb_substr(trim($note), 0, 1000), ':id' => $id]);
        Audit::log('portal.application_decline', 'prequalification', $id, ['legal_name' => $p['legal_name']]);
        Mailer::send((string) $p['portal_email'], 'MIPS: your application for ' . $p['legal_name'],
            "Hello {$p['portal_name']},\n\nThank you for your interest in MIPS. After review, we are not able to take your application "
            . "further at this stage.\n\nIf you have questions, reply to this email.\n\nMIPS\n");
    }

    /** @param array<string,mixed> $p */
    private function createMerchant(array $p, int $staffId): int
    {
        // merchants.name is the import key: never reuse an existing one.
        $name = $p['trading_name'];
        $chk  = $this->db->prepare('SELECT 1 FROM merchants WHERE name = :n');
        for ($i = 2; ; $i++) {
            $chk->execute([':n' => $name]);
            if ($chk->fetchColumn() === false) {
                break;
            }
            $name = $p['trading_name'] . ' (' . $i . ')';
        }
        $this->db->prepare(
            "INSERT INTO merchants (name, legal_name, status, brn, vat_number, address, sector, account_manager_id, notes)
             VALUES (:n, :ln, 'onboarding', :brn, :vat, :addr, :sector, :am, :notes)"
        )->execute([
            ':n' => $name, ':ln' => $p['legal_name'], ':brn' => $p['brn'], ':vat' => $p['vat_number'], ':addr' => $p['registered_address'],
            ':sector' => (($this->cfg['sectors'] ?? [])[$p['sector']] ?? $p['sector']), ':am' => $staffId,
            ':notes' => 'Created from merchant portal application #' . $p['id'] . '.',
        ]);
        $id = (int) $this->db->lastInsertId();
        Audit::log('merchant.create', 'merchant', $id, ['name' => $name, 'source' => 'portal', 'application_id' => (int) $p['id']]);
        return $id;
    }
}
