/**
 * Public booking: dates → free places with their price (computed by the
 * server) → booking request; on the guest's booking page, cancel a request.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

    async function post(payload) {
        const res = await fetch('/api/bookora/public', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            throw new Error(body.error || 'Error.');
        }
        return body;
    }

    function rs(cents) {
        return 'Rs ' + Math.floor(cents / 100).toLocaleString('en-US') + '.' + String(cents % 100).padStart(2, '0');
    }

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text !== undefined) { n.textContent = text; }
        return n;
    }

    /* ---- Guest's booking page: cancel ---- */
    const cancel = document.getElementById('bk-cancel');
    if (cancel) {
        cancel.addEventListener('click', async function () {
            if (!window.confirm(cancel.dataset.confirm)) { return; }
            cancel.disabled = true;
            try {
                await post({ action: 'cancel', t: cancel.dataset.t });
                window.location.reload();
            } catch (err) {
                const box = document.getElementById('bk-error');
                box.textContent = err.message;
                box.hidden = false;
                cancel.disabled = false;
            }
        });
    }

    /* ---- Booking page ---- */
    const root = document.getElementById('bk');
    if (!root) { return; }
    const t       = JSON.parse(root.dataset.t);
    const search  = document.getElementById('bk-search');
    const errBox  = document.getElementById('bk-error');
    const book    = document.getElementById('bk-book');
    const request = document.getElementById('bk-request');
    const units   = document.querySelector('.bk-units');
    let chosen = null;
    let stay   = null;

    function showError(box, msg) {
        box.textContent = msg;
        box.hidden = false;
    }

    search.elements.check_in.addEventListener('change', function () {
        const f = search.elements;
        if (f.check_in.value) {
            const next = new Date(f.check_in.value + 'T00:00:00Z');
            next.setUTCDate(next.getUTCDate() + 1);
            f.check_out.min = next.toISOString().slice(0, 10);
            if (!f.check_out.value || f.check_out.value <= f.check_in.value) { f.check_out.value = f.check_out.min; }
        }
    });

    search.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        errBox.hidden = true;
        const f = search.elements;
        stay = { check_in: f.check_in.value, check_out: f.check_out.value, guests: Number(f.guests.value) };
        const submit = search.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
            const body = await post(Object.assign({ action: 'search', o: root.dataset.o }, stay));
            const free = {};
            body.units.forEach(function (u) { free[u.unit_id] = u; });
            let any = false;
            document.querySelectorAll('.bk-unit').forEach(function (card) {
                const q   = free[card.dataset.unit];
                const box = card.querySelector('.bk-quote');
                box.textContent = '';
                box.hidden = false;
                card.classList.toggle('is-out', !q || !q.available);
                if (!q || !q.available) {
                    box.appendChild(el('p', 'small muted', q ? q.reason : t.unavailable));
                    return;
                }
                any = true;
                box.appendChild(el('p', 'small', t.available + ' · ' + t.nights.replace('%d', q.nights)));
                const line = el('div', 'product-foot');
                line.appendChild(el('strong', null, t.total + ' ' + rs(q.total)));
                const btn = el('button', 'btn-primary btn-inline', t.choose);
                btn.type = 'button';
                btn.addEventListener('click', function () { choose(card, q); });
                line.appendChild(btn);
                box.appendChild(line);
            });
            if (!any) { showError(errBox, t.none); }
        } catch (err) {
            showError(errBox, err.message);
        } finally {
            submit.disabled = false;
        }
    });

    function choose(card, q) {
        chosen = q;
        document.getElementById('bk-title').textContent = card.querySelector('h2').textContent;
        const list = document.getElementById('bk-lines');
        list.textContent = '';
        q.lines.forEach(function (l) {
            const li = el('li', null, l.text + ' — ' + rs(l.amount));
            list.appendChild(li);
        });
        document.getElementById('bk-total').textContent = t.total + ' : ' + rs(q.total);
        const pct = Number(root.dataset.deposit);
        document.getElementById('bk-deposit').textContent = pct > 0 ? t.deposit.replace('%s', rs(Math.round(q.total * pct / 100))) : t.no_deposit;
        units.hidden = true;
        search.hidden = true;
        book.hidden = false;
        book.scrollIntoView({ block: 'start' });
        request.elements.name.focus();
    }

    document.getElementById('bk-back').addEventListener('click', function (ev) {
        ev.preventDefault();
        book.hidden = true;
        units.hidden = false;
        search.hidden = false;
    });

    request.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        const box = document.getElementById('bk-form-error');
        box.hidden = true;
        const f = request.elements;
        const submit = request.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
            const body = await post(Object.assign({ action: 'book', o: root.dataset.o, unit_id: chosen.unit_id }, stay, {
                name: f.name.value, phone: f.phone.value, email: f.email.value, note: f.note.value, website: f.website.value,
            }));
            if (body.booking_url) {
                window.location.assign(body.booking_url);
            }
        } catch (err) {
            showError(box, err.message);
            submit.disabled = false;
        }
    });
})();
