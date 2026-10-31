<?php
/**
 * @var callable $e
 * @var array<string,mixed> $unit
 * @var list<array<string,mixed>> $seasons
 * @var list<array<string,mixed>> $blocks
 * @var array<string,string> $profile
 */
use App\Facturo\Money;
use App\Format;

$defaultCode = (string) $unit['tax_code'];
$u    = $unit;
$uid  = (int) $u['id'];
$feed = rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/') . '/bookora/ical.php?u=' . $u['ical_token'];
$last = static fn (string $end): string => Format::date((new DateTimeImmutable($end))->modify('-1 day')->format('Y-m-d'));
?>
<section class="card">
  <p class="small muted"><a href="/app.php?m=bookora&amp;p=units">← Logements</a></p>
  <h2><?= $e($u['name']) ?></h2>
  <?php require __DIR__ . '/unit-form.partial.php'; ?>
</section>

<section class="card">
  <h2>Saisons</h2>
  <p class="small muted">Prix par nuit sur une période (haute saison, fêtes). Hors saison, le prix du logement s'applique. Une nuit prend le prix de la saison qui la couvre.</p>
  <?php if ($seasons !== []): ?>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Saison</th><th>Première nuit</th><th>Dernière nuit</th><th class="num">Prix / nuit TTC</th><th></th></tr></thead>
      <tbody>
        <?php foreach ($seasons as $s): ?>
          <tr><td><?= $e($s['label']) ?></td><td><?= $e(Format::date($s['start_date'])) ?></td><td><?= $e(Format::date($s['end_date'])) ?></td>
            <td class="num"><?= $e(Money::format($s['price_ttc_cents'], 'MUR')) ?></td>
            <td class="num"><button type="button" class="btn-link danger" data-bk-del="del_season" data-id="<?= $s['id'] ?>">Retirer</button></td></tr>
        <?php endforeach; ?>
      </tbody>
    </table></div>
  <?php endif; ?>
  <form id="bk-season" class="form-grid" novalidate data-unit="<?= $uid ?>">
    <div class="field"><label for="s-label">Nom</label><input type="text" id="s-label" name="label" maxlength="60" placeholder="Haute saison" required></div>
    <div class="field"><label for="s-start">Première nuit</label><input type="date" id="s-start" name="start" required></div>
    <div class="field"><label for="s-end">Dernière nuit</label><input type="date" id="s-end" name="end" required></div>
    <div class="field"><label for="s-price">Prix / nuit TTC</label><input type="text" id="s-price" name="price" inputmode="decimal" maxlength="15" required></div>
    <div class="field sz-holiday-btn"><button type="submit" class="btn-secondary">Ajouter</button></div>
  </form>
</section>

<section class="card">
  <h2>Fermetures</h2>
  <p class="small muted">Nuits indisponibles : travaux, usage personnel, réservation prise ailleurs. Les nuits importées d'Airbnb ou Booking.com apparaissent ici et se gèrent sur la plateforme d'origine.</p>
  <?php if ($blocks !== []): ?>
    <ul class="sz-holidays">
      <?php foreach ($blocks as $k): ?>
        <li><span><?= $e(Format::date((string) $k['start_date'])) ?> → <?= $e($last((string) $k['end_date'])) ?> · <?= $k['source'] === 'ical' ? 'importé' : 'fermé' ?><?= $k['reason'] !== null ? ' — ' . $e($k['reason']) : '' ?></span>
          <?php if ($k['source'] === 'manual'): ?><button type="button" class="btn-link danger" data-bk-del="del_block" data-id="<?= (int) $k['id'] ?>">Retirer</button><?php endif; ?></li>
      <?php endforeach; ?>
    </ul>
  <?php endif; ?>
  <form id="bk-block" class="form-grid" novalidate data-unit="<?= $uid ?>">
    <div class="field"><label for="k-start">Première nuit</label><input type="date" id="k-start" name="start" required></div>
    <div class="field"><label for="k-end">Dernière nuit</label><input type="date" id="k-end" name="end" required></div>
    <div class="field"><label for="k-reason">Motif</label><input type="text" id="k-reason" name="reason" maxlength="200" placeholder="Travaux"></div>
    <div class="field sz-holiday-btn"><button type="submit" class="btn-secondary">Fermer ces nuits</button></div>
  </form>
</section>

<section class="card">
  <h2>Synchroniser avec Airbnb, Booking.com…</h2>
  <p class="small muted">Évite les doubles réservations : chaque plateforme bloque les nuits réservées sur l'autre.</p>
  <h3>1. Donner ce calendrier aux plateformes</h3>
  <p class="small">Collez ce lien dans « Importer un calendrier » d'Airbnb ou Booking.com. Il contient les nuits occupées, jamais les noms des clients.</p>
  <div class="share-box">
    <input type="text" id="bk-feed" value="<?= $e($feed) ?>" readonly aria-label="Lien du calendrier">
    <button type="button" class="btn-secondary" data-copy="bk-feed">Copier</button>
    <button type="button" class="btn-link" id="bk-ical-token" data-unit="<?= $uid ?>">Nouveau lien</button>
  </div>
  <h3>2. Importer le calendrier de la plateforme</h3>
  <p class="small">Copiez le lien « Exporter le calendrier » (.ics) d'Airbnb ou Booking.com. Il est relu toutes les heures ; ses nuits deviennent indisponibles ici.</p>
  <form id="bk-ical" class="share-box" novalidate data-unit="<?= $uid ?>">
    <input type="url" name="url" maxlength="500" value="<?= $e($u['ical_import_url'] ?? '') ?>" placeholder="https://www.airbnb.com/calendar/ical/….ics" aria-label="Lien du calendrier à importer">
    <button type="submit" class="btn-secondary">Enregistrer</button>
    <?php if ($u['ical_import_url'] !== null): ?><button type="button" class="btn-secondary" id="bk-sync" data-unit="<?= $uid ?>">Synchroniser maintenant</button><?php endif; ?>
  </form>
  <?php if ($u['ical_import_url'] !== null): ?>
    <p class="small" id="bk-sync-state"><?= $u['ical_synced_at'] !== null ? 'Dernière synchronisation : ' . $e(Format::dateTime((string) $u['ical_synced_at'])) : 'Pas encore synchronisé.' ?>
      <?php if ($u['ical_error'] !== null): ?><br><strong class="text-danger"><?= $e($u['ical_error']) ?></strong><?php endif; ?></p>
  <?php endif; ?>
</section>
