/**
 * Dashboard client.
 * Hooks up the logout button to POST /api/auth/logout and redirects
 * back to the login page once the server has destroyed the session.
 */
(function () {
    'use strict';

    const btn       = document.getElementById('logout-btn');
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

    btn.addEventListener('click', async function () {
        btn.disabled = true;
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
            });
        } catch (_) {
            // Fall through — we redirect regardless.
        }
        window.location.assign('/login.php');
    });
})();
