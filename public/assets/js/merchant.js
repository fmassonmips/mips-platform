/**
 * Merchant record: profile, contracts, contacts, identifiers, activity.
 */
(function () {
    'use strict';

    const { api, el, table, show, int, money } = window.MIPS;
    const $ = (id) => document.getElementById(id);
    const merchantId = Number($('merchant-page').dataset.id);
    let data = null;

    function options(select, values, current, labelFn) {
        select.replaceChildren(...values.map((v) => el('option', {
            value: v.value !== undefined ? v.value : v,
            text: labelFn ? labelFn(v) : v,
            selected: String(v.value !== undefined ? v.value : v) === String(current === null ? '' : current),
        })));
    }

    function formBody(form) {
        const body = Object.fromEntries(new FormData(form).entries());
        form.querySelectorAll('input[type="checkbox"]').forEach((c) => { body[c.name] = c.checked; });
        return body;
    }

    function btn(text, onClick) {
        return el('button', { type: 'button', class: 'btn-secondary btn-small', text: text, on: { click: onClick } });
    }

    async function load() {
        try {
            data = await api('/api/merchants/get?id=' + merchantId);
        } catch (err) {
            show($('page-error'), err.message);
            return;
        }
        render();
    }

    function render() {
        const m = data.merchant;
        document.title = m.name + ' · MIPS Dashboard';
        $('m-title').textContent = m.legal_name ? m.name + ' — ' + m.legal_name : m.name;
        $('m-status').textContent = m.status;
        $('m-status').className = 'badge badge-m-' + m.status;

        // Profile
        $('p-name').value = m.name;
        $('p-name').readOnly = data.has_transactions;
        $('p-name').title = data.has_transactions ? 'Locked: transactions are imported under this name.' : '';
        $('p-legal').value = m.legal_name || '';
        options($('p-status'), data.statuses, m.status);
        $('p-brn').value = m.brn || '';
        $('p-vat').value = m.vat_number || '';
        $('p-sector').value = m.sector || '';
        options($('p-manager'), [{ value: '', name: 'None' }].concat(data.managers.map((u) => ({ value: u.id, name: u.name || u.email }))),
            m.account_manager_id, (u) => u.name);
        $('p-billing').value = m.billing_email || '';
        $('p-billable').checked = Number(m.is_billable) === 1;
        $('p-address').value = m.address || '';
        $('p-notes').value = m.notes || '';

        // Onboarding / KYC
        const ob = data.onboarding;
        const open = ob && ['collecting', 'under_review', 'on_hold'].includes(ob.status);
        $('kyc-status').textContent = !ob ? 'No onboarding case yet.'
            : (ob.kind === 'periodic_review' ? 'Periodic review' : 'Onboarding') + ' #' + ob.id + ': ' + ob.status.replace('_', ' ')
              + (ob.risk_rating ? ' · risk ' + ob.risk_rating : '')
              + (open && ob.due_date ? ' · due ' + ob.due_date : '')
              + (ob.status === 'approved' && ob.next_review_date ? ' · next review ' + ob.next_review_date : '');
        $('kyc-actions').replaceChildren(
            ob ? el('a', { class: 'btn-secondary', href: '/onboarding-case.php?id=' + ob.id, text: 'Open case' }) : '',
            open ? '' : el('button', { type: 'button', class: 'btn-primary btn-auto', text: ob ? 'Start periodic review' : 'Start onboarding',
                on: { click: startOnboarding } }));

        // Contracts
        options($('c-type'), data.contract_types, 'MSA');
        options($('c-status'), data.contract_status, 'draft');
        $('contracts').replaceChildren(data.contracts.length
            ? table(['Type', 'Reference', 'Status', 'Signed', 'Start', 'End', 'Notice deadline', 'Auto-renew', 'Document', ''],
                data.contracts.map((c) => ({
                    className: c.status === 'terminated' ? 'row-muted' : null,
                    cells: [c.type, c.reference || '', el('span', { class: 'badge badge-c-' + c.status, text: c.status }),
                        c.signed_at || '', c.start_date || '', c.end_date || 'open-ended', c.notice_deadline || '',
                        Number(c.auto_renew) ? 'yes' : 'no',
                        c.document_name ? el('a', { href: '/api/merchants/contract-file?id=' + c.id, text: c.document_name }) : 'none',
                        el('span', { class: 'actions' }, [
                            btn('Edit', () => editContract(c)),
                            c.status === 'draft' ? btn('Delete', () => removeContract(c)) : null,
                        ])],
                })))
            : el('p', { class: 'muted', text: 'No contract recorded.' }));

        // Contacts
        $('contacts').replaceChildren(data.contacts.length
            ? table(['Name', 'Job title', 'Email', 'Phone', 'Role', 'Notes', ''],
                data.contacts.map((c) => [
                    c.name, c.job_title || '',
                    c.email ? el('a', { href: 'mailto:' + c.email, text: c.email }) : '',
                    c.phone || '',
                    [Number(c.is_primary) ? 'primary' : '', Number(c.is_billing) ? 'billing' : ''].filter(Boolean).join(', '),
                    c.notes || '',
                    el('span', { class: 'actions' }, [btn('Edit', () => editContact(c)), btn('Delete', () => removeContact(c))]),
                ]))
            : el('p', { class: 'muted', text: 'No contact yet.' }));

        // Identifiers
        options($('i-type'), data.id_types, 'MID');
        $('identifiers').replaceChildren(data.identifiers.length
            ? table(['Type', 'Value', 'Label', ''], data.identifiers.map((i) => [i.type, i.value, i.label || '',
                btn('Remove', () => removeIdentifier(i))]))
            : el('p', { class: 'muted', text: 'None.' }));

        // Activity
        $('volumes').replaceChildren(data.volumes.length
            ? table(['Month', 'Txn', 'MUR volume', 'TPE', 'Online', 'Rails'],
                data.volumes.map((v) => [v.period, int(v.txn), money(v.mur_vol), int(v.tpe_txn), int(v.online_txn), v.rails || '']), [1, 2, 3, 4])
            : el('p', { class: 'muted', text: 'No imported transactions.' }));
        $('invoices').replaceChildren(data.invoices.length
            ? table(['Invoice', 'Month', 'Total', 'Status'], data.invoices.map((i) => [
                el('a', { href: '/invoice.php?id=' + i.id, target: '_blank', rel: 'noopener', text: i.number || 'Draft #' + i.id }),
                i.period, i.currency + ' ' + money(i.total), i.status]), [2])
            : el('p', { class: 'muted', text: 'No invoice.' }));
        $('fee-rules').replaceChildren(data.fee_rules.length
            ? table(['Rail', 'Type', 'Channel', 'Rate %', 'Fixed', 'From'], data.fee_rules.map((r) => [
                r.sof_proc_nickname || 'any', r.rail_type || 'any', r.channel || 'any', Number(r.rate_pct).toFixed(4), money(r.fixed_fee), r.valid_from]))
            : el('p', { class: 'muted', text: 'Uses the general fee rules (Billing page).' }));
        $('history').replaceChildren(data.history.length
            ? table(['When', 'Who', 'Action', 'Details'], data.history.map((h) => [h.created_at, h.user_email || '', h.action,
                h.details ? el('code', { class: 'details', text: JSON.stringify(h.details) }) : '']))
            : el('p', { class: 'muted', text: 'No change recorded yet.' }));
    }

    async function startOnboarding() {
        show($('kyc-error'), '');
        try {
            const r = await api('/api/onboarding/open', { method: 'POST', body: { merchant_id: merchantId } });
            window.location.assign('/onboarding-case.php?id=' + r.id);
        } catch (err) {
            show($('kyc-error'), err.message);
        }
    }

    // ---- Profile -------------------------------------------------------------
    $('profile-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        show($('profile-error'), '');
        $('profile-msg').hidden = true;
        const body = formBody(this);
        body.id = merchantId;
        if (body.status !== data.merchant.status && ['suspended', 'terminated'].includes(body.status)
            && !window.confirm('Set ' + data.merchant.name + ' to ' + body.status + '?')) {
            return;
        }
        try {
            await api('/api/merchants/save', { method: 'POST', body: body });
            $('profile-msg').hidden = false;
            await load();
        } catch (err) {
            show($('profile-error'), err.message);
        }
    });

    // ---- Contracts -----------------------------------------------------------
    const cForm = $('contract-form');
    function editContract(c) {
        cForm.reset();
        $('c-id').value = c ? c.id : '';
        if (c) {
            $('c-ref').value = c.reference || '';
            $('c-type').value = c.type;
            $('c-status').value = c.status;
            $('c-signed').value = c.signed_at || '';
            $('c-start').value = c.start_date || '';
            $('c-end').value = c.end_date || '';
            $('c-notice').value = c.notice_days === null ? '' : c.notice_days;
            $('c-renew').checked = Number(c.auto_renew) === 1;
            $('c-notes').value = c.notes || '';
        }
        cForm.hidden = false;
        $('c-ref').focus();
    }
    $('contract-new').addEventListener('click', () => editContract(null));
    $('contract-cancel').addEventListener('click', () => { cForm.hidden = true; });
    cForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        show($('contract-error'), '');
        const fd = new FormData(cForm);
        fd.set('merchant_id', String(merchantId));
        fd.set('auto_renew', $('c-renew').checked ? '1' : '');
        if (!$('c-doc').files.length) { fd.delete('document'); }
        try {
            await api('/api/merchants/contract-save', { method: 'POST', body: fd });
            cForm.hidden = true;
            await load();
        } catch (err) {
            show($('contract-error'), err.message);
        }
    });
    async function removeContract(c) {
        if (!window.confirm('Delete this draft contract?')) { return; }
        try {
            await api('/api/merchants/contract-delete', { method: 'POST', body: { id: c.id } });
            await load();
        } catch (err) {
            show($('contract-error'), err.message);
        }
    }

    // ---- Contacts ------------------------------------------------------------
    const ctForm = $('contact-form');
    function editContact(c) {
        ctForm.reset();
        $('ct-id').value = c ? c.id : '';
        if (c) {
            $('ct-name').value = c.name;
            $('ct-title').value = c.job_title || '';
            $('ct-email').value = c.email || '';
            $('ct-phone').value = c.phone || '';
            $('ct-primary').checked = Number(c.is_primary) === 1;
            $('ct-billing').checked = Number(c.is_billing) === 1;
            $('ct-notes').value = c.notes || '';
        }
        ctForm.hidden = false;
        $('ct-name').focus();
    }
    $('contact-new').addEventListener('click', () => editContact(null));
    $('contact-cancel').addEventListener('click', () => { ctForm.hidden = true; });
    ctForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        show($('contact-error'), '');
        const body = formBody(ctForm);
        body.merchant_id = merchantId;
        try {
            await api('/api/merchants/contact-save', { method: 'POST', body: body });
            ctForm.hidden = true;
            await load();
        } catch (err) {
            show($('contact-error'), err.message);
        }
    });
    async function removeContact(c) {
        if (!window.confirm('Delete contact ' + c.name + '?')) { return; }
        try {
            await api('/api/merchants/contact-delete', { method: 'POST', body: { id: c.id } });
            await load();
        } catch (err) {
            show($('contact-error'), err.message);
        }
    }

    // ---- Identifiers -----------------------------------------------------------
    $('identifier-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        show($('identifier-error'), '');
        const body = formBody(this);
        body.merchant_id = merchantId;
        try {
            await api('/api/merchants/identifier-save', { method: 'POST', body: body });
            this.reset();
            await load();
        } catch (err) {
            show($('identifier-error'), err.message);
        }
    });
    async function removeIdentifier(i) {
        if (!window.confirm('Remove ' + i.type + ' ' + i.value + '?')) { return; }
        try {
            await api('/api/merchants/identifier-delete', { method: 'POST', body: { id: i.id } });
            await load();
        } catch (err) {
            show($('identifier-error'), err.message);
        }
    }

    load();
})();
