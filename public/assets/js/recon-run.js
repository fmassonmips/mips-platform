/**
 * One reconciliation: summary, % views, gaps by merchant, daily drill-down.
 */
(function () {
    'use strict';

    const { api, el, table, show, money } = window.MIPS;
    const $ = (id) => document.getElementById(id);
    const runId = Number($('run-page').dataset.id);
    const pct = (v) => (v === null || v === undefined ? '—' : v.toFixed(2) + '%');
    const CAT_KEYS = { card_verif: 'amt_card_verif', clearing: 'amt_clearing', watch: 'amt_watch',
        mips_only: 'amt_mips_only', mcb_only: 'amt_mcb_only', real: 'amt_real' };
    let data = null;

    async function load() {
        try {
            data = await api('/api/recon/get?id=' + runId);
        } catch (err) {
            show($('page-error'), err.message);
            return;
        }
        render();
    }

    function render() {
        const r = data.run;
        const s = r.summary || { currencies: {} };
        document.title = 'Recon ' + r.period + ' · MIPS Dashboard';
        $('run-title').textContent = 'MCB vs MIPS — ' + r.period;
        $('run-meta').textContent = 'MCB: ' + r.mcb_name + ' (' + s.files.mcb.rows + ' rows, ' + s.files.mcb.from + ' → ' + s.files.mcb.to + ') · MIPS: '
            + r.mips_name + ' (' + s.files.mips.rows + ' rows, ' + s.files.mips.from + ' → ' + s.files.mips.to + ') · computed ' + r.computed_at
            + (r.created_by_email ? ' by ' + r.created_by_email : '');
        ['summary', 'lines', 'claims'].forEach((k) => { $('x-' + k).href = '/api/recon/export?id=' + runId + '&kind=' + k; });
        $('warnings').replaceChildren(...r.warnings.map((w) => el('li', { class: w.startsWith('BLOCKING') ? 'error-left' : null, text: w })));

        const curs = Object.keys(s.currencies);
        const prev = data.previous && data.previous.summary ? data.previous.summary.currencies : {};
        const rows = [['MCB total', (c) => c.mcb], ['MIPS total', (c) => c.mips], ['Gap (MCB − MIPS)', (c) => c.diff]]
            .concat(Object.entries(data.labels).map(([k, label]) => [label, (c) => c.categories[k]]))
            .concat([['Unexplained', (c) => c.unexplained]]);
        $('summary').replaceChildren(table(['', ...curs],
            rows.map(([label, f]) => ({
                className: label.startsWith('Gap') || label === 'Unexplained' ? 'row-strong' : null,
                cells: [label, ...curs.map((c) => money(f(s.currencies[c])))],
            })), curs.map((_, i) => i + 1)));

        const views = [['Global', 'global'], ['Excluding watch-list MIDs', 'excl_watch'], ['Bundle merchants only (order_is_bundled = 1)', 'bundle'], ['Real gap only', 'real']];
        $('pct').replaceChildren(table(['View', ...curs.flatMap((c) => [c, c + ' prev. month'])],
            views.map(([label, k]) => [label, ...curs.flatMap((c) => [pct(s.currencies[c].pct[k]), prev[c] ? pct(prev[c].pct[k]) : '—'])]),
            curs.flatMap((_, i) => [i * 2 + 1, i * 2 + 2])));
        $('global-pct').textContent = 'All currencies added without conversion (indicative only): ' + pct(s.global_pct_mixed_currencies)
            + (data.previous ? '' : ' · No reconciliation for the previous month to compare with.');

        $('watch-cum').replaceChildren(data.watch_cumulative.length
            ? el('p', { class: 'notice', text: 'Watch-list MIDs, cumulative to date: ' + data.watch_cumulative.map((w) =>
                w.currency + ' ' + money(w.total) + ' over ' + w.months + ' month(s)').join(' · ') })
            : '');

        $('suggestions').replaceChildren(data.remap_suggestions.length
            ? el('div', {}, [
                el('h3', { text: 'Possible MID remaps' }),
                el('p', { class: 'muted', text: 'One-sided gaps that cancel out in the same currency: probably one merchant under two MIDs. Check before adding the remap in Settings.' }),
                table(['MCB MID', 'MIPS MID', 'Merchant', 'Currency', 'MCB', 'MIPS'], data.remap_suggestions.map((x) =>
                    [x.mcb_mid, x.mips_mid, x.merchant || '', x.currency, money(x.mcb_amount), money(x.mips_amount)]), [4, 5]),
            ])
            : '');

        const fc = $('f-cat');
        if (fc.options.length === 1) {
            fc.append(...Object.entries(data.labels).map(([k, label]) => el('option', { value: k, text: label })));
            $('f-cur').append(...curs.map((c) => el('option', { value: c, text: c })));
        }
        renderLines();
    }

    function renderLines() {
        const cat = $('f-cat').value;
        const cur = $('f-cur').value;
        const lines = data.lines.filter((l) => Number(l.diff) !== 0
            && (!cur || l.currency === cur) && (!cat || Number(l[CAT_KEYS[cat]]) !== 0));
        const catLabel = (l) => Object.entries(CAT_KEYS).filter(([, col]) => Number(l[col]) !== 0).map(([k]) => data.labels[k]).join(', ');
        $('lines').replaceChildren(lines.length
            ? table(['MID', 'Merchant', 'Cur.', 'MCB', 'MIPS', 'Gap', 'Category', 'Real gap', ''],
                lines.map((l) => ({
                    className: Number(l.amt_real) !== 0 ? 'warn' : null,
                    cells: [l.mid,
                        l.merchant_id ? el('a', { href: '/merchant.php?id=' + l.merchant_id, text: l.merchant_name || '' }) : (l.merchant_name || '—'),
                        l.currency, money(l.mcb_amount), money(l.mips_amount), money(l.diff), catLabel(l), money(l.amt_real),
                        el('button', { type: 'button', class: 'btn-secondary btn-small', text: 'Days' + (Number(l.claim_items) ? ' · ' + l.claim_items + ' txn' : ''),
                            on: { click: () => drill(l) } })],
                })), [3, 4, 5, 7])
            : el('p', { class: 'muted', text: 'No line in this selection.' }));
    }

    async function drill(l) {
        const d = await api('/api/recon/daily?line_id=' + l.id);
        $('drill-card').hidden = false;
        $('drill-title').textContent = 'Daily detail — MID ' + l.mid + ' ' + (l.merchant_name || '') + ' (' + l.currency + ')';
        const days = d.days.filter((x) => Number(x.diff) !== 0);
        $('drill-days').replaceChildren(days.length
            ? table(['Day', 'MCB', 'MIPS', 'Gap'], days.map((x) => [x.day, money(x.mcb_amount), money(x.mips_amount), money(x.diff)]), [1, 2, 3])
            : el('p', { class: 'muted', text: 'No daily gap (the gap is a total-level effect, e.g. card verifications).' }));
        $('drill-claims').replaceChildren(d.claims.length
            ? table(['Date', 'Reference', 'Network', 'Amount'], d.claims.map((c) => [c.txn_at, c.reference || '', c.network || '', money(c.amount)]), [3])
            : el('p', { class: 'muted', text: Number(l.amt_real) > 0 ? 'MCB has more than MIPS here: no MIPS transaction to list.' : 'None.' }));
        $('drill-card').scrollIntoView({ behavior: 'smooth' });
    }

    $('f-cat').addEventListener('change', renderLines);
    $('f-cur').addEventListener('change', renderLines);
    $('recompute-btn').addEventListener('click', async function () {
        this.disabled = true;
        try {
            await api('/api/recon/recompute', { method: 'POST', body: { id: runId } });
            await load();
        } catch (err) {
            show($('page-error'), err.message);
        } finally {
            this.disabled = false;
        }
    });

    load();
})();
