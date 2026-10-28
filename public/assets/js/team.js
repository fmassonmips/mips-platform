/**
 * Team page: invite (link shown for copy / WhatsApp), resend, revoke,
 * change a role, remove a member. The server enforces every rule.
 */
(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const errorBox  = document.getElementById('team-error');

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest' });
    }

    async function post(payload) {
        errorBox.hidden = true;
        const res = await fetch('/api/suite/team', {
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

    function showLink(email, url) {
        document.getElementById('invite-msg').textContent = 'Invitation envoyée à ' + email + '.';
        document.getElementById('invite-link').value = url;
        document.getElementById('invite-wa').href = 'https://wa.me/?text=' + encodeURIComponent('Rejoignez notre équipe sur MIPS : ' + url);
        document.getElementById('invite-copy').textContent = 'Copier';
        document.getElementById('invite-done').hidden = false;
    }

    const form = document.getElementById('invite-form');
    if (form) {
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            try {
                const email = form.elements.email.value.trim();
                const body  = await post({ action: 'invite', email: email, role: form.elements.role.value });
                form.reset();
                showLink(email, body.url);
            } catch (err) {
                showError(err.message);
            } finally {
                submit.disabled = false;
            }
        });
    }

    const copy = document.getElementById('invite-copy');
    if (copy) {
        copy.addEventListener('click', async function () {
            const input = document.getElementById('invite-link');
            try {
                await navigator.clipboard.writeText(input.value);
                copy.textContent = 'Copié';
            } catch (e) {
                input.select();
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

    onClick('[data-resend]', async function (btn) {
        const body = await post({ action: 'invite', email: btn.dataset.resend, role: btn.dataset.role });
        showLink(btn.dataset.resend, body.url);
        document.getElementById('invite-done').scrollIntoView({ block: 'nearest' });
        btn.disabled = false;
    });

    onClick('[data-revoke]', async function (btn) {
        await post({ action: 'revoke', id: Number(btn.dataset.revoke) });
        window.location.reload();
    });

    onClick('[data-remove]', async function (btn) {
        if (!window.confirm('Retirer ' + btn.dataset.name + ' de l\'équipe ? Son accès est coupé immédiatement ; ses tâches et tickets en cours sont désassignés.')) {
            btn.disabled = false;
            return;
        }
        await post({ action: 'remove', user_id: Number(btn.dataset.remove) });
        window.location.reload();
    });

    document.querySelectorAll('[data-role-of]').forEach(function (sel) {
        const before = sel.value;
        sel.addEventListener('change', async function () {
            sel.disabled = true;
            try {
                await post({ action: 'role', user_id: Number(sel.dataset.roleOf), role: sel.value });
                window.location.reload();
            } catch (err) {
                sel.value = before;
                sel.disabled = false;
                showError(err.message);
            }
        });
    });
})();
