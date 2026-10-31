/**
 * Public booking page and appointment page (no login).
 * Loads free times for the chosen service / person / date, books, cancels.
 * Texts come from the page (company's document language).
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('bk-error');

    function showError(message) {
        if (!errorBox) { return; }
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest' });
    }

    async function post(payload) {
        if (errorBox) { errorBox.hidden = true; }
        const res = await fetch('/api/rendezvous/public', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            throw new Error(body.error || 'Error');
        }
        return body;
    }

    const form = document.getElementById('booking-form');
    if (form) {
        const f     = form.elements;
        const slots = document.getElementById('bk-slots');
        let chosen  = '';
        let seq     = 0;

        const load = async function () {
            const mine = ++seq;
            chosen = '';
            slots.textContent = '…';
            try {
                const body = await post({
                    action: 'slots', o: form.dataset.o, service_id: Number(f.service_id.value),
                    staff_id: Number(f.staff_id.value), date: f.date.value,
                });
                if (mine !== seq) { return; }
                slots.textContent = '';
                if (body.slots.length === 0) {
                    const p = document.createElement('p');
                    p.className = 'muted small';
                    p.textContent = form.dataset.noTimes;
                    slots.appendChild(p);
                    return;
                }
                body.slots.forEach(function (s) {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'slot';
                    b.textContent = s.time;
                    b.setAttribute('role', 'radio');
                    b.setAttribute('aria-checked', 'false');
                    b.addEventListener('click', function () {
                        slots.querySelectorAll('.slot').forEach(function (o) {
                            o.classList.remove('is-selected');
                            o.setAttribute('aria-checked', 'false');
                        });
                        b.classList.add('is-selected');
                        b.setAttribute('aria-checked', 'true');
                        chosen = s.time;
                    });
                    slots.appendChild(b);
                });
            } catch (err) {
                slots.textContent = '';
                showError(err.message);
            }
        };

        ['service_id', 'staff_id', 'date'].forEach(function (name) {
            if (f[name] && f[name].type !== 'hidden') {
                f[name].addEventListener('change', load);
            }
        });
        load();

        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            if (!chosen) {
                showError(form.dataset.pickTime);
                return;
            }
            const submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            try {
                const body = await post({
                    action: 'book', o: form.dataset.o, service_id: Number(f.service_id.value), staff_id: Number(f.staff_id.value),
                    date: f.date.value, time: chosen, name: f.name.value, phone: f.phone.value, email: f.email.value, note: f.note.value,
                });
                window.location.href = body.manage_url + '&new=1';
            } catch (err) {
                showError(err.message);
                load();
            } finally {
                submit.disabled = false;
            }
        });
    }

    const cancelBtn = document.getElementById('bk-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', async function () {
            if (!window.confirm(cancelBtn.dataset.confirm)) {
                return;
            }
            cancelBtn.disabled = true;
            try {
                await post({ action: 'cancel', t: cancelBtn.dataset.t });
                window.location.reload();
            } catch (err) {
                showError(err.message);
                cancelBtn.disabled = false;
            }
        });
    }
})();
