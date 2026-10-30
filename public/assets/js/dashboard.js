/**
 * Dashboard client.
 * - Logout button: POST /api/auth/logout, then back to the login page.
 * - « Bien démarrer » checklist: « Masquer » posts to /api/suite/onboarding.
 * - App launcher buttons: POST /api/suite/modules to activate/deactivate
 *   a module for the organization, then reload to show the new state.
 */
(function () {
    'use strict';

    const btn       = document.getElementById('logout-btn');
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

    btn.addEventListener('click', async function () {
        btn.disabled = true;
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
            });
        } catch (_) {
            // Fall through — we redirect regardless.
        }
        window.location.assign('/login.php');
    });

    // Terms of use / privacy policy in force not yet accepted.
    const termsAccept = document.getElementById('terms-accept');
    if (termsAccept) {
        termsAccept.addEventListener('click', async function () {
            termsAccept.disabled = true;
            const res = await fetch('/api/auth/terms', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ action: 'accept' }),
            }).catch(function () { return null; });
            if (res && res.ok) {
                document.getElementById('terms-card').remove();
            } else {
                termsAccept.disabled = false;
            }
        });
    }

    // « Bien démarrer »: hide the checklist for good.
    const obHide = document.getElementById('ob-hide');
    if (obHide) {
        obHide.addEventListener('click', async function () {
            obHide.disabled = true;
            const res = await fetch('/api/suite/onboarding', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ action: 'done' }),
            }).catch(function () { return null; });
            if (res && res.ok) {
                document.getElementById('ob-card').remove();
            } else {
                obHide.disabled = false;
            }
        });
    }

    const suiteError = document.getElementById('suite-error');

    document.querySelectorAll('button[data-action][data-module]').forEach(function (el) {
        el.addEventListener('click', async function () {
            el.disabled = true;
            if (suiteError) { suiteError.hidden = true; }
            try {
                const res = await fetch('/api/suite/modules', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken,
                    },
                    body: JSON.stringify({ action: el.dataset.action, module: el.dataset.module }),
                });
                if (res.ok) {
                    window.location.reload();
                    return;
                }
                const body = await res.json().catch(function () { return {}; });
                throw new Error(body.error || 'La requête a échoué.');
            } catch (err) {
                if (suiteError) {
                    suiteError.textContent = err.message;
                    suiteError.hidden = false;
                }
                el.disabled = false;
            }
        });
    });

    // App whose free trial is over: read-only. Form controls are disabled (values stay readable) and
    // action buttons are hidden by CSS; navigation (GET forms, .ro-ok) keeps working. The server refuses
    // every write anyway.
    if (document.body.classList.contains('is-readonly')) {
        document.querySelectorAll('.app-main input, .app-main select, .app-main textarea, .app-main button').forEach(function (el) {
            if (!el.closest('form[method="get"], .ro-ok')) {
                el.disabled = true;
            }
        });
        // Blank forms are for creating (new product, checkout…): useless read-only, hidden with their
        // card when the card holds nothing else. Filled forms (settings) stay visible, disabled.
        document.querySelectorAll('.app-main form:not([method="get"]):not(.ro-ok)').forEach(function (form) {
            const fields = form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], input[type="url"], input:not([type]), textarea');
            const blank  = fields.length > 0 && Array.prototype.every.call(fields, function (f) { return f.value.trim() === ''; });
            if (!blank) { return; }
            const card = form.closest('.card');
            const rest = card ? Array.prototype.filter.call(card.children, function (c) {
                return c !== form && !c.contains(form) && !/^(H[1-6]|P)$/.test(c.tagName);
            }) : [];
            (card && rest.length === 0 ? card : form).hidden = true;
        });
    }
})();
