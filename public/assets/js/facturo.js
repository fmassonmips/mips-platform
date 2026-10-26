/**
 * Facturo client.
 * - Draft editor: add/remove lines, live totals preview, save via POST /api/facturo/documents.
 * - Document actions (issue, status, convert, delete) on [data-doc-action] buttons.
 * - Clients page: create/edit/delete via POST /api/facturo/clients.
 * - Company page: save via POST /api/suite/organization.
 * - Send by e-mail: POST /api/facturo/documents { action: 'email' }.
 * - MRA e-invoicing settings: POST /api/suite/mra.
 * The server recomputes every amount; the totals shown here are a preview only.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('facturo-error');

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
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            throw new Error(body.error || 'La requête a échoué.');
        }
        return body;
    }

    function editUrl(id) {
        return '/app.php?m=facturo&p=edit&id=' + encodeURIComponent(id);
    }

    // ---- Document actions ------------------------------------------------
    document.querySelectorAll('[data-doc-action]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
            if (btn.dataset.confirm && !window.confirm(btn.dataset.confirm)) {
                return;
            }
            btn.disabled = true;
            try {
                const body = await post('/api/facturo/documents', {
                    action: btn.dataset.docAction,
                    id: Number(btn.dataset.id),
                    status: btn.dataset.status || '',
                });
                window.location.assign(btn.dataset.redirect || editUrl(body.id));
            } catch (err) {
                showError(err.message);
                btn.disabled = false;
            }
        });
    });

    // ---- Draft editor ----------------------------------------------------
    const form = document.getElementById('document-form');
    if (form) {
        const tbody    = document.getElementById('lines');
        const template = document.getElementById('line-template');

        // Preview only: parse to cents/thousandths/basis points like the server does.
        const toInt = function (value, decimals) {
            const m = String(value).trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
            if (!m) { return null; }
            const frac = (m[3] || '').padEnd(decimals, '0').slice(0, decimals);
            const n = Number(m[2]) * Math.pow(10, decimals) + Number(frac || 0);
            return m[1] === '-' ? -n : n;
        };
        const fmt = function (cents) {
            const sign = cents < 0 ? '-' : '';
            const abs = Math.abs(cents);
            return form.currency.value + ' ' + sign
                + Math.floor(abs / 100).toLocaleString('en-US') + '.'
                + String(abs % 100).padStart(2, '0');
        };
        const roundDiv = function (num, d) {
            return num >= 0 ? Math.floor((2 * num + d) / (2 * d)) : -Math.floor((-2 * num + d) / (2 * d));
        };

        const recalc = function () {
            let sub = 0;
            let tax = 0;
            tbody.querySelectorAll('tr.line').forEach(function (row) {
                const qty  = toInt(row.querySelector('[name="quantity"]').value, 3);
                const unit = toInt(row.querySelector('[name="unit_price"]').value, 2);
                const taxSel = row.querySelector('[name="tax_code"]');
                const rate = Number(taxSel.options[taxSel.selectedIndex].dataset.rate);
                const cell = row.querySelector('.line-amount');
                if (qty === null || unit === null) {
                    cell.textContent = '—';
                    return;
                }
                const total = roundDiv(qty * unit, 1000);
                sub += total;
                tax += (total < 0 ? -1 : 1) * roundDiv(Math.abs(total) * rate, 10000);
                cell.textContent = fmt(total);
            });
            document.getElementById('total-sub').textContent = fmt(sub);
            document.getElementById('total-tax').textContent = fmt(tax);
            document.getElementById('total-all').textContent = fmt(sub + tax);
        };

        document.getElementById('add-line').addEventListener('click', function () {
            tbody.appendChild(template.content.cloneNode(true));
            recalc();
        });
        tbody.addEventListener('click', function (ev) {
            const btn = ev.target.closest('[data-remove-line]');
            if (btn && tbody.querySelectorAll('tr.line').length > 1) {
                btn.closest('tr').remove();
                recalc();
            }
        });
        form.addEventListener('input', recalc);
        form.addEventListener('change', recalc);
        recalc();

        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            const lines = Array.prototype.map.call(tbody.querySelectorAll('tr.line'), function (row) {
                return {
                    description: row.querySelector('[name="description"]').value,
                    quantity:    row.querySelector('[name="quantity"]').value,
                    unit_price:  row.querySelector('[name="unit_price"]').value,
                    tax_code:    row.querySelector('[name="tax_code"]').value,
                    nature:      row.querySelector('[name="nature"]').value,
                };
            });
            try {
                const body = await post('/api/facturo/documents', {
                    action: 'save',
                    id: Number(form.dataset.id),
                    type: form.dataset.type,
                    client_id: form.client_id.value,
                    issue_date: form.issue_date.value,
                    due_date: form.due_date ? form.due_date.value : '',
                    currency: form.currency.value,
                    notes: form.notes.value,
                    lines: lines,
                });
                window.location.assign(editUrl(body.id));
            } catch (err) {
                showError(err.message);
                submit.disabled = false;
            }
        });
    }

    // ---- Clients ---------------------------------------------------------
    const clientForm = document.getElementById('client-form');
    if (clientForm) {
        const fields = ['name', 'email', 'phone', 'address', 'brn', 'vat_number'];
        const title  = document.getElementById('client-form-title');

        document.querySelectorAll('[data-edit-client]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const c = JSON.parse(btn.dataset.editClient);
                clientForm.dataset.id = c.id;
                fields.forEach(function (f) { clientForm.elements[f].value = c[f] || ''; });
                title.textContent = 'Modifier le client';
                clientForm.scrollIntoView({ block: 'nearest' });
                clientForm.elements.name.focus();
            });
        });

        clientForm.addEventListener('reset', function () {
            clientForm.dataset.id = '0';
            title.textContent = 'Nouveau client';
        });

        clientForm.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const payload = { action: 'save', id: Number(clientForm.dataset.id) };
            fields.forEach(function (f) { payload[f] = clientForm.elements[f].value; });
            try {
                await post('/api/facturo/clients', payload);
                window.location.reload();
            } catch (err) {
                showError(err.message);
            }
        });

        document.querySelectorAll('[data-delete-client]').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                if (!window.confirm('Supprimer ce client ?')) { return; }
                try {
                    await post('/api/facturo/clients', { action: 'delete', id: Number(btn.dataset.deleteClient) });
                    window.location.reload();
                } catch (err) {
                    showError(err.message);
                }
            });
        });
    }

    // ---- Send by e-mail -------------------------------------------------
    const emailForm = document.getElementById('email-form');
    if (emailForm) {
        emailForm.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const submit = emailForm.querySelector('[type="submit"]');
            submit.disabled = true;
            try {
                await post('/api/facturo/documents', {
                    action: 'email',
                    id: Number(emailForm.dataset.id),
                    to: emailForm.elements.to.value,
                    subject: emailForm.elements.subject.value,
                    message: emailForm.elements.message.value,
                });
                window.location.reload();
            } catch (err) {
                showError(err.message);
                submit.disabled = false;
            }
        });
    }

    // ---- MRA e-invoicing settings -----------------------------------------
    const mraForm = document.getElementById('mra-form');
    if (mraForm) {
        const result = document.getElementById('mra-result');
        const say = function (text) { result.textContent = text; result.hidden = false; };

        mraForm.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            result.hidden = true;
            try {
                await post('/api/suite/mra', {
                    action: 'save',
                    enabled: mraForm.elements.enabled.checked,
                    username: mraForm.elements.username.value,
                    password: mraForm.elements.password.value,
                    ebs_id: mraForm.elements.ebs_id.value,
                });
                mraForm.elements.password.value = '';
                say('Enregistré.');
            } catch (err) {
                showError(err.message);
            }
        });

        document.getElementById('mra-test').addEventListener('click', async function () {
            result.hidden = true;
            try {
                const body = await post('/api/suite/mra', { action: 'test' });
                say(body.message);
            } catch (err) {
                showError(err.message);
            }
        });
    }

    // ---- Company profile -------------------------------------------------
    const companyForm = document.getElementById('company-form');
    if (companyForm && companyForm.querySelector('[type="submit"]')) {
        companyForm.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const payload = {};
            ['name', 'legal_name', 'address', 'brn', 'vat_number', 'email', 'phone'].forEach(function (f) {
                payload[f] = companyForm.elements[f].value;
            });
            try {
                await post('/api/suite/organization', payload);
                document.getElementById('company-saved').hidden = false;
            } catch (err) {
                showError(err.message);
            }
        });
    }
})();
