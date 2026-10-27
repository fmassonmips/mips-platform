/**
 * Public Formelio form: collects the answers and posts them.
 * Required fields and formats are checked by the server, whose messages
 * come back in the form's language.
 */
(function () {
    'use strict';

    const form = document.getElementById('public-form');
    if (!form) { return; }
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('fm-error');

    form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        const answers = {};
        form.querySelectorAll('[data-field]').forEach(function (block) {
            const id = block.dataset.field;
            const name = 'q_' + id;
            if (block.dataset.type === 'multi') {
                answers[id] = Array.from(form.querySelectorAll('input[name="' + name + '"]:checked')).map(function (i) { return i.value; });
            } else if (['choice', 'rating', 'nps'].indexOf(block.dataset.type) !== -1) {
                const picked = form.querySelector('input[name="' + name + '"]:checked');
                answers[id] = picked ? picked.value : '';
            } else {
                answers[id] = form.elements[name].value;
            }
        });

        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        errorBox.hidden = true;
        try {
            const res = await fetch('/api/formelio/public', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ t: form.dataset.t, r: form.dataset.r, answers: answers, website: form.elements.website.value }),
            });
            const body = await res.json().catch(function () { return {}; });
            if (!res.ok) {
                throw new Error(body.error || 'Error');
            }
            form.hidden = true;
            document.getElementById('fm-thanks').hidden = false;
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.hidden = false;
            errorBox.scrollIntoView({ block: 'nearest' });
            submit.disabled = false;
        }
    });
})();
