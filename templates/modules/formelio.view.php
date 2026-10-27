<?php
/**
 * Formelio module router, rendered inside the suite app shell.
 * Pages: forms (default), edit (?id), results (?id).
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 */

use App\Formelio\Forms;
use App\Formelio\Responses;
use App\Suite\Tenant;

$e    = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$page = is_string($_GET['p'] ?? null) ? $_GET['p'] : 'forms';
$id   = ctype_digit((string) ($_GET['id'] ?? '')) ? (int) $_GET['id'] : 0;

$can_manage = Tenant::canManage($org);
$base_url   = rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/');
$view       = null;
$form       = null;

switch ($page) {
    case 'forms':
        $forms = Forms::all($org['id']);
        $view  = 'forms';
        break;

    case 'edit':
    case 'results':
        $form = Forms::find($org['id'], $id);
        if ($form !== null) {
            $responses = Responses::forForm($org['id'], $id);
            if ($page === 'results') {
                $summary = Responses::summary($form['fields'], $responses);
            }
            $view = $page;
        }
        break;
}
?>
<nav class="subnav" aria-label="Formelio">
  <a href="/app.php?m=formelio"<?= $form === null ? ' class="is-current" aria-current="page"' : '' ?>>Formulaires</a>
  <?php if ($form !== null): ?>
    <a href="/app.php?m=formelio&amp;p=edit&amp;id=<?= (int) $form['id'] ?>"<?= $page === 'edit' ? ' class="is-current" aria-current="page"' : '' ?>>Questions</a>
    <a href="/app.php?m=formelio&amp;p=results&amp;id=<?= (int) $form['id'] ?>"<?= $page === 'results' ? ' class="is-current" aria-current="page"' : '' ?>>Réponses (<?= count($responses) ?>)</a>
  <?php endif; ?>
</nav>
<p id="fm-error" class="error" role="alert" hidden></p>
<?php
if ($view === null) {
    echo '<section class="card"><p>Page introuvable.</p></section>';
} else {
    require TEMPLATES_PATH . '/modules/formelio/' . $view . '.view.php';
}
