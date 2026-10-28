/**
 * Invitation page: choose a name and password, join the company, then go
 * to the app launcher (the server logs the new member in).
 */
(function () {
    'use strict';

    const form = document.getElementById('invite-accept');
    if (!form) { return; }
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('error-message');
    const submit    = document.getElementById('submit-btn');

    form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        errorBox.hidden = true;
        submit.disabled = true;
        try {
            const res = await fetch('/api/auth/invite', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ t: form.dataset.t, name: form.elements.name.value, password: form.elements.password.value }),
            });
            const body = await res.json().catch(function () { return {}; });
            if (!res.ok) {
                throw new Error(body.error || 'La requête a échoué.');
            }
            window.location.assign('/dashboard.php');
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.hidden = false;
            submit.disabled = false;
        }
    });
})();
