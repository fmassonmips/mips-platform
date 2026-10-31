/**
 * Bookora back office: places (photo shrunk in the browser), seasons,
 * closures, calendar sync, settings, bookings typed by the team, booking
 * actions. All endpoints: POST JSON with the CSRF token; the server enforces
 * every rule and computes every price.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('bk-error');

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest' });
    }

    async function post(payload) {
        errorBox.hidden = true;
        const res = await fetch('/api/bookora/admin', {
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
        if (!form) { return; }
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            if (submit) { submit.disabled = true; }
            try {
                await fn(form.elements);
            } catch (err) {
                showError(err.message);
            } finally {
                if (submit) { submit.disabled = false; }
            }
        });
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

    const reload = function () { window.location.reload(); };

    /* ---- Place ---- */

    // Phone photos are several MB: shrink to 800 px JPEG (server cap: 400 KB). Data URL: the CSP refuses blob: images.
    function shrink(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onerror = function () { reject(new Error('Image illisible.')); };
            reader.onload = function () {
                const img = new Image();
                img.onload = function () {
                    const scale  = Math.min(1, 800 / Math.max(img.width, img.height));
                    const canvas = document.createElement('canvas');
                    canvas.width  = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = function () { reject(new Error('Image illisible.')); };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    const unitForm = document.getElementById('bk-unit-form');
    if (unitForm) {
        const file    = document.getElementById('pr-image');
        const preview = document.getElementById('pr-preview');
        let image = '';
        file.addEventListener('change', async function () {
            image = '';
            if (!file.files.length) { return; }
            try {
                image = await shrink(file.files[0]);
                preview.src = image;
                preview.hidden = false;
            } catch (err) {
                showError(err.message);
            }
        });
        guard(unitForm, async function (f) {
            const id   = Number(unitForm.dataset.id);
            const body = await post({
                action: 'unit', id: id, name: f.name.value, description: f.description.value, price: f.price.value.trim(),
                tax_code: f.tax_code.value, capacity: f.capacity.value, min_nights: f.min_nights.value, active: f.active.checked,
                image: image !== '' ? image : (f.remove_image && f.remove_image.checked ? 'remove' : ''),
            });
            if (id === 0) {
                window.location.href = '/app.php?m=bookora&p=unit&id=' + body.id;
            } else {
                reload();
            }
        });
    }

    onClick('#bk-delete-unit', async function (btn) {
        if (!window.confirm('Supprimer ce logement ?')) { btn.disabled = false; return; }
        await post({ action: 'delete_unit', id: Number(btn.dataset.id) });
        window.location.href = '/app.php?m=bookora&p=units';
    });

    const season = document.getElementById('bk-season');
    guard(season, async function (f) {
        await post({ action: 'season', unit_id: Number(season.dataset.unit), label: f.label.value, start: f.start.value, end: f.end.value, price: f.price.value.trim() });
        reload();
    });

    const block = document.getElementById('bk-block');
    guard(block, async function (f) {
        await post({ action: 'block', unit_id: Number(block.dataset.unit), start: f.start.value, end: f.end.value || f.start.value, reason: f.reason.value });
        reload();
    });

    onClick('[data-bk-del]', async function (btn) {
        await post({ action: btn.dataset.bkDel, id: Number(btn.dataset.id) });
        reload();
    });

    const ical = document.getElementById('bk-ical');
    guard(ical, async function (f) {
        await post({ action: 'ical_url', unit_id: Number(ical.dataset.unit), url: f.url.value.trim() });
        reload();
    });

    onClick('#bk-sync', async function (btn) {
        const body = await post({ action: 'ical_sync', unit_id: Number(btn.dataset.unit) });
        if (body.warning) {
            showError(body.warning);
            btn.disabled = false;
            return;
        }
        reload();
    });

    onClick('#bk-ical-token', async function (btn) {
        if (!window.confirm('Créer un nouveau lien ? Remplacez-le ensuite sur chaque plateforme.')) { btn.disabled = false; return; }
        await post({ action: 'ical_token', unit_id: Number(btn.dataset.unit) });
        reload();
    });

    /* ---- Settings ---- */

    guard(document.getElementById('bk-settings'), async function (f) {
        const payload = { action: 'settings', booking_open: f.booking_open.checked };
        ['intro', 'checkin_time', 'checkout_time', 'deposit_percent', 'hold_hours', 'bank_details', 'juice_number', 'notify_email'].forEach(function (k) {
            payload[k] = f[k].value.trim();
        });
        await post(payload);
        reload();
    });

    onClick('#bk-new-link', async function (btn) {
        if (!window.confirm('Créer un nouveau lien ? L\'ancien cessera de fonctionner.')) { btn.disabled = false; return; }
        await post({ action: 'new_link' });
        reload();
    });

    document.querySelectorAll('[data-copy]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
            const input = document.getElementById(btn.dataset.copy);
            try {
                await navigator.clipboard.writeText(input.value);
                btn.textContent = 'Copié';
            } catch (e) {
                input.select();
            }
        });
    });

    /* ---- Bookings ---- */

    const manual = document.getElementById('bk-manual');
    guard(manual, async function (f) {
        const body = await post({
            action: 'booking', unit_id: Number(f.unit_id.value), check_in: f.check_in.value, check_out: f.check_out.value,
            guests: Number(f.guests.value), name: f.name.value, phone: f.phone.value, email: f.email.value, note: f.note.value,
        });
        window.location.href = '/app.php?m=bookora&p=booking&id=' + body.id;
    });

    onClick('[data-bk]', async function (btn) {
        const action = btn.dataset.bk;
        if (action === 'cancel' && !window.confirm('Annuler cette réservation ? Les dates seront libérées et le client prévenu.')) {
            btn.disabled = false;
            return;
        }
        const body = await post({ action: action, id: Number(btn.dataset.id), on: btn.dataset.on === '1' });
        if (action === 'invoice') {
            window.location.href = '/app.php?m=facturo&p=edit&id=' + body.id;
            return;
        }
        reload();
    });
})();
