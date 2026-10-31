/**
 * Merchant portal, terms of use: show the current version, record the
 * acceptance (with the hash of the text displayed).
 */
(function () {
    'use strict';

    const { api, show } = window.MIPS;
    const $ = (id) => document.getElementById(id);
    let terms = null;

    async function load() {
        const data = await api('/api/portal/terms');
        terms = data.terms;
        if (!terms) {
            $('terms-title').textContent = 'Terms of use';
            show($('terms-error'), 'The portal is not open yet: the terms of use have not been published. Please come back later.');
            return;
        }
        $('terms-title').textContent = terms.title;
        $('terms-meta').textContent = 'Version ' + terms.version + ' · published ' + terms.published_at.slice(0, 10);
        $('terms-text').textContent = terms.body;
        if (data.accepted_at) {
            $('terms-done').textContent = 'You accepted this version on ' + data.accepted_at + '.';
            $('terms-done').hidden = false;
        } else {
            $('terms-form').hidden = false;
            if (data.accepted_previous) {
                show($('terms-notice'), 'The terms of use have changed since you last accepted them. Please read and accept the new version to continue.');
            }
        }
    }

    $('terms-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        show($('terms-error'), '');
        if (!$('terms-agree').checked) {
            show($('terms-error'), 'Tick the box to confirm you have read and accept the terms.');
            return;
        }
        try {
            await api('/api/portal/terms-accept', { method: 'POST', body: { version_id: terms.id, sha256: terms.sha256, agree: true } });
            window.location.assign('/portal/home.php');
        } catch (err) {
            show($('terms-error'), err.message);
            if (/changed/.test(err.message)) { load(); }
        }
    });

    load().catch((err) => show($('terms-error'), err.message));
})();
