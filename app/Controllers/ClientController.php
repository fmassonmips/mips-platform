<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Csrf;
use App\View;
use App\Validator;

class ClientController
{
    private static function scope(): array
    {
        $a = $_SESSION['agent'] ?? [];
        $isAdmin = ($a['role'] ?? '') === 'admin';
        return [
            'brokerage_id' => (int) ($a['brokerage_id'] ?? 0),
            'agent_id'     => (int) ($a['id'] ?? 0),
            'is_admin'     => $isAdmin,
        ];
    }

    private static function requireOwnership(Database $db, int $clientId): array
    {
        $s = self::scope();
        $client = $db->fetchOne(
            'SELECT * FROM clients WHERE id = ? AND brokerage_id = ?',
            [$clientId, $s['brokerage_id']]
        );
        if (!$client) {
            http_response_code(404);
            View::render('errors/404');
            exit;
        }
        return $client;
    }

    public static function index(): void
    {
        $db = Database::getInstance();
        $s  = self::scope();

        $search = trim($_GET['q'] ?? '');
        $params = [$s['brokerage_id']];
        $where  = 'brokerage_id = ?';

        if (!$s['is_admin']) {
            $where .= ' AND agent_id = ?';
            $params[] = $s['agent_id'];
        }

        if ($search !== '') {
            $where .= ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone_mobile LIKE ?)';
            $like = "%{$search}%";
            array_push($params, $like, $like, $like, $like);
        }

        $clients = $db->fetchAll(
            "SELECT c.*, u.name AS agent_name
             FROM clients c
             LEFT JOIN agents a ON a.id = c.agent_id
             LEFT JOIN users u  ON u.id = a.user_id
             WHERE {$where}
             ORDER BY c.created_at DESC
             LIMIT 200",
            $params
        );

        View::render('clients/index', compact('clients', 'search'));
    }

    public static function show(int $id): void
    {
        $db     = Database::getInstance();
        $client = self::requireOwnership($db, $id);

        $policies = $db->fetchAll(
            "SELECT p.*, i.name AS insurer_name, ip.product_name
             FROM policies p
             JOIN insurers i ON i.id = p.insurer_id
             LEFT JOIN insurer_products ip ON ip.id = p.insurer_product_id
             WHERE p.client_id = ?
             ORDER BY p.end_date DESC",
            [$id]
        );

        $comms = $db->fetchAll(
            "SELECT * FROM communications WHERE client_id = ? ORDER BY created_at DESC LIMIT 20",
            [$id]
        );

        View::render('clients/show', compact('client', 'policies', 'comms'));
    }

    public static function create(): void
    {
        $s = self::scope();
        $db = Database::getInstance();

        // Agents list for admin
        $agents = $s['is_admin']
            ? $db->fetchAll(
                'SELECT a.id, u.name FROM agents a JOIN users u ON u.id = a.user_id WHERE a.brokerage_id = ? AND a.is_active = 1',
                [$s['brokerage_id']]
              )
            : [];

        View::render('clients/form', [
            'client' => [], 'errors' => [], 'agents' => $agents,
            'is_edit' => false, 'csrf' => Csrf::token(),
        ]);
    }

    public static function store(): void
    {
        Csrf::validate($_POST['csrf_token'] ?? '');
        $db = Database::getInstance();
        $s  = self::scope();

        $v = new Validator($_POST);
        $v->required('first_name')->maxLen('first_name', 80)
          ->required('last_name')->maxLen('last_name', 80)
          ->email('email')->required('phone_mobile');

        if ($v->fails()) {
            $agents = $s['is_admin']
                ? $db->fetchAll('SELECT a.id, u.name FROM agents a JOIN users u ON u.id=a.user_id WHERE a.brokerage_id=? AND a.is_active=1', [$s['brokerage_id']])
                : [];
            View::render('clients/form', [
                'client' => $_POST, 'errors' => $v->errors(),
                'agents' => $agents, 'is_edit' => false, 'csrf' => Csrf::token(),
            ]);
            return;
        }

        $assignedAgent = $s['is_admin'] && !empty($_POST['agent_id'])
            ? (int) $_POST['agent_id']
            : $s['agent_id'];

        $db->execute(
            "INSERT INTO clients
                (brokerage_id, agent_id, client_type, first_name, last_name,
                 nic_number, email, phone_mobile, phone_whatsapp,
                 language_pref, communication_pref, notes)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [
                $s['brokerage_id'],
                $assignedAgent,
                $_POST['client_type'] ?? 'individual',
                trim($_POST['first_name']),
                trim($_POST['last_name']),
                trim($_POST['nic_number'] ?? ''),
                trim($_POST['email'] ?? ''),
                trim($_POST['phone_mobile']),
                trim($_POST['phone_whatsapp'] ?? ''),
                $_POST['language_pref'] ?? 'en',
                json_encode(array_filter(['email' => !empty($_POST['pref_email']), 'whatsapp' => !empty($_POST['pref_whatsapp'])])),
                trim($_POST['notes'] ?? ''),
            ]
        );

        View::flash('success', 'Client created successfully.');
        header('Location: /clients/' . $db->lastInsertId());
        exit;
    }

    public static function edit(int $id): void
    {
        $db     = Database::getInstance();
        $client = self::requireOwnership($db, $id);
        $s      = self::scope();

        $agents = $s['is_admin']
            ? $db->fetchAll('SELECT a.id, u.name FROM agents a JOIN users u ON u.id=a.user_id WHERE a.brokerage_id=? AND a.is_active=1', [$s['brokerage_id']])
            : [];

        View::render('clients/form', [
            'client' => $client, 'errors' => [], 'agents' => $agents,
            'is_edit' => true, 'csrf' => Csrf::token(),
        ]);
    }

    public static function update(int $id): void
    {
        Csrf::validate($_POST['csrf_token'] ?? '');
        $db     = Database::getInstance();
        $client = self::requireOwnership($db, $id);
        $s      = self::scope();

        $v = new Validator($_POST);
        $v->required('first_name')->required('last_name')->email('email')->required('phone_mobile');

        if ($v->fails()) {
            $agents = $s['is_admin']
                ? $db->fetchAll('SELECT a.id, u.name FROM agents a JOIN users u ON u.id=a.user_id WHERE a.brokerage_id=? AND a.is_active=1', [$s['brokerage_id']])
                : [];
            View::render('clients/form', [
                'client' => array_merge($client, $_POST), 'errors' => $v->errors(),
                'agents' => $agents, 'is_edit' => true, 'csrf' => Csrf::token(),
            ]);
            return;
        }

        $db->execute(
            "UPDATE clients SET
                client_type=?, first_name=?, last_name=?, nic_number=?,
                email=?, phone_mobile=?, phone_whatsapp=?,
                language_pref=?, communication_pref=?, notes=?
             WHERE id=? AND brokerage_id=?",
            [
                $_POST['client_type'] ?? 'individual',
                trim($_POST['first_name']),
                trim($_POST['last_name']),
                trim($_POST['nic_number'] ?? ''),
                trim($_POST['email'] ?? ''),
                trim($_POST['phone_mobile']),
                trim($_POST['phone_whatsapp'] ?? ''),
                $_POST['language_pref'] ?? 'en',
                json_encode(array_filter(['email' => !empty($_POST['pref_email']), 'whatsapp' => !empty($_POST['pref_whatsapp'])])),
                trim($_POST['notes'] ?? ''),
                $id,
                $s['brokerage_id'],
            ]
        );

        View::flash('success', 'Client updated.');
        header('Location: /clients/' . $id);
        exit;
    }
}
