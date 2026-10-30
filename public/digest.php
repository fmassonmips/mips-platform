<?php
/**
 * Monday summary e-mail on or off.
 *   /digest.php?u=<id>&s=<signature>  the link in the e-mail: no login needed; a button
 *                                      confirms (POST), so mail scanners opening the link change nothing
 *   /digest.php                        the logged-in owner/admin, from the dashboard
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use App\BizPilot\Digest;
use App\Csrf;
use App\Database;

header('Referrer-Policy: no-referrer');
$uid = is_string($_REQUEST['u'] ?? null) && ctype_digit($_REQUEST['u']) ? (int) $_REQUEST['u'] : 0;
$sig = is_string($_REQUEST['s'] ?? null) ? $_REQUEST['s'] : '';
if ($uid > 0 && Digest::checkSignature($uid, $sig)) {
    $userId = $uid;
} else {
    $userId = (int) \App\Auth::require_auth()['id'];
}
$done = null;
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (!Csrf::verify(is_string($_POST['csrf'] ?? null) ? $_POST['csrf'] : null)) {
        http_response_code(419);
        exit('Jeton de sécurité invalide, rechargez la page.');
    }
    Digest::setOptOut($userId, ($_POST['on'] ?? '') !== '1');
    $done = true;
}
$stmt = Database::connection()->prepare('SELECT email, digest_opt_out FROM users WHERE id = :id');
$stmt->execute([':id' => $userId]);
$row = $stmt->fetch();
if (!is_array($row)) {
    http_response_code(404);
    exit('Compte introuvable.');
}
$e  = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$on = (int) $row['digest_opt_out'] === 0;
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Résumé du lundi &middot; MIPS</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
  <main class="auth-card">
    <h1>Résumé du lundi</h1>
    <p class="auth-subtitle">Chaque lundi matin, un e-mail à <?= $e($row['email']) ?> : la semaine écoulée et ce qui attend (factures en retard, commandes à confirmer…).</p>
    <?php if ($done): ?><p class="success" role="status"><?= $on ? 'C’est noté : vous recevrez le résumé chaque lundi.' : 'C’est noté : vous ne recevrez plus le résumé.' ?></p><?php endif; ?>
    <p>Actuellement : <strong><?= $on ? 'activé' : 'désactivé' ?></strong>.</p>
    <form method="post">
      <input type="hidden" name="csrf" value="<?= $e(Csrf::token()) ?>">
      <input type="hidden" name="u" value="<?= $uid > 0 ? $uid : '' ?>">
      <input type="hidden" name="s" value="<?= $e($sig) ?>">
      <input type="hidden" name="on" value="<?= $on ? '0' : '1' ?>">
      <button type="submit" class="btn-primary"><?= $on ? 'Ne plus recevoir le résumé' : 'Recevoir le résumé chaque lundi' ?></button>
    </form>
    <p class="auth-link"><a href="/dashboard.php">Tableau de bord</a></p>
  </main>
</body>
</html>
