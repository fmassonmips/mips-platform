/**
 * Audit log viewer (read-only).
 */
(function () {
    'use strict';

    const { api, el, table, show } = window.MIPS;

    const form     = document.getElementById('audit-filters');
    const box      = document.getElementById('audit');
    const errBox   = document.getElementById('audit-error');
    const prevBtn  = document.getElementById('prev-page');
    const nextBtn  = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');
    let page = 1;

    async function load() {
        show(errBox, '');
        const params = new URLSearchParams();
        new FormData(form).forEach((v, k) => { if (String(v).trim() !== '') { params.set(k, String(v).trim()); } });
        params.set('page', String(page));
        try {
            const data = await api('/api/audit/list?' + params.toString());
            const pages = Math.max(1, Math.ceil(data.total / data.per_page));
            pageInfo.textContent = 'Page ' + data.page + ' of ' + pages + ' · ' + data.total + ' entries';
            prevBtn.disabled = data.page <= 1;
            nextBtn.disabled = data.page >= pages;
            box.replaceChildren(table(['When', 'User', 'Action', 'Entity', 'Details', 'IP'],
                data.entries.map((e) => [
                    e.created_at, e.user_email || '(anonymous)', e.action,
                    e.entity_type ? e.entity_type + (e.entity_id ? ' #' + e.entity_id : '') : '',
                    e.details ? el('code', { class: 'details', text: JSON.stringify(e.details) }) : '',
                    e.ip_address || '',
                ])));
        } catch (err) {
            show(errBox, err.message);
        }
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); page = 1; load(); });
    prevBtn.addEventListener('click', function () { page = Math.max(1, page - 1); load(); });
    nextBtn.addEventListener('click', function () { page += 1; load(); });
    load();
})();
