/**
 * ShopLokal back office: products (photo shrunk in the browser), order status,
 * payment, Facturo invoice, shop settings and link.
 * All endpoints: POST JSON with the CSRF token; the server enforces every rule.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('sl-error');

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest' });
    }

    async function post(payload) {
        errorBox.hidden = true;
        const res = await fetch('/api/shoplokal/shop', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            throw new Error(body.error || 'La requête a échoué.');
        }
        return body;
    }

    function guard(form, fn) {
        if (!form) { return; }
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            if (submit) { submit.disabled = true; }
            try {
                await fn(form.elements);
            } catch (err) {
                showError(err.message);
            } finally {
                if (submit) { submit.disabled = false; }
            }
        });
    }

    function onClick(selector, fn) {
        document.querySelectorAll(selector).forEach(function (btn) {
            btn.addEventListener('click', async function () {
                btn.disabled = true;
                try {
                    await fn(btn);
                } catch (err) {
                    showError(err.message);
                    btn.disabled = false;
                }
            });
        });
    }

    /* ---- Products ---- */

    // Phone photos are several MB: shrink to 800 px JPEG before sending (server cap: 400 KB).
    // Read as a data URL: the CSP allows data: images, not blob:.
    function shrink(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onerror = function () { reject(new Error('Image illisible.')); };
            reader.onload = function () {
                const img = new Image();
                img.onload = function () {
                    const scale  = Math.min(1, 800 / Math.max(img.width, img.height));
                    const canvas = document.createElement('canvas');
                    canvas.width  = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = function () { reject(new Error('Image illisible.')); };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    const productForm = document.getElementById('sl-product-form');
    if (productForm) {
        const f       = productForm.elements;
        const file    = document.getElementById('pr-image');
        const preview = document.getElementById('pr-preview');
        const remove  = document.getElementById('pr-remove-wrap');
        const title   = document.getElementById('product-form-title');
        let image = '';

        file.addEventListener('change', async function () {
            image = '';
            preview.hidden = true;
            if (!file.files.length) { return; }
            try {
                image = await shrink(file.files[0]);
                preview.src = image;
                preview.hidden = false;
            } catch (err) {
                showError(err.message);
            }
        });

        productForm.addEventListener('reset', function () {
            productForm.dataset.id = '0';
            title.textContent = 'Nouveau produit';
            image = '';
            preview.hidden = true;
            remove.hidden = true;
            setTimeout(function () { f.tax_code.value = productForm.dataset.defaultCode; });
        });

        guard(productForm, async function () {
            await post({
                action: 'product', id: Number(productForm.dataset.id), name: f.name.value, description: f.description.value,
                price: f.price.value.trim(), tax_code: f.tax_code.value, stock: f.stock.value.trim(), active: f.active.checked,
                image: image !== '' ? image : (f.remove_image.checked ? 'remove' : ''),
            });
            window.location.reload();
        });

        document.querySelectorAll('[data-edit-product]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const p = JSON.parse(btn.dataset.editProduct);
                productForm.reset();
                productForm.dataset.id = String(p.id);
                title.textContent = 'Modifier « ' + p.name + ' »';
                f.name.value = p.name;
                f.description.value = p.description;
                f.price.value = p.price;
                f.stock.value = p.stock;
                f.active.checked = p.active;
                remove.hidden = !p.has_image;
                setTimeout(function () { f.tax_code.value = p.tax_code; });
                productForm.scrollIntoView({ block: 'start' });
                f.name.focus();
            });
        });
    }

    /* ---- Orders ---- */

    onClick('[data-sl-status]', async function (btn) {
        if (btn.dataset.slStatus === 'cancelled' && !window.confirm('Annuler cette commande ? Le stock sera remis en vente.')) {
            btn.disabled = false;
            return;
        }
        await post({ action: 'status', id: Number(btn.dataset.id), status: btn.dataset.slStatus });
        window.location.reload();
    });

    onClick('[data-sl-paid]', async function (btn) {
        await post({ action: 'paid', id: Number(btn.dataset.id), paid: btn.dataset.slPaid === '1' });
        window.location.reload();
    });

    onClick('#sl-invoice', async function (btn) {
        const body = await post({ action: 'invoice', id: Number(btn.dataset.id) });
        window.location.href = '/app.php?m=facturo&p=edit&id=' + body.id;
    });

    /* ---- Shop settings ---- */

    const settings = document.getElementById('sl-settings');
    if (settings && settings.querySelector('[type="submit"]')) {
        guard(settings, async function (f) {
            const payload = { action: 'settings' };
            ['shop_open', 'pay_cod', 'pay_bank', 'pay_juice', 'delivery_enabled', 'pickup_enabled'].forEach(function (k) {
                payload[k] = f[k].checked;
            });
            ['intro', 'bank_details', 'juice_number', 'delivery_fee', 'free_delivery_from', 'pickup_address', 'notify_email'].forEach(function (k) {
                payload[k] = f[k].value.trim();
            });
            await post(payload);
            window.location.reload();
        });
    }

    const copy = document.getElementById('sl-copy');
    if (copy) {
        copy.addEventListener('click', async function () {
            const input = document.getElementById('sl-link');
            try {
                await navigator.clipboard.writeText(input.value);
                copy.textContent = 'Copié';
            } catch (e) {
                input.select();
            }
        });
    }

    const newLink = document.getElementById('sl-new-link');
    if (newLink) {
        newLink.addEventListener('click', async function () {
            if (!window.confirm('Créer un nouveau lien ? L\'ancien cessera de fonctionner.')) { return; }
            try {
                await post({ action: 'new_link' });
                window.location.reload();
            } catch (err) {
                showError(err.message);
            }
        });
    }
})();
