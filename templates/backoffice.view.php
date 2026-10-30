<?php
/**
 * MIPS back-office: list of companies, or one company ($company not null).
 *
 * @var array<string,mixed> $user
 * @var array<string,mixed>|null $company
 * @var list<array<string,mixed>> $members      (company)
 * @var list<array<string,mixed>> $apps         (company)
 * @var array<string,int> $kpis                  (list)
 * @var list<array<string,mixed>> $companies     (list)
 * @var string $filter                           (list)
 * @var string $search                           (list)
 * @var list<array<string,mixed>> $log
 * @var string $csrf_token
 * @var string $page_title
 */
use App\Backoffice\Companies;
use App\Format;
use App\Suite\Team;

$e = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$states = [
    'trial'      => ['Essai', 'status--sent'],
    'read_only'  => ['Lecture seule', 'status--declined'],
    'subscribed' => ['Abonné', 'status--paid'],
    'disabled'   => ['Éteinte', 'status--draft'],
    'off'        => ['—', ''],
];
$daysLeft = static function (?string $end): string {
    if ($end === null) {
        return '';
    }
    $d = (int) ceil((strtotime($end) - time()) / 86400);
    return $d <= 0 ? 'terminé' : ($d === 1 ? '1 jour' : $d . ' jours');
};
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf_token) ?>">
  <meta name="robots" content="noindex">
  <title><?= $e($page_title) ?> &middot; Back-office MIPS</title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="bo">
  <header class="app-header">
    <h1>
      <a class="app-home" href="/dashboard.php">MIPS</a>
      <span class="app-crumb">/ <a href="/backoffice.php">Back-office</a><?= $company !== null ? ' / ' . $e($company['name']) : '' ?></span>
    </h1>
    <div class="user-info">
      <span><?= $e($user['email']) ?></span>
      <button id="logout-btn" type="button" class="btn-secondary">Déconnexion</button>
    </div>
  </header>

  <main class="app-main">
    <p id="bo-error" class="error" role="alert" hidden></p>

  <?php if ($company === null): ?>
    <div class="kpis">
      <div class="kpi"><span>Entreprises</span><strong><?= $kpis['companies'] ?></strong><small>+<?= $kpis['new_30d'] ?> sur 30 jours</small></div>
      <div class="kpi"><span>Actives sur 7 jours</span><strong><?= $kpis['active_7d'] ?></strong><small>au moins une connexion</small></div>
      <div class="kpi"><span>Apps en essai</span><strong><?= $kpis['trials'] ?></strong><small>toutes entreprises</small></div>
      <div class="kpi<?= $kpis['ending_7d'] > 0 ? ' kpi--warn' : '' ?>"><span>Essais finissant sous 7 j</span><strong><?= $kpis['ending_7d'] ?></strong><small>à relancer</small></div>
      <div class="kpi"><span>Abonnements</span><strong><?= $kpis['subscriptions'] ?></strong><small><?= $kpis['customers'] ?> entreprise<?= $kpis['customers'] > 1 ? 's' : '' ?> cliente<?= $kpis['customers'] > 1 ? 's' : '' ?></small></div>
    </div>

    <section class="card">
      <form method="get" class="bo-filters">
        <div class="field"><label for="bo-q">Rechercher</label><input type="search" id="bo-q" name="q" value="<?= $e($search) ?>" placeholder="Nom, raison sociale, BRN, e-mail"></div>
        <div class="field"><label for="bo-f">Filtre</label>
          <select id="bo-f" name="f">
            <?php foreach (Companies::FILTERS as $k => $label): ?><option value="<?= $e($k) ?>"<?= $k === $filter ? ' selected' : '' ?>><?= $e($label) ?></option><?php endforeach; ?>
          </select></div>
        <div class="field bo-filters-btn"><button type="submit" class="btn-primary">Afficher</button></div>
      </form>

      <div class="table-wrap"><table class="table">
        <thead><tr><th>Entreprise</th><th>Contact</th><th class="num">Membres</th><th>Apps</th><th>Prochaine fin d'essai</th><th>Dernière connexion</th><th>Créée le</th></tr></thead>
        <tbody>
          <?php if ($companies === []): ?>
            <tr><td colspan="7" class="muted">Aucune entreprise.</td></tr>
          <?php endif; ?>
          <?php foreach ($companies as $c): ?>
            <tr>
              <td><a href="/backoffice.php?org=<?= (int) $c['id'] ?>"><?= $e($c['name']) ?></a>
                <?= $c['suspended_at'] !== null ? ' <span class="tag tag--warn">suspendue</span>' : '' ?>
                <?= $c['deletion_scheduled_at'] !== null ? ' <span class="tag tag--warn">suppression le ' . $e(Format::date((string) $c['deletion_scheduled_at'])) . '</span>' : '' ?></td>
              <td><?= $e($c['owner_email'] ?? '—') ?></td>
              <td class="num"><?= (int) $c['members'] ?></td>
              <td class="nowrap">
                <?php if ((int) $c['subscribed'] > 0): ?><span class="status status--paid"><?= (int) $c['subscribed'] ?> abonnée<?= (int) $c['subscribed'] > 1 ? 's' : '' ?></span><?php endif; ?>
                <?php if ((int) $c['trials'] > 0): ?><span class="status status--sent"><?= (int) $c['trials'] ?> en essai</span><?php endif; ?>
                <?php if ((int) $c['read_only'] > 0): ?><span class="status status--declined"><?= (int) $c['read_only'] ?> lecture seule</span><?php endif; ?>
                <?php if ((int) $c['subscribed'] + (int) $c['trials'] + (int) $c['read_only'] === 0): ?><span class="muted">aucune</span><?php endif; ?>
              </td>
              <td><?= $c['next_trial_end'] !== null ? $e(Format::date((string) $c['next_trial_end'])) . ' <span class="muted small">(' . $e($daysLeft((string) $c['next_trial_end'])) . ')</span>' : '—' ?></td>
              <td><?= $e(Format::dateTime($c['last_login_at'], 'jamais')) ?></td>
              <td><?= $e(Format::date((string) $c['created_at'])) ?></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table></div>
      <?php if (count($companies) === 500): ?><p class="small muted">500 premières affichées : affinez la recherche.</p><?php endif; ?>
    </section>

  <?php else: $id = (int) $company['id']; $suspended = $company['suspended_at'] !== null; ?>
    <?php if ($suspended): ?>
      <section class="card bk-warning">
        <p><strong>Entreprise suspendue</strong> depuis le <?= $e(Format::dateTime((string) $company['suspended_at'])) ?> : <?= $e($company['suspended_reason'] ?? '') ?>.
          Ses membres ne peuvent plus se connecter et ses pages publiques sont fermées ; les données sont conservées.</p>
        <div class="actions"><button type="button" class="btn-secondary" data-bo="unsuspend" data-confirm="Réactiver l'accès de cette entreprise ?">Réactiver l'accès</button></div>
      </section>
    <?php endif; ?>

    <?php if ($company['deletion_scheduled_at'] !== null): ?>
      <section class="card bk-warning">
        <p><strong>Fermeture demandée par le propriétaire</strong> : apps et pages publiques fermées, seul le propriétaire peut se connecter.
          Données supprimées définitivement le <?= $e(Format::dateTime((string) $company['deletion_scheduled_at'])) ?>.</p>
        <div class="actions"><button type="button" class="btn-secondary" data-bo="reopen" data-confirm="Annuler la fermeture demandée par le propriétaire ?">Annuler la fermeture</button></div>
      </section>
    <?php endif; ?>

    <section class="card" id="bo-company" data-org="<?= $id ?>">
      <div class="card-head">
        <h2><?= $e($company['name']) ?> <span class="muted small">#<?= $id ?></span></h2>
        <div class="actions"><a class="btn-secondary" href="/export.php?org=<?= $id ?>">Exporter les données (ZIP)</a></div>
      </div>
      <dl class="bo-profile">
        <dt>Raison sociale</dt><dd><?= $e($company['legal_name'] ?: '—') ?></dd>
        <dt>BRN</dt><dd><?= $e($company['brn'] ?: '—') ?></dd>
        <dt>N° TVA</dt><dd><?= $e($company['vat_number'] ?: '—') ?></dd>
        <dt>Contact</dt><dd><?= $e(trim(($company['email'] ?? '') . ' ' . ($company['phone'] ?? '')) ?: '—') ?></dd>
        <dt>MRA</dt><dd><?= (int) $company['mra_enabled'] === 1 ? 'facturation électronique activée' : 'non activée' ?></dd>
        <dt>Créée le</dt><dd><?= $e(Format::date((string) $company['created_at'])) ?></dd>
      </dl>
    </section>

    <section class="card">
      <h2>Apps</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>App</th><th>État</th><th>Activée le</th><th>Fin d'essai</th><th class="num">Activité 30 j</th><th class="num">Total</th><th></th></tr></thead>
        <tbody>
          <?php foreach ($apps as $a): [$label, $cls] = $states[$a['state']]; ?>
            <tr>
              <td><?= $e($a['name']) ?></td>
              <td><?= $cls !== '' ? '<span class="status ' . $cls . '">' . $e($label) . '</span>' : '<span class="muted">non activée</span>' ?></td>
              <td><?= $e(Format::date($a['activated_at'])) ?></td>
              <td><?php if (in_array($a['state'], ['trial', 'read_only'], true)): ?><?= $e(Format::date($a['trial_ends_at'])) ?><?= $a['state'] === 'trial' ? ' <span class="muted small">(' . $e($daysLeft($a['trial_ends_at'])) . ')</span>' : '' ?><?php else: ?>—<?php endif; ?></td>
              <td class="num"><?= $a['usage_label'] !== null && $a['state'] !== 'off' ? (int) $a['last_30d'] . ' <span class="muted small">' . $e($a['usage_label']) . '</span>' : '—' ?></td>
              <td class="num"><?= $a['usage_label'] !== null && $a['state'] !== 'off' ? (int) $a['total'] : '—' ?></td>
              <td class="num nowrap">
                <?php if ($a['state'] !== 'subscribed'): ?>
                  <button type="button" class="btn-link" data-bo="subscribe" data-app="<?= $e($a['slug']) ?>" data-confirm="Abonner <?= $e($company['name']) ?> à <?= $e($a['name']) ?> ?">Abonner</button>
                <?php else: ?>
                  <button type="button" class="btn-link danger" data-bo="end" data-app="<?= $e($a['slug']) ?>" data-confirm="Mettre fin à l'abonnement <?= $e($a['name']) ?> ? L'app passe en lecture seule tout de suite.">Fin d'abonnement</button>
                <?php endif; ?>
                <?php if (in_array($a['state'], ['trial', 'read_only'], true)): ?>
                  <button type="button" class="btn-link" data-bo-extend="<?= $e($a['slug']) ?>" data-name="<?= $e($a['name']) ?>">Prolonger</button>
                <?php endif; ?>
              </td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table></div>
      <form id="bo-extend" class="bo-extend" hidden novalidate>
        <p><strong id="bo-extend-title"></strong></p>
        <div class="form-grid">
          <div class="field"><label for="bo-days">Jours en plus</label><input type="number" id="bo-days" name="days" min="1" max="<?= Companies::MAX_EXTEND_DAYS ?>" value="14" required></div>
          <div class="field"><label for="bo-reason">Raison</label><input type="text" id="bo-reason" name="reason" maxlength="300" placeholder="Ex. : pilote, attente du compte MRA"></div>
        </div>
        <div class="actions"><button type="submit" class="btn-primary btn-inline">Prolonger l'essai</button> <button type="button" class="btn-link" id="bo-extend-cancel">Annuler</button></div>
      </form>
      <p class="small muted">Abonner rend l'app pleinement utilisable, sans date de fin. Fin d'abonnement : l'app passe en lecture seule, les données restent. Prolonger rouvre un essai terminé à partir d'aujourd'hui.</p>
    </section>

    <section class="card">
      <h2>Membres <span class="muted small">(<?= count($members) ?>)</span></h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Dernière connexion</th><th>Depuis le</th></tr></thead>
        <tbody>
          <?php foreach ($members as $m): ?>
            <tr>
              <td><?= $e($m['name'] ?: '—') ?><?= (int) $m['is_active'] === 0 ? ' <span class="tag">désactivé</span>' : '' ?></td>
              <td><a href="mailto:<?= $e($m['email']) ?>"><?= $e($m['email']) ?></a></td>
              <td><?= $e(Team::ROLES[$m['role']] ?? $m['role']) ?></td>
              <td><?= $e(Format::dateTime($m['last_login_at'], 'jamais')) ?></td>
              <td><?= $e(Format::date((string) $m['joined_at'])) ?></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table></div>
    </section>

    <section class="card">
      <h2>Notes et journal</h2>
      <form id="bo-note" novalidate>
        <div class="field"><label for="bo-note-text">Ajouter une note</label><textarea id="bo-note-text" name="text" rows="2" maxlength="1000" placeholder="Appel du 30/10 : veut ShopLokal pour Noël, rappeler lundi"></textarea></div>
        <div class="actions"><button type="submit" class="btn-primary btn-inline">Enregistrer la note</button></div>
      </form>
      <?php require __DIR__ . '/backoffice.log.partial.php'; ?>
    </section>

    <?php if (!$suspended): ?>
      <section class="card">
        <h2>Suspendre l'accès</h2>
        <p class="small muted">Pour un impayé ou un abus : les membres ne peuvent plus se connecter (les sessions ouvertes se ferment), les pages publiques (réservation, boutique, formulaires) ferment. Rien n'est supprimé ; « Réactiver l'accès » rétablit tout.</p>
        <form id="bo-suspend" novalidate>
          <div class="field"><label for="bo-suspend-reason">Raison (montrée aux membres à la connexion)</label><input type="text" id="bo-suspend-reason" name="reason" maxlength="300" required></div>
          <div class="actions"><button type="submit" class="btn-secondary danger">Suspendre l'entreprise</button></div>
        </form>
      </section>
    <?php endif; ?>
  <?php endif; ?>

  <?php if ($company === null): ?>
    <section class="card">
      <h2>Dernières actions de l'équipe</h2>
      <?php require __DIR__ . '/backoffice.log.partial.php'; ?>
    </section>
  <?php endif; ?>
  </main>
  <script src="/assets/js/dashboard.js"></script>
  <script src="/assets/js/backoffice.js"></script>
</body>
</html>
