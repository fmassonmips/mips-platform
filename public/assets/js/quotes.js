/**
 * Quote requests (devis) list page.
 * List + search + status filter, create/edit modal, and a convert-to-policy
 * flow that creates a contract from the quote and links the two together.
 */
(function () {
    'use strict';

    var App = window.App;
    var rows    = document.getElementById('rows');
    var empty   = document.getElementById('empty');
    var loading = document.getElementById('loading');
    var search  = document.getElementById('search');
    var filter  = document.getElementById('status-filter');

    var form    = document.getElementById('quote-form');
    var title   = document.getElementById('quote-modal-title');
    var saveBtn = document.getElementById('quote-save');

    var cvForm    = document.getElementById('convert-form');
    var cvSaveBtn = document.getElementById('convert-save');

    var searchTimer = null;

    function statusBadge(status) {
        return '<span class="badge qstatus-' + App.escapeHtml(status) + '">' +
            App.escapeHtml(App.t('quote.status.' + status)) + '</span>';
    }

    function render(list) {
        loading.hidden = true;
        rows.innerHTML = '';
        empty.hidden = list.length > 0;

        list.forEach(function (q) {
            var converted = q.status === 'converted';
            var actions =
                '<button type="button" class="btn-link" data-edit="' + q.id + '">' + App.escapeHtml(App.t('common.edit')) + '</button>' +
                (converted ? '' : '<button type="button" class="btn-link" data-convert="' + q.id + '">' + App.escapeHtml(App.t('quote.convert')) + '</button>') +
                '<button type="button" class="btn-link danger" data-del="' + q.id + '">' + App.escapeHtml(App.t('common.delete')) + '</button>';

            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + App.escapeHtml(q.reference) + '</td>' +
                '<td><a class="row-link" href="/client.php?id=' + q.client_id + '">' + App.escapeHtml(q.client_name) + '</a></td>' +
                '<td>' + App.escapeHtml(q.type) + '</td>' +
                '<td class="num">' + (q.estimated_premium !== null ? App.fmtMoney(q.estimated_premium) : App.t('common.none')) + '</td>' +
                '<td>' + statusBadge(q.status) + '</td>' +
                '<td class="actions-col">' + actions + '</td>';
            rows.appendChild(tr);
        });
    }

    function load() {
        var params = [];
        var q = search.value.trim();
        if (q) { params.push('q=' + encodeURIComponent(q)); }
        if (filter.value) { params.push('status=' + encodeURIComponent(filter.value)); }
        App.api('GET', '/api/quotes' + (params.length ? '?' + params.join('&') : '')).then(function (r) {
            if (r.ok) { render(r.data.data || []); }
            else { App.toast(App.t('msg.load_error'), 'error'); }
        });
    }

    function openNew() {
        App.fillForm(form, { status: 'new' });
        title.textContent = App.t('quotes.new');
        App.openModal('quote-modal');
        document.getElementById('q-client').focus();
    }

    function openEdit(id) {
        App.api('GET', '/api/quotes?id=' + id).then(function (r) {
            if (!r.ok) { App.toast(App.t('msg.load_error'), 'error'); return; }
            App.fillForm(form, r.data.data);
            title.textContent = App.t('quotes.edit');
            App.openModal('quote-modal');
        });
    }

    function save(ev) {
        ev.preventDefault();
        var body = App.serializeForm(form);
        var id = body.id;
        delete body.id;
        saveBtn.disabled = true;
        App.api(id ? 'PUT' : 'POST', '/api/quotes' + (id ? '?id=' + id : ''), body).then(function (r) {
            saveBtn.disabled = false;
            if (r.ok) {
                App.closeModal('quote-modal');
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
        App.api('DELETE', '/api/quotes?id=' + id).then(function (r) {
            if (r.ok) { App.toast(App.t('msg.deleted'), 'success'); load(); }
            else { App.toast(App.t('msg.save_error'), 'error'); }
        });
    }

    // --- Conversion: quote -> policy -------------------------------------
    function openConvert(id) {
        App.api('GET', '/api/quotes?id=' + id).then(function (r) {
            if (!r.ok) { App.toast(App.t('msg.load_error'), 'error'); return; }
            var q = r.data.data;
            var today = new Date();
            var nextYear = new Date();
            nextYear.setFullYear(today.getFullYear() + 1);
            App.fillForm(cvForm, {
                quote_id: q.id,
                client_id: q.client_id,
                type: 'other',
                premium: q.estimated_premium !== null ? q.estimated_premium : '0',
                commission_rate: '0',
                start_date: today.toISOString().slice(0, 10),
                end_date: nextYear.toISOString().slice(0, 10)
            });
            App.openModal('convert-modal');
            document.getElementById('cv-policy').focus();
        });
    }

    function convert(ev) {
        ev.preventDefault();
        var data = App.serializeForm(cvForm);
        var quoteId = data.quote_id;
        delete data.quote_id;

        cvSaveBtn.disabled = true;
        // 1) Create the policy, 2) link it back to the quote.
        App.api('POST', '/api/contracts', data).then(function (r) {
            if (!r.ok) {
                cvSaveBtn.disabled = false;
                if (r.status === 422) { App.setFieldErrors(cvForm, r.data.errors); }
                else { App.toast(App.t('msg.save_error'), 'error'); }
                return;
            }
            var contractId = r.data.data.id;
            App.api('POST', '/api/quotes?id=' + quoteId + '&action=convert', { contract_id: contractId }).then(function (r2) {
                cvSaveBtn.disabled = false;
                if (r2.ok) {
                    App.closeModal('convert-modal');
                    App.toast(App.t('quote.converted_notice'), 'success');
                    load();
                } else {
                    App.toast(App.t('msg.save_error'), 'error');
                }
            });
        });
    }

    document.getElementById('new-btn').addEventListener('click', openNew);
    form.addEventListener('submit', save);
    cvForm.addEventListener('submit', convert);
    filter.addEventListener('change', load);
    search.addEventListener('input', function () {
        if (searchTimer) { clearTimeout(searchTimer); }
        searchTimer = setTimeout(load, 250);
    });
    rows.addEventListener('click', function (ev) {
        var edit = ev.target.getAttribute('data-edit');
        var conv = ev.target.getAttribute('data-convert');
        var d = ev.target.getAttribute('data-del');
        if (edit) { openEdit(edit); }
        else if (conv) { openConvert(conv); }
        else if (d) { del(d); }
    });

    load();
})();
