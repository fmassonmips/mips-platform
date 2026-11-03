/**
 * Merchant portal, Documents page: people (directors, beneficial owners,
 * signatories), document uploads, and sending the complete file to MIPS.
 */
(function () {
    'use strict';

    const { api, el, table, show } = window.MIPS;
    const $ = (id) => document.getElementById(id);
    const ROLE_LABEL = { director: 'Director', ubo: 'Beneficial owner', signatory: 'Signatory', shareholder: 'Shareholder' };
    const DOC_STATUS = { missing: 'To upload', pending: 'Received — being checked', accepted: 'Accepted', rejected: 'Not accepted', expired: 'Expired' };
    const FILE_STATUS = { documents: 'Collecting', submitted: 'Sent to MIPS', review: 'Under review by MIPS', on_hold: 'On hold', approved: 'Approved', not_approved: 'Not approved' };
    const NO_CASE = {
        application: 'Fill in the pre-qualification first. Documents are requested once MIPS has reviewed it.',
        application_review: 'MIPS is reviewing your pre-qualification. You will be able to upload documents once it has been reviewed.',
        declined: 'MIPS is not able to take your application further at this stage.',
    };
    let data = null;

    const btn = (text, onClick, primary) => el('button', { type: 'button', class: (primary ? 'btn-primary btn-auto' : 'btn-secondary') + ' btn-small', text: text, on: { click: onClick } });

    async function load() {
        show($('page-error'), '');
        data = await api('/api/portal/case');
        if (!data.case) {
            $('no-case-text').textContent = NO_CASE[data.stage] || '';
            $('no-case').hidden = false;
            $('case-area').hidden = true;
            return;
        }
        $('no-case').hidden = true;
        $('case-area').hidden = false;
        renderStatus();
        renderParties();
        renderChecklist();
    }

    function renderStatus() {
        const c = data.case;
        $('file-status').textContent = FILE_STATUS[data.stage] || data.stage;
        $('file-status').className = 'badge badge-k-' + c.status;
        const blocks = [];
        if (data.stage === 'documents') {
            blocks.push(c.missing.length
                ? el('div', { class: 'notice' }, [el('strong', { text: 'Still needed before you can send your file:' }), el('ul', { class: 'flags' }, c.missing.map((m) => el('li', { text: m })))])
                : el('p', { class: 'success-left', text: 'Everything requested is uploaded. Send your file to MIPS so that it can be reviewed.' }));
            if (c.due_date) { blocks.push(el('p', { class: 'muted', text: 'Please complete your file by ' + c.due_date + '.' })); }
        } else if (data.stage === 'submitted' || data.stage === 'review') {
            blocks.push(el('p', { text: 'Your file was sent to MIPS' + (c.merchant_submitted_at ? ' on ' + c.merchant_submitted_at.slice(0, 10) : '')
                + '. It is not approved yet. ' + (c.editable ? 'You can still upload documents if MIPS asks for them.' : 'Contact MIPS if you need to change something.') }));
        } else if (data.stage === 'on_hold') {
            blocks.push(el('p', { text: 'Your file is on hold. Your MIPS contact will get in touch with you.' }));
        } else if (data.stage === 'approved') {
            blocks.push(el('p', { class: 'success-left', text: 'MIPS has approved your onboarding file.' }));
        } else if (data.stage === 'not_approved') {
            blocks.push(el('p', { text: 'MIPS has not approved your application.' }));
        }
        $('missing').replaceChildren(...blocks);
        $('submit-btn').hidden = !c.can_submit;
        $('submit-btn').disabled = c.missing.length > 0;
    }

    function renderParties() {
        const c = data.case;
        $('party-intro').textContent = 'List every director, every beneficial owner (anyone owning ' + c.ubo_threshold_pct
            + '% or more, or controlling the business by other means) and every person authorised to sign. Each of them needs an identity document and a proof of address.';
        $('party-new').hidden = !c.editable;
        $('parties').replaceChildren(c.parties.length
            ? table(['Name', 'Roles', 'Ownership', 'Added by', ''], c.parties.map((p) => [
                p.full_name, p.roles.map((r) => ROLE_LABEL[r]).join(', '), p.ownership_pct === null ? '' : Number(p.ownership_pct) + '%',
                p.declared_by_you ? 'You' : 'MIPS',
                el('span', { class: 'actions' }, [p.can_edit ? btn('Edit', () => editParty(p)) : '', p.can_delete ? btn('Delete', () => deleteParty(p)) : '']),
            ]))
            : el('p', { class: 'muted', text: 'Nobody added yet.' }));
    }

    function uploadForm(item) {
        const form = el('form', { class: 'inline-form upload-form', novalidate: true });
        const file = el('input', { type: 'file', name: 'file', accept: 'application/pdf,image/jpeg,image/png', 'aria-label': 'File for ' + item.label + (item.party_name ? ' — ' + item.party_name : '') });
        const exp = item.expires ? el('input', { type: 'date', name: 'expires_at', 'aria-label': 'Expiry date of the document' }) : null;
        const submit = el('button', { type: 'submit', class: 'btn-secondary btn-small', text: item.document ? 'Upload a new one' : 'Upload' });
        form.append(file, exp ? el('label', {}, ['Expires ', exp]) : '', submit);
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            show($('doc-error'), '');
            if (!file.files.length) { show($('doc-error'), 'Choose a file.'); return; }
            if (exp && !exp.value) { show($('doc-error'), 'Enter the expiry date shown on the document.'); return; }
            const fd = new FormData(form);
            fd.set('requirement', item.requirement);
            if (item.party_id) { fd.set('party_id', String(item.party_id)); }
            submit.disabled = true;
            submit.textContent = 'Uploading…';
            try {
                await api('/api/portal/upload', { method: 'POST', body: fd });
                await load();
            } catch (err) {
                show($('doc-error'), err.message);
                submit.disabled = false;
                submit.textContent = 'Upload';
            }
        });
        return form;
    }

    async function removeDoc(doc) {
        if (!window.confirm('Remove this upload?')) { return; }
        try {
            await api('/api/portal/document-delete', { method: 'POST', body: { id: doc.id } });
            await load();
        } catch (err) {
            show($('doc-error'), err.message);
        }
    }

    function renderChecklist() {
        const items = data.case.checklist;
        $('checklist').replaceChildren(table(['Document', 'For', 'Status', 'Your upload', ''], items.map(function (i) {
            const d = i.document;
            const status = el('span', {}, [el('span', { class: 'badge badge-d-' + i.status, text: DOC_STATUS[i.status] || i.status }),
                d && d.rejection_reason ? el('span', { class: 'reason', text: ' ' + d.rejection_reason }) : '']);
            const fileCell = i.provided_by === 'mips' ? el('span', { class: 'muted', text: 'Provided to MIPS' })
                : d ? el('span', {}, [d.name || '', ' · ' + d.uploaded_at.slice(0, 16) + (d.expires_at ? ' · expires ' + d.expires_at : ''),
                    d.can_remove ? ' ' : '', d.can_remove ? btn('Remove', () => removeDoc(d)) : ''])
                : '';
            return {
                className: i.required && ['missing', 'rejected', 'expired'].includes(i.status) ? 'warn' : null,
                cells: [el('span', {}, [i.label, i.from_mips ? el('span', { class: 'muted', text: ' · MIPS sends you this agreement to sign; upload it once signed' })
                    : i.required ? '' : el('span', { class: 'muted', text: ' · optional' })]),
                    i.party_name || 'Company', status, fileCell, i.can_upload ? uploadForm(i) : ''],
            };
        })));
    }

    const pForm = $('party-form');
    function editParty(p) {
        pForm.reset();
        $('pt-id').value = p ? p.id : '';
        if (p) {
            $('pt-name').value = p.full_name;
            pForm.querySelectorAll('input[name="roles"]').forEach((c) => { c.checked = p.roles.includes(c.value); });
            $('pt-pct').value = p.ownership_pct === null ? '' : Number(p.ownership_pct);
            $('pt-nat').value = p.nationality || '';
            $('pt-dob').value = p.date_of_birth || '';
        }
        pForm.hidden = false;
        $('pt-name').focus();
    }
    async function deleteParty(p) {
        if (!window.confirm('Remove ' + p.full_name + '?')) { return; }
        try {
            await api('/api/portal/party-delete', { method: 'POST', body: { id: p.id } });
            await load();
        } catch (err) {
            show($('party-error'), err.message);
        }
    }
    $('party-new').addEventListener('click', () => editParty(null));
    $('party-cancel').addEventListener('click', () => { pForm.hidden = true; });
    pForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        show($('party-error'), '');
        const fd = new FormData(pForm);
        const body = Object.fromEntries(fd.entries());
        body.roles = fd.getAll('roles');
        body.is_pep = $('pt-pep').checked;
        try {
            await api('/api/portal/party-save', { method: 'POST', body: body });
            pForm.hidden = true;
            await load();
        } catch (err) {
            show($('party-error'), err.message);
        }
    });

    $('submit-btn').addEventListener('click', async function () {
        if (!window.confirm('Send your file to MIPS for review?')) { return; }
        this.disabled = true;
        try {
            await api('/api/portal/submit', { method: 'POST', body: {} });
            await load();
            window.scrollTo(0, 0);
        } catch (err) {
            show($('page-error'), err.message);
            this.disabled = false;
        }
    });

    load().catch((err) => show($('page-error'), err.message));
})();
