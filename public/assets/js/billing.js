/**
 * Billing page: invoices per month and fee rules.
 */
(function () {
    'use strict';

    const { api, el, table, show, int, money } = window.MIPS;

    const select      = document.getElementById('period-select');
    const generateBtn = document.getElementById('generate-btn');
    const exportLink  = document.getElementById('export-link');
    const msgBox      = document.getElementById('billing-msg');
    const errBox      = document.getElementById('billing-error');
    const invoicesBox = document.getElementById('invoices');
    const ruleForm    = document.getElementById('rule-form');
    const ruleErr     = document.getElementById('rule-error');
    const rulesBox    = document.getElementById('rules');
    const merchantSel = document.getElementById('rule-merchant');

    const nextActions = { draft: ['issued', 'void'], issued: ['paid', 'void'], paid: [], void: [] };
    const actionLabel = { issued: 'Issue', paid: 'Mark paid', void: 'Void' };
    const confirmText = {
        issued: 'Issue this invoice? It gets a definitive number and can no longer be regenerated.',
        paid: 'Mark this invoice as paid?',
        void: 'Void this invoice? This cannot be undone.',
    };

    async function loadPeriods() {
        const data = await api('/api/reports/periods');
        select.replaceChildren(...data.periods.map((p) => el('option', { value: p, text: p })));
        generateBtn.disabled = data.periods.length === 0;
        if (!data.periods.length) {
            invoicesBox.replaceChildren(el('p', { class: 'muted', text: 'Import transactions in Reports first.' }));
            return;
        }
        await loadInvoices();
    }

    async function loadInvoices() {
        const period = select.value;
        exportLink.href = '/api/billing/export?period=' + encodeURIComponent(period);
        const { invoices } = await api('/api/billing/invoices?period=' + encodeURIComponent(period));
        if (!invoices.length) {
            invoicesBox.replaceChildren(el('p', { class: 'muted', text: 'No invoices for ' + period + '. Generate drafts.' }));
            return;
        }

        const totals = {};
        invoices.filter((i) => i.status !== 'void').forEach(function (i) {
            totals[i.currency] = (totals[i.currency] || 0) + Number(i.total);
        });

        invoicesBox.replaceChildren(
            el('p', { class: 'muted', text: 'Total invoiced (excl. void): ' + Object.entries(totals).map(([c, v]) => c + ' ' + money(v)).join(' · ') }),
            table(['Number', 'Merchant', 'Cur.', 'Txn', 'Volume', 'Subtotal', 'VAT', 'Total', 'Status', ''],
                invoices.map((i) => ({
                    className: i.status === 'void' ? 'row-muted' : (Number(i.unpriced_lines) > 0 ? 'warn' : null),
                    cells: [
                        el('a', { href: '/invoice.php?id=' + i.id, target: '_blank', rel: 'noopener', text: i.number || 'Draft #' + i.id }),
                        i.merchant_name + (Number(i.unpriced_lines) > 0 ? ' (no fee rule on ' + i.unpriced_lines + ' line(s))' : ''),
                        i.currency, int(i.txn_count), money(i.volume), money(i.subtotal), money(i.vat_amount), money(i.total),
                        el('span', { class: 'badge badge-' + i.status, text: i.status }),
                        el('span', { class: 'actions' }, nextActions[i.status].map((s) =>
                            el('button', { type: 'button', class: 'btn-secondary btn-small', text: actionLabel[s], on: { click: () => setStatus(i.id, s) } }))),
                    ],
                })),
                [3, 4, 5, 6, 7])
        );
    }

    async function setStatus(id, status) {
        if (!window.confirm(confirmText[status])) { return; }
        show(errBox, '');
        try {
            await api('/api/billing/invoice-status', { method: 'POST', body: { id: id, status: status } });
            await loadInvoices();
        } catch (err) {
            show(errBox, err.message);
        }
    }

    generateBtn.addEventListener('click', async function () {
        show(errBox, '');
        show(msgBox, '');
        generateBtn.disabled = true;
        try {
            const { result } = await api('/api/billing/generate', { method: 'POST', body: { period: select.value } });
            let msg = result.created + ' draft invoice(s) generated.';
            if (result.skipped_locked) { msg += ' ' + result.skipped_locked + ' already issued, left unchanged.'; }
            if (result.unpriced_lines) { msg += ' Warning: ' + result.unpriced_lines + ' line(s) have no matching fee rule and bill at 0.'; }
            show(msgBox, msg);
            await loadInvoices();
        } catch (err) {
            show(errBox, err.message);
        } finally {
            generateBtn.disabled = false;
        }
    });

    async function loadRules() {
        const { fee_rules: rules } = await api('/api/billing/fee-rules');
        const any = (v) => (v === null || v === '' ? 'any' : v);
        rulesBox.replaceChildren(rules.length
            ? table(['Merchant', 'Rail', 'Type', 'Channel', 'Rate %', 'Fixed', 'From', 'To', 'Status', ''],
                rules.map((r) => ({
                    className: Number(r.is_active) ? null : 'row-muted',
                    cells: [any(r.merchant_name), any(r.sof_proc_nickname), any(r.rail_type), any(r.channel),
                        Number(r.rate_pct).toFixed(4), money(r.fixed_fee), r.valid_from, r.valid_to || 'open',
                        Number(r.is_active) ? 'active' : 'disabled',
                        Number(r.is_active)
                            ? el('button', { type: 'button', class: 'btn-secondary btn-small', text: 'Disable', on: { click: () => disableRule(r.id) } })
                            : ''],
                })),
                [4, 5])
            : el('p', { class: 'muted', text: 'No fee rules yet. Without rules, every invoice line bills at 0.' }));
    }

    async function disableRule(id) {
        if (!window.confirm('Disable this rule? Existing invoices keep their amounts; regenerate drafts to apply.')) { return; }
        try {
            await api('/api/billing/fee-rule-disable', { method: 'POST', body: { id: id } });
            await loadRules();
        } catch (err) {
            show(ruleErr, err.message);
        }
    }

    ruleForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        show(ruleErr, '');
        const body = Object.fromEntries(new FormData(ruleForm).entries());
        try {
            await api('/api/billing/fee-rule', { method: 'POST', body: body });
            ruleForm.reset();
            await loadRules();
        } catch (err) {
            show(ruleErr, err.message);
        }
    });

    async function loadMerchants() {
        const { merchants } = await api('/api/billing/merchants');
        merchantSel.replaceChildren(el('option', { value: '', text: 'Any merchant' }),
            ...merchants.map((m) => el('option', { value: m.id, text: m.name })));
    }

    select.addEventListener('change', () => loadInvoices().catch((err) => show(errBox, err.message)));
    loadPeriods().catch((err) => show(errBox, err.message));
    loadRules().catch((err) => show(ruleErr, err.message));
    loadMerchants().catch((err) => show(ruleErr, err.message));
})();
