<?php
/**
 * POST /api/auth/register
 *
 * Input (JSON body):
 *   { "email": "...", "name": "...", "password": "..." }
 *
 * Responses:
 *   201 { "success": true, "message": "Account created. An administrator will activate it." }
 *   409 { "error": "An account with this email already exists." }
 *   422 { "error": "..." }
 *   429 { "error": "Too many attempts. Please try again later." }
 *   405 { "error": "Method Not Allowed" }
 *   419 { "error": "Invalid CSRF token." }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Csrf;
use App\Database;
use App\RateLimiter;
use App\Response;
use App\Validator;

final class RegisterController
{
    public function handle(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }

        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Invalid CSRF token.'], 419);
        }

        $raw  = (string) file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $data = $_POST;
        }

        $email    = is_string($data['email'] ?? null) ? trim((string) $data['email']) : '';
        $name     = is_string($data['name'] ?? null) ? trim((string) $data['name']) : '';
        $password = is_string($data['password'] ?? null) ? (string) $data['password'] : '';

        $minLen    = (int) ($GLOBALS['config']['security']['password_min_length'] ?? 8);
        $emailErr  = Validator::email($email);
        $nameErr   = Validator::name($name);
        $passwdErr = Validator::password($password, $minLen);

        if ($emailErr !== null) {
            Response::json(['error' => $emailErr], 422);
        }
        if ($nameErr !== null) {
            Response::json(['error' => $nameErr], 422);
        }
        if ($passwdErr !== null) {
            Response::json(['error' => $passwdErr], 422);
        }

        $rl = $GLOBALS['config']['rate_limit'];
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
        if (RateLimiter::tooManyAttempts($ip, $email, (int) $rl['max_attempts'], (int) $rl['window_seconds'])) {
            Response::json(['error' => 'Too many attempts. Please try again later.'], 429);
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);

        try {
            $stmt = Database::connection()->prepare(
                'INSERT INTO users (email, password_hash, name, role, is_active, created_at, updated_at)
                 VALUES (:email, :hash, :name, :role, 0, NOW(), NOW())'
            );
            $stmt->execute([
                ':email' => $email,
                ':hash'  => $hash,
                ':name'  => $name,
                ':role'  => 'user',
            ]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') {
                RateLimiter::record($ip, $email, false);
                Response::json(['error' => 'An account with this email already exists.'], 409);
            }
            error_log('[Register] ' . $e->getMessage());
            Response::json(['error' => 'Registration failed. Please try again later.'], 500);
        }

        RateLimiter::record($ip, $email, true);

        Response::json([
            'success' => true,
            'message' => 'Account created. An administrator will activate it.',
        ], 201);
    }
}
