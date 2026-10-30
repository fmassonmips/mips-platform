/**
 * Registration page client.
 * Sends name, email, and password to /api/auth/register as JSON,
 * handles errors; on success shows "open the link we e-mailed" (self-service sign-up)
 * or redirects to /login.php?registered=1 (manual activation, no e-mail).
 */
(function () {
    'use strict';

    const form       = document.getElementById('register-form');
    const errorBox   = document.getElementById('error-message');
    const submitBtn  = document.getElementById('submit-btn');
    const nameEl     = document.getElementById('name');
    const emailEl    = document.getElementById('email');
    const passwordEl = document.getElementById('password');
    const csrfToken  = document.querySelector('meta[name="csrf-token"]').content;

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.hidden = false;
    }

    function clearError() {
        errorBox.textContent = '';
        errorBox.hidden = true;
    }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        clearError();

        const name     = nameEl.value.trim();
        const email    = emailEl.value.trim();
        const password = passwordEl.value;

        if (!name || !email || !password) {
            showError('Veuillez remplir tous les champs.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Création du compte…';

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ name: name, email: email, password: password, accept_terms: document.getElementById('accept-terms').checked }),
            });

            let data = {};
            try { data = await res.json(); } catch (_) { /* ignore */ }

            if (!res.ok) {
                showError(data.error || 'Échec de l’inscription. Veuillez réessayer.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Créer un compte';
                return;
            }

            if (data.verify) {
                // E-mail confirmation: the account opens from the link sent by e-mail.
                form.hidden = true;
                const done = document.getElementById('done-message');
                done.textContent = data.message;
                done.hidden = false;
                return;
            }
            window.location.assign('/login.php?registered=1');
        } catch (err) {
            showError('Erreur réseau. Veuillez réessayer.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Créer un compte';
        }
    });
})();
