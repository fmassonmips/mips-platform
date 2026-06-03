/**
 * Dashboard overview.
 * Pulls aggregates from /api/stats and renders KPI cards, quotes-by-status,
 * upcoming policy expiries and recent quote requests.
 *
 * (Logout is wired globally in app.js, since the button lives in the top bar.)
 */
(function () {
    'use strict';

    var App = window.App;

    function expiryLabel(daysLeft) {
        var n = parseInt(daysLeft, 10);
        if (isNaN(n)) { return ''; }
        if (n < 0) { return App.t('dashboard.overdue'); }
        if (n === 0) { return App.t('dashboard.expires_today'); }
        return App.t('dashboard.days_left', { n: n });
    }

    function renderUpcoming(list) {
        var body = document.getElementById('upcoming');
        body.innerHTML = '';
        document.getElementById('upcoming-empty').hidden = list.length > 0;
        list.forEach(function (c) {
            var n = parseInt(c.days_left, 10);
            var cls = n < 0 ? 'badge-overdue' : (n <= 14 ? 'badge-warning' : 'badge-soft');
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td><a class="row-link" href="/client.php?id=' + c.client_id + '">' + App.escapeHtml(c.client_name) + '</a></td>' +
                '<td>' + App.escapeHtml(c.policy_number) + '</td>' +
                '<td>' + App.fmtDate(c.end_date) + '</td>' +
                '<td><span class="badge ' + cls + '">' + App.escapeHtml(expiryLabel(c.days_left)) + '</span></td>';
            body.appendChild(tr);
        });
    }

    function renderQuotesByStatus(byStatus) {
        var ul = document.getElementById('quotes-status');
        ul.innerHTML = '';
        ['new', 'in_progress', 'converted', 'declined'].forEach(function (s) {
            var li = document.createElement('li');
            li.innerHTML =
                '<span class="badge qstatus-' + s + '">' + App.escapeHtml(App.t('quote.status.' + s)) + '</span>' +
                '<span class="status-count">' + (byStatus[s] || 0) + '</span>';
            ul.appendChild(li);
        });
    }

    function renderRecentQuotes(list) {
        var body = document.getElementById('recent-quotes');
        body.innerHTML = '';
        document.getElementById('recent-empty').hidden = list.length > 0;
        list.forEach(function (q) {
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + App.escapeHtml(q.reference) + '</td>' +
                '<td>' + App.escapeHtml(q.client_name) + '</td>' +
                '<td>' + App.escapeHtml(q.type) + '</td>' +
                '<td class="num">' + (q.estimated_premium !== null ? App.fmtMoney(q.estimated_premium) : App.t('common.none')) + '</td>' +
                '<td><span class="badge qstatus-' + App.escapeHtml(q.status) + '">' + App.escapeHtml(App.t('quote.status.' + q.status)) + '</span></td>';
            body.appendChild(tr);
        });
    }

    App.api('GET', '/api/stats').then(function (r) {
        if (!r.ok) { App.toast(App.t('msg.load_error'), 'error'); return; }
        var d = r.data.data;
        document.getElementById('stat-clients').textContent    = d.clients_count;
        document.getElementById('stat-active').textContent     = d.active_contracts;
        document.getElementById('stat-commission').textContent = App.fmtMoney(d.est_commission);
        document.getElementById('stat-premium').textContent    =
            App.t('dashboard.total_premium') + ': ' + App.fmtMoney(d.total_premium);
        document.getElementById('stat-quotes').textContent     = d.open_quotes;

        renderUpcoming(d.upcoming || []);
        renderQuotesByStatus(d.quotes_by_status || {});
        renderRecentQuotes(d.recent_quotes || []);
    });
})();
