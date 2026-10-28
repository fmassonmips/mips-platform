/**
 * Staff: one merchant portal application. Accept (create or link the
 * merchant, open the onboarding case) or decline; switch the portal account off.
 */
(function () {
    'use strict';

    const { api, el, table, show, money } = window.MIPS;
    const $ = (id) => document.getElementById(id);
    const id = Number($('app-page').dataset.id);
    let data = null;

    const btn = (text, onClick, primary) => el('button', { type: 'button', class: (primary ? 'btn-primary btn-auto' : 'btn-secondary') + ' btn-small', text: text, on: { click: onClick } });

    async function load() {
        try {
            data = await api('/api/applications/get?id=' + id);
        } catch (err) {
            show($('page-error'), err.message);
            return;
        }
        render();
    }

    function render() {
        const a = data.application;
        const o = data.options;
        document.title = 'Application ' + a.legal_name + ' · MIPS Dashboard';
        $('app-title').textContent = 'Portal application — ' + a.legal_name;
        $('app-status').textContent = a.status;
        $('app-status').className = 'badge badge-a-' + a.status;

        $('flags').replaceChildren(a.flags.length
            ? el('div', { class: 'notice' }, [el('strong', { text: 'Points to check (computed from the declaration):' }), el('ul', { class: 'flags' }, a.flags.map((f) => el('li', { text: f })))])
            : el('p', { class: 'muted', text: 'No automatic point to check. This is not a risk assessment.' }));

        const rows = [
            ['Legal name', a.legal_name], ['Trading name', a.trading_name], ['BRN', a.brn], ['VAT number', a.vat_number || '—'],
            ['Country of incorporation', a.country_of_incorporation], ['Registered address', a.registered_address],
            ['Sector', o.sectors[a.sector] || a.sector], ['Products and services', a.products_services], ['Website', a.website || '—'],
            ['Countries of operation', a.countries_of_operation],
            ['Payment methods', a.payment_methods.map((m) => o.payment_methods[m] || m).join(', ')],
            ['Expected monthly volume', o.volume_bands[a.monthly_volume_band] || a.monthly_volume_band],
            ['Average ticket', 'MUR ' + money(a.average_ticket_mur)],
            ['Regulated', Number(a.is_regulated) ? 'Yes — ' + (a.regulator || '') : 'No'],
            ['Contact', a.contact_name + (a.contact_role ? ' (' + a.contact_role + ')' : '') + ' · ' + a.contact_phone + ' · ' + a.portal_email],
            ['Sent', a.submitted_at],
        ];
        $('details').replaceChildren(el('dl', { class: 'meta' }, rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: String(v === null ? '' : v) })])));

        renderDecision();
        renderAccount();
    }

    function renderDecision() {
        const a = data.application;
        if (a.status !== 'submitted') {
            $('decision').replaceChildren(
                el('p', { text: (a.status === 'accepted' ? 'Accepted' : 'Declined') + ' on ' + a.decided_at + ' by ' + (a.decided_by_email || '?') + '.' }),
                a.decision_note ? el('p', { class: 'muted', text: 'Note: ' + a.decision_note }) : '',
                a.case_id ? el('p', {}, [el('a', { href: '/onboarding-case.php?id=' + a.case_id, text: 'Open the onboarding case' }), ' · ',
                    el('a', { href: '/merchant.php?id=' + a.merchant_id, text: 'merchant record' })]) : '');
            return;
        }
        const link = el('select', { id: 'link-merchant' }, [el('option', { value: '', text: 'Create a new merchant from this application' }),
            ...data.candidates.map((m) => el('option', { value: m.id, text: 'Link to existing: ' + m.name + (m.legal_name ? ' — ' + m.legal_name : '') + ' (BRN ' + (m.brn || '?') + ', ' + m.status + ')' }))]);
        const note = el('textarea', { id: 'decision-note', rows: '2', placeholder: 'Internal note (required to decline; never sent to the applicant)' });
        const go = (url, body, confirmText) => async function () {
            if (!window.confirm(confirmText)) { return; }
            show($('page-error'), '');
            try {
                const r = await api(url, { method: 'POST', body: body() });
                if (r.case_id) { window.location.assign('/onboarding-case.php?id=' + r.case_id); return; }
                await load();
            } catch (err) {
                show($('page-error'), err.message);
                window.scrollTo(0, 0);
            }
        };
        $('decision').replaceChildren(
            data.candidates.length ? el('p', { class: 'notice', text: data.candidates.length + ' existing merchant(s) share this BRN or name. Link instead of creating a duplicate if it is the same business.' }) : '',
            el('div', { class: 'field' }, [el('label', { for: 'link-merchant', text: 'Merchant record' }), link]),
            el('div', { class: 'field' }, [note]),
            el('div', { class: 'actions' }, [
                btn('Accept and open the onboarding case', go('/api/applications/accept', () => ({ id: id, merchant_id: link.value, note: note.value }),
                    'Accept this application? The applicant will be asked for the KYC documents. This is not an approval.'), true),
                btn('Decline', go('/api/applications/decline', () => ({ id: id, note: note.value }),
                    'Decline this application? The applicant receives a short email without the reason.')),
            ]),
            el('p', { class: 'muted', text: 'Accepting opens the case assigned to you. Approval of the merchant still happens in the case, by another approver (four eyes).' }));
    }

    function renderAccount() {
        const u = data.account;
        if (!u) { $('account').replaceChildren(); return; }
        $('account').replaceChildren(
            table(['Account', 'Email confirmed', 'Two-factor', 'Last sign-in', 'Status', ''], [[
                u.name + ' · ' + u.email + (u.phone ? ' · ' + u.phone : ''), u.email_verified_at || 'no', u.totp_enabled_at ? 'on' : 'not set up',
                u.last_login_at || '—', Number(u.is_active) ? 'active' : 'switched off',
                btn(Number(u.is_active) ? 'Switch off' : 'Switch on', async function () {
                    if (!window.confirm(Number(u.is_active) ? 'Switch this merchant account off? It is signed out at once.' : 'Switch this account back on?')) { return; }
                    try {
                        await api('/api/applications/account-status', { method: 'POST', body: { portal_user_id: u.id, active: !Number(u.is_active) } });
                        await load();
                    } catch (err) {
                        show($('page-error'), err.message);
                    }
                }),
            ]]),
            el('h3', { text: 'Terms of use accepted' }),
            data.consents.length
                ? table(['Version', 'Accepted', 'IP address', 'Text fingerprint (sha256)'], data.consents.map((c) => [
                    c.version + (c.version === data.current_terms_version ? ' (current)' : ''), c.accepted_at, c.ip_address || '', el('code', { class: 'details', text: c.body_sha256 })]))
                : el('p', { class: 'muted', text: 'None.' }));
    }

    load();
})();
