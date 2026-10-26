<?php
/**
 * Customer profile (or creation form when $customer is null): details,
 * cashback balance, ledger, CRM notes, manager corrections.
 *
 * @var callable $e
 * @var array<string,mixed>|null $customer
 * @var list<array<string,mixed>> $history
 * @var list<array<string,mixed>> $notes
 * @var bool $can_manage
 */
use App\ClientBloom\Ledger;
use App\Facturo\Money;

$c      = $customer;
$id     = (int) ($c['id'] ?? 0);
$erased = $c !== null && $c['erased_at'] !== null;
$prefill = $c === null && is_string($_GET['phone'] ?? null) ? mb_substr($_GET['phone'], 0, 30) : '';
?>
<section class="card">
  <div class="card-head">
    <h2><?= $c === null ? 'Nouveau client' : $e($c['name']) ?></h2>
    <?php if ($c !== null && !$erased): ?>
      <div class="balance"><span class="muted small">Cashback</span><strong><?= $e(Money::format((int) $c['balance_cents'], 'MUR')) ?></strong></div>
    <?php endif; ?>
  </div>

  <?php if ($c !== null): ?>
    <dl class="meta">
      <dt>Visites</dt><dd><?= (int) $c['visits'] ?></dd>
      <dt>Total dépensé</dt><dd><?= $e(Money::format((int) $c['total_spent_cents'], 'MUR')) ?></dd>
      <dt>Dernière visite</dt><dd><?= $e($c['last_visit_at'] ?? '—') ?></dd>
      <dt>Client depuis</dt><dd><?= $e(substr((string) $c['created_at'], 0, 10)) ?></dd>
      <dt>Marketing</dt><dd><?= (int) $c['marketing_consent'] === 1 ? 'Consentement donné le ' . $e(substr((string) $c['consent_at'], 0, 10)) : 'Pas de consentement' ?></dd>
    </dl>
  <?php endif; ?>

  <?php if ($erased): ?>
    <p class="muted">Données personnelles effacées le <?= $e(substr((string) $c['erased_at'], 0, 10)) ?>. L'historique anonyme des opérations est conservé comme pièce comptable.</p>
  <?php else: ?>
  <form id="customer-form" novalidate data-id="<?= $id ?>">
    <div class="form-grid">
      <div class="field"><label for="cu-name">Nom</label><input type="text" id="cu-name" name="name" maxlength="120" required value="<?= $e($c['name'] ?? '') ?>"></div>
      <div class="field"><label for="cu-phone">Téléphone</label><input type="tel" id="cu-phone" name="phone" maxlength="30" value="<?= $e($c['phone'] ?? $prefill) ?>"></div>
      <div class="field"><label for="cu-email">E-mail</label><input type="email" id="cu-email" name="email" maxlength="254" value="<?= $e($c['email'] ?? '') ?>"></div>
      <div class="field"><label for="cu-bday">Anniversaire</label><input type="date" id="cu-bday" name="birthday" value="<?= $e($c['birthday'] ?? '') ?>"></div>
      <div class="field"><label for="cu-tags">Étiquettes (séparées par des virgules)</label><input type="text" id="cu-tags" name="tags" maxlength="255" value="<?= $e($c['tags'] ?? '') ?>"></div>
    </div>
    <label class="checkbox"><input type="checkbox" name="marketing_consent"<?= (int) ($c['marketing_consent'] ?? 0) === 1 ? ' checked' : '' ?>>
      Le client accepte de recevoir des offres (SMS, WhatsApp, e-mail)</label>
    <div class="actions">
      <button type="submit" class="btn-primary btn-inline"><?= $c === null ? 'Créer le client' : 'Enregistrer' ?></button>
      <?php if ($c !== null): ?>
        <button type="button" id="card-btn" class="btn-secondary" data-id="<?= $id ?>">Lien de la carte de fidélité</button>
        <?php if ($can_manage): ?>
          <button type="button" class="btn-link" id="erase-btn" data-id="<?= $id ?>">Effacer les données personnelles</button>
        <?php endif; ?>
      <?php endif; ?>
    </div>
    <div id="card-share" class="related" hidden>
      <div><input type="text" id="card-url" readonly aria-label="Lien de la carte de fidélité"></div>
      <a id="card-wa" class="btn-secondary" target="_blank" rel="noopener" data-phone="<?= $e($c['phone'] ?? '') ?>" data-name="<?= $e($c['name'] ?? '') ?>" href="#">Partager sur WhatsApp</a>
    </div>
  </form>
  <?php endif; ?>
</section>

<?php if ($c !== null): ?>
<section class="card">
  <h2>Historique du cashback</h2>
  <?php if ($history === []): ?>
    <p class="muted">Aucune opération pour l'instant.</p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Date</th><th>Type</th><th>Référence</th><th class="num">Achat</th><th class="num">Cashback</th><th class="num">Solde</th><th></th></tr></thead>
        <tbody>
          <?php foreach ($history as $t): ?>
            <tr>
              <td><?= $e(substr((string) $t['created_at'], 0, 16)) ?></td>
              <td><?= $e(Ledger::LABELS[$t['type']] ?? $t['type']) ?></td>
              <td><?= $e($t['reference'] ?? '') ?></td>
              <td class="num"><?= (int) $t['amount_cents'] !== 0 ? $e(Money::format((int) $t['amount_cents'], 'MUR')) : '' ?></td>
              <td class="num <?= (int) $t['cashback_cents'] < 0 ? 'neg' : 'pos' ?>"><?= $e(((int) $t['cashback_cents'] > 0 ? '+' : '') . Money::format((int) $t['cashback_cents'], 'MUR')) ?></td>
              <td class="num"><?= $e(Money::format((int) $t['balance_after'], 'MUR')) ?></td>
              <td class="num">
                <?php if ($can_manage && !$erased && (int) $t['reversed'] === 0 && !in_array($t['type'], ['reversal', 'expire'], true)): ?>
                  <button type="button" class="btn-link" data-reverse="<?= (int) $t['id'] ?>">Annuler</button>
                <?php elseif ((int) $t['reversed'] > 0): ?>
                  <span class="muted small">annulée</span>
                <?php endif; ?>
              </td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>

  <?php if ($can_manage && !$erased): ?>
    <details class="send">
      <summary><strong>Correction manuelle</strong></summary>
      <form id="adjust-form" class="inline-form" novalidate data-id="<?= $id ?>">
        <div class="field"><label for="adj-amount">Montant (MUR, négatif pour retirer)</label><input type="text" id="adj-amount" name="amount" inputmode="decimal" required></div>
        <div class="field grow"><label for="adj-reason">Motif</label><input type="text" id="adj-reason" name="reason" maxlength="100" required></div>
        <button type="submit" class="btn-secondary">Appliquer</button>
      </form>
    </details>
  <?php endif; ?>
</section>

<?php if (!$erased): ?>
<section class="card">
  <h2>Notes</h2>
  <form id="note-form" novalidate data-id="<?= $id ?>">
    <div class="field"><label for="note-body">Ajouter une note (préférences, appels, réclamations…)</label>
      <textarea id="note-body" name="body" rows="2" maxlength="5000" required></textarea></div>
    <div class="actions"><button type="submit" class="btn-secondary">Ajouter la note</button></div>
  </form>
  <ul class="timeline">
    <?php foreach ($notes as $n): ?>
      <li><span class="muted small"><?= $e(substr((string) $n['created_at'], 0, 16)) ?> · <?= $e($n['author'] ?? '') ?></span>
        <div class="pre"><?= $e($n['body']) ?></div></li>
    <?php endforeach; ?>
  </ul>
</section>
<?php endif; ?>
<?php endif; ?>
