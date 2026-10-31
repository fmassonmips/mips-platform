/**
 * First steps wizard: profile (POST /api/suite/organization), apps
 * (/api/suite/modules activate), team (/api/suite/team invite). Each step can
 * be skipped; the end goes to the dashboard and its « Bien démarrer » card.
 */
(function () {
    'use strict';

    const root = document.getElementById('wizard');
    if (!root) { return; }
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('wz-error');
    const steps     = Array.from(document.querySelectorAll('.wz-step'));
    const bars      = Array.from(document.querySelectorAll('.wz-progress span'));

    async function post(url, payload) {
        const res = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            throw new Error(body.error || 'La requête a échoué.');
        }
        return body;
    }

    function show(n) {
        if (n > steps.length) {
            window.location.assign('/dashboard.php');
            return;
        }
        errorBox.hidden = true;
        steps.forEach(function (s) { s.hidden = Number(s.dataset.step) !== n; });
        bars.forEach(function (b, i) { b.classList.toggle('is-on', i < n); });
        const first = steps[n - 1].querySelector('input:not([disabled]), select');
        if (first) { first.focus(); }
    }

    function onSubmit(form, run) {
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            errorBox.hidden = true;
            try {
                await run();
                show(Number(form.dataset.step) + 1);
            } catch (err) {
                errorBox.textContent = err.message;
                errorBox.hidden = false;
            } finally {
                submit.disabled = false;
            }
        });
        form.querySelector('[data-skip]').addEventListener('click', function () { show(Number(form.dataset.step) + 1); });
    }

    const profile = document.getElementById('wz-profile');
    onSubmit(profile, function () {
        const payload = {};
        ['name', 'legal_name', 'brn', 'vat_number', 'phone', 'email', 'address', 'document_language'].forEach(function (k) {
            payload[k] = profile.elements[k].value.trim();
        });
        return post('/api/suite/organization', payload);
    });

    const apps = document.getElementById('wz-apps');
    onSubmit(apps, async function () {
        const chosen = Array.from(apps.querySelectorAll('input[name="apps"]:checked:not([disabled])'));
        for (const box of chosen) {
            await post('/api/suite/modules', { action: 'activate', module: box.value });
            box.disabled = true;   // a retry after an error does not activate it twice
        }
    });

    const team = document.getElementById('wz-team');
    onSubmit(team, async function () {
        const emails = Array.from(team.querySelectorAll('input[name="email"]'));
        for (const input of emails) {
            const email = input.value.trim();
            if (email === '' || input.disabled) { continue; }
            const role = input.closest('.form-grid').querySelector('select').value;
            try {
                await post('/api/suite/team', { action: 'invite', email: email, role: role });
                input.disabled = true;
            } catch (err) {
                throw new Error(email + ' : ' + err.message);
            }
        }
    });

    show(Number(root.dataset.step) || 1);
})();
