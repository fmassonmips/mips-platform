<?php
/**
 * Ticket: thread, reply / internal note, status, priority, assignee.
 *
 * @var callable $e
 * @var array<string,mixed> $ticket
 * @var list<array<string,mixed>> $messages
 * @var array<int,string> $members
 * @var array<string,mixed>|null $loyalty
 * @var array{tasks:list<array<string,mixed>>,projects:list<array<string,mixed>>}|null $teamnest  null when TeamNest is off
 */
use App\Facturo\Money;
use App\FlowDesk\Notifier;
use App\FlowDesk\Tickets;
use App\Format;

$id = (int) $ticket['id'];
?>
<div class="ticket-layout">
  <section class="card">
    <p class="muted small"><a href="/app.php?m=flowdesk">← Tickets</a> · #<?= (int) $ticket['number'] ?> · ouvert le <?= $e(Format::dateTime((string) $ticket['created_at'])) ?>
      <?= $ticket['source'] === 'web' ? '· formulaire de contact' : ($ticket['source'] === 'formelio' ? '· réponse Formelio' : '· saisi par l\'équipe') ?></p>
    <h2><?= $e($ticket['subject']) ?></h2>
    <ol class="thread">
      <?php foreach ($messages as $m): ?>
        <li class="msg msg--<?= $m['kind'] === 'customer' ? 'customer' : ($m['kind'] === 'note' ? 'note' : 'agent') ?>">
          <div class="msg-head small muted">
            <strong><?= $e($m['kind'] === 'customer' ? $ticket['customer_name'] : ($m['author_name'] ?: $m['author_email'] ?: 'Équipe')) ?></strong>
            <?= $m['kind'] === 'note' ? '· note interne' : ($m['kind'] === 'reply' ? '· réponse envoyée' : '') ?>
            · <?= $e(Format::dateTime((string) $m['created_at'])) ?></div>
          <div class="pre"><?= $e($m['body']) ?></div>
        </li>
      <?php endforeach; ?>
    </ol>

    <form id="fd-answer" novalidate data-id="<?= $id ?>">
      <div class="seg" role="radiogroup" aria-label="Type de message">
        <label><input type="radio" name="kind" value="reply"<?= $ticket['email'] !== null ? ' checked' : ' disabled' ?>> Répondre au client</label>
        <label><input type="radio" name="kind" value="note"<?= $ticket['email'] === null ? ' checked' : '' ?>> Note interne</label>
      </div>
      <?php if ($ticket['email'] === null): ?><p class="muted small">Pas d'e-mail pour ce client : notez ici vos échanges par téléphone.</p><?php endif; ?>
      <textarea name="body" rows="5" maxlength="10000" aria-label="Message"></textarea>
      <div class="actions">
        <label class="small">Puis
          <select name="status" aria-label="Statut après envoi">
            <option value="">statut automatique</option>
            <?php foreach (Tickets::STATUSES as $k => $label): ?><option value="<?= $e($k) ?>"><?= $e($label) ?></option><?php endforeach; ?>
          </select></label>
        <button type="submit" class="btn-primary btn-inline">Envoyer</button>
      </div>
      <p class="muted small">Une réponse est envoyée par e-mail au client avec le lien de sa demande ; le ticket passe « En attente du client ». Une note interne n'est visible que par l'équipe.</p>
    </form>
  </section>

  <aside class="card ticket-side">
    <h3>Client</h3>
    <p><strong><?= $e($ticket['customer_name']) ?></strong><br>
      <?php if ($ticket['email'] !== null): ?><a href="mailto:<?= $e($ticket['email']) ?>"><?= $e($ticket['email']) ?></a><br><?php endif; ?>
      <?php if ($ticket['phone'] !== null): ?><a href="tel:<?= $e($ticket['phone']) ?>"><?= $e($ticket['phone']) ?></a><?php endif; ?></p>
    <?php if ($loyalty !== null): ?>
      <p class="small"><a href="/app.php?m=clientbloom&amp;p=customer&amp;id=<?= (int) $loyalty['id'] ?>">Client fidélité</a> ·
        <?= (int) $loyalty['visits'] ?> visite(s) · cashback <?= $e(Money::format((int) $loyalty['balance_cents'], 'MUR')) ?></p>
    <?php endif; ?>
    <p class="small"><a href="<?= $e(Notifier::ticketUrl((string) $ticket['token'])) ?>" target="_blank" rel="noopener">Page du client</a></p>

    <h3>Suivi</h3>
    <form id="fd-update" novalidate data-id="<?= $id ?>">
      <div class="field"><label for="fd-status">Statut</label>
        <select id="fd-status" name="status"><?php foreach (Tickets::STATUSES as $k => $label): ?><option value="<?= $e($k) ?>"<?= $ticket['status'] === $k ? ' selected' : '' ?>><?= $e($label) ?></option><?php endforeach; ?></select></div>
      <div class="field"><label for="fd-priority">Priorité</label>
        <select id="fd-priority" name="priority"><?php foreach (Tickets::PRIORITIES as $k => $label): ?><option value="<?= $e($k) ?>"<?= $ticket['priority'] === $k ? ' selected' : '' ?>><?= $e($label) ?></option><?php endforeach; ?></select></div>
      <div class="field"><label for="fd-assignee">Assigné à</label>
        <select id="fd-assignee" name="assignee_id">
          <option value="0">Personne</option>
          <?php foreach ($members as $uid => $name): ?><option value="<?= (int) $uid ?>"<?= (int) $ticket['assignee_id'] === $uid ? ' selected' : '' ?>><?= $e($name) ?></option><?php endforeach; ?>
        </select></div>
    </form>
    <p class="muted small">Première réponse : <?= $ticket['first_response_at'] !== null ? $e(Format::dateTime((string) $ticket['first_response_at'])) : 'pas encore' ?></p>

    <?php if ($teamnest !== null): ?>
      <h3>Tâches (TeamNest)</h3>
      <?php foreach ($teamnest['tasks'] as $tk): ?>
        <p class="small"><a href="/app.php?m=teamnest&amp;p=task&amp;id=<?= (int) $tk['id'] ?>"><?= $e($tk['title']) ?></a>
          · <?= $e(\App\TeamNest\Tasks::STATUSES[$tk['status']]) ?></p>
      <?php endforeach; ?>
      <?php if ($teamnest['projects'] === []): ?>
        <p class="muted small">Créez un projet dans TeamNest pour transformer ce ticket en tâche.</p>
      <?php else: ?>
        <form id="fd-task" novalidate data-ticket="<?= $id ?>">
          <div class="field"><label for="fd-task-project">Créer une tâche dans</label>
            <select id="fd-task-project" name="project_id"><?php foreach ($teamnest['projects'] as $p): ?><option value="<?= (int) $p['id'] ?>"><?= $e($p['name']) ?></option><?php endforeach; ?></select></div>
          <div class="field"><label for="fd-task-title">Tâche</label><input type="text" id="fd-task-title" name="title" maxlength="200" value="<?= $e($ticket['subject']) ?>"></div>
          <button type="submit" class="btn-secondary">Créer la tâche</button>
        </form>
      <?php endif; ?>
    <?php endif; ?>
  </aside>
</div>
