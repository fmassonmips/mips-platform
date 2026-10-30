/**
 * MIPS back-office: subscribe / end / extend apps, suspend, notes.
 */
(function () {
    'use strict';

    const page = document.getElementById('bo-company');
    if (!page) { return; }
    const orgId     = Number(page.dataset.org);
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('bo-error');

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest' });
    }

    async function post(payload) {
        payload.org_id = orgId;
        const res = await fetch('/api/backoffice/company', {
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

    document.querySelectorAll('[data-bo]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
            if (btn.dataset.confirm && !window.confirm(btn.dataset.confirm)) { return; }
            btn.disabled = true;
            try {
                await post({ action: btn.dataset.bo, app: btn.dataset.app || '' });
            } catch (err) {
                showError(err.message);
                btn.disabled = false;
            }
        });
    });

    const extend = document.getElementById('bo-extend');
    document.querySelectorAll('[data-bo-extend]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            extend.dataset.app = btn.dataset.boExtend;
            document.getElementById('bo-extend-title').textContent = 'Prolonger l\'essai ' + btn.dataset.name;
            extend.hidden = false;
            extend.elements.days.focus();
        });
    });
    document.getElementById('bo-extend-cancel').addEventListener('click', function () { extend.hidden = true; });

    function onSubmit(form, build) {
        if (!form) { return; }
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            const payload = build();
            if (payload === null) { return; }
            submit.disabled = true;
            try {
                await post(payload);
            } catch (err) {
                showError(err.message);
                submit.disabled = false;
            }
        });
    }

    onSubmit(extend, function () {
        return { action: 'extend', app: extend.dataset.app, days: extend.elements.days.value, reason: extend.elements.reason.value.trim() };
    });
    onSubmit(document.getElementById('bo-note'), function () {
        return { action: 'note', text: document.getElementById('bo-note-text').value.trim() };
    });
    const suspend = document.getElementById('bo-suspend');
    onSubmit(suspend, function () {
        if (!window.confirm('Suspendre cette entreprise ? Ses membres sont déconnectés et ses pages publiques ferment.')) { return null; }
        return { action: 'suspend', reason: suspend.elements.reason.value.trim() };
    });
})();
