/**
 * Registration page client.
 * Sends name, email, and password to /api/auth/register as JSON,
 * handles errors, and redirects to /login.php?registered=1 on success.
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
            showError('Please fill in all fields.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account…';

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ name: name, email: email, password: password }),
            });

            let data = {};
            try { data = await res.json(); } catch (_) { /* ignore */ }

            if (!res.ok) {
                showError(data.error || 'Registration failed. Please try again.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create account';
                return;
            }

            window.location.assign('/login.php?registered=1');
        } catch (err) {
            showError('Network error. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create account';
        }
    });
})();
