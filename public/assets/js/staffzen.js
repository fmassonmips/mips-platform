/**
 * StaffZen: leave request / record forms (live working-day count), cancel,
 * approve / refuse, per-person allowances, settings (work days, leave types,
 * public holidays). All endpoints: POST JSON with the CSRF token; the server
 * counts the days and enforces every rule.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('sz-error');

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest' });
    }

    async function post(payload) {
        errorBox.hidden = true;
        const res = await fetch('/api/staffzen/leave', {
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

    function onClick(selector, fn) {
        document.querySelectorAll(selector).forEach(function (btn) {
            btn.addEventListener('click', async function () {
                btn.disabled = true;
                try {
                    await fn(btn);
                } catch (err) {
                    showError(err.message);
                    btn.disabled = false;
                }
            });
        });
    }

    function days(half) {
        return String(Math.floor(half / 2)) + (half % 2 ? ',5' : '') + ' j';
    }

    /* ---- Request / record forms ---- */

    document.querySelectorAll('.sz-leave-form').forEach(function (form) {
        const f     = form.elements;
        const cal   = JSON.parse(form.dataset.cal);
        const hol   = new Set(cal.holidays);
        const out   = form.querySelector('[data-count]');
        const halfF = form.querySelector('[data-half-field]');

        // Same rule as the server: worked weekdays, public holidays excluded.
        function render() {
            const start = f.start.value;
            const end   = f.end.value || start;
            const single = !!start && end === start;
            halfF.hidden = !single;
            if (!single) { f.half.value = ''; }
            if (!start || end < start) { out.textContent = ''; return; }
            let n = 0;
            for (let d = new Date(start + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
                const iso = d.toISOString().slice(0, 10);
                if (cal.work[(d.getUTCDay() + 6) % 7] === '1' && !hol.has(iso)) { n += 2; }
                if (n > 400) { break; }
            }
            if (n > 0 && f.half.value !== '') { n = 1; }
            out.textContent = n === 0 ? 'Aucun jour travaillé sur cette période.' : 'Durée décomptée : ' + days(n) + ' ouvré' + (n > 2 ? 's' : '') + '.';
        }
        f.start.addEventListener('change', function () {
            if (!f.end.value || f.end.value < f.start.value) { f.end.value = f.start.value; }
            render();
        });
        f.end.addEventListener('change', render);
        f.half.addEventListener('change', render);
        render();

        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            try {
                await post({
                    action: form.id === 'sz-record' ? 'record' : 'request',
                    user_id: f.user_id ? Number(f.user_id.value) : 0, type_id: Number(f.type_id.value),
                    start: f.start.value, end: f.end.value, half: f.half.value, note: f.note.value,
                });
                window.location.reload();
            } catch (err) {
                showError(err.message);
                submit.disabled = false;
            }
        });
    });

    onClick('[data-sz-cancel]', async function (btn) {
        if (!window.confirm('Annuler ce congé ?')) { btn.disabled = false; return; }
        await post({ action: 'cancel', id: Number(btn.dataset.szCancel) });
        window.location.reload();
    });

    onClick('[data-sz-decide]', async function (btn) {
        const note = document.querySelector('[data-note-for="' + btn.dataset.szDecide + '"]');
        await post({ action: 'decide', id: Number(btn.dataset.szDecide), approve: btn.dataset.approve === '1', note: note ? note.value : '' });
        window.location.reload();
    });

    /* ---- Balances ---- */

    document.querySelectorAll('[data-sz-allow]').forEach(function (input) {
        input.addEventListener('change', async function () {
            input.disabled = true;
            try {
                await post({ action: 'allowance', user_id: Number(input.dataset.user), type_id: Number(input.dataset.type), year: Number(input.dataset.year), days: input.value.trim() });
                window.location.reload();
            } catch (err) {
                showError(err.message);
                input.disabled = false;
            }
        });
    });

    /* ---- Settings ---- */

    const workdays = document.getElementById('sz-workdays');
    if (workdays) {
        workdays.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            let mask = '';
            workdays.querySelectorAll('input[type="checkbox"]').forEach(function (c) { mask += c.checked ? '1' : '0'; });
            try {
                await post({ action: 'work_days', days: mask });
                window.location.reload();
            } catch (err) {
                showError(err.message);
            }
        });
    }

    onClick('[data-save-type]', async function (btn) {
        const row = document.querySelector('[data-type-row="' + btn.dataset.saveType + '"]');
        await post({
            action: 'type', id: Number(btn.dataset.saveType), name: row.querySelector('[name="name"]').value,
            days: row.querySelector('[name="days"]').value.trim(), active: row.querySelector('[name="active"]').checked,
        });
        window.location.reload();
    });

    onClick('[data-delete-type]', async function (btn) {
        if (!window.confirm('Supprimer ce type de congé ?')) { btn.disabled = false; return; }
        await post({ action: 'delete_type', id: Number(btn.dataset.deleteType) });
        window.location.reload();
    });

    const holiday = document.getElementById('sz-holiday');
    if (holiday) {
        holiday.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            try {
                await post({ action: 'holiday', day: holiday.elements.day.value, name: holiday.elements.name.value });
                window.location.reload();
            } catch (err) {
                showError(err.message);
            }
        });
    }

    onClick('[data-del-holiday]', async function (btn) {
        await post({ action: 'del_holiday', day: btn.dataset.delHoliday });
        window.location.reload();
    });

    onClick('#sz-fixed', async function (btn) {
        for (const h of JSON.parse(btn.dataset.days)) {
            await post({ action: 'holiday', day: h.day, name: h.name });
        }
        window.location.reload();
    });
})();
