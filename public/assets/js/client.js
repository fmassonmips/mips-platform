/**
 * Client detail page.
 * Renders the profile, interaction history (with inline add), and the
 * client's linked policies and quotes. Also hosts the edit-client modal.
 */
(function () {
    'use strict';

    var App = window.App;
    var clientId = parseInt(document.querySelector('.page-head').getAttribute('data-client-id'), 10);

    var info        = document.getElementById('client-info');
    var typeBadge   = document.getElementById('client-type-badge');
    var iForm       = document.getElementById('interaction-form');
    var iSave       = document.getElementById('interaction-save');
    var timeline    = document.getElementById('interactions');
    var iEmpty      = document.getElementById('interactions-empty');
    var cForm       = document.getElementById('client-form');
    var cSave       = document.getElementById('client-save');

    function row(dt, dd) {
        if (dd === null || dd === undefined || dd === '') { return ''; }
        return '<dt>' + App.escapeHtml(dt) + '</dt><dd>' + App.escapeHtml(dd) + '</dd>';
    }

    function loadClient() {
        App.api('GET', '/api/clients?id=' + clientId).then(function (r) {
            if (!r.ok) { App.toast(App.t('msg.load_error'), 'error'); return; }
            var c = r.data.data;
            typeBadge.textContent = App.t('client.type.' + c.type);
            App.fillForm(cForm, c);
            info.innerHTML =
                row(App.t('client.email'), c.email) +
                row(App.t('client.phone'), c.phone) +
                row(App.t('client.address'), c.address) +
                row(App.t('client.city'), c.city) +
                row(App.t('client.notes'), c.notes) +
                '<dt>' + App.escapeHtml(App.t('common.created')) + '</dt><dd>' + App.fmtDateTime(c.created_at) + '</dd>';
        });
    }

    function loadInteractions() {
        App.api('GET', '/api/interactions?client_id=' + clientId).then(function (r) {
            if (!r.ok) { return; }
            var list = r.data.data || [];
            timeline.innerHTML = '';
            iEmpty.hidden = list.length > 0;
            list.forEach(function (it) {
                var li = document.createElement('li');
                li.className = 'timeline-item';
                li.innerHTML =
                    '<div class="timeline-meta">' +
                        '<span class="badge badge-soft">' + App.escapeHtml(App.t('interaction.type.' + it.type)) + '</span>' +
                        '<span class="timeline-date">' + App.fmtDateTime(it.occurred_at) + '</span>' +
                        (it.user_name ? '<span class="timeline-who">' + App.escapeHtml(it.user_name) + '</span>' : '') +
                        '<button type="button" class="btn-link danger" data-del-int="' + it.id + '">' + App.escapeHtml(App.t('common.delete')) + '</button>' +
                    '</div>' +
                    '<p class="timeline-summary">' + App.escapeHtml(it.summary) + '</p>' +
                    (it.details ? '<p class="timeline-details">' + App.escapeHtml(it.details) + '</p>' : '');
                timeline.appendChild(li);
            });
        });
    }

    function contractStatusBadge(status) {
        return '<span class="badge status-' + App.escapeHtml(status) + '">' +
            App.escapeHtml(App.t('contract.status.' + status)) + '</span>';
    }
    function quoteStatusBadge(status) {
        return '<span class="badge qstatus-' + App.escapeHtml(status) + '">' +
            App.escapeHtml(App.t('quote.status.' + status)) + '</span>';
    }

    function loadContracts() {
        App.api('GET', '/api/contracts?client_id=' + clientId).then(function (r) {
            if (!r.ok) { return; }
            var list = r.data.data || [];
            var body = document.getElementById('client-contracts');
            body.innerHTML = '';
            document.getElementById('contracts-empty').hidden = list.length > 0;
            list.forEach(function (ct) {
                var tr = document.createElement('tr');
                tr.innerHTML =
                    '<td>' + App.escapeHtml(ct.policy_number) + '</td>' +
                    '<td>' + App.escapeHtml(ct.insurer) + '</td>' +
                    '<td>' + App.escapeHtml(App.t('contract.type.' + ct.type)) + '</td>' +
                    '<td class="num">' + App.fmtMoney(ct.premium) + '</td>' +
                    '<td>' + App.fmtDate(ct.end_date) + '</td>' +
                    '<td>' + contractStatusBadge(ct.status) + '</td>';
                body.appendChild(tr);
            });
        });
    }

    function loadQuotes() {
        App.api('GET', '/api/quotes?client_id=' + clientId).then(function (r) {
            if (!r.ok) { return; }
            var list = r.data.data || [];
            var body = document.getElementById('client-quotes');
            body.innerHTML = '';
            document.getElementById('quotes-empty').hidden = list.length > 0;
            list.forEach(function (q) {
                var tr = document.createElement('tr');
                tr.innerHTML =
                    '<td>' + App.escapeHtml(q.reference) + '</td>' +
                    '<td>' + App.escapeHtml(q.type) + '</td>' +
                    '<td class="num">' + (q.estimated_premium !== null ? App.fmtMoney(q.estimated_premium) : App.t('common.none')) + '</td>' +
                    '<td>' + quoteStatusBadge(q.status) + '</td>';
                body.appendChild(tr);
            });
        });
    }

    function addInteraction(ev) {
        ev.preventDefault();
        var body = App.serializeForm(iForm);
        iSave.disabled = true;
        App.api('POST', '/api/interactions?client_id=' + clientId, body).then(function (r) {
            iSave.disabled = false;
            if (r.ok) {
                iForm.reset();
                App.toast(App.t('msg.saved'), 'success');
                loadInteractions();
            } else if (r.status === 422) {
                App.setFieldErrors(iForm, r.data.errors);
            } else {
                App.toast(App.t('msg.save_error'), 'error');
            }
        });
    }

    function delInteraction(id) {
        if (!window.confirm(App.t('msg.confirm_delete'))) { return; }
        App.api('DELETE', '/api/interactions?id=' + id).then(function (r) {
            if (r.ok) { App.toast(App.t('msg.deleted'), 'success'); loadInteractions(); }
        });
    }

    function saveClient(ev) {
        ev.preventDefault();
        var body = App.serializeForm(cForm);
        delete body.id;
        cSave.disabled = true;
        App.api('PUT', '/api/clients?id=' + clientId, body).then(function (r) {
            cSave.disabled = false;
            if (r.ok) {
                App.closeModal('client-modal');
                App.toast(App.t('msg.saved'), 'success');
                loadClient();
            } else if (r.status === 422) {
                App.setFieldErrors(cForm, r.data.errors);
            } else {
                App.toast(App.t('msg.save_error'), 'error');
            }
        });
    }

    document.getElementById('edit-client-btn').addEventListener('click', function () {
        App.openModal('client-modal');
    });
    iForm.addEventListener('submit', addInteraction);
    cForm.addEventListener('submit', saveClient);
    timeline.addEventListener('click', function (ev) {
        var id = ev.target.getAttribute('data-del-int');
        if (id) { delInteraction(id); }
    });

    loadClient();
    loadInteractions();
    loadContracts();
    loadQuotes();
})();
