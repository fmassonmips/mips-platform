<?php
/**
 * @var callable $e
 * @var list<array<string,mixed>> $forms
 */
use App\Format;
use App\Formelio\Forms;
?>
<section class="card">
  <h2>Nouveau formulaire</h2>
  <p class="muted">Partez d'un modèle, puis adaptez les questions.</p>
  <div class="actions">
    <button type="button" class="btn-secondary" data-fm-create="satisfaction">Satisfaction client</button>
    <button type="button" class="btn-secondary" data-fm-create="contact">Contact</button>
    <button type="button" class="btn-secondary" data-fm-create="event">Inscription</button>
    <button type="button" class="btn-link" data-fm-create="">Formulaire vide</button>
  </div>
</section>

<section class="card">
  <h2>Formulaires</h2>
  <?php if ($forms === []): ?>
    <p class="muted">Aucun formulaire pour l'instant.</p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Titre</th><th>Statut</th><th class="num">Réponses</th><th>Dernière réponse</th><th></th></tr></thead>
        <tbody>
          <?php foreach ($forms as $f): ?>
            <tr>
              <td><a href="/app.php?m=formelio&amp;p=edit&amp;id=<?= (int) $f['id'] ?>"><?= $e($f['title']) ?></a></td>
              <td><span class="status status--fm-<?= $e($f['status']) ?>"><?= $e(Forms::STATUSES[$f['status']] ?? $f['status']) ?></span></td>
              <td class="num"><?= (int) $f['response_count'] ?></td>
              <td><?= $e(Format::dateTime($f['last_response_at'])) ?></td>
              <td class="num"><a href="/app.php?m=formelio&amp;p=results&amp;id=<?= (int) $f['id'] ?>">Réponses</a></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</section>
