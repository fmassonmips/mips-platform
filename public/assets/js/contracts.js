/**
 * Policies (contracts) list page.
 * List + search + status filter, with a create/edit modal. Rows highlight
 * policies that are expired or close to their expiry date.
 */
(function () {
    'use strict';

    var App = window.App;
    var rows    = document.getElementById('rows');
    var empty   = document.getElementById('empty');
    var loading = document.getElementById('loading');
    var search  = document.getElementById('search');
    var filter  = document.getElementById('status-filter');
    var form    = document.getElementById('contract-form');
    var title   = document.getElementById('contract-modal-title');
    var saveBtn = document.getElementById('contract-save');

    var searchTimer = null;

    function daysUntil(dateStr) {
        var d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.round((d - today) / 86400000);
    }

    function statusBadge(status) {
        return '<span class="badge status-' + App.escapeHtml(status) + '">' +
            App.escapeHtml(App.t('contract.status.' + status)) + '</span>';
    }

    function render(list) {
        loading.hidden = true;
        rows.innerHTML = '';
        empty.hidden = list.length > 0;

        list.forEach(function (ct) {
            var tr = document.createElement('tr');
            var endCell = App.fmtDate(ct.end_date);
            if (ct.status === 'active') {
                var dleft = daysUntil(ct.end_date);
                if (dleft < 0) { tr.classList.add('row-overdue'); }
                else if (dleft <= 30) { tr.classList.add('row-warning'); }
            }
            tr.innerHTML =
                '<td><a class="row-link" href="/client.php?id=' + ct.client_id + '">' + App.escapeHtml(ct.client_name) + '</a></td>' +
                '<td>' + App.escapeHtml(ct.policy_number) + '</td>' +
                '<td>' + App.escapeHtml(ct.insurer) + '</td>' +
                '<td>' + App.escapeHtml(App.t('contract.type.' + ct.type)) + '</td>' +
                '<td class="num">' + App.fmtMoney(ct.premium) + '</td>' +
                '<td>' + endCell + '</td>' +
                '<td>' + statusBadge(ct.status) + '</td>' +
                '<td class="actions-col">' +
                    '<button type="button" class="btn-link" data-edit="' + ct.id + '">' + App.escapeHtml(App.t('common.edit')) + '</button>' +
                    '<button type="button" class="btn-link danger" data-del="' + ct.id + '">' + App.escapeHtml(App.t('common.delete')) + '</button>' +
                '</td>';
            rows.appendChild(tr);
        });
    }

    function load() {
        var params = [];
        var q = search.value.trim();
        if (q) { params.push('q=' + encodeURIComponent(q)); }
        if (filter.value) { params.push('status=' + encodeURIComponent(filter.value)); }
        App.api('GET', '/api/contracts' + (params.length ? '?' + params.join('&') : '')).then(function (r) {
            if (r.ok) { render(r.data.data || []); }
            else { App.toast(App.t('msg.load_error'), 'error'); }
        });
    }

    function openNew() {
        App.fillForm(form, { type: 'auto', status: 'active', premium: '0', commission_rate: '0' });
        title.textContent = App.t('contracts.new');
        App.openModal('contract-modal');
        document.getElementById('ct-client').focus();
    }

    function openEdit(id) {
        App.api('GET', '/api/contracts?id=' + id).then(function (r) {
            if (!r.ok) { App.toast(App.t('msg.load_error'), 'error'); return; }
            App.fillForm(form, r.data.data);
            title.textContent = App.t('contracts.edit');
            App.openModal('contract-modal');
        });
    }

    function save(ev) {
        ev.preventDefault();
        var body = App.serializeForm(form);
        var id = body.id;
        delete body.id;
        saveBtn.disabled = true;
        App.api(id ? 'PUT' : 'POST', '/api/contracts' + (id ? '?id=' + id : ''), body).then(function (r) {
            saveBtn.disabled = false;
            if (r.ok) {
                App.closeModal('contract-modal');
                App.toast(App.t('msg.saved'), 'success');
                load();
            } else if (r.status === 422) {
                App.setFieldErrors(form, r.data.errors);
            } else {
                App.toast(App.t('msg.save_error'), 'error');
            }
        });
    }

    function del(id) {
        if (!window.confirm(App.t('msg.confirm_delete'))) { return; }
        App.api('DELETE', '/api/contracts?id=' + id).then(function (r) {
            if (r.ok) { App.toast(App.t('msg.deleted'), 'success'); load(); }
            else { App.toast(App.t('msg.save_error'), 'error'); }
        });
    }

    document.getElementById('new-btn').addEventListener('click', openNew);
    form.addEventListener('submit', save);
    filter.addEventListener('change', load);
    search.addEventListener('input', function () {
        if (searchTimer) { clearTimeout(searchTimer); }
        searchTimer = setTimeout(load, 250);
    });
    rows.addEventListener('click', function (ev) {
        var edit = ev.target.getAttribute('data-edit');
        var d = ev.target.getAttribute('data-del');
        if (edit) { openEdit(edit); }
        else if (d) { del(d); }
    });

    load();
})();
