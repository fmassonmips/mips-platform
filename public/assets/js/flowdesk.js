/**
 * FlowDesk back office: new ticket, reply / note, status / priority / assignee
 * (saved on change), contact form settings.
 * All endpoints: POST JSON with the CSRF token; the server enforces every rule.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('fd-error');

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest' });
    }

    async function post(payload) {
        errorBox.hidden = true;
        const res = await fetch('/api/flowdesk/tickets', {
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

    const staffNew = document.getElementById('fd-staff-new');
    if (staffNew) {
        guard(staffNew, async function (f) {
            const body = await post({
                action: 'create', name: f.name.value, email: f.email.value, phone: f.phone.value,
                subject: f.subject.value, message: f.message.value,
            });
            window.location.href = '/app.php?m=flowdesk&p=ticket&id=' + body.id;
        });
    }

    const answer = document.getElementById('fd-answer');
    if (answer) {
        guard(answer, async function (f) {
            const kind = answer.querySelector('input[name="kind"]:checked');
            await post({
                action: 'answer', id: Number(answer.dataset.id), kind: kind ? kind.value : 'note',
                body: f.body.value, status: f.status.value,
            });
            window.location.reload();
        });
    }

    const update = document.getElementById('fd-update');
    if (update) {
        ['status', 'priority', 'assignee_id'].forEach(function (name) {
            update.elements[name].addEventListener('change', async function () {
                const payload = { action: 'update', id: Number(update.dataset.id) };
                payload[name] = name === 'assignee_id' ? Number(update.elements[name].value) : update.elements[name].value;
                try {
                    await post(payload);
                    window.location.reload();
                } catch (err) {
                    showError(err.message);
                }
            });
        });
        update.addEventListener('submit', function (ev) { ev.preventDefault(); });
    }

    const taskForm = document.getElementById('fd-task');
    if (taskForm) {
        guard(taskForm, async function (f) {
            const res = await fetch('/api/teamnest/tasks', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ action: 'from_ticket', ticket_id: Number(taskForm.dataset.ticket), project_id: Number(f.project_id.value), title: f.title.value }),
            });
            const body = await res.json().catch(function () { return {}; });
            if (!res.ok) {
                throw new Error(body.error || 'La requête a échoué.');
            }
            window.location.reload();
        });
    }

    const settings = document.getElementById('fd-settings');
    if (settings && settings.querySelector('[type="submit"]')) {
        guard(settings, async function (f) {
            await post({ action: 'settings', form_enabled: f.form_enabled.checked, notify_email: f.notify_email.value, intro: f.intro.value });
            document.getElementById('fd-saved').hidden = false;
        });
    }

    const copy = document.getElementById('fd-copy');
    if (copy) {
        copy.addEventListener('click', async function () {
            const input = document.getElementById('fd-link');
            try {
                await navigator.clipboard.writeText(input.value);
                copy.textContent = 'Copié';
            } catch (e) {
                input.select();
            }
        });
    }

    const newLink = document.getElementById('fd-new-link');
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
