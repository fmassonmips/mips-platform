<?php
/** @var array<string,mixed> $user */
/** @var string $csrf_token */
/** @var string $page_title */
$active = 'users';
require TEMPLATES_PATH . '/partials/app_header.php';
?>

  <main class="app-main app-wide">
    <section class="card">
      <div class="card-head">
        <h2>Users</h2>
        <form id="user-filters" class="toolbar" novalidate>
          <label for="f-status" class="sr-only">Status</label>
          <select id="f-status" name="status">
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="deactivated">Deactivated</option>
          </select>
          <label for="f-q" class="sr-only">Search</label>
          <input type="text" id="f-q" name="q" placeholder="Search name or email">
          <button type="submit" class="btn-secondary">Search</button>
        </form>
      </div>
      <p class="muted">New accounts stay pending until activated here. Deactivation and role changes take effect on the user's next request.</p>
      <p id="pending-banner" class="notice" role="status" hidden></p>
      <p id="users-error" class="error" role="alert" hidden></p>
      <div id="users"></div>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/users.js"></script>
</body>
</html>
