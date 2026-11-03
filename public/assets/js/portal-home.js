/**
 * Merchant portal, Progress page: where the application stands and what to
 * do next. "Sent to MIPS" and "approved" are always kept apart.
 */
(function () {
    'use strict';

    const { api, el, show } = window.MIPS;
    const $ = (id) => document.getElementById(id);
    const ORDER = ['application', 'application_review', 'documents', 'submitted', 'review', 'on_hold', 'approved'];

    function render(d) {
        const s = d.stage;
        const at = ORDER.indexOf(s);
        const reached = (stage) => at >= ORDER.indexOf(stage) || s === 'not_approved';
        const c = d.case;
        const missing = c ? c.missing.length : 0;

        // [label, state: done | current | todo | failed, detail]
        const steps = [
            ['Account secured with two-factor authentication', 'done', ''],
            ['Terms of use accepted', 'done', ''],
            ['Pre-qualification sent', s === 'application' ? 'current' : 'done', d.application ? 'Sent ' + d.application.submitted_at.slice(0, 10) : ''],
            ['Pre-qualification reviewed by MIPS',
                s === 'declined' ? 'failed' : s === 'application_review' ? 'current' : reached('documents') ? 'done' : 'todo', ''],
            ['Company documents and people provided',
                s === 'declined' ? 'todo' : s === 'documents' ? 'current' : reached('submitted') ? 'done' : 'todo',
                s === 'documents' ? (missing ? missing + ' item(s) still needed' : 'Complete: send it to MIPS') : ''],
            ['File checked by MIPS',
                ['submitted', 'review', 'on_hold'].includes(s) ? 'current' : ['approved', 'not_approved'].includes(s) ? 'done' : 'todo',
                c && c.merchant_submitted_at ? 'Sent ' + c.merchant_submitted_at.slice(0, 10) : ''],
            ['Decision', s === 'approved' ? 'done' : s === 'not_approved' ? 'failed' : 'todo', c && c.decided_at ? c.decided_at.slice(0, 10) : ''],
        ];
        const stateLabel = { done: 'Done', current: 'In progress', todo: 'To come', failed: 'Stopped' };
        $('tracker').replaceChildren(...steps.map(([label, state, detail], i) => el('li', { class: 'tracker-step is-' + state }, [
            el('span', { class: 'tracker-dot', 'aria-hidden': 'true', text: state === 'done' ? '✓' : state === 'failed' ? '✕' : String(i + 1) }),
            el('span', { class: 'tracker-body' }, [
                el('strong', { text: label }),
                el('span', { class: 'tracker-state', text: stateLabel[state] + (detail ? ' · ' + detail : '') }),
            ]),
        ])));

        const link = (href, text) => el('a', { href: href, class: 'btn-primary btn-auto btn-link', text: text });
        const next = {
            application: [el('p', { text: 'Start by telling us about your business.' }), link('/portal/application.php', 'Fill in the pre-qualification')],
            application_review: [el('p', { text: 'MIPS is reviewing your pre-qualification. You will receive an email with the next step. Nothing is approved at this stage.' })],
            declined: [el('p', { text: 'MIPS is not able to take your application further at this stage. If you have questions, contact MIPS.' })],
            documents: [el('p', { text: missing
                ? 'Add the directors, beneficial owners and signatories, and upload the documents requested. ' + missing + ' item(s) still needed.'
                : 'Everything requested is uploaded. Send your file to MIPS.' }), link('/portal/documents.php', 'Go to documents')],
            submitted: [el('p', { text: 'Your file was sent to MIPS on ' + (c && c.merchant_submitted_at ? c.merchant_submitted_at.slice(0, 10) : '') + '. It is not approved yet: MIPS checks each document and may ask for more.' })],
            review: [el('p', { text: 'MIPS is reviewing your file. It is not approved yet. You will be contacted if anything is needed.' })],
            on_hold: [el('p', { text: 'Your file is on hold. Your MIPS contact will get in touch with you.' }), link('/portal/documents.php', 'See your documents')],
            approved: [el('p', { text: 'MIPS has approved your onboarding file. Your MIPS contact will get in touch for the next steps (agreement and technical set-up).' })],
            not_approved: [el('p', { text: 'MIPS has not approved your application. If you have questions, contact MIPS.' })],
        }[s] || [];
        $('next').className = 'next-step is-' + s;
        $('next').replaceChildren(el('h3', { text: 'What happens now' }), ...next);
    }

    api('/api/portal/case').then(render).catch((err) => show($('home-error'), err.message));
})();
