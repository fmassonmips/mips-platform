/**
 * Clients (CRM) list page.
 * Loads, searches, creates, edits and deletes client records, and links
 * through to each client's detail page.
 */
(function () {
    'use strict';

    var App = window.App;
    var rows    = document.getElementById('rows');
    var empty   = document.getElementById('empty');
    var loading = document.getElementById('loading');
    var search  = document.getElementById('search');
    var form    = document.getElementById('client-form');
    var title   = document.getElementById('client-modal-title');
    var saveBtn = document.getElementById('client-save');

    var searchTimer = null;

    function typeLabel(type) {
        return App.t('client.type.' + type);
    }

    function render(list) {
        loading.hidden = true;
        rows.innerHTML = '';
        empty.hidden = list.length > 0;

        list.forEach(function (c) {
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td><a class="row-link" href="/client.php?id=' + c.id + '">' + App.escapeHtml(c.name) + '</a></td>' +
                '<td>' + App.escapeHtml(typeLabel(c.type)) + '</td>' +
                '<td>' + App.escapeHtml(c.email || App.t('common.none')) + '</td>' +
                '<td>' + App.escapeHtml(c.phone || App.t('common.none')) + '</td>' +
                '<td class="num">' + (c.contracts_count || 0) + '</td>' +
                '<td class="actions-col">' +
                    '<button type="button" class="btn-link" data-edit="' + c.id + '">' + App.escapeHtml(App.t('common.edit')) + '</button>' +
                    '<button type="button" class="btn-link danger" data-del="' + c.id + '">' + App.escapeHtml(App.t('common.delete')) + '</button>' +
                '</td>';
            rows.appendChild(tr);
        });
    }

    function load() {
        var q = search.value.trim();
        App.api('GET', '/api/clients' + (q ? '?q=' + encodeURIComponent(q) : '')).then(function (r) {
            if (r.ok) { render(r.data.data || []); }
            else { App.toast(App.t('msg.load_error'), 'error'); }
        });
    }

    function openNew() {
        App.fillForm(form, { type: 'individual' });
        title.textContent = App.t('clients.new');
        App.openModal('client-modal');
        document.getElementById('c-name').focus();
    }

    function openEdit(id) {
        App.api('GET', '/api/clients?id=' + id).then(function (r) {
            if (!r.ok) { App.toast(App.t('msg.load_error'), 'error'); return; }
            App.fillForm(form, r.data.data);
            title.textContent = App.t('clients.edit');
            App.openModal('client-modal');
        });
    }

    function save(ev) {
        ev.preventDefault();
        var body = App.serializeForm(form);
        var id = body.id;
        delete body.id;

        saveBtn.disabled = true;
        var method = id ? 'PUT' : 'POST';
        var url = '/api/clients' + (id ? '?id=' + id : '');

        App.api(method, url, body).then(function (r) {
            saveBtn.disabled = false;
            if (r.ok) {
                App.closeModal('client-modal');
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
        if (!window.confirm(App.t('client.confirm_delete'))) { return; }
        App.api('DELETE', '/api/clients?id=' + id).then(function (r) {
            if (r.ok) { App.toast(App.t('msg.deleted'), 'success'); load(); }
            else { App.toast(App.t('msg.save_error'), 'error'); }
        });
    }

    document.getElementById('new-btn').addEventListener('click', openNew);
    form.addEventListener('submit', save);
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
