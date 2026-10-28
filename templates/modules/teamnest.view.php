<?php
/**
 * TeamNest module router, rendered inside the suite app shell.
 * Pages: projects (default, ?archived=1), project (?id board), task (?id), mine.
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 */

use App\Facturo\Clients;
use App\Suite\Modules;
use App\Suite\Tenant;
use App\TeamNest\Projects;
use App\TeamNest\Tasks;

$e    = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$page = is_string($_GET['p'] ?? null) ? $_GET['p'] : 'projects';
$id   = ctype_digit((string) ($_GET['id'] ?? '')) ? (int) $_GET['id'] : 0;
$nav  = ['projects' => 'Projets', 'mine' => 'Mes tâches'];

$can_manage = Tenant::canManage($org);
$facturo    = Modules::isEnabled($org['id'], 'facturo');
$members    = Tenant::members($org['id']);
$userId     = (int) $user['id'];
$view       = null;

switch ($page) {
    case 'projects':
        $archived = ($_GET['archived'] ?? '') === '1';
        $projects = Projects::all($org['id'], $archived);
        $clients  = $facturo ? Clients::all($org['id']) : [];
        $view     = 'projects';
        break;

    case 'project':
        $project = Projects::find($org['id'], $id);
        if ($project !== null) {
            $board   = Tasks::board($org['id'], $id);
            $clients = $facturo ? Clients::all($org['id']) : [];
            $view    = 'project';
            $page    = 'projects';
        }
        break;

    case 'task':
        $task = Tasks::find($org['id'], $id);
        if ($task !== null) {
            $time     = Tasks::time($id);
            $projects = Projects::all($org['id']);
            $view     = 'task';
            $page     = 'projects';
        }
        break;

    case 'mine':
        $tasks = Tasks::mine($org['id'], $userId);
        $view  = 'mine';
        break;
}
?>
<nav class="subnav" aria-label="TeamNest">
  <?php foreach ($nav as $key => $label): ?>
    <a href="/app.php?m=teamnest&amp;p=<?= $e($key) ?>"<?= $page === $key ? ' class="is-current" aria-current="page"' : '' ?>><?= $e($label) ?></a>
  <?php endforeach; ?>
</nav>
<p id="tn-error" class="error" role="alert" hidden></p>
<?php
if ($view === null) {
    echo '<section class="card"><p>Page introuvable.</p></section>';
} else {
    require TEMPLATES_PATH . '/modules/teamnest/' . $view . '.view.php';
}
