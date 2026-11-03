/**
 * Staff (admin): merchant portal terms of use — versions and publication.
 */
(function () {
    'use strict';

    const { api, el, table, show } = window.MIPS;
    const $ = (id) => document.getElementById(id);

    async function load() {
        try {
            const d = await api('/api/terms/list');
            $('versions').replaceChildren(d.versions.length
                ? table(['Version', 'Title', 'Published', 'By', 'Accepted by', 'Fingerprint (sha256)', ''], d.versions.map((v, i) => [
                    v.version + (i === 0 ? ' (current)' : ''), v.title, v.published_at, v.published_by_email || '',
                    v.acceptances + (i === 0 ? ' of ' + d.active_accounts + ' account(s)' : ''),
                    el('code', { class: 'details', text: v.body_sha256.slice(0, 16) + '…' }),
                    el('details', {}, [el('summary', { text: 'Text' }), el('div', { class: 'terms-text', text: v.body })]),
                ]))
                : el('p', { class: 'notice', text: 'No version published: merchants cannot use the portal until the terms of use are published.' }));
        } catch (err) {
            show($('terms-error'), err.message);
        }
    }

    $('publish-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        show($('publish-error'), '');
        if (!window.confirm('Publish this version? It cannot be edited afterwards, and every merchant will have to accept it.')) { return; }
        try {
            await api('/api/terms/publish', { method: 'POST', body: Object.fromEntries(new FormData(this).entries()) });
            this.reset();
            await load();
        } catch (err) {
            show($('publish-error'), err.message);
        }
    });

    load();
})();
