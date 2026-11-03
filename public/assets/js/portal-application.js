/**
 * Merchant portal, pre-qualification: the form (sent once), then a
 * read-only summary of what was sent.
 */
(function () {
    'use strict';

    const { api, el, show, money } = window.MIPS;
    const $ = (id) => document.getElementById(id);
    const STATUS = {
        submitted: 'Sent — MIPS is reviewing it',
        accepted: 'Reviewed — next step: documents',
        declined: 'Not taken further',
    };

    function summary(a, o) {
        const rows = [
            ['Status', STATUS[a.status] || a.status], ['Sent', a.submitted_at],
            ['Legal name', a.legal_name], ['Trading name', a.trading_name], ['BRN', a.brn], ['VAT number', a.vat_number || '—'],
            ['Country of incorporation', a.country_of_incorporation], ['Registered address', a.registered_address],
            ['Sector', o.sectors[a.sector] || a.sector], ['Products and services', a.products_services], ['Website', a.website || '—'],
            ['Countries where you sell', a.countries_of_operation],
            ['Payment methods', a.payment_methods.map((m) => o.payment_methods[m] || m).join(', ')],
            ['Expected monthly volume', o.volume_bands[a.monthly_volume_band] || a.monthly_volume_band],
            ['Average ticket', 'MUR ' + money(a.average_ticket_mur)],
            ['Regulated', Number(a.is_regulated) ? 'Yes — ' + (a.regulator || '') : 'No'],
            ['Contact', a.contact_name + (a.contact_role ? ' (' + a.contact_role + ')' : '') + ' · ' + a.contact_phone],
        ];
        $('app-summary').replaceChildren(
            el('dl', { class: 'meta' }, rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v === null ? '' : String(v) })])),
            el('p', { class: 'muted', text: 'To change this information, contact MIPS.' }),
            a.status === 'accepted' ? el('a', { href: '/portal/documents.php', class: 'btn-primary btn-auto btn-link', text: 'Go to documents' }) : '');
        $('app-summary').hidden = false;
    }

    function fillOptions(o) {
        $('a-sector').replaceChildren(el('option', { value: '', text: 'Choose…' }), ...Object.entries(o.sectors).map(([k, v]) => el('option', { value: k, text: v })));
        $('a-band').replaceChildren(el('option', { value: '', text: 'Choose…' }), ...Object.entries(o.volume_bands).map(([k, v]) => el('option', { value: k, text: v })));
        $('a-methods').append(...Object.entries(o.payment_methods).map(([k, v]) =>
            el('label', {}, [el('input', { type: 'checkbox', name: 'payment_methods', value: k }), ' ' + v])));
        $('a-coi').value = o.home_country;
        $('a-coo').value = o.home_country;
        $('app-form').hidden = false;
    }

    $('app-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        show($('app-error'), '');
        const fd = new FormData(this);
        const body = Object.fromEntries(fd.entries());
        body.payment_methods = fd.getAll('payment_methods');
        body.is_regulated = $('a-reg').checked;
        body.declaration = $('a-decl').checked;
        if (!window.confirm('Send this pre-qualification to MIPS? You will not be able to change it afterwards.')) { return; }
        try {
            await api('/api/portal/application', { method: 'POST', body: body });
            window.location.assign('/portal/home.php');
        } catch (err) {
            show($('app-error'), err.message);
            window.scrollTo(0, 0);
        }
    });

    api('/api/portal/application').then(function (d) {
        if (d.application) { summary(d.application, d.options); } else { fillOptions(d.options); }
    }).catch((err) => show($('app-error'), err.message));
})();
