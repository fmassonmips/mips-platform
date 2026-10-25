/**
 * ClientBloom client.
 * - Counter: find a customer by phone, record a sale with optional cashback use.
 * - Customer profile: save, notes, loyalty card link (copy / WhatsApp), erase.
 * - Manager tools: manual correction, reversal.
 * - Program rules: save.
 * All endpoints: POST JSON with the CSRF token; the server enforces every rule.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('cb-error');

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest' });
    }

    async function post(url, payload) {
        errorBox.hidden = true;
        const res = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            throw new Error(body.error || 'Request failed.');
        }
        return body;
    }

    function guard(form, fn) {
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            if (submit) { submit.disabled = true; }
            try {
                await fn();
            } catch (err) {
                showError(err.message);
            } finally {
                if (submit) { submit.disabled = false; }
            }
        });
    }

    const profileUrl = function (id) { return '/app.php?m=clientbloom&p=customer&id=' + encodeURIComponent(id); };

    // ---- Counter ---------------------------------------------------------
    const lookupForm = document.getElementById('lookup-form');
    if (lookupForm) {
        const checkout = document.getElementById('checkout');
        const notFound = document.getElementById('not-found');
        const result   = document.getElementById('co-result');
        const coForm   = document.getElementById('checkout-form');
        let customerId = 0;

        const showCustomer = function (c) {
            customerId = c.id;
            document.getElementById('co-name').textContent = c.name;
            document.getElementById('co-phone').textContent = c.phone;
            document.getElementById('co-balance').textContent = c.balance;
            document.getElementById('co-visits').textContent = c.visits + ' visit(s)' + (c.last_visit_at ? ' · last ' + c.last_visit_at.slice(0, 10) : '');
            document.getElementById('co-profile').href = profileUrl(c.id);
            checkout.hidden = false;
            notFound.hidden = true;
            coForm.elements.amount.focus();
        };

        guard(lookupForm, async function () {
            result.hidden = true;
            const phone = lookupForm.elements.phone.value;
            const body = await post('/api/clientbloom/loyalty', { action: 'lookup', phone: phone });
            if (body.customer) {
                showCustomer(body.customer);
            } else {
                checkout.hidden = true;
                notFound.hidden = false;
                document.getElementById('create-link').href = '/app.php?m=clientbloom&p=customer&phone=' + encodeURIComponent(phone);
            }
        });

        guard(coForm, async function () {
            const body = await post('/api/clientbloom/loyalty', {
                action: 'checkout',
                id: customerId,
                amount: coForm.elements.amount.value,
                redeem: coForm.elements.redeem.value,
                reference: coForm.elements.reference.value,
            });
            result.textContent = 'Sale recorded. Cashback earned ' + body.earned
                + (body.redeemed !== 'MUR 0.00' ? ', used ' + body.redeemed : '')
                + '. New balance: ' + body.balance + '.';
            result.hidden = false;
            document.getElementById('co-balance').textContent = body.balance;
            coForm.reset();
            checkout.hidden = true;
            lookupForm.reset();
            lookupForm.elements.phone.focus();
        });
    }

    // ---- Customer profile ------------------------------------------------
    const customerForm = document.getElementById('customer-form');
    if (customerForm) {
        guard(customerForm, async function () {
            const f = customerForm.elements;
            const body = await post('/api/clientbloom/customers', {
                action: 'save',
                id: Number(customerForm.dataset.id),
                name: f.name.value,
                phone: f.phone.value,
                email: f.email.value,
                birthday: f.birthday.value,
                tags: f.tags.value,
                marketing_consent: f.marketing_consent.checked,
            });
            window.location.assign(profileUrl(body.id));
        });

        const cardBtn = document.getElementById('card-btn');
        if (cardBtn) {
            cardBtn.addEventListener('click', async function () {
                try {
                    const body = await post('/api/clientbloom/customers', { action: 'card', id: Number(cardBtn.dataset.id) });
                    const share = document.getElementById('card-share');
                    const wa = document.getElementById('card-wa');
                    document.getElementById('card-url').value = body.url;
                    let phone = wa.dataset.phone || '';
                    if (phone && phone.length <= 8) { phone = '230' + phone; }   // Mauritian local number
                    const text = 'Hello ' + wa.dataset.name + ', here is your loyalty card: ' + body.url;
                    wa.href = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
                    share.hidden = false;
                } catch (err) {
                    showError(err.message);
                }
            });
        }

        const eraseBtn = document.getElementById('erase-btn');
        if (eraseBtn) {
            eraseBtn.addEventListener('click', async function () {
                if (!window.confirm('Erase this customer\'s personal data? This cannot be undone.')) { return; }
                try {
                    await post('/api/clientbloom/customers', { action: 'erase', id: Number(eraseBtn.dataset.id) });
                    window.location.reload();
                } catch (err) {
                    showError(err.message);
                }
            });
        }
    }

    const noteForm = document.getElementById('note-form');
    if (noteForm) {
        guard(noteForm, async function () {
            await post('/api/clientbloom/customers', { action: 'note', id: Number(noteForm.dataset.id), body: noteForm.elements.body.value });
            window.location.reload();
        });
    }

    // ---- Manager corrections --------------------------------------------
    const adjustForm = document.getElementById('adjust-form');
    if (adjustForm) {
        guard(adjustForm, async function () {
            await post('/api/clientbloom/loyalty', {
                action: 'adjust',
                id: Number(adjustForm.dataset.id),
                amount: adjustForm.elements.amount.value,
                reason: adjustForm.elements.reason.value,
            });
            window.location.reload();
        });
    }

    document.querySelectorAll('[data-reverse]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
            if (!window.confirm('Reverse this transaction?')) { return; }
            btn.disabled = true;
            try {
                await post('/api/clientbloom/loyalty', { action: 'reverse', transaction_id: Number(btn.dataset.reverse) });
                window.location.reload();
            } catch (err) {
                showError(err.message);
                btn.disabled = false;
            }
        });
    });

    // ---- Program rules ---------------------------------------------------
    const programForm = document.getElementById('program-form');
    if (programForm && programForm.querySelector('[type="submit"]')) {
        guard(programForm, async function () {
            const f = programForm.elements;
            await post('/api/clientbloom/settings', {
                cashback_rate: f.cashback_rate.value,
                min_redeem: f.min_redeem.value,
                welcome_bonus: f.welcome_bonus.value,
                expiry_months: f.expiry_months.value,
            });
            document.getElementById('program-saved').hidden = false;
        });
    }
})();
