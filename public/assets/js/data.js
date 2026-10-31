/**
 * « Vos données »: close the company's account, or cancel the closing.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('data-error');

    async function post(payload) {
        const res = await fetch('/api/suite/closure', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            throw new Error(body.error || 'La requête a échoué.');
        }
        window.location.reload();
    }

    function fail(err, btn) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest' });
        btn.disabled = false;
    }

    const form = document.getElementById('closure-form');
    if (form) {
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const btn = form.querySelector('[type="submit"]');
            if (!window.confirm('Fermer le compte ? Les apps ferment tout de suite et toutes les données seront supprimées dans 30 jours.')) { return; }
            btn.disabled = true;
            try {
                await post({ action: 'request', name: form.elements.name.value, password: form.elements.password.value });
            } catch (err) {
                fail(err, btn);
            }
        });
    }

    const cancel = document.getElementById('closure-cancel');
    if (cancel) {
        cancel.addEventListener('click', async function () {
            cancel.disabled = true;
            try {
                await post({ action: 'cancel' });
            } catch (err) {
                fail(err, cancel);
            }
        });
    }
})();
