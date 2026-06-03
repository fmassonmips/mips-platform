/**
 * Shared client-side helpers for the MIPS Assurance platform.
 *
 * Exposes a small `window.App` namespace used by every page script:
 *   - t()            translate a key (with {placeholder} substitution)
 *   - fmtMoney()     format a number as currency in the active locale
 *   - fmtDate()      format a YYYY-MM-DD value
 *   - fmtDateTime()  format a YYYY-MM-DD HH:MM:SS value
 *   - escapeHtml()   escape a string for safe insertion into innerHTML
 *   - api()          fetch wrapper (JSON + CSRF + 401 handling)
 *   - toast()        transient status message
 *   - modal helpers  openModal / closeModal
 *   - form helpers   fillForm / serializeForm / setFieldErrors / clearFieldErrors
 *
 * No inline scripts anywhere — config travels via the #page-data JSON block,
 * keeping everything compatible with the strict `script-src 'self'` CSP.
 */
(function () {
    'use strict';

    var PD = {};
    try {
        PD = JSON.parse(document.getElementById('page-data').textContent);
    } catch (e) {
        PD = { csrf: '', locale: 'en', currency: 'Rs', t: {} };
    }

    var MESSAGES = PD.t || {};
    var LOCALE   = PD.locale || 'en';
    var CURRENCY = PD.currency || 'Rs';
    var CSRF     = PD.csrf || '';

    function t(key, repl) {
        var msg = Object.prototype.hasOwnProperty.call(MESSAGES, key) ? MESSAGES[key] : key;
        if (repl) {
            Object.keys(repl).forEach(function (k) {
                msg = msg.replace('{' + k + '}', String(repl[k]));
            });
        }
        return msg;
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) { return ''; }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    var moneyFmt = new Intl.NumberFormat(LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    function fmtMoney(value) {
        var n = Number(value);
        if (!isFinite(n)) { n = 0; }
        return CURRENCY + ' ' + moneyFmt.format(n);
    }

    var dateFmt = new Intl.DateTimeFormat(LOCALE, { year: 'numeric', month: 'short', day: 'numeric' });

    function fmtDate(value) {
        if (!value) { return t('common.none'); }
        var d = new Date(String(value).slice(0, 10) + 'T00:00:00');
        return isNaN(d.getTime()) ? escapeHtml(value) : dateFmt.format(d);
    }

    var dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    function fmtDateTime(value) {
        if (!value) { return t('common.none'); }
        var d = new Date(String(value).replace(' ', 'T'));
        return isNaN(d.getTime()) ? escapeHtml(value) : dateTimeFmt.format(d);
    }

    /**
     * JSON fetch wrapper.
     * Returns { ok, status, data }. Redirects to /login.php on 401.
     */
    function api(method, url, body) {
        var headers = { 'Accept': 'application/json' };
        var opts = { method: method, credentials: 'same-origin', headers: headers };

        if (method !== 'GET' && method !== 'HEAD') {
            headers['X-CSRF-Token'] = CSRF;
            if (body !== undefined && body !== null) {
                headers['Content-Type'] = 'application/json';
                opts.body = JSON.stringify(body);
            }
        }

        return fetch(url, opts).then(function (res) {
            if (res.status === 401) {
                window.location.assign('/login.php');
                return { ok: false, status: 401, data: {} };
            }
            return res.json().catch(function () { return {}; }).then(function (data) {
                return { ok: res.ok, status: res.status, data: data || {} };
            });
        });
    }

    var toastTimer = null;
    function toast(message, kind) {
        var el = document.getElementById('toast');
        if (!el) { return; }
        el.textContent = message;
        el.className = 'toast show' + (kind ? ' toast-' + kind : '');
        el.hidden = false;
        if (toastTimer) { clearTimeout(toastTimer); }
        toastTimer = setTimeout(function () {
            el.className = 'toast';
            el.hidden = true;
        }, 3200);
    }

    function openModal(id) {
        var el = document.getElementById(id);
        if (el) { el.classList.remove('hidden'); document.body.classList.add('modal-open'); }
    }

    function closeModal(id) {
        var el = document.getElementById(id);
        if (el) { el.classList.add('hidden'); document.body.classList.remove('modal-open'); }
    }

    // Generic modal dismissal: backdrop click, [data-close] buttons and Escape.
    function wireModals() {
        document.querySelectorAll('.modal').forEach(function (modal) {
            modal.addEventListener('click', function (ev) {
                if (ev.target === modal || ev.target.hasAttribute('data-close')) {
                    closeModal(modal.id);
                }
            });
        });
        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape') {
                document.querySelectorAll('.modal:not(.hidden)').forEach(function (m) {
                    closeModal(m.id);
                });
            }
        });
    }

    /** Populate a form's named fields from a plain object. */
    function fillForm(form, data) {
        clearFieldErrors(form);
        Array.prototype.forEach.call(form.elements, function (el) {
            if (!el.name) { return; }
            var v = data ? data[el.name] : undefined;
            el.value = (v === null || v === undefined) ? '' : v;
        });
    }

    /** Read a form's named fields into a plain object. */
    function serializeForm(form) {
        var out = {};
        Array.prototype.forEach.call(form.elements, function (el) {
            if (el.name) { out[el.name] = el.value; }
        });
        return out;
    }

    function clearFieldErrors(form) {
        form.querySelectorAll('.field-error').forEach(function (n) { n.remove(); });
        form.querySelectorAll('.has-error').forEach(function (n) { n.classList.remove('has-error'); });
    }

    /** Render server-side validation errors next to their fields. */
    function setFieldErrors(form, errors) {
        clearFieldErrors(form);
        if (!errors) { return; }
        Object.keys(errors).forEach(function (name) {
            var field = form.querySelector('[name="' + name + '"]');
            if (!field) { return; }
            field.classList.add('has-error');
            var msg = document.createElement('p');
            msg.className = 'field-error';
            msg.textContent = errors[name];
            (field.closest('.field') || field.parentNode).appendChild(msg);
        });
    }

    // Logout button is part of the shared top bar on every page.
    function wireLogout() {
        var btn = document.getElementById('logout-btn');
        if (!btn) { return; }
        btn.addEventListener('click', function () {
            btn.disabled = true;
            api('POST', '/api/auth/logout').then(function () {
                window.location.assign('/login.php');
            }).catch(function () {
                window.location.assign('/login.php');
            });
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        wireModals();
        wireLogout();
    });

    window.App = {
        locale: LOCALE,
        currency: CURRENCY,
        t: t,
        escapeHtml: escapeHtml,
        fmtMoney: fmtMoney,
        fmtDate: fmtDate,
        fmtDateTime: fmtDateTime,
        api: api,
        toast: toast,
        openModal: openModal,
        closeModal: closeModal,
        fillForm: fillForm,
        serializeForm: serializeForm,
        setFieldErrors: setFieldErrors,
        clearFieldErrors: clearFieldErrors
    };
})();
