/**
 * Merchant portal, signed-out pages: sign in (+ second factor), register,
 * confirm email, forgotten password, reset. Each page has one of the forms.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const $ = (id) => document.getElementById(id);

    async function post(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(body),
        });
        let data = {};
        try { data = await res.json(); } catch (_) { /* ignore */ }
        if (!res.ok) {
            const err = new Error(data.error || 'Request failed (' + res.status + ').');
            err.data = data;
            throw err;
        }
        return data;
    }

    function show(node, msg) {
        if (!node) { return; }
        node.textContent = msg || '';
        node.hidden = !msg;
    }

    // Wire a form: validate, POST, then call done(); errors go to #error-message.
    function wire(formId, validate, url, done) {
        const form = $(formId);
        if (!form) { return; }
        const btn = form.querySelector('button[type="submit"]');
        const errBox = form.querySelector('.error');
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            show(errBox, '');
            const body = validate();
            if (typeof body === 'string') { show(errBox, body); return; }
            btn.disabled = true;
            try {
                await done(await post(url, body));
            } catch (err) {
                show(errBox, err.message);
                if (err.data && err.data.restart) {
                    $('twofa-form').hidden = true;
                    $('login-form').hidden = false;
                }
            } finally {
                btn.disabled = false;
            }
        });
    }

    wire('login-form', function () {
        const email = $('email').value.trim();
        const password = $('password').value;
        return email && password ? { email: email, password: password } : 'Enter your email and password.';
    }, '/api/portal/login', function (data) {
        if (data.two_factor_required) {
            $('login-form').hidden = true;
            $('twofa-form').hidden = false;
            $('code').focus();
            return;
        }
        window.location.assign(data.enroll_2fa ? '/portal/security.php?enroll=1' : '/portal/home.php');
    });

    wire('twofa-form', function () {
        const code = $('code').value.trim();
        return code ? { code: code } : 'Enter the code.';
    }, '/api/portal/2fa', function (data) {
        if (data.recovery_codes_left !== null && data.recovery_codes_left !== undefined && data.recovery_codes_left < 3) {
            window.alert('You have ' + data.recovery_codes_left + ' recovery code(s) left. Create new ones on the Security page.');
        }
        window.location.assign('/portal/home.php');
    });

    wire('register-form', function () {
        if ($('password').value !== $('password2').value) { return 'The two passwords do not match.'; }
        if (!$('name').value.trim() || !$('email').value.trim()) { return 'Enter your name and email address.'; }
        return { name: $('name').value.trim(), email: $('email').value.trim(), phone: $('phone').value.trim(), password: $('password').value };
    }, '/api/portal/register', function (data) {
        $('register-form').hidden = true;
        show($('done-message'), data.message);
    });

    wire('verify-form', function () {
        return { token: $('verify-form').dataset.token };
    }, '/api/portal/verify', function () {
        window.location.assign('/portal/login.php?verified=1');
    });

    wire('forgot-form', function () {
        const email = $('email').value.trim();
        return email ? { email: email } : 'Enter your email address.';
    }, '/api/portal/forgot', function (data) {
        $('forgot-form').hidden = true;
        show($('done-message'), data.message);
    });

    wire('reset-form', function () {
        if ($('password').value !== $('password2').value) { return 'The two passwords do not match.'; }
        return { token: $('reset-form').dataset.token, password: $('password').value };
    }, '/api/portal/reset', function () {
        window.location.assign('/portal/login.php?reset=1');
    });
})();
