/**
 * Import from Excel (CSV): read the file, check the column matching and every
 * row (nothing saved), then import. The file is sent as base64 so that the
 * server can tell UTF-8 from Windows-1252 (Excel « CSV » on Windows).
 */
(function () {
    'use strict';

    const root = document.getElementById('import');
    if (!root) { return; }
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const type      = root.dataset.type;
    const fields    = JSON.parse(root.dataset.fields);
    const input     = document.getElementById('im-file');
    const errorBox  = document.getElementById('im-error');
    const check     = document.getElementById('im-check');
    const mappingEl = document.getElementById('im-mapping');
    const summary   = document.getElementById('im-summary');
    const errorList = document.getElementById('im-errors');
    const go        = document.getElementById('im-go');
    let file = '';
    let header = [];

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    }

    async function post(payload) {
        payload.type = type;
        payload.file = file;
        const res = await fetch('/api/suite/import', {
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

    function mapping() {
        const out = {};
        mappingEl.querySelectorAll('select').forEach(function (s) { out[s.name] = Number(s.value); });
        return out;
    }

    function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }

    function listErrors(ul, errors) {
        ul.replaceChildren();
        errors.slice(0, 50).forEach(function (er) {
            const li = document.createElement('li');
            li.textContent = 'Ligne ' + er.line + ' : ' + er.message;
            ul.appendChild(li);
        });
        if (errors.length > 50) {
            const li = document.createElement('li');
            li.textContent = '… et ' + (errors.length - 50) + ' autres lignes.';
            ul.appendChild(li);
        }
    }

    function showResult(r, rows) {
        const parts = [plural(r.created, 'ligne prête à importer', 'lignes prêtes à importer')];
        if (r.duplicates > 0) { parts.push(plural(r.duplicates, 'déjà présente (ignorée)', 'déjà présentes (ignorées)')); }
        if (r.errors.length > 0) { parts.push(plural(r.errors.length, 'ligne à corriger (ignorée)', 'lignes à corriger (ignorées)')); }
        summary.textContent = rows + ' lignes dans le fichier : ' + parts.join(', ') + '.';
        listErrors(errorList, r.errors);
        go.disabled = r.created === 0;
        go.textContent = r.created > 0 ? 'Importer ' + plural(r.created, 'ligne', 'lignes') : 'Rien à importer';
    }

    function buildMapping(map) {
        mappingEl.replaceChildren();
        Object.keys(fields).forEach(function (key) {
            const wrap = document.createElement('div');
            wrap.className = 'field';
            const label = document.createElement('label');
            label.htmlFor = 'im-map-' + key;
            label.textContent = fields[key].label + (fields[key].required ? ' *' : '');
            const select = document.createElement('select');
            select.id = 'im-map-' + key;
            select.name = key;
            const none = document.createElement('option');
            none.value = '-1';
            none.textContent = fields[key].required ? '— choisir une colonne —' : '— ne pas importer —';
            select.appendChild(none);
            header.forEach(function (h, i) {
                const o = document.createElement('option');
                o.value = String(i);
                o.textContent = h !== '' ? h : 'Colonne ' + (i + 1);
                select.appendChild(o);
            });
            select.value = String(map[key]);
            select.addEventListener('change', recheck);
            wrap.append(label, select);
            mappingEl.appendChild(wrap);
        });
    }

    async function recheck() {
        errorBox.hidden = true;
        go.disabled = true;
        try {
            const body = await post({ action: 'check', mapping: mapping() });
            showResult(body.result, body.rows);
        } catch (err) {
            summary.textContent = '';
            errorList.replaceChildren();
            showError(err.message);
        }
    }

    input.addEventListener('change', function () {
        errorBox.hidden = true;
        check.hidden = true;
        document.getElementById('im-done').hidden = true;
        const f = input.files[0];
        if (!f) { return; }
        if (f.size > 1000000) { showError('Fichier trop gros (1 Mo au plus).'); return; }
        const reader = new FileReader();
        reader.onload = async function () {
            const bytes = new Uint8Array(reader.result);
            let bin = '';
            for (let i = 0; i < bytes.length; i += 0x8000) {
                bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            }
            file = btoa(bin);
            try {
                const body = await post({ action: 'preview' });
                header = body.header;
                buildMapping(body.mapping);
                check.hidden = false;
                if (body.result) {
                    showResult(body.result, body.rows);
                } else {
                    await recheck();
                }
            } catch (err) {
                showError(err.message);
            }
        };
        reader.readAsArrayBuffer(f);
    });

    go.addEventListener('click', async function () {
        go.disabled = true;
        errorBox.hidden = true;
        try {
            const body = await post({ action: 'import', mapping: mapping() });
            const r = body.result;
            let text = plural(r.created, 'ligne importée', 'lignes importées') + '.';
            if (r.duplicates > 0) { text += ' ' + plural(r.duplicates, 'déjà présente, ignorée', 'déjà présentes, ignorées') + '.'; }
            if (r.errors.length > 0) { text += ' ' + plural(r.errors.length, 'ligne non importée', 'lignes non importées') + ' (à corriger dans le fichier puis réimporter : les lignes déjà importées seront ignorées) :'; }
            document.getElementById('im-done-text').textContent = text;
            listErrors(document.getElementById('im-done-errors'), r.errors);
            check.hidden = true;
            input.value = '';
            document.getElementById('im-done').hidden = false;
        } catch (err) {
            showError(err.message);
            go.disabled = false;
        }
    });
})();
