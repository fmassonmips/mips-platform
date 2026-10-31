<?php
/**
 * Company team page: members, roles, invitations. Every member sees the
 * team; owners and admins invite and remove (rules in App\Suite\Team).
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$user        = \App\Auth::require_auth();
$org         = \App\Suite\Tenant::forUser($user);
$can_manage  = \App\Suite\Tenant::canManage($org);
$members     = \App\Suite\Team::members($org['id']);
$invitations = $can_manage ? \App\Suite\Team::invitations($org['id']) : [];
$mail_on     = \App\Mail\SmtpMailer::isConfigured();
$csrf_token  = \App\Csrf::token();
$page_title  = 'Équipe';

require TEMPLATES_PATH . '/team.view.php';
