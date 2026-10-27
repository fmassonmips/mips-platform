<?php
/**
 * RendezVous module router, rendered inside the suite app shell.
 * Pages: agenda (default, ?d=Y-m-d), services, staff, settings.
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 */

use App\RendezVous\Booking;
use App\RendezVous\Services;
use App\RendezVous\Settings;
use App\RendezVous\Staff;
use App\Suite\Modules;
use App\Suite\Tenant;

$e    = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$page = is_string($_GET['p'] ?? null) ? $_GET['p'] : 'agenda';
$nav  = ['agenda' => 'Agenda', 'services' => 'Prestations', 'staff' => 'Équipe', 'settings' => 'Réservation en ligne'];

$can_manage = Tenant::canManage($org);
$view       = null;

switch ($page) {
    case 'agenda':
        $date = is_string($_GET['d'] ?? null) && Booking::validDate($_GET['d']) ? $_GET['d'] : Booking::now()->format('Y-m-d');
        $day  = new DateTimeImmutable($date);
        $monday = $day->modify('-' . ((int) $day->format('N') - 1) . ' days');
        $week   = Booking::between($org['id'], $monday->format('Y-m-d'), $monday->modify('+7 days')->format('Y-m-d'), false);
        $counts = [];
        foreach ($week as $a) {
            $d = substr((string) $a['starts_at'], 0, 10);
            $counts[$d] = ($counts[$d] ?? 0) + 1;
        }
        $appointments = Booking::between($org['id'], $date, $day->modify('+1 day')->format('Y-m-d'));
        $loyalty      = Modules::isEnabled($org['id'], 'clientbloom') ? Booking::loyaltyByPhone($org['id'], $appointments) : null;
        $services     = Services::all($org['id'], true);
        $staff        = Staff::all($org['id'], true);
        $view         = 'agenda';
        break;

    case 'services':
        $services = Services::all($org['id']);
        $view     = 'services';
        break;

    case 'staff':
        $staff = array_map(static function (array $s): array {
            $s['hours'] = array_map([Staff::class, 'formatRanges'], Staff::hours((int) $s['id']));
            return $s;
        }, Staff::all($org['id']));
        $view = 'staff';
        break;

    case 'settings':
        $settings = Settings::get($org['id']);
        $profile  = Tenant::profile($org['id']);
        $view     = 'settings';
        break;
}
?>
<nav class="subnav" aria-label="RendezVous">
  <?php foreach ($nav as $key => $label): ?>
    <a href="/app.php?m=rendezvous&amp;p=<?= $e($key) ?>"<?= $page === $key ? ' class="is-current" aria-current="page"' : '' ?>><?= $e($label) ?></a>
  <?php endforeach; ?>
</nav>
<p id="rv-error" class="error" role="alert" hidden></p>
<?php
if ($view === null) {
    echo '<section class="card"><p>Page introuvable.</p></section>';
} else {
    require TEMPLATES_PATH . '/modules/rendezvous/' . $view . '.view.php';
}
