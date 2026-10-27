/**
 * Reports page: Commission_Data import + monthly report.
 */
(function () {
    'use strict';

    const { api, el, table, show, int, money, pct } = window.MIPS;

    const form       = document.getElementById('import-form');
    const fileEl     = document.getElementById('import-file');
    const periodEl   = document.getElementById('import-period');
    const importBtn  = document.getElementById('import-btn');
    const importErr  = document.getElementById('import-error');
    const importRes  = document.getElementById('import-result');
    const select     = document.getElementById('period-select');
    const exportLink = document.getElementById('export-link');
    const exportXlsx = document.getElementById('export-xlsx');
    const reportBox  = document.getElementById('report');
    const reportErr  = document.getElementById('report-error');
    const emptyMsg   = document.getElementById('report-empty');
    const $trendCard = document.getElementById('trend-card');
    const $trendRange = document.getElementById('trend-range');
    const $trend     = document.getElementById('trend');

    async function loadPeriods(selected) {
        const data = await api('/api/reports/periods');
        select.replaceChildren(...data.periods.map((p) => el('option', { value: p, text: p })));
        emptyMsg.hidden = data.periods.length > 0;
        exportLink.hidden = data.periods.length === 0;
        exportXlsx.hidden = data.periods.length === 0;
        if (data.periods.length) {
            select.value = selected && data.periods.includes(selected) ? selected : data.periods[0];
            await loadReport();
        } else {
            reportBox.replaceChildren();
        }
    }

    // Categorical slots in fixed order (validated palette, light surface).
    const SLOT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];

    function delta(v, label) {
        if (v === null || v === undefined) { return el('span', { text: 'no ' + label + ' to compare' }); }
        // Arrow + sign carry the direction; colour only reinforces it.
        return el('span', { class: v >= 0 ? 'delta-up' : 'delta-down', text: (v >= 0 ? '▲ ' : '▼ ') + pct(v) + ' ' + label });
    }

    async function loadTrend(period) {
        const { trend } = await api('/api/reports/trend?to=' + encodeURIComponent(period));
        const t = trend.series;
        const P = trend.periods;
        const hl = trend.headline;
        const chart = MIPS.lineChart;
        $trendCard.hidden = false;
        $trendRange.textContent = P[0] + ' → ' + P[P.length - 1] + ' · ' + trend.imported + ' of ' + P.length + ' months imported';

        $trend.replaceChildren(
            el('div', { class: 'hero' }, [
                el('div', { class: 'hero-label', text: 'MUR volume, ' + hl.period }),
                el('div', { class: 'hero-value', text: hl.total === null ? '—' : money(hl.total) }),
                el('div', { class: 'hero-delta' }, [delta(hl.mom, 'vs previous month'), ' · ', delta(hl.yoy, 'vs ' + hl.yoy_period)]),
            ]),
            chart({ title: 'MUR volume, all channels', periods: P, format: money,
                series: [{ label: 'MUR volume', color: SLOT[0], values: t.total }] }),
            el('div', { class: 'viz-grid-2' }, [
                chart({ title: 'MUR volume by channel', periods: P, format: money,
                    series: [{ label: 'TPE', color: SLOT[0], values: t.tpe }, { label: 'Online', color: SLOT[1], values: t.online }] }),
                chart({ title: 'MUR volume by rail type', subtitle: 'Push-to-phone shown on its own, never inside QR', periods: P, format: money,
                    series: [{ label: 'Card', color: SLOT[0], values: t.rail_CARD }, { label: 'QR', color: SLOT[1], values: t.rail_QR },
                        { label: 'Push', color: SLOT[2], values: t.rail_PUSH }, { label: 'Other', color: SLOT[3], values: t.rail_OTHER }] }),
                chart({ title: 'Transactions (all currencies)', periods: P, format: int, integer: true,
                    series: [{ label: 'Transactions', color: SLOT[0], values: t.txn }] }),
                chart({ title: 'Active merchants', periods: P, format: int, integer: true,
                    series: [{ label: 'Active merchants', color: SLOT[0], values: t.merchants }] }),
            ])
        );
    }

    async function loadReport() {
        const period = select.value;
        loadTrend(period).catch((err) => show(reportErr, err.message));
        exportLink.href = '/api/reports/export?period=' + encodeURIComponent(period);
        exportXlsx.href = exportLink.href + '&format=xlsx';
        show(reportErr, '');
        try {
            const { report } = await api('/api/reports/monthly?period=' + encodeURIComponent(period));
            render(report);
        } catch (err) {
            reportBox.replaceChildren();
            show(reportErr, err.message);
        }
    }

    function line(report, label) {
        return report.lines.find((l) => l.label === label) || { mur_vol: 0, txn: 0, mom_vol: null };
    }

    function kpi(label, value, sub) {
        return el('div', { class: 'kpi' }, [
            el('div', { class: 'kpi-label', text: label }),
            el('div', { class: 'kpi-value', text: value }),
            sub ? el('div', { class: 'kpi-sub', text: sub }) : null,
        ]);
    }

    function render(r) {
        const prev = r.previous_period;
        const momLabel = (v) => (prev ? pct(v) + ' vs ' + prev : 'no previous month imported');
        const tpe = line(r, 'TPE total');
        const onl = line(r, 'Online total (all rails)');
        const gw  = line(r, 'Ecom gateways (strict)');
        const totalVol = tpe.mur_vol + onl.mur_vol;
        const prevTotal = (tpe.prev_mur_vol || 0) + (onl.prev_mur_vol || 0);
        const c = r.cleaning;

        const linesTable = table(
            ['Line', 'Txn', 'MUR txn', 'MUR volume', 'Avg ticket', 'Non-MUR txn', prev ? 'MUR vol ' + prev : 'Prev vol', 'MoM vol', 'MoM txn'],
            r.lines.map((l) => ({
                className: /total|strict|all$/.test(l.label) ? 'row-strong' : null,
                cells: [l.label, int(l.txn), int(l.mur_txn), money(l.mur_vol), money(l.avg_ticket), int(l.fx_txn),
                    money(l.prev_mur_vol), pct(l.mom_vol), pct(l.mom_txn)],
            })),
            [1, 2, 3, 4, 5, 6, 7, 8]
        );

        reportBox.replaceChildren(
            el('div', { class: 'kpis' }, [
                kpi('MUR volume', money(totalVol), prev && prevTotal ? momLabel(totalVol / prevTotal - 1) : momLabel(null)),
                kpi('TPE', money(tpe.mur_vol), momLabel(tpe.mom_vol)),
                kpi('Online', money(onl.mur_vol), momLabel(onl.mom_vol)),
                kpi('Ecom gateways', money(gw.mur_vol), momLabel(gw.mom_vol)),
                kpi('Transactions', int(tpe.txn + onl.txn), null),
            ]),
            el('h3', { text: 'Verify before use' }),
            el('ul', { class: 'flags' }, r.flags.map((f) => el('li', { text: f }))),
            el('h3', { text: 'Cleaning' }),
            el('p', { class: 'muted', text: 'Source: ' + c.filename + ', imported ' + c.imported_at }),
            table(['Raw rows', 'Not SUCCESS', 'Test', 'Refund-only', 'Refunds reported', 'Clean rows'],
                [[int(c.rows_raw), int(c.rows_not_success), int(c.rows_test), int(c.rows_refund_only), money(c.refund_total_reported), int(c.rows_clean)]],
                [0, 1, 2, 3, 4, 5]),
            el('h3', { text: 'Lines' }),
            linesTable,
            el('h3', { text: 'Merchant segments' }),
            table(['Active forms', 'TPE only', 'Online only', 'Both'],
                [[int(r.segments.active_forms), int(r.segments.tpe_only), int(r.segments.online_only), int(r.segments.both)]], [0, 1, 2, 3]),
            el('h3', { text: 'Top merchants (MUR)' }),
            table(['Merchant', 'Txn', 'MUR volume', 'Prev', 'MoM'],
                r.top_merchants.map((m) => [m.merchant, int(m.txn), money(m.mur_vol), money(m.prev_mur_vol), pct(m.mom_vol)]), [1, 2, 3, 4]),
            el('h3', { text: 'Non-MUR (not converted)' }),
            r.fx.length
                ? table(['Currency', 'Txn', 'Volume'], r.fx.map((f) => [f.currency, int(f.txn), money(f.vol)]), [1, 2])
                : el('p', { class: 'muted', text: 'None.' })
        );
    }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        show(importErr, '');
        importRes.hidden = true;
        if (!fileEl.files.length) {
            show(importErr, 'Choose a file.');
            return;
        }
        const fd = new FormData();
        fd.append('file', fileEl.files[0]);
        fd.append('period', periodEl.value.trim());

        importBtn.disabled = true;
        importBtn.textContent = 'Importing…';
        try {
            const { result } = await api('/api/reports/import', { method: 'POST', body: fd });
            const months = Object.keys(result.periods);
            const notes = [];
            if (result.replaced_periods.length) { notes.push('Replaced previous data for ' + result.replaced_periods.join(', ') + '.'); }
            if (result.rows_bad_date) { notes.push(result.rows_bad_date + ' rows dropped: unreadable date in ' + result.date_column + '.'); }
            if (result.rows_bad_amount) { notes.push(result.rows_bad_amount + ' rows dropped: non-numeric somme_totale.'); }
            importRes.replaceChildren(
                el('p', { class: 'success-left', text: 'Imported ' + int(result.rows_clean) + ' clean rows out of ' + int(result.rows_raw) + ' for ' + months.join(', ') + '.' }),
                ...notes.map((n) => el('p', { class: 'notice', text: n }))
            );
            importRes.hidden = false;
            form.reset();
            await loadPeriods(months[months.length - 1]);
        } catch (err) {
            show(importErr, err.message);
        } finally {
            importBtn.disabled = false;
            importBtn.textContent = 'Import';
        }
    });

    select.addEventListener('change', loadReport);
    loadPeriods().catch((err) => show(reportErr, err.message));
})();
