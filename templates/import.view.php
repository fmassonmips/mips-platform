<?php
/**
 * Import a list from Excel: choose the file, check the columns and the rows, import.
 *
 * @var array<string,mixed> $user
 * @var array{id:int,name:string,role:string} $org
 * @var string $type
 * @var array{app:string,title:string,back:string,fields:array<string,array{0:string,1:bool,2:list<string>}>,example:list<string>} $def
 * @var string $csrf_token
 * @var string $page_title
 */
use App\Suite\Import;

$e = static fn (mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= $e($csrf_token) ?>">
  <title><?= $e($page_title) ?> &middot; <?= $e($org['name']) ?></title>
  <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body>
  <header class="app-header">
    <h1>
      <a class="app-home" href="/dashboard.php">MIPS</a>
      <span class="app-crumb">/ Importer</span>
    </h1>
    <div class="user-info">
      <span><?= $e($org['name']) ?></span>
      <button id="logout-btn" type="button" class="btn-secondary">Déconnexion</button>
    </div>
  </header>

  <main class="app-main" id="import" data-type="<?= $e($type) ?>" data-back="<?= $e($def['back']) ?>"
        data-fields="<?= $e(json_encode(array_map(static fn (array $f): array => ['label' => $f[0], 'required' => $f[1]], $def['fields']), JSON_UNESCAPED_UNICODE)) ?>">
    <section class="card">
      <h2><?= $e($def['title']) ?> : importer depuis Excel</h2>
      <ol class="im-steps">
        <li>Dans Excel, une ligne par <?= $type === 'products' ? 'produit' : 'client' ?>, les noms de colonnes sur la première ligne
          (<a href="/import.php?type=<?= $e($type) ?>&amp;template=1">télécharger un modèle</a>).</li>
        <li>« Fichier » → « Enregistrer sous » → <strong>CSV UTF-8</strong> (ou CSV séparateur point-virgule).</li>
        <li>Choisissez le fichier ci-dessous : rien n'est enregistré avant que vous confirmiez.</li>
      </ol>
      <div class="field">
        <label for="im-file">Fichier CSV (<?= Import::MAX_ROWS ?> lignes au plus)</label>
        <input type="file" id="im-file" accept=".csv,text/csv,text/plain">
      </div>
      <p id="im-error" class="error" role="alert" hidden></p>
    </section>

    <section class="card" id="im-check" hidden>
      <h2>Vérifier les colonnes</h2>
      <p class="small muted">Nous avons associé les colonnes de votre fichier d'après leurs noms : corrigez si besoin.</p>
      <div class="im-mapping" id="im-mapping"></div>
      <p id="im-summary" class="im-summary" role="status"></p>
      <ul id="im-errors" class="im-errors"></ul>
      <?php if ($type === 'customers'): ?>
        <p class="small muted">Les clients importés ne reçoivent pas le bonus de bienvenue, et leur cashback démarre à zéro.
          « Accepte les offres » : ne cochez oui que pour les clients qui l'ont réellement accepté (Data Protection Act).</p>
      <?php elseif ($type === 'products'): ?>
        <p class="small muted">Prix TTC en roupies (250, 250,00 ou 1 250,00). TVA : 15 %, 0 % ou exonéré (vide = 15 %). Stock vide = non suivi. Les photos s'ajoutent ensuite dans le catalogue.</p>
      <?php endif; ?>
      <div class="actions">
        <button type="button" id="im-go" class="btn-primary btn-inline" disabled>Importer</button>
        <a class="btn-link" href="<?= $e($def['back']) ?>">Annuler</a>
      </div>
    </section>

    <section class="card" id="im-done" hidden>
      <h2>Import terminé</h2>
      <p id="im-done-text" class="success" role="status"></p>
      <ul id="im-done-errors" class="im-errors"></ul>
      <div class="actions"><a class="btn-primary btn-inline" href="<?= $e($def['back']) ?>">Voir la liste</a></div>
    </section>
  </main>
  <script src="/assets/js/dashboard.js"></script>
  <script src="/assets/js/import.js"></script>
</body>
</html>
