<?php
/**
 * Facturo module router, rendered inside the suite app shell.
 * Pages: invoices (default), quotes, credit_notes, edit, clients, company.
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 */

use App\Facturo\Clients;
use App\Facturo\Documents;
use App\Suite\Tenant;

$e    = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$page = is_string($_GET['p'] ?? null) ? $_GET['p'] : 'invoices';

$listPages = ['invoices' => 'invoice', 'quotes' => 'quote', 'credit_notes' => 'credit_note'];
$nav       = ['invoices' => 'Invoices', 'quotes' => 'Quotes', 'credit_notes' => 'Credit notes', 'clients' => 'Clients', 'company' => 'Company'];

// Load the page's data first so the active tab can follow the document type.
$view = null;
switch ($page) {
    case 'invoices':
    case 'quotes':
    case 'credit_notes':
        $type      = $listPages[$page];
        $documents = Documents::all($org['id'], $type);
        $view      = 'list';
        break;

    case 'edit':
        $id  = ctype_digit((string) ($_GET['id'] ?? '')) ? (int) $_GET['id'] : 0;
        $doc = $id > 0 ? Documents::find($org['id'], $id) : null;
        if ($id > 0 && $doc === null) {
            break;
        }
        $type = $doc['type'] ?? ((($_GET['type'] ?? '') === 'quote') ? 'quote' : 'invoice');
        if ($doc === null && $type === 'credit_note') {
            break;
        }
        $clients = Clients::all($org['id']);
        $profile = Tenant::profile($org['id']);
        $view    = $doc === null || $doc['status'] === 'draft' ? 'edit' : 'show';
        $page    = (string) array_search($type, $listPages, true);
        break;

    case 'clients':
        $clients = Clients::all($org['id']);
        $view    = 'clients';
        break;

    case 'company':
        $profile    = Tenant::profile($org['id']);
        $can_manage = Tenant::canManage($org);
        $view       = 'company';
        break;
}
?>
<nav class="subnav" aria-label="Facturo">
  <?php foreach ($nav as $key => $label): ?>
    <a href="/app.php?m=facturo&amp;p=<?= $e($key) ?>"<?= $page === $key ? ' class="is-current" aria-current="page"' : '' ?>><?= $e($label) ?></a>
  <?php endforeach; ?>
</nav>
<p id="facturo-error" class="error" role="alert" hidden></p>
<?php
if ($view === null) {
    echo '<section class="card"><p>Not found.</p></section>';
} else {
    require TEMPLATES_PATH . '/modules/facturo/' . $view . '.view.php';
}
