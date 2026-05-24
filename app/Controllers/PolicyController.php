<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Csrf;
use App\View;
use App\Validator;

class PolicyController
{
    private static function scope(): array
    {
        $a = $_SESSION['agent'] ?? [];
        return [
            'brokerage_id' => (int) ($a['brokerage_id'] ?? 0),
            'agent_id'     => (int) ($a['id'] ?? 0),
            'is_admin'     => ($a['role'] ?? '') === 'admin',
        ];
    }

    private static function requireOwnership(Database $db, int $policyId): array
    {
        $s = self::scope();
        $policy = $db->fetchOne(
            'SELECT p.*, c.first_name, c.last_name, c.email
             FROM policies p JOIN clients c ON c.id = p.client_id
             WHERE p.id = ? AND c.brokerage_id = ?',
            [$policyId, $s['brokerage_id']]
        );
        if (!$policy) {
            http_response_code(404);
            View::render('errors/404');
            exit;
        }
        return $policy;
    }

    public static function index(): void
    {
        $db = Database::getInstance();
        $s  = self::scope();

        $status = $_GET['status'] ?? '';
        $params = [$s['brokerage_id']];
        $where  = 'c.brokerage_id = ?';

        if (!$s['is_admin']) {
            $where .= ' AND p.agent_id = ?';
            $params[] = $s['agent_id'];
        }
        if ($status && in_array($status, ['active','draft','lapsed','cancelled','renewed'], true)) {
            $where .= ' AND p.status = ?';
            $params[] = $status;
        }

        $policies = $db->fetchAll(
            "SELECT p.*, c.first_name, c.last_name, c.email,
                    i.name AS insurer_name, ip.product_name
             FROM policies p
             JOIN clients c  ON c.id = p.client_id
             JOIN insurers i ON i.id = p.insurer_id
             LEFT JOIN insurer_products ip ON ip.id = p.insurer_product_id
             WHERE {$where}
             ORDER BY p.end_date ASC
             LIMIT 300",
            $params
        );

        $insurers = $db->fetchAll('SELECT id, name FROM insurers WHERE is_active=1 ORDER BY name');

        View::render('policies/index', compact('policies', 'status', 'insurers'));
    }

    public static function show(int $id): void
    {
        $db     = Database::getInstance();
        $policy = self::requireOwnership($db, $id);

        $renewals = $db->fetchAll(
            'SELECT r.*, pl.payment_url, pl.status AS link_status, pl.amount AS link_amount
             FROM renewals r LEFT JOIN payment_links pl ON pl.id = r.payment_link_id
             WHERE r.policy_id = ? ORDER BY r.renewal_year DESC',
            [$id]
        );

        $payments = $db->fetchAll(
            'SELECT * FROM payment_links WHERE policy_id = ? ORDER BY created_at DESC LIMIT 20',
            [$id]
        );

        View::render('policies/show', compact('policy', 'renewals', 'payments'));
    }

    public static function create(): void
    {
        $db = Database::getInstance();
        $s  = self::scope();

        $clients  = $db->fetchAll(
            'SELECT id, first_name, last_name FROM clients WHERE brokerage_id=? ORDER BY last_name, first_name',
            [$s['brokerage_id']]
        );
        $insurers = $db->fetchAll('SELECT id, name FROM insurers WHERE is_active=1 ORDER BY name');
        $products = $db->fetchAll(
            'SELECT ip.*, i.name AS insurer_name FROM insurer_products ip JOIN insurers i ON i.id=ip.insurer_id WHERE ip.is_active=1 ORDER BY i.name, ip.product_name'
        );

        // Pre-select client from query string
        $selectedClient = $_GET['client_id'] ?? '';

        View::render('policies/form', [
            'policy' => ['client_id' => $selectedClient],
            'errors' => [], 'clients' => $clients, 'insurers' => $insurers,
            'products' => $products, 'is_edit' => false, 'csrf' => Csrf::token(),
        ]);
    }

    public static function store(): void
    {
        Csrf::validate($_POST['csrf_token'] ?? '');
        $db = Database::getInstance();
        $s  = self::scope();

        $v = new Validator($_POST);
        $v->required('client_id')->required('insurer_id')
          ->required('start_date')->required('end_date')
          ->required('premium_amount');

        if ($v->fails()) {
            self::showFormWithErrors($db, $s, false);
            return;
        }

        $clientId = (int) $_POST['client_id'];
        // Verify client belongs to this brokerage
        $client = $db->fetchOne('SELECT id FROM clients WHERE id=? AND brokerage_id=?', [$clientId, $s['brokerage_id']]);
        if (!$client) {
            View::flash('error', 'Invalid client.');
            header('Location: /policies/create');
            exit;
        }

        $premium   = (float) str_replace(',', '', $_POST['premium_amount']);
        $commPct   = (float) ($_POST['broker_commission_pct'] ?? 0);
        $commAmt   = $commPct > 0 ? round($premium * $commPct / 100, 2) : null;
        $internalRef = 'INS-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -5));

        $db->execute(
            "INSERT INTO policies
                (client_id, agent_id, insurer_id, insurer_product_id,
                 policy_number, internal_ref, status, premium_amount,
                 sum_insured, excess_amount, start_date, end_date,
                 cover_type, payment_frequency, asset_description,
                 broker_commission_pct, broker_commission_amt,
                 inspection_required, notes)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
                $clientId,
                $s['agent_id'],
                (int) $_POST['insurer_id'],
                !empty($_POST['insurer_product_id']) ? (int) $_POST['insurer_product_id'] : null,
                trim($_POST['policy_number'] ?? ''),
                $internalRef,
                $_POST['status'] ?? 'draft',
                $premium,
                !empty($_POST['sum_insured']) ? (float) str_replace(',', '', $_POST['sum_insured']) : null,
                !empty($_POST['excess_amount']) ? (float) str_replace(',', '', $_POST['excess_amount']) : null,
                $_POST['start_date'],
                $_POST['end_date'],
                trim($_POST['cover_type'] ?? ''),
                $_POST['payment_frequency'] ?? 'annual',
                trim($_POST['asset_description'] ?? ''),
                $commPct > 0 ? $commPct : null,
                $commAmt,
                !empty($_POST['inspection_required']) ? 1 : 0,
                trim($_POST['notes'] ?? ''),
            ]
        );

        $policyId = (int) $db->lastInsertId();

        // Auto-create renewal record if policy is active and has an end date
        if (($_POST['status'] ?? '') === 'active' && !empty($_POST['end_date'])) {
            self::createRenewalRecord($db, $policyId, $_POST['end_date']);
        }

        View::flash('success', 'Policy created. Reference: ' . $internalRef);
        header('Location: /policies/' . $policyId);
        exit;
    }

    public static function edit(int $id): void
    {
        $db     = Database::getInstance();
        $policy = self::requireOwnership($db, $id);
        $s      = self::scope();

        $clients  = $db->fetchAll('SELECT id, first_name, last_name FROM clients WHERE brokerage_id=? ORDER BY last_name', [$s['brokerage_id']]);
        $insurers = $db->fetchAll('SELECT id, name FROM insurers WHERE is_active=1 ORDER BY name');
        $products = $db->fetchAll('SELECT ip.*, i.name AS insurer_name FROM insurer_products ip JOIN insurers i ON i.id=ip.insurer_id WHERE ip.is_active=1 ORDER BY i.name, ip.product_name');

        View::render('policies/form', [
            'policy' => $policy, 'errors' => [], 'clients' => $clients,
            'insurers' => $insurers, 'products' => $products,
            'is_edit' => true, 'csrf' => Csrf::token(),
        ]);
    }

    public static function update(int $id): void
    {
        Csrf::validate($_POST['csrf_token'] ?? '');
        $db     = Database::getInstance();
        $policy = self::requireOwnership($db, $id);
        $s      = self::scope();

        $v = new Validator($_POST);
        $v->required('insurer_id')->required('start_date')->required('end_date')->required('premium_amount');

        if ($v->fails()) {
            self::showFormWithErrors($db, $s, true, $id, $policy);
            return;
        }

        $premium = (float) str_replace(',', '', $_POST['premium_amount']);
        $commPct = (float) ($_POST['broker_commission_pct'] ?? 0);
        $commAmt = $commPct > 0 ? round($premium * $commPct / 100, 2) : null;

        $db->execute(
            "UPDATE policies SET
                insurer_id=?, insurer_product_id=?, policy_number=?, status=?,
                premium_amount=?, sum_insured=?, excess_amount=?,
                start_date=?, end_date=?, cover_type=?, payment_frequency=?,
                asset_description=?, broker_commission_pct=?, broker_commission_amt=?,
                inspection_required=?, notes=?
             WHERE id=?",
            [
                (int) $_POST['insurer_id'],
                !empty($_POST['insurer_product_id']) ? (int) $_POST['insurer_product_id'] : null,
                trim($_POST['policy_number'] ?? ''),
                $_POST['status'] ?? 'draft',
                $premium,
                !empty($_POST['sum_insured']) ? (float) str_replace(',', '', $_POST['sum_insured']) : null,
                !empty($_POST['excess_amount']) ? (float) str_replace(',', '', $_POST['excess_amount']) : null,
                $_POST['start_date'],
                $_POST['end_date'],
                trim($_POST['cover_type'] ?? ''),
                $_POST['payment_frequency'] ?? 'annual',
                trim($_POST['asset_description'] ?? ''),
                $commPct > 0 ? $commPct : null,
                $commAmt,
                !empty($_POST['inspection_required']) ? 1 : 0,
                trim($_POST['notes'] ?? ''),
                $id,
            ]
        );

        // Ensure renewal record exists for active policies
        if (($_POST['status'] ?? '') === 'active') {
            $existing = $db->fetchOne('SELECT id FROM renewals WHERE policy_id=? AND renewal_year=YEAR(?)', [$id, $_POST['end_date']]);
            if (!$existing) {
                self::createRenewalRecord($db, $id, $_POST['end_date']);
            }
        }

        View::flash('success', 'Policy updated.');
        header('Location: /policies/' . $id);
        exit;
    }

    private static function createRenewalRecord(Database $db, int $policyId, string $endDate): void
    {
        $expiry = new \DateTimeImmutable($endDate);
        $db->execute(
            "INSERT IGNORE INTO renewals
                (policy_id, renewal_year, status, trigger_date_j45, trigger_date_j30, trigger_date_j15)
             VALUES (?, YEAR(?), 'pending', ?, ?, ?)",
            [
                $policyId,
                $endDate,
                $expiry->modify('-45 days')->format('Y-m-d'),
                $expiry->modify('-30 days')->format('Y-m-d'),
                $expiry->modify('-15 days')->format('Y-m-d'),
            ]
        );
    }

    private static function showFormWithErrors(Database $db, array $s, bool $isEdit, int $id = 0, array $policy = []): void
    {
        $clients  = $db->fetchAll('SELECT id, first_name, last_name FROM clients WHERE brokerage_id=? ORDER BY last_name', [$s['brokerage_id']]);
        $insurers = $db->fetchAll('SELECT id, name FROM insurers WHERE is_active=1 ORDER BY name');
        $products = $db->fetchAll('SELECT ip.*, i.name AS insurer_name FROM insurer_products ip JOIN insurers i ON i.id=ip.insurer_id WHERE ip.is_active=1 ORDER BY i.name, ip.product_name');
        $v = new Validator($_POST);
        $v->required('insurer_id')->required('start_date')->required('end_date')->required('premium_amount');
        $v->fails();
        View::render('policies/form', [
            'policy' => array_merge($policy, $_POST), 'errors' => $v->errors(),
            'clients' => $clients, 'insurers' => $insurers, 'products' => $products,
            'is_edit' => $isEdit, 'csrf' => Csrf::token(),
        ]);
    }
}
