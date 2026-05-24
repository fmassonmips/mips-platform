<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Csrf;
use App\Database;
use App\View;

class LoginController
{
    public static function showForm(): void
    {
        if (!empty($_SESSION['agent'])) {
            header('Location: /');
            exit;
        }
        View::render('auth/login', ['csrf' => Csrf::token(), 'error' => null], '');
    }

    public static function login(): void
    {
        $token = $_POST['csrf_token'] ?? '';
        if (!Csrf::verify($token)) {
            View::render('auth/login', ['csrf' => Csrf::token(), 'error' => 'Security token expired. Try again.'], '');
            return;
        }

        $email    = trim($_POST['email'] ?? '');
        $password = $_POST['password'] ?? '';

        if ($email === '' || $password === '') {
            View::render('auth/login', ['csrf' => Csrf::token(), 'error' => 'Email and password are required.'], '');
            return;
        }

        $db   = Database::getInstance();
        $user = $db->fetchOne(
            'SELECT id, email, password_hash, name, role, is_active FROM users WHERE email = ? LIMIT 1',
            [$email]
        );

        if (!$user || !(int) $user['is_active'] || !password_verify($password, (string) $user['password_hash'])) {
            View::render('auth/login', ['csrf' => Csrf::token(), 'error' => 'Invalid email or password.'], '');
            return;
        }

        $agent = $db->fetchOne(
            'SELECT a.id, a.brokerage_id, a.role, b.name AS brokerage_name
             FROM agents a JOIN brokerages b ON b.id = a.brokerage_id
             WHERE a.user_id = ? AND a.is_active = 1 LIMIT 1',
            [(int) $user['id']]
        );

        if (!$agent) {
            View::render('auth/login', ['csrf' => Csrf::token(), 'error' => 'Account not linked to a brokerage. Contact your administrator.'], '');
            return;
        }

        session_regenerate_id(true);
        $_SESSION['agent'] = [
            'id'             => (int) $agent['id'],
            'user_id'        => (int) $user['id'],
            'brokerage_id'   => (int) $agent['brokerage_id'],
            'role'           => $agent['role'],
            'name'           => (string) $user['name'],
            'email'          => (string) $user['email'],
            'brokerage_name' => (string) $agent['brokerage_name'],
        ];

        header('Location: /');
        exit;
    }
}
