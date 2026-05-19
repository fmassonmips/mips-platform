/**
 * Login page client.
 * Sends credentials to /api/auth/login as JSON, handles errors,
 * and redirects to /dashboard.php on success.
 *
 * The session cookie is set by the server (HttpOnly), and the browser
 * attaches it automatically on subsequent requests — the client code
 * never touches the auth state directly, which is the whole point.
 */
(function () {
    'use strict';

    const form       = document.getElementById('login-form');
    const errorBox   = document.getElementById('error-message');
    const submitBtn  = document.getElementById('submit-btn');
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

        const email    = emailEl.value.trim();
        const password = passwordEl.value;

        if (!email || !password) {
            showError('Please enter your email and password.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in…';

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ email: email, password: password }),
            });

            let data = {};
            try { data = await res.json(); } catch (_) { /* ignore */ }

            if (!res.ok) {
                showError(data.error || 'Login failed. Please try again.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign in';
                return;
            }

            // Session cookie is already set. Redirect to the dashboard.
            window.location.assign('/dashboard.php');
        } catch (err) {
            showError('Network error. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign in';
        }
    });
})();
