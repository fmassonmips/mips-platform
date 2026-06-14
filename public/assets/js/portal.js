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

    // ---- Routing table ----
    async function initRouting() {
        const el = document.getElementById('routing-table');
        const res = await api('GET', '/api/payments/routing.php');
        const rules = res.data.routing || {};
        el.innerHTML = '<table class="data"><thead><tr><th>Payment type</th><th>Provider</th></tr></thead><tbody>'
            + Object.entries(rules).map(([k, v]) => '<tr><td>' + k + '</td><td><span class="badge info">' + v + '</span></td></tr>').join('')
            + '</tbody></table>';
    }

    if (document.querySelector('[data-section="merchant"]')) initMerchant();
    if (document.querySelector('[data-section="pay"]')) initPay();
    if (document.querySelector('[data-section="compliance"]')) initCompliance();
    if (document.querySelector('[data-section="finance"]')) initFinance();
    if (document.querySelector('[data-section="routing"]')) initRouting();
})();
