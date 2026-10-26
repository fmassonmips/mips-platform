/**
 * User administration: activate / deactivate accounts and change roles.
 */
(function () {
    'use strict';

    const { api, el, table, show } = window.MIPS;

    const form    = document.getElementById('user-filters');
    const box     = document.getElementById('users');
    const errBox  = document.getElementById('users-error');
    const banner  = document.getElementById('pending-banner');
    const meEmail = document.querySelector('.user-info strong').textContent.trim();

    async function update(body, confirmText) {
        if (confirmText && !window.confirm(confirmText)) { return; }
        show(errBox, '');
        try {
            await api('/api/admin/user-update', { method: 'POST', body: body });
        } catch (err) {
            show(errBox, err.message);
        }
        await load();
    }

    async function load() {
        const params = new URLSearchParams(new FormData(form));
        try {
            const data = await api('/api/admin/users?' + params.toString());
            show(banner, data.pending ? data.pending + ' account(s) waiting for activation.' : '');
            box.replaceChildren(data.users.length
                ? table(['Name', 'Email', 'Status', 'Role', 'Registered', 'Last login', ''],
                    data.users.map(function (u) {
                        const isMe = u.email === meEmail;
                        const role = el('select', { 'aria-label': 'Role for ' + u.email, disabled: isMe },
                            data.roles.map((r) => el('option', { value: r, text: r, selected: r === u.role })));
                        role.addEventListener('change', () => update({ id: u.id, role: role.value },
                            'Change the role of ' + u.email + ' to ' + role.value + '?'));

                        let action = null;
                        if (u.status === 'pending') {
                            action = el('button', { type: 'button', class: 'btn-primary btn-auto btn-small', text: 'Activate',
                                on: { click: () => update({ id: u.id, is_active: true, role: role.value }, null) } });
                        } else if (u.status === 'deactivated') {
                            action = el('button', { type: 'button', class: 'btn-secondary btn-small', text: 'Reactivate',
                                on: { click: () => update({ id: u.id, is_active: true }, 'Reactivate ' + u.email + '?') } });
                        } else if (!isMe) {
                            action = el('button', { type: 'button', class: 'btn-secondary btn-small', text: 'Deactivate',
                                on: { click: () => update({ id: u.id, is_active: false }, 'Deactivate ' + u.email + '? They lose access immediately.') } });
                        }

                        return {
                            className: u.status === 'pending' ? 'warn' : (u.status === 'deactivated' ? 'row-muted' : null),
                            cells: [u.name || '', u.email + (isMe ? ' (you)' : ''),
                                el('span', { class: 'badge badge-' + u.status, text: u.status }),
                                role, u.created_at, u.last_login_at || 'never', action || ''],
                        };
                    }))
                : el('p', { class: 'muted', text: 'No users match.' }));
        } catch (err) {
            show(errBox, err.message);
        }
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); load(); });
    document.getElementById('f-status').addEventListener('change', load);
    load();
})();
