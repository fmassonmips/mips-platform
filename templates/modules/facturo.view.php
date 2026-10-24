<?php
/**
 * Facturo module router, rendered inside the suite app shell.
 * Pages: invoices (default), quotes, edit, clients, company.
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 */

use App\Facturo\Clients;
use App\Facturo\Documents;
use App\Suite\Tenant;

$e    = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$page = is_string($_GET['p'] ?? null) ? $_GET['p'] : 'invoices';

$nav = ['invoices' => 'Invoices', 'quotes' => 'Quotes', 'clients' => 'Clients', 'company' => 'Company'];
$current = $page === 'edit' ? ((($_GET['type'] ?? '') === 'quote') ? 'quotes' : 'invoices') : $page;
?>
<nav class="subnav" aria-label="Facturo">
  <?php foreach ($nav as $key => $label): ?>
    <a href="/app.php?m=facturo&amp;p=<?= $e($key) ?>"<?= $current === $key ? ' class="is-current" aria-current="page"' : '' ?>><?= $e($label) ?></a>
  <?php endforeach; ?>
</nav>
<p id="facturo-error" class="error" role="alert" hidden></p>
<?php
switch ($page) {
    case 'quotes':
    case 'invoices':
        $type      = $page === 'quotes' ? 'quote' : 'invoice';
        $documents = Documents::all($org['id'], $type);
        require TEMPLATES_PATH . '/modules/facturo/list.view.php';
        break;

    case 'edit':
        $id  = ctype_digit((string) ($_GET['id'] ?? '')) ? (int) $_GET['id'] : 0;
        $doc = $id > 0 ? Documents::find($org['id'], $id) : null;
        if ($id > 0 && $doc === null) {
            echo '<section class="card"><p>Document not found.</p></section>';
            break;
        }
        $type    = $doc['type'] ?? ((($_GET['type'] ?? '') === 'quote') ? 'quote' : 'invoice');
        $clients = Clients::all($org['id']);
        $profile = Tenant::profile($org['id']);
        require TEMPLATES_PATH . '/modules/facturo/' . ($doc === null || $doc['status'] === 'draft' ? 'edit' : 'show') . '.view.php';
        break;

    case 'clients':
        $clients = Clients::all($org['id']);
        require TEMPLATES_PATH . '/modules/facturo/clients.view.php';
        break;

    case 'company':
        $profile    = Tenant::profile($org['id']);
        $can_manage = Tenant::canManage($org);
        require TEMPLATES_PATH . '/modules/facturo/company.view.php';
        break;

    default:
        echo '<section class="card"><p>Page not found.</p></section>';
}
