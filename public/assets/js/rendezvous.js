/**
 * RendezVous back office.
 * - Agenda: go to a date, change an appointment's status, book manually.
 * - Services and team: create / edit (owner/admin).
 * - Online booking: copy the link, new link, rules.
 * All endpoints: POST JSON with the CSRF token; the server enforces every rule.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('rv-error');

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest' });
    }

    async function post(url, payload) {
        errorBox.hidden = true;
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

    function guard(form, fn) {
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            if (submit) { submit.disabled = true; }
            try {
                await fn();
            } catch (err) {
                showError(err.message);
            } finally {
                if (submit) { submit.disabled = false; }
            }
        });
    }

    // ---- Agenda ----------------------------------------------------------
    const gotoForm = document.getElementById('rv-goto');
    if (gotoForm) {
        gotoForm.elements.d.addEventListener('change', function () {
            if (gotoForm.elements.d.value) {
                window.location.href = '/app.php?m=rendezvous&d=' + encodeURIComponent(gotoForm.elements.d.value);
            }
        });
        gotoForm.addEventListener('submit', function (ev) { ev.preventDefault(); });
    }

    document.querySelectorAll('[data-rv-status]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
            if (btn.dataset.rvStatus === 'cancelled' && !window.confirm('Annuler ce rendez-vous ? Le client est prévenu par e-mail s\'il en a laissé un.')) {
                return;
            }
            try {
                await post('/api/rendezvous/agenda', { action: 'status', id: Number(btn.dataset.id), status: btn.dataset.rvStatus });
                window.location.reload();
            } catch (err) {
                showError(err.message);
            }
        });
    });

    const bookForm = document.getElementById('rv-book-form');
    if (bookForm) {
        guard(bookForm, async function () {
            const f = bookForm.elements;
            await post('/api/rendezvous/agenda', {
                action: 'book', service_id: Number(f.service_id.value), staff_id: Number(f.staff_id.value),
                date: f.date.value, time: f.time.value, name: f.name.value, phone: f.phone.value,
                email: f.email.value, note: f.note.value,
            });
            window.location.href = '/app.php?m=rendezvous&d=' + encodeURIComponent(f.date.value);
        });
    }

    // ---- Services --------------------------------------------------------
    const serviceForm = document.getElementById('service-form');
    if (serviceForm) {
        const title = document.getElementById('service-form-title');
        document.querySelectorAll('[data-edit-service]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const s = JSON.parse(btn.dataset.editService);
                serviceForm.dataset.id = s.id;
                serviceForm.elements.name.value = s.name;
                serviceForm.elements.duration_min.value = s.duration_min;
                serviceForm.elements.price.value = s.price;
                serviceForm.elements.active.checked = s.active;
                title.textContent = 'Modifier la prestation';
                serviceForm.scrollIntoView({ block: 'nearest' });
                serviceForm.elements.name.focus();
            });
        });
        serviceForm.addEventListener('reset', function () {
            serviceForm.dataset.id = '0';
            title.textContent = 'Nouvelle prestation';
        });
        guard(serviceForm, async function () {
            const f = serviceForm.elements;
            await post('/api/rendezvous/setup', {
                action: 'service', id: Number(serviceForm.dataset.id), name: f.name.value,
                duration_min: Number(f.duration_min.value), price: f.price.value.trim(), active: f.active.checked,
            });
            window.location.reload();
        });
    }

    // ---- Team ------------------------------------------------------------
    const staffForm = document.getElementById('staff-form');
    if (staffForm) {
        const title = document.getElementById('staff-form-title');
        document.querySelectorAll('[data-edit-staff]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const s = JSON.parse(btn.dataset.editStaff);
                staffForm.dataset.id = s.id;
                staffForm.elements.name.value = s.name;
                staffForm.elements.active.checked = s.active;
                for (let d = 1; d <= 7; d++) {
                    staffForm.elements['h' + d].value = s.hours[d] || '';
                }
                title.textContent = 'Modifier : ' + s.name;
                staffForm.scrollIntoView({ block: 'nearest' });
                staffForm.elements.name.focus();
            });
        });
        staffForm.addEventListener('reset', function () {
            staffForm.dataset.id = '0';
            title.textContent = 'Nouveau membre de l\'équipe';
        });
        guard(staffForm, async function () {
            const f = staffForm.elements;
            const hours = {};
            for (let d = 1; d <= 7; d++) {
                hours[d] = f['h' + d].value;
            }
            await post('/api/rendezvous/setup', {
                action: 'staff', id: Number(staffForm.dataset.id), name: f.name.value, active: f.active.checked, hours: hours,
            });
            window.location.reload();
        });
    }

    // ---- Online booking --------------------------------------------------
    const copyBtn = document.getElementById('rv-copy');
    if (copyBtn) {
        copyBtn.addEventListener('click', async function () {
            const input = document.getElementById('rv-link');
            try {
                await navigator.clipboard.writeText(input.value);
                copyBtn.textContent = 'Copié';
            } catch (e) {
                input.select();
            }
        });
    }

    const newLink = document.getElementById('rv-new-link');
    if (newLink) {
        newLink.addEventListener('click', async function () {
            if (!window.confirm('Créer un nouveau lien ? L\'ancien cessera de fonctionner, y compris là où vous l\'avez déjà partagé.')) {
                return;
            }
            try {
                await post('/api/rendezvous/setup', { action: 'new_link' });
                window.location.reload();
            } catch (err) {
                showError(err.message);
            }
        });
    }

    const settingsForm = document.getElementById('rv-settings-form');
    if (settingsForm && settingsForm.querySelector('[type="submit"]')) {
        guard(settingsForm, async function () {
            const f = settingsForm.elements;
            const payload = {
                action: 'settings', booking_enabled: f.booking_enabled.checked, slot_step_min: Number(f.slot_step_min.value),
                min_notice_min: Number(f.min_notice_min.value), max_days_ahead: Number(f.max_days_ahead.value),
                cancel_notice_min: Number(f.cancel_notice_min.value), notify_email: f.notify_email.value, intro: f.intro.value,
            };
            if (f.survey_form_id) {
                payload.survey_form_id = Number(f.survey_form_id.value);
            }
            await post('/api/rendezvous/setup', payload);
            document.getElementById('rv-settings-saved').hidden = false;
        });
    }
})();
