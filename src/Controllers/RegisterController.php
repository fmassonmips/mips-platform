<?php
/**
 * POST /api/auth/register
 *
 * Input (JSON body):
 *   { "email": "...", "name": "...", "password": "..." }
 *
 * Responses:
 *   201 { "success": true, "verify": true, "message": "..." }   e-mail configured: confirmation link sent
 *   201 { "success": true, "message": "Account created. An administrator will activate it." }   no e-mail
 *   409 { "error": "An account with this email already exists." }
 *   422 { "error": "..." }
 *   429 { "error": "Too many attempts. Please try again later." }
 *   405 { "error": "Method Not Allowed" }
 *   419 { "error": "Invalid CSRF token." }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Accounts;
use App\Csrf;
use App\Database;
use App\Legal;
use App\Mail\SmtpMailer;
use App\RateLimiter;
use App\Request;
use App\Response;
use App\Validator;

final class RegisterController
{
    public function handle(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Méthode non autorisée'], 405);
        }

        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Jeton de sécurité invalide, rechargez la page.'], 419);
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
        if (($data['accept_terms'] ?? false) !== true) {
            Response::json(['error' => 'Pour créer un compte, acceptez les conditions générales d’utilisation et la politique de confidentialité.'], 422);
        }

        $rl = $GLOBALS['config']['rate_limit'];
        $ip = Request::clientIp();
        if (RateLimiter::tooManyAttempts($ip, $email, (int) $rl['max_attempts'], (int) $rl['window_seconds'])) {
            Response::json(['error' => 'Trop de tentatives. Veuillez réessayer plus tard.'], 429);
        }

        // With e-mail: self-service sign-up confirmed by a link; the answer is the same whether
        // the address is new or not (the e-mail tells the owner). Without e-mail: manual activation.
        if (SmtpMailer::isConfigured()) {
            if (RateLimiter::tooManyRequests($ip, 'signup', 10, 3600)) {
                Response::json(['error' => 'Trop d’inscriptions depuis cette connexion. Réessayez dans une heure.'], 429);
            }
            RateLimiter::recordRequest($ip, 'signup');
            Accounts::register(strtolower($email), $name, $password);
            Response::json([
                'success' => true, 'verify' => true,
                'message' => 'Presque fini : ouvrez le lien envoyé à ' . strtolower($email) . ' pour activer votre compte (pensez aux indésirables).',
            ], 201);
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);

        try {
            $stmt = Database::connection()->prepare(
                'INSERT INTO users (email, password_hash, name, role, is_active, terms_version, terms_accepted_at, created_at, updated_at)
                 VALUES (:email, :hash, :name, :role, 0, :terms, NOW(), NOW(), NOW())'
            );
            $stmt->execute([
                ':email' => $email,
                ':hash'  => $hash,
                ':name'  => $name,
                ':role'  => 'user',
                ':terms' => Legal::VERSION,
            ]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') {
                RateLimiter::record($ip, $email, false);
                Response::json(['error' => 'Un compte existe déjà avec cet e-mail.'], 409);
            }
            error_log('[Register] ' . $e->getMessage());
            Response::json(['error' => 'Échec de l’inscription. Veuillez réessayer plus tard.'], 500);
        }

        RateLimiter::record($ip, $email, true);

        Response::json([
            'success' => true,
            'message' => 'Compte créé. Un administrateur va l’activer.',
        ], 201);
    }
}
