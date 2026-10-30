/**
 * Account pages: confirm the e-mail, ask for a reset link, set a new password.
 */
(function () {
    'use strict';

    const form = document.getElementById('account-form');
    if (!form) { return; }
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('error-message');
    const submit    = document.getElementById('submit-btn');

    form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        errorBox.hidden = true;
        const action  = form.dataset.action;
        const payload = { action: action, t: form.dataset.t || '' };
        if (action === 'forgot') {
            payload.email = form.elements.email.value.trim();
        }
        if (action === 'reset') {
            if (form.elements.password.value !== form.elements.password2.value) {
                errorBox.textContent = 'Les deux mots de passe ne correspondent pas.';
                errorBox.hidden = false;
                return;
            }
            payload.password = form.elements.password.value;
        }
        submit.disabled = true;
        try {
            const res = await fetch('/api/auth/account', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify(payload),
            });
            const body = await res.json().catch(function () { return {}; });
            if (!res.ok) {
                throw new Error(body.error || 'La requête a échoué.');
            }
            if (action === 'forgot') {
                const done = document.getElementById('done-message');
                done.textContent = body.message;
                done.hidden = false;
                return;
            }
            window.location.assign('/dashboard.php');
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.hidden = false;
            submit.disabled = false;
        }
    });
})();
