import { requireAuth } from '@/lib/auth/session';
import { tx, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { listMembers, listRoles } from '@/lib/services/admin';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Flash } from '../../strategy/_ui';
import { SubmitButton } from '../../strategy/_client';
import { InviteForm } from '../_client';
import { changeRole, setMembershipActive, setDepartment } from '../actions';

export const dynamic = 'force-dynamic';

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const auth = await requireAuth('admin.users');
  const sp = await searchParams;
  const { members, roles, departments } = await tx(auth, async (t) => ({
    members: await listMembers(t), roles: await listRoles(t), departments: await q<{ code: string; name: string }>(t, 'SELECT code, name FROM departments ORDER BY code'),
  }));
  const userAdminRoles = new Set(roles.filter((r) => r.permissions.includes('admin.users')).map((r) => r.id));
  const rt = '/admin/users';
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Users & role assignment" subtitle={<>Memberships of <b>{auth.tenantName}</b>. User accounts are global (one login across tenants); roles and departments are per tenant. Deactivating a membership revokes that user’s sessions in this tenant. You cannot remove your own administrator role, and the last user administrator cannot be removed.</>} />
      <Flash sp={sp} />
      <Card className="mb-4">
        <CardHeader title="Invite / create user" subtitle="New accounts get a generated one-time password that is displayed once. Existing accounts (other tenants) are simply added." />
        <CardBody><InviteForm roles={roles.map((r) => ({ id: r.id, code: r.code, name: r.name }))} departments={departments} /></CardBody>
      </Card>
      <Card>
        <CardHeader title={`Members (${members.length})`} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className="th">User</th><th className="th">Role</th><th className="th">Department</th><th className="th">MFA</th><th className="th">Last login</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody>
              {members.map((m) => {
                const self = m.user_id === auth.userId;
                return (
                  <tr key={m.user_id} className={`align-top ${m.is_active ? '' : 'opacity-60'}`}>
                    <td className="td"><div className="font-medium">{m.name}{self && <Badge tone="gold" className="ml-1">you</Badge>}</div><div className="text-xs text-muted">{m.email}</div></td>
                    <td className="td">
                      <form action={changeRole} className="flex items-center gap-1">
                        <input type="hidden" name="user_id" value={m.user_id} /><input type="hidden" name="returnTo" value={rt} />
                        <select name="role_id" defaultValue={m.role_id} className="input w-auto py-1 text-xs" aria-label={`Role for ${m.email}`}>
                          {roles.map((r) => <option key={r.id} value={r.id} disabled={self && userAdminRoles.has(m.role_id) && !userAdminRoles.has(r.id)}>{r.name}{r.is_system ? '' : ' (custom)'}</option>)}
                        </select>
                        <SubmitButton className="btn py-1 text-xs" pendingLabel="…">Change</SubmitButton>
                      </form>
                    </td>
                    <td className="td">
                      <form action={setDepartment} className="flex items-center gap-1">
                        <input type="hidden" name="user_id" value={m.user_id} /><input type="hidden" name="returnTo" value={rt} />
                        <select name="department" defaultValue={m.department ?? ''} className="input w-auto py-1 text-xs" aria-label={`Department for ${m.email}`}><option value="">—</option>{departments.map((d) => <option key={d.code} value={d.code}>{d.code}</option>)}</select>
                        <SubmitButton className="btn py-1 text-xs" pendingLabel="…">Set</SubmitButton>
                      </form>
                    </td>
                    <td className="td">{m.mfa_enabled ? <Badge tone="pos">on</Badge> : <Badge>off</Badge>}</td>
                    <td className="td text-xs">{m.last_login_at?.slice(0, 16).replace('T', ' ') ?? 'never'}</td>
                    <td className="td"><StatusBadge status={m.is_active ? 'active' : 'cancelled'} />{!m.user_active && <div className="text-2xs text-neg">account disabled</div>}</td>
                    <td className="td">
                      {!self && (
                        <form action={setMembershipActive}>
                          <input type="hidden" name="user_id" value={m.user_id} /><input type="hidden" name="active" value={m.is_active ? 'false' : 'true'} /><input type="hidden" name="returnTo" value={rt} />
                          <SubmitButton className={m.is_active ? 'btn-danger py-1 text-xs' : 'btn py-1 text-xs'} pendingLabel="…" confirm={m.is_active ? `Deactivate ${m.email} in this tenant and revoke their sessions?` : undefined}>{m.is_active ? 'Deactivate' : 'Reactivate'}</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
