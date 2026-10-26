<?php
/**
 * ClientBloom module router, rendered inside the suite app shell.
 * Pages: counter (default), customers, customer, overview.
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 */

use App\ClientBloom\Customers;
use App\ClientBloom\Ledger;
use App\ClientBloom\Settings;
use App\Suite\Tenant;

$e    = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$page = is_string($_GET['p'] ?? null) ? $_GET['p'] : 'counter';
$nav  = ['counter' => 'Caisse', 'customers' => 'Clients', 'overview' => 'Programme'];

$can_manage = Tenant::canManage($org);
$rules      = Settings::get($org['id']);
$view       = null;

switch ($page) {
    case 'counter':
        $view = 'counter';
        break;

    case 'customers':
        $segment   = is_string($_GET['s'] ?? null) && isset(Customers::SEGMENTS[$_GET['s']]) ? $_GET['s'] : 'all';
        $query     = is_string($_GET['q'] ?? null) ? mb_substr($_GET['q'], 0, 100) : '';
        $customers = Customers::search($org['id'], $segment, $query);
        $view      = 'customers';
        break;

    case 'customer':
        $id       = ctype_digit((string) ($_GET['id'] ?? '')) ? (int) $_GET['id'] : 0;
        $customer = $id > 0 ? Customers::find($org['id'], $id) : null;
        if ($id === 0 || $customer !== null) {
            $history = $customer !== null ? Ledger::history($org['id'], $id) : [];
            $notes   = $customer !== null ? Customers::notes($org['id'], $id) : [];
            $view    = 'customer';
            $page    = 'customers';
        }
        break;

    case 'overview':
        $stats = Customers::stats($org['id']);
        $view  = 'overview';
        break;
}
?>
<nav class="subnav" aria-label="ClientBloom">
  <?php foreach ($nav as $key => $label): ?>
    <a href="/app.php?m=clientbloom&amp;p=<?= $e($key) ?>"<?= $page === $key ? ' class="is-current" aria-current="page"' : '' ?>><?= $e($label) ?></a>
  <?php endforeach; ?>
</nav>
<p id="cb-error" class="error" role="alert" hidden></p>
<?php
if ($view === null) {
    echo '<section class="card"><p>Page introuvable.</p></section>';
} else {
    require TEMPLATES_PATH . '/modules/clientbloom/' . $view . '.view.php';
}
