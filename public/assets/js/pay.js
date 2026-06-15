/**
 * Hosted payment-link checkout. Loads the link, then completes payment via the
 * API. For open-amount links it prompts the payer for an amount.
 */
(function () {
    'use strict';

    const csrf = document.querySelector('meta[name="csrf-token"]').content;
    const slug = document.querySelector('meta[name="link-slug"]').content;
    const detailsEl = document.getElementById('link-details');
    const form = document.getElementById('pay-form');
    const amountField = document.getElementById('amount-field');
    const notice = document.getElementById('pay-notice');

    async function api(method, url, body) {
        const opts = { method, credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.headers['X-CSRF-Token'] = csrf;
            opts.body = JSON.stringify(body);
        }
        const res = await fetch(url, opts);
        let data = {}; try { data = await res.json(); } catch (_) {}
        return { ok: res.ok, status: res.status, data };
    }

    async function load() {
        if (!slug) { detailsEl.textContent = 'Invalid payment link.'; return; }
        const r = await api('GET', '/api/links/show.php?slug=' + encodeURIComponent(slug));
        if (!r.ok) { detailsEl.textContent = r.data.error || 'Payment link not found.'; return; }
        const l = r.data.link;
        if (l.status !== 'ACTIVE') { detailsEl.textContent = 'This payment link is not active.'; return; }

        detailsEl.innerHTML =
            (l.description ? '<p><strong>' + l.description + '</strong></p>' : '')
            + '<dl class="meta"><dt>Reference</dt><dd><code>' + l.link_reference + '</code></dd>'
            + '<dt>Amount</dt><dd>' + (l.amount_display ? l.amount_display + ' ' + l.currency : 'You choose') + '</dd></dl>';

        if (l.amount_minor === null) amountField.hidden = false;
        form.hidden = false;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { slug };
        const amt = form.querySelector('input[name="amount"]');
        if (!amountField.hidden && amt) body.amount = amt.value;
        const r = await api('POST', '/api/links/pay.php', body);
        if (r.ok) {
            const t = r.data.transaction;
            form.hidden = true;
            notice.className = 'notice success';
            notice.innerHTML = 'Payment ' + t.status + ' — ' + t.amount_display + ' ' + t.currency
                + '<br><code>' + t.transaction_reference + '</code>';
        } else {
            notice.className = 'notice error';
            notice.textContent = r.data.error || 'Payment failed.';
        }
    });

    load();
})();
