<?php
/**
 * First steps of a new company (owner/admin), opened right after the e-mail
 * confirmation: 1. company profile, 2. apps, 3. team. Every step can be
 * skipped; the « Bien démarrer » card on the dashboard keeps what is left.
 * /welcome.php?step=2 opens a given step.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use App\Suite\Catalog;
use App\Suite\Modules;
use App\Suite\Tenant;

$user = \App\Auth::require_auth();
$org  = Tenant::forUser($user);
if (!Tenant::canManage($org)) {
    header('Location: /dashboard.php');
    exit;
}

$step       = is_string($_GET['step'] ?? null) && in_array($_GET['step'], ['1', '2', '3'], true) ? (int) $_GET['step'] : 1;
$profile    = Tenant::profile($org['id']);
$catalog    = Catalog::all();
$enabled    = Modules::enabledFor($org['id']);
$ended      = Modules::trialEndedFor($org['id']);
$mail_on    = \App\Mail\SmtpMailer::isConfigured();
$csrf_token = \App\Csrf::token();
$page_title = 'Bienvenue';

require TEMPLATES_PATH . '/welcome.view.php';
