/**
 * Forgot-password and reset-password pages.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('error-message');
    const submitBtn = document.getElementById('submit-btn');

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.hidden = !msg;
    }

    async function post(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(body),
        });
        let data = {};
        try { data = await res.json(); } catch (_) { /* ignore */ }
        if (!res.ok) { throw new Error(data.error || 'Request failed. Please try again.'); }
        return data;
    }

    const forgot = document.getElementById('forgot-form');
    if (forgot) {
        forgot.addEventListener('submit', async function (e) {
            e.preventDefault();
            showError('');
            submitBtn.disabled = true;
            try {
                const data = await post('/api/auth/forgot', { email: document.getElementById('email').value.trim() });
                const ok = document.getElementById('success-message');
                ok.textContent = data.message;
                ok.hidden = false;
            } catch (err) {
                showError(err.message);
                submitBtn.disabled = false;
            }
        });
    }

    const reset = document.getElementById('reset-form');
    if (reset) {
        reset.addEventListener('submit', async function (e) {
            e.preventDefault();
            showError('');
            const p1 = document.getElementById('password').value;
            const p2 = document.getElementById('password2').value;
            if (p1 !== p2) {
                showError('The two passwords do not match.');
                return;
            }
            submitBtn.disabled = true;
            try {
                await post('/api/auth/reset', { token: document.getElementById('token').value, password: p1 });
                window.location.assign('/login.php?reset=1');
            } catch (err) {
                showError(err.message);
                submitBtn.disabled = false;
            }
        });
    }
})();
