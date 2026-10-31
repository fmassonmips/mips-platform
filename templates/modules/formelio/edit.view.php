<?php
/**
 * Form builder: texts, questions, status and public link.
 *
 * @var callable $e
 * @var array<string,mixed> $form
 * @var list<array<string,mixed>> $responses
 * @var bool $can_manage
 * @var string $base_url
 * @var bool $flowdesk  FlowDesk enabled for the organization
 */
use App\Formelio\Forms;

$url    = $base_url . '/formelio/f.php?t=' . $form['public_token'];
$status = (string) $form['status'];
?>
<section class="card">
  <div class="card-head">
    <div>
      <h2><?= $e($form['title']) ?></h2>
      <span class="status status--fm-<?= $e($status) ?>"><?= $e(Forms::STATUSES[$status]) ?></span>
      <?php if ($status === 'draft'): ?><span class="muted small">Personne ne peut répondre tant que le formulaire n'est pas ouvert.</span><?php endif; ?>
    </div>
    <div class="actions">
      <?php if ($status !== 'open'): ?>
        <button type="button" class="btn-primary btn-inline" data-fm-status="open" data-id="<?= (int) $form['id'] ?>">Ouvrir aux réponses</button>
      <?php else: ?>
        <button type="button" class="btn-secondary" data-fm-status="closed" data-id="<?= (int) $form['id'] ?>">Fermer</button>
      <?php endif; ?>
      <a class="btn-secondary" href="<?= $e($url) ?>" target="_blank" rel="noopener"><?= $status === 'open' ? 'Ouvrir le formulaire' : 'Aperçu' ?></a>
    </div>
  </div>
  <div class="share-box">
    <input type="text" id="fm-link" value="<?= $e($url) ?>" readonly aria-label="Lien du formulaire">
    <button type="button" class="btn-secondary" id="fm-copy">Copier</button>
    <a class="btn-secondary" href="https://wa.me/?text=<?= $e(rawurlencode($form['title'] . ' : ' . $url)) ?>" target="_blank" rel="noopener">WhatsApp</a>
  </div>
  <?php if ($responses !== []): ?>
    <p class="muted small">Déjà <?= count($responses) ?> réponse(s) : modifier un intitulé ne change pas les réponses reçues (chacune garde la question telle qu'elle a été posée) ; une question supprimée reste visible dans ces réponses.</p>
  <?php endif; ?>
</section>

<section class="card">
  <form id="fm-form" novalidate data-id="<?= (int) $form['id'] ?>"
        data-fields="<?= $e(json_encode($form['fields'], JSON_UNESCAPED_UNICODE)) ?>"
        data-types="<?= $e(json_encode(Forms::TYPES, JSON_UNESCAPED_UNICODE)) ?>">
    <div class="form-grid">
      <div class="field"><label for="fm-title">Titre</label><input type="text" id="fm-title" name="title" maxlength="200" value="<?= $e($form['title']) ?>" required></div>
      <div class="field"><label for="fm-notify">Me prévenir à chaque réponse (e-mail)</label><input type="email" id="fm-notify" name="notify_email" maxlength="254" value="<?= $e($form['notify_email'] ?? '') ?>"></div>
    </div>
    <div class="field"><label for="fm-desc">Introduction</label><textarea id="fm-desc" name="description" rows="2" maxlength="1000"><?= $e($form['description'] ?? '') ?></textarea></div>

    <h3>Questions</h3>
    <ol id="fm-fields" class="fm-fields"></ol>
    <div class="inline-form">
      <div class="field"><label for="fm-add-type">Ajouter une question</label>
        <select id="fm-add-type">
          <?php foreach (Forms::TYPES as $k => $label): ?><option value="<?= $e($k) ?>"><?= $e($label) ?></option><?php endforeach; ?>
        </select></div>
      <button type="button" class="btn-secondary" id="fm-add">Ajouter</button>
    </div>

    <?php if ($flowdesk): ?>
      <label class="checkbox"><input type="checkbox" name="flowdesk_ticket"<?= (int) $form['flowdesk_ticket'] === 1 ? ' checked' : '' ?>>
        Créer un ticket FlowDesk pour chaque réponse (nom, e-mail et téléphone repris des réponses)</label>
    <?php endif; ?>
    <div class="field"><label for="fm-thanks">Message après l'envoi</label><textarea id="fm-thanks" name="thank_you" rows="2" maxlength="500" placeholder="Merci, votre réponse a bien été envoyée."><?= $e($form['thank_you'] ?? '') ?></textarea></div>
    <div class="actions">
      <button type="submit" class="btn-primary btn-inline">Enregistrer</button>
      <span id="fm-saved" class="success" role="status" hidden>Enregistré.</span>
    </div>
  </form>
</section>

<?php if ($can_manage): ?>
<section class="card">
  <p class="small">
    <button type="button" class="btn-link" data-fm-new-link="<?= (int) $form['id'] ?>">Créer un nouveau lien</button> <span class="muted">— l'ancien cessera de fonctionner.</span>
    · <button type="button" class="btn-link danger" data-fm-delete="<?= (int) $form['id'] ?>">Supprimer le formulaire et ses réponses</button>
  </p>
</section>
<?php endif; ?>
