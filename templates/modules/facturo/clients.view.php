<?php
/**
 * @var callable $e
 * @var list<array<string,mixed>> $clients
 */
?>
<section class="card">
  <h2 id="client-form-title">New client</h2>
  <form id="client-form" novalidate data-id="0">
    <div class="form-grid">
      <div class="field"><label for="c-name">Name</label><input type="text" id="c-name" name="name" maxlength="200" required></div>
      <div class="field"><label for="c-email">Email</label><input type="email" id="c-email" name="email" maxlength="254"></div>
      <div class="field"><label for="c-phone">Phone</label><input type="text" id="c-phone" name="phone" maxlength="40"></div>
      <div class="field"><label for="c-brn">BRN</label><input type="text" id="c-brn" name="brn" maxlength="40"></div>
      <div class="field"><label for="c-vat">VAT number</label><input type="text" id="c-vat" name="vat_number" maxlength="40"></div>
    </div>
    <div class="field"><label for="c-address">Address</label><textarea id="c-address" name="address" rows="2" maxlength="500"></textarea></div>
    <div class="actions">
      <button type="submit" class="btn-primary btn-inline">Save client</button>
      <button type="reset" class="btn-link">Cancel</button>
    </div>
  </form>
</section>

<section class="card">
  <h2>Clients</h2>
  <?php if ($clients === []): ?>
    <p class="muted">No clients yet.</p>
  <?php else: ?>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Name</th><th>Email</th><th>BRN</th><th></th></tr></thead>
        <tbody>
          <?php foreach ($clients as $c): ?>
            <tr>
              <td><?= $e($c['name']) ?></td>
              <td><?= $e($c['email'] ?? '') ?></td>
              <td><?= $e($c['brn'] ?? '') ?></td>
              <td class="num">
                <button type="button" class="btn-link" data-edit-client="<?= $e(json_encode($c, JSON_UNESCAPED_UNICODE)) ?>">Edit</button>
                <button type="button" class="btn-link" data-delete-client="<?= (int) $c['id'] ?>">Delete</button>
              </td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</section>
