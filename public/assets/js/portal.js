/**
 * PassPass portal client. Wires the role-aware sections to the JSON API.
 * Every state-changing call carries the CSRF token; the server re-checks RBAC.
 */
(function () {
    'use strict';

    const csrf = document.querySelector('meta[name="csrf-token"]').content;

    async function api(method, url, body) {
        const opts = {
            method,
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
        };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.headers['X-CSRF-Token'] = csrf;
            opts.body = JSON.stringify(body);
        }
        const res = await fetch(url, opts);
        let data = {};
        try { data = await res.json(); } catch (_) { /* non-JSON */ }
        return { ok: res.ok, status: res.status, data };
    }

    function notice(el, msg, kind) {
        if (!el) return;
        el.className = 'notice ' + (kind || '');
        el.textContent = msg;
    }

    function badge(status) {
        const ok = ['APPROVED', 'CLEARED', 'PAID', 'SETTLED', 'RECONCILED'];
        const warn = ['SUBMITTED', 'REVIEW', 'PENDING', 'PROCESSING', 'PENDING_PAYMENT', 'CREATED'];
        const danger = ['REJECTED', 'FAILED', 'CANCELLED', 'SUSPENDED', 'FLAGGED'];
        let cls = 'info';
        if (ok.includes(status)) cls = 'ok';
        else if (warn.includes(status)) cls = 'warn';
        else if (danger.includes(status)) cls = 'danger';
        return '<span class="badge ' + cls + '">' + status + '</span>';
    }

    // ---- Logout (shared) ----
    const logout = document.getElementById('logout-btn');
    if (logout) {
        logout.addEventListener('click', async () => {
            await api('POST', '/api/auth/logout.php', {});
            window.location.assign('/login.php');
        });
    }

    // ---- Merchant onboarding ----
    async function initMerchant() {
        const statusEl = document.getElementById('merchant-status');
        const createForm = document.getElementById('merchant-create');
        const kycForm = document.getElementById('kyc-submit');
        const res = await api('GET', '/api/merchants/show.php');

        if (res.status === 404) {
            statusEl.hidden = true;
            createForm.hidden = false;
            return;
        }
        const m = res.data.merchant;
        statusEl.innerHTML = 'Merchant <code>' + m.merchant_reference + '</code> · regulated id <code>'
            + m.regulated_merchant_id + '</code><br>KYC ' + badge(m.kyc_status)
            + ' · Compliance ' + badge(m.compliance_status)
            + (m.risk_rating ? ' · Risk ' + badge(m.risk_rating) : '');
        statusEl.dataset.ref = m.merchant_reference;
        if (m.kyc_status === 'DRAFT') kycForm.hidden = false;

        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(createForm).entries());
            const r = await api('POST', '/api/merchants/create.php', body);
            if (r.ok) { window.location.reload(); }
            else notice(document.getElementById('merchant-notice'), r.data.error || 'Failed', 'error');
        });

        kycForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const r = await api('POST', '/api/kyc/submit.php', {
                merchant_reference: statusEl.dataset.ref,
                documents: [{ doc_type: 'CERT_INCORPORATION', file_reference: 'sandbox://cert.pdf' }],
            });
            if (r.ok) { notice(document.getElementById('merchant-notice'), 'KYC submitted: ' + r.data.kyc_status, 'success'); kycForm.hidden = true; }
            else notice(document.getElementById('merchant-notice'), r.data.error || 'Failed', 'error');
        });
    }

    // ---- Pay by Bank ----
    function initPay() {
        const form = document.getElementById('pay-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(form).entries());
            const r = await api('POST', '/api/payments/create.php', body);
            if (r.ok) {
                const t = r.data.transaction;
                notice(document.getElementById('pay-notice'), 'Payment created.', 'success');
                document.getElementById('pay-result').innerHTML =
                    '<table class="data"><tr><th>Reference</th><td><code>' + t.transaction_reference + '</code></td></tr>'
                    + '<tr><th>Status</th><td>' + badge(t.status) + '</td></tr>'
                    + '<tr><th>Amount</th><td>' + t.amount_display + ' ' + t.currency + '</td></tr>'
                    + '<tr><th>Fee</th><td>' + t.fee_minor + ' (minor)</td></tr>'
                    + '<tr><th>Provider</th><td>' + t.provider_name + ' · ' + (t.provider_reference || '') + '</td></tr>'
                    + '<tr><th>Regulated txn</th><td><code>' + (t.regulated_transaction_id || '') + '</code></td></tr></table>';
            } else {
                notice(document.getElementById('pay-notice'), r.data.error || 'Failed', 'error');
                document.getElementById('pay-result').innerHTML = '';
            }
        });
    }

    // ---- Payment links ----
    async function refreshLinks() {
        const res = await api('GET', '/api/links/list.php');
        const list = res.data.links || [];
        const el = document.getElementById('link-list');
        if (!list.length) { el.innerHTML = '<p class="muted">No links yet.</p>'; return; }
        el.innerHTML = '<table class="data"><thead><tr><th>Link</th><th>Amount</th><th>Uses</th><th>Pay URL</th></tr></thead><tbody>'
            + list.map((l) => '<tr><td><code>' + l.link_reference + '</code></td>'
                + '<td>' + (l.amount_display ? l.amount_display + ' ' + l.currency : 'payer-entered') + '</td>'
                + '<td>' + l.uses + (l.max_uses ? '/' + l.max_uses : '') + '</td>'
                + '<td><a href="' + l.pay_url + '" target="_blank">' + l.pay_url + '</a></td></tr>').join('')
            + '</tbody></table>';
    }
    function initLinks() {
        const form = document.getElementById('link-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(form).entries());
            const r = await api('POST', '/api/links/create.php', body);
            if (r.ok) { notice(document.getElementById('link-notice'), 'Created ' + r.data.link.pay_url, 'success'); form.reset(); refreshLinks(); }
            else notice(document.getElementById('link-notice'), r.data.error || 'Failed', 'error');
        });
        refreshLinks();
    }

    // ---- Merchant QR ----
    async function refreshQr() {
        const res = await api('GET', '/api/qr/list.php');
        const list = res.data.qr || [];
        const el = document.getElementById('qr-list');
        if (!list.length) { el.innerHTML = '<p class="muted">No QR profiles yet.</p>'; return; }
        el.innerHTML = '<table class="data"><thead><tr><th>QR</th><th>Type</th><th>Amount</th></tr></thead><tbody>'
            + list.map((q) => '<tr><td><code>' + q.qr_reference + '</code></td><td>' + q.qr_type + '</td>'
                + '<td>' + (q.amount_display ? q.amount_display + ' ' + q.currency : 'open') + '</td></tr>').join('')
            + '</tbody></table>';
    }
    function initQr() {
        const form = document.getElementById('qr-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(form).entries());
            const r = await api('POST', '/api/qr/create.php', body);
            if (r.ok) { notice(document.getElementById('qr-notice'), 'Created ' + r.data.qr.qr_reference, 'success'); form.reset(); refreshQr(); }
            else notice(document.getElementById('qr-notice'), r.data.error || 'Failed', 'error');
        });
        refreshQr();
    }

    // ---- Virtual credentials ----
    async function refreshCreds() {
        const res = await api('GET', '/api/credentials/overview.php');
        const el = document.getElementById('cred-overview');
        const aliases = (res.data.aliases || []).map((a) => '<span class="badge info">' + a.alias + ' (' + a.alias_type + ')</span>').join(' ');
        const creds = (res.data.credentials || []).map((c) => '<span class="badge">' + c.type + ' · ' + c.credential_reference + '</span>').join(' ');
        el.innerHTML = '<p class="muted">Profile <code>' + (res.data.profile_reference || '') + '</code></p>'
            + '<div class="stack"><div>' + (aliases || '<span class="muted">no aliases</span>') + '</div>'
            + '<div>' + (creds || '<span class="muted">no credentials</span>') + '</div></div>';
    }
    function initCredentials() {
        const aliasForm = document.getElementById('alias-form');
        const credForm = document.getElementById('cred-form');
        aliasForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const r = await api('POST', '/api/credentials/alias.php', Object.fromEntries(new FormData(aliasForm).entries()));
            if (r.ok) { notice(document.getElementById('cred-notice'), 'Alias added', 'success'); aliasForm.reset(); refreshCreds(); }
            else notice(document.getElementById('cred-notice'), r.data.error || 'Failed', 'error');
        });
        credForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const r = await api('POST', '/api/credentials/create.php', Object.fromEntries(new FormData(credForm).entries()));
            if (r.ok) { notice(document.getElementById('cred-notice'), 'Credential issued: ' + r.data.credential.credential_reference, 'success'); refreshCreds(); }
            else notice(document.getElementById('cred-notice'), r.data.error || 'Failed', 'error');
        });
        refreshCreds();
    }

    // ---- API keys ----
    async function refreshApiKeys() {
        const res = await api('GET', '/api/apikeys/list.php');
        const list = res.data.keys || [];
        const el = document.getElementById('apikey-list');
        if (!list.length) { el.innerHTML = '<p class="muted">No API keys yet.</p>'; return; }
        el.innerHTML = '<table class="data"><thead><tr><th>Key ID</th><th>Label</th><th>Status</th><th>Last used</th><th></th></tr></thead><tbody>'
            + list.map((k) => '<tr><td><code>' + k.key_id + '</code></td><td>' + (k.label || '') + '</td>'
                + '<td>' + badge(k.is_active == 1 ? 'CLEARED' : 'SUSPENDED') + '</td>'
                + '<td>' + (k.last_used_at || '—') + '</td>'
                + '<td>' + (k.is_active == 1 ? '<button class="btn-secondary btn-sm" data-revoke="' + k.key_id + '">Revoke</button>' : '') + '</td></tr>').join('')
            + '</tbody></table>';
        el.querySelectorAll('button[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
            await api('POST', '/api/apikeys/revoke.php', { key_id: b.dataset.revoke });
            refreshApiKeys();
        }));
    }
    function initApiKeys() {
        const form = document.getElementById('apikey-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const r = await api('POST', '/api/apikeys/create.php', Object.fromEntries(new FormData(form).entries()));
            if (r.ok) {
                const k = r.data.api_key;
                notice(document.getElementById('apikey-notice'),
                    'Key ' + k.key_id + ' — SECRET (shown once): ' + k.secret, 'success');
                form.reset();
                refreshApiKeys();
            } else notice(document.getElementById('apikey-notice'), r.data.error || 'Failed', 'error');
        });
        refreshApiKeys();
    }

    // ---- Compliance queue ----
    async function initCompliance() {
        const queue = document.getElementById('compliance-queue');
        const res = await api('GET', '/api/merchants/pending.php');
        const list = (res.data.merchants || []);
        if (!list.length) { queue.innerHTML = '<p class="muted">No merchants awaiting review.</p>'; return; }

        queue.innerHTML = '<table class="data"><thead><tr><th>Merchant</th><th>Legal name</th><th>KYC</th><th>Actions</th></tr></thead><tbody>'
            + list.map((m) =>
                '<tr><td><code>' + m.merchant_reference + '</code></td><td>' + m.legal_name + '</td><td>' + badge(m.kyc_status) + '</td>'
                + '<td><button class="btn-secondary btn-sm" data-act="approve" data-ref="' + m.merchant_reference + '">Approve</button> '
                + '<button class="btn-secondary btn-sm" data-act="reject" data-ref="' + m.merchant_reference + '">Reject</button></td></tr>'
            ).join('') + '</tbody></table>';

        queue.querySelectorAll('button[data-act]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const ref = btn.dataset.ref;
                const decision = btn.dataset.act === 'approve' ? 'APPROVE' : 'REJECT';
                await api('POST', '/api/compliance/score.php', { merchant_reference: ref, score: 20 });
                const r = await api('POST', '/api/compliance/decision.php', { merchant_reference: ref, decision });
                if (r.ok) { notice(document.getElementById('compliance-notice'), ref + ' → ' + r.data.kyc_status + ' / ' + r.data.compliance_status, 'success'); initCompliance(); }
                else notice(document.getElementById('compliance-notice'), r.data.error || 'Failed', 'error');
            });
        });
    }

    // ---- Finance ----
    function initFinance() {
        const settle = document.getElementById('settle-form');
        const sim = document.getElementById('simulate-form');
        settle.addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(settle).entries());
            const r = await api('POST', '/api/settlements/create.php', body);
            if (r.ok) {
                const s = r.data.settlement;
                notice(document.getElementById('finance-notice'),
                    'Settled ' + s.transaction_count + ' txn(s) — net ' + s.net_display + ' ' + s.currency + ' · batch ' + s.batch_reference, 'success');
            } else notice(document.getElementById('finance-notice'), r.data.error || 'Failed', 'error');
        });
        sim.addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(sim).entries());
            const r = await api('POST', '/api/payments/simulate.php', body);
            if (r.ok) notice(document.getElementById('finance-notice'), body.reference + ' → ' + r.data.transaction.status, 'success');
            else notice(document.getElementById('finance-notice'), r.data.error || 'Failed', 'error');
        });
    }

    // ---- KPI dashboard ----
    async function initKpis() {
        const el = document.getElementById('kpi-grid');
        const res = await api('GET', '/api/reports/kpis.php');
        const k = res.data.kpis;
        if (!k) { el.innerHTML = '<p class="muted">No data.</p>'; return; }
        const cards = [
            ['Total merchants', k.merchants_total],
            ['Active merchants', k.merchants_active],
            ['Pending KYC', k.merchants_pending_kyc],
            ['Approved merchants', k.merchants_approved],
            ['Transactions', k.transactions_total],
            ['Successful', k.transactions_successful],
            ['Failed', k.transactions_failed],
            ['Volume (' + k.currency + ')', k.volume_display],
            ['Settlements', k.settlements_total],
            ['Settled net (' + k.currency + ')', k.settlements_net_display],
            ['Fees generated (' + k.currency + ')', k.fees_generated_display],
            ['Pending reconciliation', k.pending_reconciliation],
            ['Settlement exceptions', k.settlement_exceptions],
        ];
        el.className = 'kpi-grid';
        el.innerHTML = cards.map(([label, value]) =>
            '<div class="kpi"><div class="kpi-value">' + value + '</div><div class="kpi-label">' + label + '</div></div>'
        ).join('');
    }

    // ---- Reconciliation ----
    function initReconciliation() {
        const form = document.getElementById('recon-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = Object.fromEntries(new FormData(form).entries());
            const body = {};
            if (fd.merchant_reference) body.merchant_reference = fd.merchant_reference;
            const r = await api('POST', '/api/reconciliation/run.php', body);
            if (r.ok) {
                const s = r.data.reconciliation;
                notice(document.getElementById('recon-notice'),
                    'Batch ' + s.batch_reference + ' (' + s.source + ')', 'success');
                document.getElementById('recon-result').innerHTML =
                    '<table class="data"><tr><th>Matched</th><td>' + badge('MATCHED') + ' ' + s.matched + '</td></tr>'
                    + '<tr><th>Exceptions</th><td>' + (s.exceptions ? badge('FAILED') : badge('PAID')) + ' ' + s.exceptions + '</td></tr>'
                    + '<tr><th>Total items</th><td>' + s.total + '</td></tr></table>';
            } else {
                notice(document.getElementById('recon-notice'), r.data.error || 'Failed', 'error');
                document.getElementById('recon-result').innerHTML = '';
            }
        });
    }

    // ---- Routing table ----
    async function initRouting() {
        const el = document.getElementById('routing-table');
        const res = await api('GET', '/api/payments/routing.php');
        const rules = res.data.routing || {};
        el.innerHTML = '<table class="data"><thead><tr><th>Payment type</th><th>Provider</th></tr></thead><tbody>'
            + Object.entries(rules).map(([k, v]) => '<tr><td>' + k + '</td><td><span class="badge info">' + v + '</span></td></tr>').join('')
            + '</tbody></table>';
    }

    if (document.querySelector('[data-section="kpis"]')) initKpis();
    if (document.querySelector('[data-section="merchant"]')) initMerchant();
    if (document.querySelector('[data-section="links"]')) initLinks();
    if (document.querySelector('[data-section="qr"]')) initQr();
    if (document.querySelector('[data-section="apikeys"]')) initApiKeys();
    if (document.querySelector('[data-section="pay"]')) initPay();
    if (document.querySelector('[data-section="credentials"]')) initCredentials();
    if (document.querySelector('[data-section="compliance"]')) initCompliance();
    if (document.querySelector('[data-section="finance"]')) initFinance();
    if (document.querySelector('[data-section="reconciliation"]')) initReconciliation();
    if (document.querySelector('[data-section="routing"]')) initRouting();
})();
