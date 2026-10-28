/**
 * Onboarding cases list and alerts (overdue, periodic reviews, expiring IDs).
 */
(function () {
    'use strict';

    const { api, el, table, show } = window.MIPS;
    const $ = (id) => document.getElementById(id);
    const link = (id, text) => el('a', { href: '/onboarding-case.php?id=' + id, text: text });

    async function loadAlerts() {
        const a = await api('/api/onboarding/alerts');
        const blocks = [];
        if (a.overdue.length) {
            blocks.push(el('h3', { text: 'Overdue cases' }),
                table(['Merchant', 'Status', 'Due'], a.overdue.map((c) => [link(c.id, c.merchant_name), c.status.replace('_', ' '), c.due_date])));
        }
        if (a.reviews_due.length) {
            blocks.push(el('h3', { text: 'Periodic KYC reviews due (60 days)' }),
                table(['Merchant', 'Risk', 'Review due', ''], a.reviews_due.map((c) => [
                    el('a', { href: '/merchant.php?id=' + c.merchant_id, text: c.merchant_name }), c.risk_rating, c.next_review_date,
                    'Start the review from the merchant record'])));
        }
        if (a.documents_expiring.length) {
            blocks.push(el('h3', { text: 'Identity documents expiring (60 days)' }),
                table(['Merchant', 'Person', 'Document', 'Expires'], a.documents_expiring.map((d) => [
                    link(d.case_id, d.merchant_name), d.full_name || '', d.requirement, d.expires_at])));
        }
        $('alerts-card').hidden = blocks.length === 0;
        $('alerts').replaceChildren(...blocks);
    }

    async function load() {
        show($('list-error'), '');
        try {
            const { cases } = await api('/api/onboarding/list?' + new URLSearchParams(new FormData($('filters'))).toString());
            $('cases').replaceChildren(cases.length
                ? table(['Merchant', 'Type', 'Status', 'Documents', 'Risk', 'Analyst', 'Due', 'Next review'],
                    cases.map((c) => ({
                        className: c.overdue ? 'warn' : null,
                        cells: [link(c.id, c.merchant_name + (c.legal_name ? ' — ' + c.legal_name : '')),
                            c.kind === 'periodic_review' ? 'Periodic review' : 'Onboarding',
                            el('span', { class: 'badge badge-k-' + c.status, text: c.status.replace('_', ' ') }),
                            c.accepted + ' / ' + c.required + ' accepted' + (c.pending_review ? ' · ' + c.pending_review + ' to review' : ''),
                            c.risk_rating || '—', c.assigned || '—', (c.due_date || '—') + (c.overdue ? ' (overdue)' : ''), c.next_review_date || ''],
                    })))
                : el('p', { class: 'muted', text: 'No case in this selection.' }));
        } catch (err) {
            show($('list-error'), err.message);
        }
    }

    async function loadApplications() {
        show($('app-error'), '');
        try {
            const { applications } = await api('/api/applications/list?status=' + encodeURIComponent($('a-status').value));
            $('applications').replaceChildren(applications.length
                ? table(['Applicant', 'BRN', 'Sector', 'Monthly volume', 'Points to check', 'Status', 'Sent'],
                    applications.map((a) => ({
                        className: a.status === 'submitted' && a.flags.length ? 'warn' : null,
                        cells: [el('a', { href: '/application.php?id=' + a.id, text: a.legal_name + (a.trading_name !== a.legal_name ? ' (' + a.trading_name + ')' : '') }),
                            a.brn, a.sector_label, a.volume_label, a.flags.length ? String(a.flags.length) : '—',
                            el('span', { class: 'badge badge-a-' + a.status, text: a.status }), a.submitted_at.slice(0, 16)],
                    })))
                : el('p', { class: 'muted', text: 'No application in this selection.' }));
        } catch (err) {
            show($('app-error'), err.message);
        }
    }
    $('a-status').addEventListener('change', loadApplications);
    loadApplications();

    $('filters').addEventListener('submit', (e) => { e.preventDefault(); load(); });
    $('f-status').addEventListener('change', load);
    load();
    loadAlerts().catch(() => { /* secondary */ });
})();
