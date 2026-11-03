/**
 * Merchant portal, Security page: two-factor enrolment (mandatory),
 * recovery codes, password change.
 */
(function () {
    'use strict';

    const { api, show } = window.MIPS;
    const $ = (id) => document.getElementById(id);
    const errBox = $('twofa-error');
    let status = null;

    async function refresh() {
        status = await api('/api/portal/account');
        $('twofa-off').hidden = status.two_factor_enabled;
        $('twofa-on').hidden = !status.two_factor_enabled;
        $('twofa-setup').hidden = true;
        $('twofa-status').textContent = status.two_factor_enabled
            ? 'Enabled. ' + status.recovery_codes_left + ' recovery code(s) left.'
            : 'Not set up yet. Required for every merchant account.';
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
            const data = await api('/api/portal/2fa-setup', { method: 'POST', body: {} });
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
            const data = await api('/api/portal/2fa-enable', { method: 'POST', body: { code: $('enable-code').value } });
            showCodes(data.recovery_codes);
        } catch (err) {
            show(errBox, err.message);
        }
    });

    $('codes-done').addEventListener('click', async function () {
        $('codes').textContent = '';
        $('codes-box').hidden = true;
        await refresh();
        // Next gate: the terms of use.
        window.location.assign(status.terms_accepted ? '/portal/security.php' : '/portal/terms.php');
    });

    $('regen-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        show(errBox, '');
        try {
            const data = await api('/api/portal/recovery-codes', { method: 'POST', body: { password: $('regen-password').value } });
            $('regen-password').value = '';
            showCodes(data.recovery_codes);
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
            await api('/api/portal/password', { method: 'POST', body: {
                current_password: $('current-password').value, new_password: $('new-password').value } });
            this.reset();
            $('password-ok').hidden = false;
        } catch (err) {
            show($('password-error'), err.message);
        }
    });

    refresh().catch((err) => show(errBox, err.message));
})();
