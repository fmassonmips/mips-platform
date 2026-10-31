/**
 * One onboarding / KYC case: settings, decision, checklist, parties, history.
 */
(function () {
    'use strict';

    const { api, el, table, show } = window.MIPS;
    const $ = (id) => document.getElementById(id);
    const caseId = Number($('case-page').dataset.id);
    const ROLE_LABEL = { director: 'Director', ubo: 'Beneficial owner', signatory: 'Signatory', shareholder: 'Shareholder' };
    let data = null;

    const btn = (text, onClick, primary) => el('button', { type: 'button', class: (primary ? 'btn-primary btn-auto' : 'btn-secondary') + ' btn-small', text: text, on: { click: onClick } });

    async function load() {
        try {
            data = await api('/api/onboarding/get?id=' + caseId);
        } catch (err) {
            show($('page-error'), err.message);
            return;
        }
        render();
    }

    function isOpen() {
        return ['collecting', 'under_review', 'on_hold'].includes(data.case.status);
    }

    function render() {
        const c = data.case;
        document.title = 'KYC ' + c.merchant_name + ' · MIPS Dashboard';
        $('case-title').replaceChildren((c.kind === 'periodic_review' ? 'Periodic review — ' : 'Onboarding — '),
            el('a', { href: '/merchant.php?id=' + c.merchant_id, text: c.merchant_name + (c.legal_name ? ' (' + c.legal_name + ')' : '') }));
        $('case-status').textContent = c.status.replace('_', ' ');
        $('case-status').className = 'badge badge-k-' + c.status;
        $('case-meta').textContent = 'Opened ' + c.created_at
            + (c.merchant_submitted_at ? ' · merchant sent its file ' + c.merchant_submitted_at : '')
            + (c.submitted_at ? ' · submitted ' + c.submitted_at : '')
            + (c.decided_at ? ' · decided ' + c.decided_at + ' by ' + (c.decided_by_email || '?') : '')
            + (c.next_review_date ? ' · next review ' + c.next_review_date : '')
            + (c.decision_notes ? ' · decision: ' + c.decision_notes : '');

        const p = data.portal;
        $('case-portal').hidden = !p;
        if (p) {
            $('case-portal').replaceChildren('Merchant portal: opened from ',
                el('a', { href: '/application.php?id=' + p.id, text: 'application #' + p.id }),
                ' · account ' + p.email + (Number(p.is_active) ? '' : ' (switched off)') + ' · two-factor ' + (p.totp_enabled_at ? 'on' : 'off')
                + ' · terms ' + (p.terms_version ? 'v' + p.terms_version + ' accepted ' + p.terms_accepted_at : 'not accepted')
                + (p.last_login_at ? ' · last sign-in ' + p.last_login_at : ''));
        }

        $('k-risk').value = c.risk_rating || '';
        $('k-analyst').replaceChildren(el('option', { value: '', text: 'Unassigned' }),
            ...data.staff.map((u) => el('option', { value: u.id, text: (u.name || u.email) + ' (' + u.role + ')', selected: String(u.id) === String(c.assigned_to) })));
        $('k-due').value = c.due_date || '';
        $('k-notes').value = c.notes || '';
        $('case-form').querySelectorAll('input, select, textarea, button').forEach((x) => { x.disabled = !isOpen(); });

        renderDecision();
        renderChecklist();
        renderParties();

        $('remind-btn').disabled = !isOpen() || !data.outstanding.length || !data.contact_email;
        $('remind-info').textContent = !isOpen() ? ''
            : !data.outstanding.length ? 'Nothing outstanding on the merchant side.'
            : !data.contact_email ? 'No contact email on the merchant record: add a contact to send reminders.'
            : data.outstanding.length + ' document(s) outstanding. Reminders go to ' + data.contact_email + '.';

        $('reminders').replaceChildren(data.reminders.length
            ? table(['Sent', 'To', 'Items', 'By'], data.reminders.map((r) => [r.sent_at + (Number(r.delivered) ? '' : ' (FAILED)'), r.sent_to, String(r.items.length), r.sent_by || 'scheduler']))
            : el('p', { class: 'muted', text: 'None.' }));
        $('history').replaceChildren(data.history.length
            ? table(['When', 'Who', 'Action'], data.history.map((h) => [h.created_at, h.user_email || 'scheduler', h.action.replace('onboarding.', '').replace('_', ' ')]))
            : el('p', { class: 'muted', text: 'None.' }));
    }

    function renderDecision() {
        const c = data.case;
        $('blockers').replaceChildren(isOpen() && data.blockers.length
            ? el('div', { class: 'notice' }, [el('strong', { text: 'Not approvable yet:' }), el('ul', { class: 'flags' }, data.blockers.map((b) => el('li', { text: b })))])
            : isOpen() ? el('p', { class: 'success-left', text: 'All checks pass: the case can be approved.' }) : '');

        if (!isOpen()) {
            $('decision').replaceChildren(el('p', { class: 'muted', text: 'Case ' + c.status + '. Start a new case from the merchant record for the next review.' }));
            return;
        }
        const notes = el('textarea', { id: 'decision-notes', rows: '2', placeholder: 'Decision note (required to approve or reject)' });
        const go = (to, confirmText) => async function () {
            if (confirmText && !window.confirm(confirmText)) { return; }
            show($('page-error'), '');
            try {
                await api('/api/onboarding/transition', { method: 'POST', body: { id: caseId, to: to, notes: notes.value } });
                await load();
            } catch (err) {
                show($('page-error'), err.message);
                window.scrollTo(0, 0);
            }
        };
        const actions = [];
        if (c.status === 'collecting') {
            actions.push(btn('Submit for review', go('under_review'), true), btn('Put on hold', go('on_hold')));
        }
        if (c.status === 'under_review') {
            actions.push(btn('Send back to collecting', go('collecting')), btn('Put on hold', go('on_hold')));
            if (data.can_decide) {
                actions.push(btn('Approve', go('approved', 'Approve this merchant? This is recorded with your name.'), true),
                    btn('Reject', go('rejected', 'Reject this merchant?')));
            }
        }
        if (c.status === 'on_hold') {
            actions.push(btn('Resume collecting', go('collecting')), btn('Back to review', go('under_review')));
            if (data.can_decide) { actions.push(btn('Reject', go('rejected', 'Reject this merchant?'))); }
        }
        const hint = c.status === 'under_review' && !data.can_decide
            ? el('p', { class: 'muted', text: 'Approval needs an approver who is not the assigned analyst (four eyes).' }) : '';
        $('decision').replaceChildren(el('div', { class: 'field' }, [notes]), el('div', { class: 'actions' }, actions), hint);
    }

    function uploadForm(item) {
        const form = el('form', { class: 'inline-form upload-form', novalidate: true });
        const file = el('input', { type: 'file', name: 'file', accept: 'application/pdf,image/jpeg,image/png', 'aria-label': 'File for ' + item.label });
        const exp = item.expires ? el('input', { type: 'date', name: 'expires_at', 'aria-label': 'Expiry date', title: 'Expiry date' }) : null;
        form.append(file, exp ? el('label', {}, ['Expires ', exp]) : '', el('button', { type: 'submit', class: 'btn-secondary btn-small', text: 'Upload' }));
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            show($('doc-error'), '');
            if (!file.files.length) { show($('doc-error'), 'Choose a file.'); return; }
            const fd = new FormData(form);
            fd.set('case_id', String(caseId));
            fd.set('requirement', item.requirement);
            if (item.party_id) { fd.set('party_id', String(item.party_id)); }
            try {
                await api('/api/onboarding/upload', { method: 'POST', body: fd });
                await load();
            } catch (err) {
                show($('doc-error'), err.message);
            }
        });
        return form;
    }

    async function review(doc, decision) {
        let reason = '';
        if (decision === 'reject') {
            reason = window.prompt('Why is this document rejected? The merchant will see this reason.') || '';
            if (!reason.trim()) { return; }
        }
        show($('doc-error'), '');
        try {
            await api('/api/onboarding/document-review', { method: 'POST', body: { id: doc.id, decision: decision, reason: reason } });
            await load();
        } catch (err) {
            show($('doc-error'), err.message);
        }
    }

    async function removeDoc(doc) {
        if (!window.confirm('Remove this upload?')) { return; }
        try {
            await api('/api/onboarding/document-delete', { method: 'POST', body: { id: doc.id } });
            await load();
        } catch (err) {
            show($('doc-error'), err.message);
        }
    }

    function renderChecklist() {
        $('checklist').replaceChildren(table(['Document', 'Person', 'Status', 'Current file', 'Review', ''],
            data.checklist.map(function (i) {
                const d = i.document;
                const fileCell = i.via ? i.via
                    : d ? el('span', {}, [el('a', { href: '/api/onboarding/document?id=' + d.id, text: d.original_name }),
                        ' · ' + (d.uploaded_by_email || (d.uploaded_by_portal_email ? 'merchant (portal)' : '')) + ' · ' + d.uploaded_at + (d.expires_at ? ' · expires ' + d.expires_at : '')
                        + (d.scan_status === 'clean' ? ' · antivirus OK' : d.uploaded_by_portal ? ' · not scanned' : '')
                        + (i.history.length ? ' · ' + i.history.length + ' earlier version(s)' : '')])
                    : '';
                const reviewCell = !d ? ''
                    : d.status === 'pending'
                        ? (Number(d.uploaded_by) === data.me
                            ? el('span', { class: 'actions' }, [el('span', { class: 'muted', text: 'Awaiting a second person' }), isOpen() ? btn('Remove', () => removeDoc(d)) : ''])
                            : isOpen() ? el('span', { class: 'actions' }, [btn('Accept', () => review(d, 'accept'), true), btn('Reject', () => review(d, 'reject'))]) : '')
                        : (d.status === 'rejected' ? 'Rejected: ' + (d.rejection_reason || '') : 'Accepted') + (d.reviewed_by_email ? ' by ' + d.reviewed_by_email : '');
                return {
                    className: i.required && ['missing', 'rejected', 'expired'].includes(i.status) ? 'warn' : null,
                    cells: [i.label + (i.required ? '' : ' (optional)'), i.party_name || '',
                        el('span', { class: 'badge badge-d-' + i.status, text: i.status }), fileCell, reviewCell,
                        isOpen() && i.status !== 'accepted' && !i.via ? uploadForm(i) : (isOpen() && i.status === 'accepted' && i.expires ? uploadForm(i) : '')],
                };
            })));
    }

    function renderParties() {
        $('party-intro').textContent = 'Record every director, every beneficial owner (' + data.ubo_threshold_pct
            + '% or more, or control by other means) and every authorised signatory. Each needs an identity document, a proof of address and a screening result.';
        $('party-new').hidden = !isOpen();
        $('parties').replaceChildren(data.parties.length
            ? table(['Name', 'Roles', 'Ownership', 'Nationality', 'PEP', 'Screening', 'ID number', ''],
                data.parties.map((p) => ({
                    className: p.screening_result === 'match' ? 'warn' : null,
                    cells: [p.full_name + (p.declared_by_portal ? ' (declared by the merchant)' : ''), p.roles.map((r) => ROLE_LABEL[r]).join(', '),
                        p.ownership_pct === null ? '' : Number(p.ownership_pct) + '%', p.nationality || '',
                        Number(p.is_pep) ? 'YES' : 'no',
                        p.screening_result + (p.screened_at ? ' (' + p.screened_at + ')' : '') + (p.screening_reference ? ' · ' + p.screening_reference : ''),
                        p.has_id_number ? 'stored' : '—',
                        isOpen() ? el('span', { class: 'actions' }, [btn('Edit', () => editParty(p)), btn('Delete', () => deleteParty(p))]) : ''],
                })))
            : el('p', { class: 'muted', text: 'Nobody recorded yet.' }));
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
            $('pt-pep').checked = Number(p.is_pep) === 1;
            $('pt-scr').value = p.screening_result;
            $('pt-ref').value = p.screening_reference || '';
            $('pt-notes').value = p.notes || '';
        }
        $('pt-idno').placeholder = p && p.has_id_number ? 'Stored (encrypted). Type to replace.' : '';
        pForm.hidden = false;
        $('pt-name').focus();
    }
    async function deleteParty(p) {
        if (!window.confirm('Delete ' + p.full_name + ' from this case? Their uploaded documents stay on record.')) { return; }
        try {
            await api('/api/onboarding/party-delete', { method: 'POST', body: { id: p.id } });
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
        body.case_id = caseId;
        try {
            await api('/api/onboarding/party-save', { method: 'POST', body: body });
            pForm.hidden = true;
            await load();
        } catch (err) {
            show($('party-error'), err.message);
        }
    });

    $('case-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        show($('page-error'), '');
        try {
            await api('/api/onboarding/update', { method: 'POST', body: Object.assign({ id: caseId }, Object.fromEntries(new FormData(this).entries())) });
            await load();
        } catch (err) {
            show($('page-error'), err.message);
        }
    });

    $('remind-btn').addEventListener('click', async function () {
        if (!window.confirm('Email ' + data.contact_email + ' the list of ' + data.outstanding.length + ' outstanding document(s)?')) { return; }
        this.disabled = true;
        try {
            const r = await api('/api/onboarding/remind', { method: 'POST', body: { id: caseId } });
            $('remind-info').textContent = 'Reminder sent to ' + r.sent_to + '.';
            await load();
        } catch (err) {
            show($('doc-error'), err.message);
            this.disabled = false;
        }
    });

    load();
})();
