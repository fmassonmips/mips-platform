/**
 * TeamNest: projects, board moves, quick add, task edit, time, billing.
 * All endpoints: POST JSON with the CSRF token; the server enforces every rule.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('tn-error');

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest' });
    }

    async function post(payload) {
        errorBox.hidden = true;
        const res = await fetch('/api/teamnest/tasks', {
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

    const projectForm = document.getElementById('tn-project-form');
    guard(projectForm, async function (f) {
        const body = await post({
            action: 'project', id: Number(projectForm.dataset.id), name: f.name.value, description: f.description.value,
            client_id: f.client_id ? Number(f.client_id.value) : 0, hourly_rate: f.hourly_rate ? f.hourly_rate.value.trim() : '',
        });
        window.location.href = '/app.php?m=teamnest&p=project&id=' + body.id;
    });

    const quick = document.getElementById('tn-quick');
    guard(quick, async function (f) {
        await post({
            action: 'task', id: 0, project_id: Number(quick.dataset.project), title: f.title.value, description: '',
            status: 'todo', priority: 'normal', assignee_id: Number(f.assignee_id.value), due_date: f.due_date.value,
        });
        window.location.reload();
    });

    onClick('[data-tn-move]', async function (btn) {
        await post({ action: 'move', id: Number(btn.dataset.id), status: btn.dataset.tnMove });
        window.location.reload();
    });

    onClick('[data-tn-archive]', async function (btn) {
        await post({ action: 'archive', id: Number(btn.dataset.id), archived: btn.dataset.tnArchive === '1' });
        window.location.href = '/app.php?m=teamnest';
    });

    onClick('#tn-bill', async function (btn) {
        if (!window.confirm('Créer un brouillon de facture Facturo avec le temps non facturé de ce projet ?')) {
            btn.disabled = false;
            return;
        }
        const body = await post({ action: 'bill', id: Number(btn.dataset.id) });
        window.location.href = '/app.php?m=facturo&p=edit&id=' + body.id;
    });

    const taskForm = document.getElementById('tn-task-form');
    guard(taskForm, async function (f) {
        await post({
            action: 'task', id: Number(taskForm.dataset.id), project_id: Number(f.project_id.value), title: f.title.value,
            description: f.description.value, status: f.status.value, priority: f.priority.value,
            assignee_id: Number(f.assignee_id.value), due_date: f.due_date.value,
        });
        document.getElementById('tn-saved').hidden = false;
    });

    onClick('[data-tn-delete]', async function (btn) {
        if (!window.confirm('Supprimer cette tâche et son temps passé ?')) {
            btn.disabled = false;
            return;
        }
        await post({ action: 'delete_task', id: Number(btn.dataset.tnDelete) });
        window.location.href = '/app.php?m=teamnest&p=project&id=' + btn.dataset.project;
    });

    const timeForm = document.getElementById('tn-time-form');
    guard(timeForm, async function (f) {
        await post({ action: 'time', task_id: Number(timeForm.dataset.task), duration: f.duration.value, date: f.date.value, note: f.note.value });
        window.location.reload();
    });

    onClick('[data-tn-del-time]', async function (btn) {
        await post({ action: 'delete_time', id: Number(btn.dataset.tnDelTime) });
        window.location.reload();
    });

})();
