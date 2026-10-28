/**
 * Public shop: cart (kept in sessionStorage for this shop), totals computed
 * with the same per-line VAT rounding as the server, checkout.
 */
(function () {
    'use strict';

    const shop = document.getElementById('shop');
    if (!shop) { return; }
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const products  = {};
    JSON.parse(shop.dataset.products).forEach(function (p) { products[p.id] = p; });
    const t         = JSON.parse(shop.dataset.t);
    const delivery  = Number(shop.dataset.delivery);
    const freeFrom  = Number(shop.dataset.free);
    const form      = document.getElementById('checkout');
    const errorBox  = document.getElementById('sl-error');
    const key       = 'sl-cart-' + shop.dataset.o;
    let cart = {};

    try {
        cart = JSON.parse(window.sessionStorage.getItem(key) || '{}') || {};
    } catch (e) {
        cart = {};
    }
    Object.keys(cart).forEach(function (id) {
        if (!products[id]) { delete cart[id]; }
    });

    function save() {
        try { window.sessionStorage.setItem(key, JSON.stringify(cart)); } catch (e) { /* private mode: cart lives in memory */ }
    }

    // Same as the server: line excl. VAT, then VAT rounded half up, per line.
    function lineTtc(p, qty) {
        const ht = p.price * qty;
        return ht + Math.floor((2 * ht * p.rate + 10000) / 20000);
    }

    function rs(cents) {
        const abs = Math.abs(cents);
        return (cents < 0 ? '-' : '') + 'Rs ' + Math.floor(abs / 100).toLocaleString('en-US') + '.' + String(abs % 100).padStart(2, '0');
    }

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text !== undefined) { n.textContent = text; }
        return n;
    }

    function setQty(id, qty) {
        const p = products[id];
        qty = Math.max(0, Math.min(qty, p.stock === null ? 999 : p.stock));
        if (qty === 0) { delete cart[id]; } else { cart[id] = qty; }
        save();
        render();
    }

    function render() {
        const list = document.getElementById('cart-lines');
        list.textContent = '';
        let items = 0;
        let count = 0;
        Object.keys(cart).forEach(function (id) {
            const p = products[id];
            const q = cart[id];
            items += lineTtc(p, q);
            count += q;
            const li = el('li', 'cart-line');
            li.appendChild(el('span', 'cart-name', p.name));
            const ctl = el('span', 'stepper');
            const minus = el('button', 'btn-link', '−');
            minus.type = 'button';
            minus.setAttribute('aria-label', '−1');
            minus.addEventListener('click', function () { setQty(id, q - 1); });
            const plus = el('button', 'btn-link', '+');
            plus.type = 'button';
            plus.setAttribute('aria-label', '+1');
            plus.disabled = p.stock !== null && q >= p.stock;
            plus.addEventListener('click', function () { setQty(id, q + 1); });
            ctl.appendChild(minus);
            ctl.appendChild(el('span', 'qty', String(q)));
            ctl.appendChild(plus);
            li.appendChild(ctl);
            li.appendChild(el('span', 'num', rs(lineTtc(p, q))));
            list.appendChild(li);
        });
        if (count === 0) {
            list.appendChild(el('li', 'muted small', t.empty));
        }
        document.getElementById('cart-count').textContent = count > 0 ? '(' + count + ')' : '';

        const how = form.querySelector('input[name="delivery_method"]:checked');
        const isDelivery = how && how.value === 'delivery';
        let fee = 0;
        if (isDelivery && delivery > 0 && !(freeFrom >= 0 && items >= freeFrom)) {
            fee = delivery;
        }
        document.getElementById('sum-items').textContent = rs(items);
        document.getElementById('sum-delivery').textContent = isDelivery ? (fee > 0 ? rs(fee) : t.free) : '—';
        document.getElementById('sum-total').textContent = rs(items + fee);
        document.getElementById('address-field').hidden = !isDelivery;
        form.querySelector('[type="submit"]').disabled = count === 0;
    }

    document.querySelectorAll('[data-add]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const id = btn.dataset.add;
            setQty(id, (cart[id] || 0) + 1);
            if (window.matchMedia('(max-width: 860px)').matches) {
                btn.textContent = '✓';
                window.setTimeout(function () { btn.textContent = btn.dataset.label; }, 900);
            }
        });
        btn.dataset.label = btn.textContent;
    });
    form.querySelectorAll('input[name="delivery_method"]').forEach(function (r) { r.addEventListener('change', render); });

    form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        errorBox.hidden = true;
        const f = form.elements;
        const pick = function (name) { const r = form.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; };
        try {
            const res = await fetch('/api/shoplokal/public', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({
                    o: shop.dataset.o,
                    cart: Object.keys(cart).map(function (id) { return { product_id: Number(id), quantity: cart[id] }; }),
                    name: f.name.value, phone: f.phone.value, email: f.email.value, address: f.address.value,
                    delivery_method: pick('delivery_method'), payment_method: pick('payment_method'), note: f.note.value, website: f.website.value,
                }),
            });
            const body = await res.json().catch(function () { return {}; });
            if (!res.ok) {
                throw new Error(body.error || 'Error');
            }
            cart = {};
            save();
            if (body.order_url) {
                window.location.href = body.order_url;
            }
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.hidden = false;
            errorBox.scrollIntoView({ block: 'nearest' });
            submit.disabled = false;
        }
    });

    render();
})();
