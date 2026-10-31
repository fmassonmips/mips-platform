/**
 * FlowDesk customer pages: new request, reply on the ticket page.
 * Messages come back from the server in the company's document language.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('fd-error');

    async function post(payload) {
        errorBox.hidden = true;
        const res = await fetch('/api/flowdesk/public', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            throw new Error(body.error || 'Error');
        }
        return body;
    }

    function guard(form, fn) {
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            try {
                await fn(form.elements);
            } catch (err) {
                errorBox.textContent = err.message;
                errorBox.hidden = false;
                errorBox.scrollIntoView({ block: 'nearest' });
                submit.disabled = false;
            }
        });
    }

    const newForm = document.getElementById('fd-new');
    if (newForm) {
        guard(newForm, async function (f) {
            const body = await post({
                action: 'create', o: newForm.dataset.o, name: f.name.value, email: f.email.value, phone: f.phone.value,
                subject: f.subject.value, message: f.message.value, website: f.website.value,
            });
            if (body.ticket_url) {
                window.location.href = body.ticket_url;
            }
        });
    }

    const replyForm = document.getElementById('fd-reply');
    if (replyForm) {
        guard(replyForm, async function (f) {
            await post({ action: 'reply', t: replyForm.dataset.t, body: f.body.value });
            window.location.reload();
        });
    }
})();
