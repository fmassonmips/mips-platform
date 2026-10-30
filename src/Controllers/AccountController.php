<?php
/**
 * POST /api/auth/account — no login (CSRF token of the page).
 *
 * Input (JSON body), by action:
 *   verify  { "t" }                  confirm the e-mail address: activates the account and logs in
 *   forgot  { "email" }              send a reset link if the address has an active account; same answer either way
 *   reset   { "t", "password" }      new password from a reset link: logs in, other sessions end
 *
 * Responses: 200 { "success": true, "message"? } · 405 / 419 / 422 / 429 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Accounts;
use App\Auth;
use App\Csrf;
use App\Legal;
use App\RateLimiter;
use App\Request;
use App\Response;
use App\Suite\Notifications;
use App\Validator;

final class AccountController
{
    public function handle(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Méthode non autorisée'], 405);
        }
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Jeton de sécurité invalide, rechargez la page.'], 419);
        }
        $data = Request::json();
        switch (Request::str($data, 'action', 10)) {
            case 'verify':
                [$user, $error] = Accounts::verify(Request::str($data, 't', 64), is_string($data['password'] ?? null) ? $data['password'] : '');
                if ($error !== null) {
                    Response::json(['error' => $error], 422);
                }
                Auth::login_user($user);
                RateLimiter::record(Request::clientIp(), (string) $user['email'], true);   // this IP is now known
                Legal::accept((int) $user['id']);   // every sign-up form requires accepting the terms
                Notifications::welcome($user);
                Response::json(['success' => true]);

            case 'forgot':
                $email = strtolower(Request::str($data, 'email', 300));
                if (Validator::email($email) !== null) {
                    Response::json(['error' => 'Format d’e-mail invalide.'], 422);
                }
                $ip = Request::clientIp();
                if (RateLimiter::tooManyRequests($ip, 'forgot', 10, 3600)) {
                    Response::json(['error' => 'Trop de demandes depuis cette connexion. Réessayez dans une heure.'], 429);
                }
                RateLimiter::recordRequest($ip, 'forgot');   // per address: 3 e-mails an hour (Accounts)
                Accounts::forgot($email);
                Response::json(['success' => true,
                    'message' => 'Si un compte existe pour ' . $email . ', un lien pour choisir un nouveau mot de passe vient d’y être envoyé (valable 1 heure).']);

            case 'reset':
                $password = is_string($data['password'] ?? null) ? $data['password'] : '';
                [$user, $error] = Accounts::reset(Request::str($data, 't', 64), $password);
                if ($error !== null) {
                    Response::json(['error' => $error], 422);
                }
                Auth::login_user($user);
                // The mailbox owner is back in: lift a lock-out on the address, and know this IP.
                RateLimiter::clear((string) $user['email']);
                RateLimiter::record(Request::clientIp(), (string) $user['email'], true);
                Response::json(['success' => true]);

            default:
                Response::json(['error' => 'Action invalide.'], 422);
        }
    }
}
