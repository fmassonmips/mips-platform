<?php
/**
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 * @var bool $can_manage
 * @var list<array{id:int,name:string,email:string,role:string,joined_at:string}> $members
 * @var list<array<string,mixed>> $invitations
 * @var bool $mail_on
 * @var string $csrf_token
 * @var string $page_title
 */
use App\Format;
use App\Suite\Team;

$e       = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$isOwner = $org['role'] === 'owner';
$me      = (int) $user['id'];
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf_token) ?>">
  <title><?= $e($page_title) ?> &middot; <?= $e($org['name']) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body>
  <header class="app-header">
    <h1>
      <a class="app-home" href="/dashboard.php">MIPS</a>
      <span class="app-crumb">/ Équipe</span>
    </h1>
    <div class="user-info">
      <span><?= $e($org['name']) ?></span>
      <button id="logout-btn" type="button" class="btn-secondary">Déconnexion</button>
    </div>
  </header>

  <main class="app-main">
    <p id="team-error" class="error" role="alert" hidden></p>

    <section class="card">
      <h2>Équipe <span class="muted small">(<?= count($members) ?>)</span></h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Depuis le</th><?php if ($can_manage): ?><th></th><?php endif; ?></tr></thead>
        <tbody>
          <?php foreach ($members as $m): $editable = $isOwner && $m['role'] !== 'owner' && $m['id'] !== $me; ?>
            <tr>
              <td><?= $e($m['name']) ?><?= $m['id'] === $me ? ' <span class="tag">vous</span>' : '' ?></td>
              <td><?= $e($m['email']) ?></td>
              <td><?php if ($editable): ?>
                <select data-role-of="<?= $m['id'] ?>" aria-label="Rôle de <?= $e($m['name']) ?>">
                  <?php foreach (['admin', 'member'] as $r): ?><option value="<?= $r ?>"<?= $m['role'] === $r ? ' selected' : '' ?>><?= $e(Team::ROLES[$r]) ?></option><?php endforeach; ?>
                </select>
              <?php else: ?><?= $e(Team::ROLES[$m['role']] ?? $m['role']) ?><?php endif; ?></td>
              <td><?= $e(Format::date($m['joined_at'])) ?></td>
              <?php if ($can_manage): ?>
                <td class="num"><?php if ($m['id'] !== $me && $m['role'] !== 'owner' && ($isOwner || $m['role'] === 'member')): ?>
                  <button type="button" class="btn-link danger" data-remove="<?= $m['id'] ?>" data-name="<?= $e($m['name']) ?>">Retirer</button>
                <?php endif; ?></td>
              <?php endif; ?>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table></div>
      <p class="small muted">Propriétaire : tout. Administrateur : réglages des apps, catalogue, facturation, invitation de membres. Membre : travail courant (commandes, tickets, tâches, rendez-vous).</p>
    </section>

    <?php if ($can_manage): ?>
      <section class="card">
        <h2>Inviter un collègue</h2>
        <form id="invite-form" novalidate>
          <div class="form-grid">
            <div class="field"><label for="i-email">E-mail</label><input type="email" id="i-email" name="email" maxlength="254" autocomplete="off" required></div>
            <div class="field"><label for="i-role">Rôle</label>
              <select id="i-role" name="role">
                <option value="member" selected>Membre</option>
                <?php if ($isOwner): ?><option value="admin">Administrateur</option><?php endif; ?>
              </select></div>
          </div>
          <div class="actions"><button type="submit" class="btn-primary btn-inline">Envoyer l'invitation</button></div>
        </form>
        <div id="invite-done" class="invite-done" hidden>
          <p class="success" id="invite-msg"></p>
          <div class="share-box">
            <input type="text" id="invite-link" readonly aria-label="Lien d'invitation">
            <button type="button" class="btn-secondary" id="invite-copy">Copier</button>
            <a class="btn-secondary" id="invite-wa" href="#" target="_blank" rel="noopener">WhatsApp</a>
          </div>
          <p class="small muted">Lien personnel, valable 7 jours, utilisable une fois. Ne le publiez pas.</p>
        </div>
        <?php if (!$mail_on): ?><p class="small muted">L'envoi d'e-mails n'est pas configuré : transmettez le lien vous-même.</p><?php endif; ?>
      </section>

      <?php if ($invitations !== []): ?>
        <section class="card">
          <h2>Invitations en attente</h2>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>E-mail</th><th>Rôle</th><th>Envoyée le</th><th>Expire le</th><th></th></tr></thead>
            <tbody>
              <?php foreach ($invitations as $i): ?>
                <tr>
                  <td><?= $e($i['email']) ?></td>
                  <td><?= $e(Team::ROLES[$i['role']] ?? $i['role']) ?></td>
                  <td><?= $e(Format::date((string) $i['created_at'])) ?><?= $i['invited_by'] !== null ? ' <span class="muted small">par ' . $e($i['invited_by']) . '</span>' : '' ?></td>
                  <td><?= $e(Format::date((string) $i['expires_at'])) ?></td>
                  <td class="num nowrap">
                    <?php if ($isOwner || $i['role'] === 'member'): ?><button type="button" class="btn-link" data-resend="<?= $e($i['email']) ?>" data-role="<?= $e($i['role']) ?>">Renvoyer</button><?php endif; ?>
                    <button type="button" class="btn-link danger" data-revoke="<?= (int) $i['id'] ?>">Annuler</button>
                  </td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table></div>
        </section>
      <?php endif; ?>
    <?php endif; ?>
  </main>
  <script src="/assets/js/dashboard.js"></script>
  <script src="/assets/js/team.js"></script>
</body>
</html>
