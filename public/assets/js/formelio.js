/**
 * Formelio back office.
 * - Forms list: create from a template.
 * - Builder: edit, add, move and remove questions; open / close; link; delete.
 * - Results: delete a response.
 * All endpoints: POST JSON with the CSRF token; the server validates everything.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('fm-error');

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest' });
    }

    async function post(payload) {
        errorBox.hidden = true;
        const res = await fetch('/api/formelio/forms', {
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

    function onClick(selector, fn) {
        document.querySelectorAll(selector).forEach(function (btn) {
            btn.addEventListener('click', async function () {
                btn.disabled = true;
                try {
                    await fn(btn);
                } catch (err) {
                    showError(err.message);
                } finally {
                    btn.disabled = false;
                }
            });
        });
    }

    onClick('[data-fm-create]', async function (btn) {
        const body = await post({ action: 'create', template: btn.dataset.fmCreate });
        window.location.href = '/app.php?m=formelio&p=edit&id=' + body.id;
    });

    onClick('[data-fm-status]', async function (btn) {
        await post({ action: 'status', id: Number(btn.dataset.id), status: btn.dataset.fmStatus });
        window.location.reload();
    });

    onClick('[data-fm-new-link]', async function (btn) {
        if (!window.confirm('Créer un nouveau lien ? L\'ancien cessera de fonctionner, y compris là où vous l\'avez partagé.')) { return; }
        await post({ action: 'new_link', id: Number(btn.dataset.fmNewLink) });
        window.location.reload();
    });

    onClick('[data-fm-delete]', async function (btn) {
        if (!window.confirm('Supprimer ce formulaire et toutes ses réponses ? C\'est définitif.')) { return; }
        await post({ action: 'delete', id: Number(btn.dataset.fmDelete) });
        window.location.href = '/app.php?m=formelio';
    });

    onClick('[data-fm-delete-response]', async function (btn) {
        if (!window.confirm('Supprimer cette réponse ?')) { return; }
        await post({ action: 'delete_response', id: Number(btn.dataset.fmDeleteResponse) });
        window.location.reload();
    });

    const copyBtn = document.getElementById('fm-copy');
    if (copyBtn) {
        copyBtn.addEventListener('click', async function () {
            const input = document.getElementById('fm-link');
            try {
                await navigator.clipboard.writeText(input.value);
                copyBtn.textContent = 'Copié';
            } catch (e) {
                input.select();
            }
        });
    }

    // ---- Builder ---------------------------------------------------------
    const form = document.getElementById('fm-form');
    if (!form) { return; }

    const types  = JSON.parse(form.dataset.types);
    const list   = document.getElementById('fm-fields');
    let fields   = JSON.parse(form.dataset.fields);
    const hasOptions = function (type) { return type === 'choice' || type === 'multi'; };

    function el(tag, attrs, text) {
        const node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
        if (text !== undefined) { node.textContent = text; }
        return node;
    }

    // Copy what is typed into the state before re-rendering.
    function sync() {
        list.querySelectorAll('li.fm-field').forEach(function (li, i) {
            const f = fields[i];
            f.label = li.querySelector('[data-k="label"]').value;
            f.type = li.querySelector('[data-k="type"]').value;
            f.required = li.querySelector('[data-k="required"]').checked;
            const opts = li.querySelector('[data-k="options"]');
            f.options = opts ? opts.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : [];
        });
    }

    function render() {
        list.textContent = '';
        fields.forEach(function (f, i) {
            const li = el('li', { class: 'fm-field' });
            const row = el('div', { class: 'fm-row' });
            const label = el('input', { type: 'text', maxlength: '300', 'data-k': 'label', 'aria-label': 'Intitulé de la question ' + (i + 1), placeholder: 'Intitulé de la question' });
            label.value = f.label;
            const type = el('select', { 'data-k': 'type', 'aria-label': 'Type de réponse' });
            Object.keys(types).forEach(function (k) {
                const o = el('option', { value: k }, types[k]);
                if (k === f.type) { o.selected = true; }
                type.appendChild(o);
            });
            type.addEventListener('change', function () { sync(); render(); });
            row.appendChild(label);
            row.appendChild(type);
            li.appendChild(row);

            if (hasOptions(f.type)) {
                const opts = el('textarea', { rows: '3', 'data-k': 'options', 'aria-label': 'Choix, un par ligne', placeholder: 'Un choix par ligne' });
                opts.value = (f.options || []).join('\n');
                li.appendChild(opts);
            }

            const tools = el('div', { class: 'fm-tools' });
            const req = el('label', { class: 'checkbox small' });
            const box = el('input', { type: 'checkbox', 'data-k': 'required' });
            box.checked = !!f.required;
            req.appendChild(box);
            req.appendChild(document.createTextNode(' Obligatoire'));
            tools.appendChild(req);
            [['↑', -1, 'Monter'], ['↓', 1, 'Descendre']].forEach(function (m) {
                const b = el('button', { type: 'button', class: 'btn-link', 'aria-label': m[2] }, m[0]);
                b.disabled = i + m[1] < 0 || i + m[1] >= fields.length;
                b.addEventListener('click', function () {
                    sync();
                    const tmp = fields[i];
                    fields[i] = fields[i + m[1]];
                    fields[i + m[1]] = tmp;
                    render();
                });
                tools.appendChild(b);
            });
            const del = el('button', { type: 'button', class: 'btn-link danger' }, 'Supprimer');
            del.addEventListener('click', function () { sync(); fields.splice(i, 1); render(); });
            tools.appendChild(del);
            li.appendChild(tools);
            list.appendChild(li);
        });
    }

    document.getElementById('fm-add').addEventListener('click', function () {
        sync();
        const type = document.getElementById('fm-add-type').value;
        fields.push({ id: '', type: type, label: '', required: false, options: hasOptions(type) ? ['Oui', 'Non'] : [] });
        render();
        list.lastElementChild.querySelector('[data-k="label"]').focus();
    });

    form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        sync();
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        document.getElementById('fm-saved').hidden = true;
        try {
            await post({
                action: 'save', id: Number(form.dataset.id), title: form.elements.title.value,
                description: form.elements.description.value, thank_you: form.elements.thank_you.value,
                notify_email: form.elements.notify_email.value, fields: fields,
            });
            window.location.reload();
        } catch (err) {
            showError(err.message);
        } finally {
            submit.disabled = false;
        }
    });

    render();
})();
