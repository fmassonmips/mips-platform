<?php
/**
 * ShopLokal module router, rendered inside the suite app shell.
 * Pages: orders (default, ?f=filter), order (?id), products, settings.
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 */

use App\ShopLokal\Orders;
use App\ShopLokal\Products;
use App\ShopLokal\Settings;
use App\Suite\Modules;
use App\Suite\Tenant;

$e    = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$page = is_string($_GET['p'] ?? null) ? $_GET['p'] : 'orders';
$nav  = ['orders' => 'Commandes', 'products' => 'Produits', 'settings' => 'Boutique'];

$can_manage = Tenant::canManage($org);
$facturo    = Modules::isEnabled($org['id'], 'facturo');
$view       = null;

switch ($page) {
    case 'orders':
        $filter = in_array($_GET['f'] ?? '', ['todo', 'unpaid', 'done', 'all'], true) ? $_GET['f'] : 'todo';
        $orders = Orders::list($org['id'], $filter);
        $counts = Orders::counts($org['id']);
        $low    = Products::lowStock($org['id']);
        $view   = 'orders';
        break;

    case 'order':
        $id    = ctype_digit((string) ($_GET['id'] ?? '')) ? (int) $_GET['id'] : 0;
        $order = Orders::find($org['id'], $id);
        if ($order !== null) {
            $settings = Settings::get($org['id']);
            $view     = 'order';
            $page     = 'orders';
        }
        break;

    case 'products':
        $products = Products::all($org['id']);
        $profile  = Tenant::profile($org['id']);
        $view     = 'products';
        break;

    case 'settings':
        $settings = Settings::get($org['id']);
        $profile  = Tenant::profile($org['id']);
        $view     = 'settings';
        break;
}
?>
<nav class="subnav" aria-label="ShopLokal">
  <?php foreach ($nav as $key => $label): ?>
    <a href="/app.php?m=shoplokal&amp;p=<?= $e($key) ?>"<?= $page === $key ? ' class="is-current" aria-current="page"' : '' ?>><?= $e($label) ?></a>
  <?php endforeach; ?>
</nav>
<p id="sl-error" class="error" role="alert" hidden></p>
<?php
if ($view === null) {
    echo '<section class="card"><p>Page introuvable.</p></section>';
} else {
    require TEMPLATES_PATH . '/modules/shoplokal/' . $view . '.view.php';
}
