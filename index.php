<?php
/**
 * Front controller — InsurLink MU
 *
 * All HTTP requests are routed here by .htaccess (except install.php and
 * static files). No complex Router class — just clean match/if routing.
 */
declare(strict_types=1);

define('ROOT_PATH', __DIR__);

require __DIR__ . '/src/bootstrap.php';

use App\Controllers\ClientController;
use App\Controllers\DashboardController;
use App\Controllers\LoginController;
use App\Controllers\LogoutController;
use App\Controllers\PaymentController;
use App\Controllers\PolicyController;
use App\Controllers\RenewalController;
use App\Controllers\WebhookController;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Auth guard: redirect to /login when no authenticated user in session.
 */
function requireAuth(): void
{
    if (empty($_SESSION['agent'])) {
        header('Location: /login');
        exit;
    }
}

/**
 * Strip the query string and decode the URI path.
 */
function parsePath(): string
{
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($uri, PHP_URL_PATH);
    return rtrim(rawurldecode($path ?: '/'), '/') ?: '/';
}

// ── Parse request ──────────────────────────────────────────────────────────────

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path   = parsePath();

// ── Route matching ─────────────────────────────────────────────────────────────

// POST /webhook/mips — no auth guard, handle first
if ($method === 'POST' && $path === '/webhook/mips') {
    WebhookController::handle();
    exit;
}

// GET /login  — show login form
if ($method === 'GET' && $path === '/login') {
    LoginController::showForm();
    exit;
}

// POST /login — process credentials
if ($method === 'POST' && $path === '/login') {
    LoginController::login();
    exit;
}

// GET /logout
if ($method === 'GET' && $path === '/logout') {
    LogoutController::logout();
    exit;
}

// ── Everything below this line requires authentication ─────────────────────────
requireAuth();

// ── Dashboard ──────────────────────────────────────────────────────────────────
if ($method === 'GET' && $path === '/') {
    DashboardController::index();
    exit;
}

// ── Clients ───────────────────────────────────────────────────────────────────
if ($method === 'GET' && $path === '/clients') {
    ClientController::index();
    exit;
}

if ($method === 'GET' && $path === '/clients/create') {
    ClientController::create();
    exit;
}

if ($method === 'POST' && $path === '/clients') {
    ClientController::store();
    exit;
}

// /clients/{id}
if (preg_match('#^/clients/(\d+)$#', $path, $m)) {
    $id = (int) $m[1];
    if ($method === 'GET') {
        ClientController::show($id);
        exit;
    }
    if ($method === 'POST') {
        ClientController::update($id);
        exit;
    }
}

// /clients/{id}/edit
if (preg_match('#^/clients/(\d+)/edit$#', $path, $m)) {
    if ($method === 'GET') {
        ClientController::edit((int) $m[1]);
        exit;
    }
}

// ── Policies ──────────────────────────────────────────────────────────────────
if ($method === 'GET' && $path === '/policies') {
    PolicyController::index();
    exit;
}

if ($method === 'GET' && $path === '/policies/create') {
    PolicyController::create();
    exit;
}

if ($method === 'POST' && $path === '/policies') {
    PolicyController::store();
    exit;
}

// /policies/{id}
if (preg_match('#^/policies/(\d+)$#', $path, $m)) {
    $id = (int) $m[1];
    if ($method === 'GET') {
        PolicyController::show($id);
        exit;
    }
    if ($method === 'POST') {
        PolicyController::update($id);
        exit;
    }
}

// /policies/{id}/edit
if (preg_match('#^/policies/(\d+)/edit$#', $path, $m)) {
    if ($method === 'GET') {
        PolicyController::edit((int) $m[1]);
        exit;
    }
}

// ── Payments ──────────────────────────────────────────────────────────────────
if ($method === 'GET' && $path === '/payments') {
    PaymentController::index();
    exit;
}

if ($method === 'POST' && $path === '/payments/generate') {
    PaymentController::generate();
    exit;
}

// ── Renewals ──────────────────────────────────────────────────────────────────
if ($method === 'GET' && $path === '/renewals') {
    RenewalController::index();
    exit;
}

// /renewals/{id}/send
if (preg_match('#^/renewals/(\d+)/send$#', $path, $m)) {
    if ($method === 'POST') {
        RenewalController::send((int) $m[1]);
        exit;
    }
}

// ── 404 ───────────────────────────────────────────────────────────────────────
http_response_code(404);
$notFound = ROOT_PATH . '/app/Views/errors/404.php';
if (is_file($notFound)) {
    require $notFound;
} else {
    echo '<!DOCTYPE html><html><head><title>404 Not Found</title></head>'
       . '<body><h1>404 — Page Not Found</h1></body></html>';
}
exit;
