/**
 * Shared client for authenticated pages.
 * - Wires the logout button.
 * - Exposes window.MIPS: api() for JSON calls with the CSRF header,
 *   el() to build DOM safely (text only, never innerHTML), and number
 *   formatters.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

    async function api(url, options) {
        const opts = Object.assign({ method: 'GET' }, options || {});
        const headers = { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken };
        let body = opts.body;
        if (body !== undefined && !(body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(body);
        }
        const res = await fetch(url, { method: opts.method, credentials: 'same-origin', headers: headers, body: body });
        if (res.status === 401) {
            window.location.assign('/login.php');
            throw new Error('Session expired.');
        }
        let data = {};
        try { data = await res.json(); } catch (_) { /* ignore */ }
        if (!res.ok) {
            throw new Error(data.error || 'Request failed (' + res.status + ').');
        }
        return data;
    }

    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        Object.entries(attrs || {}).forEach(function ([k, v]) {
            if (v === null || v === undefined || v === false) { return; }
            if (k === 'text') { node.textContent = v; }
            else if (k === 'on') { Object.entries(v).forEach(([ev, fn]) => node.addEventListener(ev, fn)); }
            else { node.setAttribute(k, v === true ? '' : v); }
        });
        (children || []).forEach(function (c) {
            if (c === null || c === undefined) { return; }
            node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
        });
        return node;
    }

    function table(headers, rows, numericCols) {
        const num = new Set(numericCols || []);
        return el('div', { class: 'table-wrap' }, [
            el('table', { class: 'data' }, [
                el('thead', {}, [el('tr', {}, headers.map((h, i) => el('th', { class: num.has(i) ? 'num' : null, text: h })))]),
                el('tbody', {}, rows.map(function (r) {
                    const cells = r.cells || r;
                    return el('tr', { class: r.className || null }, cells.map(function (c, i) {
                        return c instanceof Node ? el('td', {}, [c]) : el('td', { class: num.has(i) ? 'num' : null, text: c === null ? '' : String(c) });
                    }));
                })),
            ]),
        ]);
    }

    const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
    const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function show(node, msg) {
        node.textContent = msg || '';
        node.hidden = !msg;
    }

    window.MIPS = {
        api: api,
        el: el,
        table: table,
        show: show,
        int: (v) => (v === null || v === undefined ? '' : nf0.format(Number(v))),
        money: (v) => (v === null || v === undefined ? '' : nf2.format(Number(v))),
        pct: (v) => (v === null || v === undefined ? '' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%'),
    };

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function () {
            logoutBtn.disabled = true;
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken },
                });
            } catch (_) {
                // Fall through — we redirect regardless.
            }
            window.location.assign('/login.php');
        });
    }
})();
