<?php
/**
 * FlowDesk module router, rendered inside the suite app shell.
 * Pages: inbox (default, ?f=filter&q=search), ticket (?id), new, settings.
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 */

use App\FlowDesk\Settings;
use App\FlowDesk\Tickets;
use App\Suite\Modules;
use App\Suite\Tenant;

$e    = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$page = is_string($_GET['p'] ?? null) ? $_GET['p'] : 'inbox';
$nav  = ['inbox' => 'Tickets', 'new' => 'Nouveau ticket', 'settings' => 'Formulaire de contact'];

$can_manage = Tenant::canManage($org);
$userId     = (int) $user['id'];
$view       = null;

switch ($page) {
    case 'inbox':
        $filter  = is_string($_GET['f'] ?? null) && isset(Tickets::FILTERS[$_GET['f']]) ? $_GET['f'] : 'todo';
        $q       = is_string($_GET['q'] ?? null) ? mb_substr(trim($_GET['q']), 0, 100) : '';
        $tickets = Tickets::inbox($org['id'], $q !== '' ? 'all' : $filter, $userId, $q);
        $counts  = Tickets::counts($org['id'], $userId);
        $view    = 'inbox';
        break;

    case 'ticket':
        $id     = ctype_digit((string) ($_GET['id'] ?? '')) ? (int) $_GET['id'] : 0;
        $ticket = Tickets::find($org['id'], $id);
        if ($ticket !== null) {
            $messages = Tickets::messages($id);
            $members  = Tickets::members($org['id']);
            $loyalty  = Modules::isEnabled($org['id'], 'clientbloom') ? Tickets::loyaltyCustomer($org['id'], $ticket) : null;
            $view     = 'ticket';
            $page     = 'inbox';
        }
        break;

    case 'new':
        $view = 'new';
        break;

    case 'settings':
        $settings = Settings::get($org['id']);
        $profile  = Tenant::profile($org['id']);
        $view     = 'settings';
        break;
}
?>
<nav class="subnav" aria-label="FlowDesk">
  <?php foreach ($nav as $key => $label): ?>
    <a href="/app.php?m=flowdesk&amp;p=<?= $e($key) ?>"<?= $page === $key ? ' class="is-current" aria-current="page"' : '' ?>><?= $e($label) ?></a>
  <?php endforeach; ?>
</nav>
<p id="fd-error" class="error" role="alert" hidden></p>
<?php
if ($view === null) {
    echo '<section class="card"><p>Page introuvable.</p></section>';
} else {
    require TEMPLATES_PATH . '/modules/flowdesk/' . $view . '.view.php';
}
