<?php require __DIR__ . '/partials/header.php'; ?>

  <main class="app-main app-wide">
    <section class="card">
      <h2>Your application</h2>
      <p id="home-error" class="error" role="alert" hidden></p>
      <div id="next" class="next-step" role="status"></div>
      <ol id="tracker" class="tracker" aria-label="Application steps"></ol>
    </section>
  </main>

  <script src="/assets/js/app.js"></script>
  <script src="/assets/js/portal-home.js"></script>
</body>
</html>
