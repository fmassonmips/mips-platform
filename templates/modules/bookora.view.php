<?php
/**
 * Bookora module router, rendered inside the suite app shell.
 * Pages: planning (default, ?mo=YYYY-MM), bookings (?f), booking (?id), new, units, unit (?id), settings.
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 */

use App\Bookora\Bookings;
use App\Bookora\Settings;
use App\Bookora\Units;
use App\RendezVous\Booking;
use App\Suite\Modules;
use App\Suite\Tenant;

$e    = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$page = is_string($_GET['p'] ?? null) ? $_GET['p'] : 'planning';
$id   = ctype_digit((string) ($_GET['id'] ?? '')) ? (int) $_GET['id'] : 0;

$can_manage = Tenant::canManage($org);
$facturo    = Modules::isEnabled($org['id'], 'facturo');
$now        = Booking::now();
$counts     = Bookings::counts($org['id']);
$nav        = ['planning' => 'Planning', 'bookings' => 'Réservations' . ($counts['todo'] > 0 ? ' (' . $counts['todo'] . ')' : ''), 'new' => 'Nouvelle réservation'];
if ($can_manage) {
    $nav += ['units' => 'Logements', 'settings' => 'Réglages'];
}
$view = null;

switch ($page) {
    case 'planning':
        $month    = is_string($_GET['mo'] ?? null) && preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $_GET['mo']) ? $_GET['mo'] : $now->format('Y-m');
        $start    = new DateTimeImmutable($month . '-01');
        $units    = Units::all($org['id'], true, false);
        $cells    = Bookings::calendar($org['id'], $start->format('Y-m-d'));
        $today_mv = Bookings::movements($org['id'], $now->format('Y-m-d'));
        $warnings = array_values(array_filter(Units::all($org['id'], false, false), static fn (array $u): bool => $u['ical_error'] !== null));
        $view     = 'planning';
        break;

    case 'bookings':
        $filter   = in_array($_GET['f'] ?? '', ['todo', 'upcoming', 'past', 'closed', 'all'], true) ? $_GET['f'] : ($counts['todo'] > 0 ? 'todo' : 'upcoming');
        $bookings = Bookings::list($org['id'], $filter);
        $view     = 'bookings';
        break;

    case 'booking':
        $booking = Bookings::find($org['id'], $id);
        if ($booking !== null) {
            $settings = Settings::get($org['id']);
            $view     = 'booking';
            $page     = 'bookings';
        }
        break;

    case 'new':
        $units = Units::all($org['id'], true, false);
        $view  = 'new';
        break;

    case 'units':
        if ($can_manage) {
            $units   = Units::all($org['id']);
            $profile = Tenant::profile($org['id']);
            $view    = 'units';
        }
        break;

    case 'unit':
        $unit = $can_manage ? Units::find($org['id'], $id) : null;
        if ($unit !== null) {
            $seasons = Units::seasons($id, (string) $unit['tax_code']);
            $blocks  = Units::blocks($id, $now->format('Y-m-d'));
            $profile = Tenant::profile($org['id']);
            $view    = 'unit';
            $page    = 'units';
        }
        break;

    case 'settings':
        if ($can_manage) {
            $settings = Settings::get($org['id']);
            $profile  = Tenant::profile($org['id']);
            $view     = 'settings';
        }
        break;
}
?>
<nav class="subnav" aria-label="Bookora">
  <?php foreach ($nav as $key => $label): ?>
    <a href="/app.php?m=bookora&amp;p=<?= $e($key) ?>"<?= $page === $key ? ' class="is-current" aria-current="page"' : '' ?>><?= $e($label) ?></a>
  <?php endforeach; ?>
</nav>
<p id="bk-error" class="error" role="alert" hidden></p>
<?php
if ($view === null) {
    echo '<section class="card"><p>Page introuvable.</p></section>';
} else {
    require TEMPLATES_PATH . '/modules/bookora/' . $view . '.view.php';
}
