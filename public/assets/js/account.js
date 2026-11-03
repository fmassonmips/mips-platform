/**
 * Account page: two-factor authentication and password change.
 */
(function () {
    'use strict';

    const { api, show } = window.MIPS;
    const $ = (id) => document.getElementById(id);

    const errBox = $('twofa-error');

    async function refresh() {
        const s = await api('/api/account/status');
        $('twofa-off').hidden = s.two_factor_enabled;
        $('twofa-on').hidden = !s.two_factor_enabled;
        $('disable-form').hidden = !s.two_factor_enabled || s.two_factor_required;
        $('twofa-setup').hidden = true;
        $('twofa-status').textContent = s.two_factor_enabled
            ? 'Enabled. ' + s.recovery_codes_left + ' recovery code(s) left.' + (s.two_factor_required ? ' Required for your role.' : '')
            : 'Not enabled.' + (s.two_factor_required ? ' Required for your role.' : '');
    }

    function showCodes(codes) {
        $('codes').textContent = codes.join('\n');
        $('codes-box').hidden = false;
        $('twofa-setup').hidden = true;
        $('twofa-off').hidden = true;
        $('twofa-on').hidden = true;
    }

    $('setup-btn').addEventListener('click', async function () {
        show(errBox, '');
        try {
            const data = await api('/api/account/2fa-setup', { method: 'POST', body: {} });
            const qr = window.qrcode(0, 'M');
            qr.addData(data.uri);
            qr.make();
            $('qr-img').src = qr.createDataURL(5, 4);
            $('secret').textContent = data.secret.replace(/(.{4})/g, '$1 ').trim();
            $('twofa-off').hidden = true;
            $('twofa-setup').hidden = false;
            $('enable-code').focus();
        } catch (err) {
            show(errBox, err.message);
        }
    });

    $('enable-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        show(errBox, '');
        try {
            const data = await api('/api/account/2fa-enable', { method: 'POST', body: { code: $('enable-code').value } });
            showCodes(data.recovery_codes);
        } catch (err) {
            show(errBox, err.message);
        }
    });

    $('codes-done').addEventListener('click', function () {
        $('codes-box').hidden = true;
        $('codes').textContent = '';
        // Enrolment may unlock the modules: reload so the page reflects it.
        window.location.assign('/account.php');
    });

    $('regen-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        show(errBox, '');
        try {
            const data = await api('/api/account/recovery-codes', { method: 'POST', body: { password: $('regen-password').value } });
            $('regen-password').value = '';
            showCodes(data.recovery_codes);
        } catch (err) {
            show(errBox, err.message);
        }
    });

    $('disable-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        show(errBox, '');
        if (!window.confirm('Turn off two-factor authentication?')) { return; }
        try {
            await api('/api/account/2fa-disable', { method: 'POST', body: { password: $('disable-password').value, code: $('disable-code').value } });
            $('disable-password').value = '';
            $('disable-code').value = '';
            await refresh();
        } catch (err) {
            show(errBox, err.message);
        }
    });

    $('password-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        show($('password-error'), '');
        $('password-ok').hidden = true;
        if ($('new-password').value !== $('new-password2').value) {
            show($('password-error'), 'The two new passwords do not match.');
            return;
        }
        try {
            await api('/api/account/password', { method: 'POST', body: {
                current_password: $('current-password').value, new_password: $('new-password').value } });
            this.reset();
            $('password-ok').hidden = false;
        } catch (err) {
            show($('password-error'), err.message);
        }
    });

    refresh().catch((err) => show(errBox, err.message));
})();
