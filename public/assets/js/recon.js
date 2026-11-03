/**
 * Reconciliation home: new run, run list, remap and watch-list settings.
 */
(function () {
    'use strict';

    const { api, el, table, show, money } = window.MIPS;
    const $ = (id) => document.getElementById(id);

    async function loadRuns() {
        const { runs } = await api('/api/recon/runs');
        $('runs').replaceChildren(runs.length
            ? table(['Month', 'Files', 'Gap by currency', 'Real gap', 'Warnings', 'Run by', 'Computed'],
                runs.map((r) => [
                    el('a', { href: '/recon-run.php?id=' + r.id, text: r.period + ' #' + r.id }),
                    r.mcb_name + ' / ' + r.mips_name,
                    Object.entries(r.currencies).map(([c, v]) => c + ' ' + money(v.diff) + (v.pct === null ? '' : ' (' + v.pct.toFixed(2) + '%)')).join(' · '),
                    Object.entries(r.currencies).filter(([, v]) => v.real !== 0).map(([c, v]) => c + ' ' + money(v.real)).join(' · ') || '0',
                    String(r.warning_count), r.created_by || '', r.computed_at || '',
                ]))
            : el('p', { class: 'muted', text: 'No reconciliation yet.' }));
    }

    async function loadSettings() {
        const s = await api('/api/recon/settings');
        const del = (url, id) => el('button', { type: 'button', class: 'btn-secondary btn-small', text: 'Remove', on: { click: async function () {
            if (!window.confirm('Remove this entry? Recompute the reconciliations it affects.')) { return; }
            try { await api(url, { method: 'POST', body: { id: id } }); await loadSettings(); } catch (err) { show($('settings-error'), err.message); }
        } } });
        $('remaps').replaceChildren(table(['From', 'Counted as', 'Merchant', ''], s.remaps.map((r) => [r.from_mid, r.to_mid, r.label || '', del('/api/recon/remap-delete', r.id)])));
        $('watch').replaceChildren(table(['MID', 'Label', ''], s.watch.map((w) => [w.mid, w.label || '', del('/api/recon/watch-delete', w.id)])));
    }

    function settingForm(form, url) {
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            show($('settings-error'), '');
            try {
                await api(url, { method: 'POST', body: Object.fromEntries(new FormData(form).entries()) });
                form.reset();
                await loadSettings();
            } catch (err) {
                show($('settings-error'), err.message);
            }
        });
    }
    settingForm($('remap-form'), '/api/recon/remap-add');
    settingForm($('watch-form'), '/api/recon/watch-add');

    $('run-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        show($('run-error'), '');
        const btn = $('run-btn');
        btn.disabled = true;
        btn.textContent = 'Reconciling… (large files take a minute)';
        try {
            const data = await api('/api/recon/run', { method: 'POST', body: new FormData(this) });
            window.location.assign('/recon-run.php?id=' + data.id);
        } catch (err) {
            show($('run-error'), err.message);
            btn.disabled = false;
            btn.textContent = 'Reconcile';
        }
    });

    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    $('r-period').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

    loadRuns().catch((err) => show($('run-error'), err.message));
    loadSettings().catch((err) => show($('settings-error'), err.message));
})();
