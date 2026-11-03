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
    const twofaForm  = document.getElementById('twofa-form');
    const twofaBtn   = document.getElementById('twofa-btn');
    const twofaError = document.getElementById('twofa-error');
    const codeEl     = document.getElementById('code');

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

            if (data.two_factor_required) {
                form.hidden = true;
                twofaForm.hidden = false;
                codeEl.focus();
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

    // Second step: authenticator or recovery code.
    twofaForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        twofaError.hidden = true;
        const code = codeEl.value.trim();
        if (!code) { return; }

        twofaBtn.disabled = true;
        try {
            const res = await fetch('/api/auth/2fa', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ code: code }),
            });
            let data = {};
            try { data = await res.json(); } catch (_) { /* ignore */ }

            if (!res.ok) {
                if (data.restart) {
                    // Pending sign-in is gone: back to the password step.
                    twofaForm.hidden = true;
                    form.hidden = false;
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign in';
                    passwordEl.value = '';
                    showError(data.error || 'Please sign in again.');
                    return;
                }
                twofaError.textContent = data.error || 'Invalid code.';
                twofaError.hidden = false;
                codeEl.select();
                twofaBtn.disabled = false;
                return;
            }

            if (data.recovery_codes_left !== null && data.recovery_codes_left !== undefined && data.recovery_codes_left <= 3) {
                window.alert('You have ' + data.recovery_codes_left + ' recovery code(s) left. Generate new ones from your Account page.');
            }
            window.location.assign('/dashboard.php');
        } catch (err) {
            twofaError.textContent = 'Network error. Please try again.';
            twofaError.hidden = false;
            twofaBtn.disabled = false;
        }
    });
})();
