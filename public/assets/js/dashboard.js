/**
 * Dashboard client.
 * - Logout button: POST /api/auth/logout, then back to the login page.
 * - App launcher buttons: POST /api/suite/modules to activate/deactivate
 *   a module for the organization, then reload to show the new state.
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

    const suiteError = document.getElementById('suite-error');

    document.querySelectorAll('button[data-action][data-module]').forEach(function (el) {
        el.addEventListener('click', async function () {
            el.disabled = true;
            if (suiteError) { suiteError.hidden = true; }
            try {
                const res = await fetch('/api/suite/modules', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken,
                    },
                    body: JSON.stringify({ action: el.dataset.action, module: el.dataset.module }),
                });
                if (res.ok) {
                    window.location.reload();
                    return;
                }
                const body = await res.json().catch(function () { return {}; });
                throw new Error(body.error || 'Request failed.');
            } catch (err) {
                if (suiteError) {
                    suiteError.textContent = err.message;
                    suiteError.hidden = false;
                }
                el.disabled = false;
            }
        });
    });
})();
