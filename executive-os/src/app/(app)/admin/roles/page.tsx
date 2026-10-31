import { Fragment } from 'react';
import { tx, type SP } from '@/lib/page';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listRoles, requireAny, isAdminPerm } from '@/lib/services/admin';
import { PageHeader, Section } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flash, Disclosure } from '../../strategy/_ui';
import { SubmitButton } from '../../strategy/_client';
import { cloneRole, saveRolePermissions, deleteRole } from '../actions';

export const dynamic = 'force-dynamic';

const BY_MODULE = Object.entries(PERMISSIONS).reduce<Record<string, [string, string][]>>((acc, [code, [module, desc]]) => { (acc[module] ??= []).push([code, desc]); return acc; }, {});

export default async function RolesPage({ searchParams }: { searchParams: SP }) {
  const auth = await requireAny(['admin.users', 'admin.settings']);
  const sp = await searchParams;
  const roles = await tx(auth, (t) => listRoles(t));
  const canSystem = auth.permissions.has('admin.users');
  const rt = '/admin/roles';
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Roles & permissions" subtitle={<>Permissions are a fixed catalogue in code; roles are tenant-configurable sets of them. System roles can only be changed by holders of <code>admin.users</code>. Granting any <code>admin.*</code> permission to a non-admin role requires an explicit confirmation, and you can never grant a permission you do not hold. Segregation-of-duty rules are additionally enforced by the database.</>} />
      <Flash sp={sp} />

      <Card>
        <CardHeader title="Permission matrix" subtitle={`${roles.length} roles × ${Object.keys(PERMISSIONS).length} permissions`} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead><tr><th className="th sticky left-0 bg-surface">Permission</th>{roles.map((r) => <th key={r.id} className="th text-center" title={r.description ?? ''}>{r.code}{!r.is_system && <div className="text-2xs font-normal text-gold">custom</div>}<div className="text-2xs font-normal text-muted">{r.members} member{r.members === 1 ? '' : 's'}</div></th>)}</tr></thead>
            <tbody>
              {Object.entries(BY_MODULE).map(([module, perms]) => (
                <Fragment key={module}><tr><td colSpan={roles.length + 1} className="td bg-surface-2 text-2xs font-semibold uppercase tracking-wide text-muted">{module}</td></tr>
                  {perms.map(([code, desc]) => (
                    <tr key={code} className="hover:bg-surface-2"><td className="td sticky left-0 bg-surface" title={desc}><code className={isAdminPerm(code) ? 'text-neg' : ''}>{code}</code><div className="text-2xs text-muted">{desc}</div></td>
                      {roles.map((r) => <td key={r.id} className="td text-center">{r.permissions.includes(code) ? <span className="font-bold text-pos" aria-label="granted">✓</span> : <span className="text-muted" aria-label="not granted">·</span>}</td>)}</tr>
                  ))}</Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Section title="Create a custom role (clone a role, then edit its permissions)">
        <Card><CardBody>
          <form action={cloneRole} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="returnTo" value={rt} />
            <label className="block"><span className="label">Clone from</span><select name="source_role_id" className="input" required>{roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}</select></label>
            <label className="block"><span className="label">New role code</span><input name="code" className="input font-mono" required pattern="[a-z][a-z0-9_]{1,39}" placeholder="e.g. treasury_lead" /></label>
            <label className="block"><span className="label">Name</span><input name="name" className="input" required minLength={2} maxLength={80} /></label>
            <label className="block"><span className="label">Description</span><input name="description" className="input" maxLength={300} /></label>
            <div className="flex items-end"><SubmitButton>Create role</SubmitButton></div>
            <label className="flex items-center gap-2 text-xs sm:col-span-2 lg:col-span-5"><input type="checkbox" name="confirm_admin" /> I confirm the new role may include administrative (<code>admin.*</code>) permissions if the source role has them.</label>
          </form>
        </CardBody></Card>
      </Section>

      <Section title="Edit role permissions">
        <div className="space-y-2">
          {roles.map((r) => {
            const editable = r.is_system ? canSystem : true;
            return (
              <Card key={r.id}>
                <CardHeader title={<span className="flex items-center gap-2">{r.name} <code className="text-xs text-muted">{r.code}</code>{r.is_system ? <Badge tone="navy">system</Badge> : <Badge tone="gold">custom</Badge>}</span>} subtitle={`${r.permissions.length} permissions · ${r.members} active member(s)${r.description ? ` · ${r.description}` : ''}`}
                  actions={!r.is_system && r.members === 0 ? <form action={deleteRole}><input type="hidden" name="role_id" value={r.id} /><input type="hidden" name="returnTo" value={rt} /><SubmitButton className="btn-danger py-1 text-xs" pendingLabel="…" confirm={`Delete role ${r.code}?`}>Delete role</SubmitButton></form> : undefined} />
                <CardBody>
                  <Disclosure summary={editable ? 'Edit permissions' : 'View permissions (system roles are editable only with admin.users)'}>
                    <form action={saveRolePermissions} className="space-y-3">
                      <input type="hidden" name="role_id" value={r.id} /><input type="hidden" name="returnTo" value={rt} />
                      <fieldset disabled={!editable} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {Object.entries(BY_MODULE).map(([module, perms]) => (
                          <div key={module}><div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">{module}</div>
                            {perms.map(([code, desc]) => (
                              <label key={code} className="flex items-start gap-2 py-0.5 text-xs" title={desc}>
                                <input type="checkbox" name="perm" value={code} defaultChecked={r.permissions.includes(code)} disabled={!auth.permissions.has(code as any) && !r.permissions.includes(code)} />
                                <span><code className={isAdminPerm(code) ? 'text-neg' : ''}>{code}</code></span>
                              </label>
                            ))}
                          </div>
                        ))}
                      </fieldset>
                      {editable && <>
                        {r.code !== 'admin' && <label className="flex items-center gap-2 text-xs text-neg"><input type="checkbox" name="confirm_admin" /> I explicitly confirm granting administrative (admin.*) permissions to this non-admin role.</label>}
                        <SubmitButton>Save permissions</SubmitButton>
                      </>}
                    </form>
                  </Disclosure>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
