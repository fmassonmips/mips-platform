/**
 * Merchant directory: list, filters, contract alerts, creation.
 */
(function () {
    'use strict';

    const { api, el, table, show, money } = window.MIPS;
    const $ = (id) => document.getElementById(id);

    const form    = $('filters');
    const errBox  = $('list-error');
    const newForm = $('new-form');
    let statuses  = [];

    function statusBadge(s) {
        return el('span', { class: 'badge badge-m-' + s, text: s });
    }

    async function loadAlerts() {
        const data = await api('/api/merchants/expiring');
        $('alerts-card').hidden = data.contracts.length === 0;
        $('alerts-intro').textContent = 'Signed contracts whose end date or notice deadline falls within ' + data.days + ' days (or ended in the last 30 days).';
        $('alerts').replaceChildren(table(['Merchant', 'Contract', 'Notice deadline', 'End date', 'Auto-renew', ''],
            data.contracts.map(function (c) {
                const d = Number(c.days_to_deadline);
                const e = Number(c.days_to_end);
                const when = e < 0 ? 'ended ' + (-e) + ' day(s) ago'
                    : d < 0 ? 'notice deadline passed ' + (-d) + ' day(s) ago'
                    : d === 0 ? 'notice deadline today' : 'in ' + d + ' day(s)';
                return {
                    className: d <= 30 ? 'warn' : null,
                    cells: [
                        el('a', { href: '/merchant.php?id=' + c.merchant_id, text: c.merchant_name }),
                        c.type + (c.reference ? ' · ' + c.reference : ''),
                        (c.notice_days ? c.notice_deadline : '—'), c.end_date,
                        Number(c.auto_renew) ? 'yes' : 'no', when,
                    ],
                };
            })));
    }

    async function load() {
        show(errBox, '');
        try {
            const data = await api('/api/merchants/list?' + new URLSearchParams(new FormData(form)).toString());
            if (!statuses.length) {
                statuses = data.statuses;
                $('f-status').append(...statuses.map((s) => el('option', { value: s, text: s })));
                $('n-status').replaceChildren(...statuses.map((s) => el('option', { value: s, text: s, selected: s === 'prospect' })));
            }
            $('counts').textContent = statuses.map((s) => (data.counts[s] || 0) + ' ' + s).join(' · ');
            $('merchants').replaceChildren(data.merchants.length
                ? table(['Merchant', 'Legal name', 'Status', 'Account manager', 'Primary contact', 'Signed contracts',
                        'Last month', 'MUR volume ' + (data.last_period || '')],
                    data.merchants.map((m) => ({
                        className: m.status === 'terminated' ? 'row-muted' : null,
                        cells: [
                            el('a', { href: '/merchant.php?id=' + m.id, text: m.name }),
                            m.legal_name || '', statusBadge(m.status), m.account_manager || m.account_manager_email || '',
                            m.primary_contact || '', String(m.signed_contracts), m.last_period || '—', money(m.last_mur_vol),
                        ],
                    })), [5, 7])
                : el('p', { class: 'muted', text: 'No merchants match.' }));
        } catch (err) {
            show(errBox, err.message);
        }
    }

    $('new-btn').addEventListener('click', function () {
        newForm.hidden = !newForm.hidden;
        if (!newForm.hidden) { $('n-name').focus(); }
    });

    newForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        show(errBox, '');
        try {
            const body = Object.fromEntries(new FormData(newForm).entries());
            body.is_billable = true;
            const data = await api('/api/merchants/save', { method: 'POST', body: body });
            window.location.assign('/merchant.php?id=' + data.id);
        } catch (err) {
            show(errBox, err.message);
        }
    });

    form.addEventListener('submit', function (e) { e.preventDefault(); load(); });
    $('f-status').addEventListener('change', load);
    load();
    loadAlerts().catch(() => { /* alerts are secondary */ });
})();
