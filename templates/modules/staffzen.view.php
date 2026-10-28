<?php
/**
 * StaffZen module router, rendered inside the suite app shell.
 * Pages: mine (default), planning (?mo=YYYY-MM), approvals, balances (?y=YYYY), settings (?y=YYYY).
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 */

use App\RendezVous\Booking;
use App\StaffZen\Leaves;
use App\StaffZen\Settings;
use App\Suite\Tenant;

$e    = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$page = is_string($_GET['p'] ?? null) ? $_GET['p'] : 'mine';

$can_manage = Tenant::canManage($org);
$userId     = (int) $user['id'];
$now        = Booking::now();
$year       = ctype_digit((string) ($_GET['y'] ?? '')) && (int) $_GET['y'] >= 2000 && (int) $_GET['y'] <= 2100 ? (int) $_GET['y'] : (int) $now->format('Y');
$settings   = Settings::get($org['id']);
$types      = Settings::types($org['id'], true);
$pending_n  = $can_manage ? Leaves::pendingCount($org['id']) : 0;
$nav        = ['mine' => 'Mes congés', 'planning' => 'Planning'];
if ($can_manage) {
    $nav += ['approvals' => 'À valider' . ($pending_n > 0 ? ' (' . $pending_n . ')' : ''), 'balances' => 'Soldes', 'settings' => 'Réglages'];
}
$view = null;

// Working days and holidays for the live day count in request forms.
$calendar_data = static fn () => $e(json_encode([
    'work' => $settings['work_days'],
    'holidays' => array_keys(Settings::holidays($org['id'], (int) $now->format('Y')) + Settings::holidays($org['id'], (int) $now->format('Y') + 1)),
]));

switch ($page) {
    case 'mine':
        $balances = Leaves::balances($org['id'], $userId, $year);
        $requests = Leaves::forUser($org['id'], $userId);
        $view     = 'mine';
        break;

    case 'planning':
        $month   = is_string($_GET['mo'] ?? null) && preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $_GET['mo']) ? $_GET['mo'] : $now->format('Y-m');
        $start   = new DateTimeImmutable($month . '-01');
        $members = Tenant::members($org['id']);
        $cells   = Leaves::calendar($org['id'], $start->format('Y-m-d'));
        $holidays = Settings::holidays($org['id'], (int) $start->format('Y'));
        $away    = Leaves::awayToday($org['id']);
        $view    = 'planning';
        break;

    case 'approvals':
        if ($can_manage) {
            $pending = Leaves::pending($org['id']);
            $recent  = Leaves::recent($org['id']);
            $members = Tenant::members($org['id']);
            $view    = 'approvals';
        }
        break;

    case 'balances':
        if ($can_manage) {
            $members = Tenant::members($org['id']);
            $team    = Leaves::teamBalances($org['id'], $year);
            $view    = 'balances';
        }
        break;

    case 'settings':
        if ($can_manage) {
            $all_types = Settings::types($org['id']);
            $holidays  = Settings::holidays($org['id'], $year);
            $view      = 'settings';
        }
        break;
}
?>
<nav class="subnav" aria-label="StaffZen">
  <?php foreach ($nav as $key => $label): ?>
    <a href="/app.php?m=staffzen&amp;p=<?= $e($key) ?>"<?= $page === $key ? ' class="is-current" aria-current="page"' : '' ?>><?= $e($label) ?></a>
  <?php endforeach; ?>
</nav>
<p id="sz-error" class="error" role="alert" hidden></p>
<?php
if ($view === null) {
    echo '<section class="card"><p>Page introuvable.</p></section>';
} else {
    require TEMPLATES_PATH . '/modules/staffzen/' . $view . '.view.php';
}
