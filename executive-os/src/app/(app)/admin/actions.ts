'use server';
/**
 * Administration mutations. Each action checks its permission server-side,
 * validates input (zod), runs in a tenant transaction and writes an audit event.
 */
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { requireAuth, tctx, type AuthContext } from '@/lib/auth/session';
import type { Permission } from '@/lib/auth/permissions';
import { hashPassword } from '@/lib/auth/password';
import { withTenant, one, q, type Tx } from '@/lib/db';
import { audit, verifyAuditChain } from '@/lib/audit';
import { syncKpiRegistry } from '@/lib/services/kpi';
import { DEFAULT_FEATURES } from '@/lib/services/provision';
import { seedDemoTenant } from '@/lib/demo/seed';
import { seedSecondaryTenant } from '@/lib/demo/seed-secondary';
import { logger } from '@/lib/logger';
import {
  readableError, flashUrl, UserError, DECIMAL_RE, generateOneTimePassword, checkRolePermissionChange, otherActiveUserAdmins, isAdminPerm,
  SETTING_FIELDS, tenantHasFinancialData, REFERENCE_TABLES, REF_CODE_RE, referenceUsage, inactiveCodes, periodTransition, demoUsersFromMemberships, type PeriodOp,
} from '@/lib/services/admin';

const opt = (v: FormDataEntryValue | null) => { const s = typeof v === 'string' ? v.trim() : ''; return s === '' ? null : s; };
const uuid = z.string().uuid();

async function authAny(perms: Permission[]): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!perms.some((p) => auth.permissions.has(p))) redirect(`/forbidden?p=${encodeURIComponent(perms.join(' | '))}`);
  return auth;
}
async function act(form: FormData, perms: Permission[], fn: (auth: AuthContext, t: Tx) => Promise<string>, fallback = '/admin'): Promise<never> {
  const auth = await authAny(perms);
  const returnTo = String(form.get('returnTo') ?? fallback);
  let msg: { ok?: string; err?: string };
  try { msg = { ok: await withTenant(tctx(auth), (t) => fn(auth, t)) }; }
  catch (e) { unstable_rethrow(e); msg = { err: e instanceof UserError ? e.message : readableError(e) }; }
  revalidatePath('/', 'layout');
  redirect(flashUrl(returnTo, '/admin', msg));
}
const roleHasPerm = async (t: Tx, roleId: string, p: string) => Boolean(await one(t, 'SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_code = $2', [roleId, p]));

// ---------------------------------------------------------------------------
// Users & memberships
// ---------------------------------------------------------------------------
export interface InviteState { ok?: string; err?: string; email?: string; password?: string; existing?: boolean }
export async function inviteUser(_: InviteState, form: FormData): Promise<InviteState> {
  const auth = await requireAuth('admin.users');
  try {
    const v = z.object({ email: z.string().email().max(254), name: z.string().min(2).max(120), role_id: uuid, department: z.string().max(40).nullable() })
      .parse({ email: opt(form.get('email'))?.toLowerCase() ?? '', name: opt(form.get('name')) ?? '', role_id: form.get('role_id'), department: opt(form.get('department')) });
    const out = await withTenant(tctx(auth), async (t) => {
      const role = await one<{ code: string }>(t, 'SELECT code FROM roles WHERE id = $1', [v.role_id]);
      if (!role) throw new UserError('Role not found.');
      if (v.department && !(await one(t, 'SELECT 1 FROM departments WHERE code = $1', [v.department]))) throw new UserError(`Unknown department ${v.department}.`);
      const existing = await one<{ id: string; is_active: boolean }>(t, 'SELECT id, is_active FROM users WHERE lower(email) = lower($1)', [v.email]);
      let userId: string; let password: string | undefined;
      if (existing) {
        if (await one(t, 'SELECT 1 FROM memberships WHERE user_id = $1', [existing.id])) throw new UserError('This user is already a member of this tenant (reactivate or change role in the list).');
        userId = existing.id;
      } else {
        password = generateOneTimePassword();
        const u = await one<{ id: string }>(t, 'INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id', [v.email, v.name, await hashPassword(password)]);
        userId = u!.id;
      }
      await t.query('INSERT INTO memberships (tenant_id, user_id, role_id, department) VALUES ($1,$2,$3,$4)', [auth.tenantId, userId, v.role_id, v.department]);
      await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: existing ? 'admin.membership_added' : 'admin.user_created', entityType: 'user', entityId: userId, payload: { email: v.email, role: role.code, department: v.department, one_time_password_issued: !existing } });
      return { userId, password, existing: Boolean(existing) };
    });
    revalidatePath('/admin/users');
    return out.existing
      ? { ok: `Existing account ${v.email} added to ${auth.tenantName}. They sign in with their current password.`, email: v.email, existing: true }
      : { ok: `User ${v.email} created.`, email: v.email, password: out.password };
  } catch (e) {
    unstable_rethrow(e);
    return { err: e instanceof UserError ? e.message : readableError(e) };
  }
}

export async function changeRole(form: FormData) {
  return act(form, ['admin.users'], async (auth, t) => {
    const userId = uuid.parse(form.get('user_id')); const roleId = uuid.parse(form.get('role_id'));
    const m = await one<{ role_id: string; role_code: string; email: string }>(t, 'SELECT m.role_id, r.code AS role_code, u.email FROM memberships m JOIN roles r ON r.id = m.role_id JOIN users u ON u.id = m.user_id WHERE m.user_id = $1 FOR UPDATE OF m', [userId]);
    if (!m) throw new UserError('Membership not found.');
    const role = await one<{ code: string }>(t, 'SELECT code FROM roles WHERE id = $1', [roleId]);
    if (!role) throw new UserError('Role not found.');
    if (m.role_id === roleId) return `${m.email} already has role ${role.code}`;
    const losesAdmin = (await roleHasPerm(t, m.role_id, 'admin.users')) && !(await roleHasPerm(t, roleId, 'admin.users'));
    if (losesAdmin && userId === auth.userId) throw new UserError('You cannot remove your own administrator role. Ask another administrator.');
    if (losesAdmin && (await otherActiveUserAdmins(t, userId)) === 0) throw new UserError('This is the last active user administrator; assign another administrator first.');
    await t.query('UPDATE memberships SET role_id = $2 WHERE user_id = $1', [userId, roleId]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'admin.role_assigned', entityType: 'membership', entityId: userId, payload: { email: m.email, from: m.role_code, to: role.code } });
    return `${m.email}: ${m.role_code} → ${role.code}`;
  }, '/admin/users');
}

export async function setMembershipActive(form: FormData) {
  return act(form, ['admin.users'], async (auth, t) => {
    const userId = uuid.parse(form.get('user_id')); const active = form.get('active') === 'true';
    const m = await one<{ role_id: string; is_active: boolean; email: string }>(t, 'SELECT m.role_id, m.is_active, u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.user_id = $1 FOR UPDATE OF m', [userId]);
    if (!m) throw new UserError('Membership not found.');
    if (!active && userId === auth.userId) throw new UserError('You cannot deactivate your own membership.');
    if (!active && (await roleHasPerm(t, m.role_id, 'admin.users')) && (await otherActiveUserAdmins(t, userId)) === 0) throw new UserError('This is the last active user administrator.');
    await t.query('UPDATE memberships SET is_active = $2 WHERE user_id = $1', [userId, active]);
    let revoked = 0;
    if (!active) revoked = (await t.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL', [userId, auth.tenantId])).rowCount ?? 0;
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: active ? 'admin.membership_reactivated' : 'admin.membership_deactivated', entityType: 'membership', entityId: userId, payload: { email: m.email, sessions_revoked: revoked } });
    return `${m.email} ${active ? 'reactivated' : `deactivated (${revoked} session(s) revoked)`}`;
  }, '/admin/users');
}

export async function setDepartment(form: FormData) {
  return act(form, ['admin.users'], async (auth, t) => {
    const userId = uuid.parse(form.get('user_id')); const dept = opt(form.get('department'));
    if (dept && !(await one(t, 'SELECT 1 FROM departments WHERE code = $1', [dept]))) throw new UserError(`Unknown department ${dept}.`);
    const m = await one<{ department: string | null; email: string }>(t, 'SELECT m.department, u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.user_id = $1', [userId]);
    if (!m) throw new UserError('Membership not found.');
    await t.query('UPDATE memberships SET department = $2 WHERE user_id = $1', [userId, dept]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'admin.membership_department_changed', entityType: 'membership', entityId: userId, payload: { email: m.email, from: m.department, to: dept } });
    return `${m.email}: department ${dept ?? 'cleared'}`;
  }, '/admin/users');
}

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------
export async function cloneRole(form: FormData) {
  return act(form, ['admin.users', 'admin.settings'], async (auth, t) => {
    const v = z.object({ source: uuid, code: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'lower-case letters, digits, underscore'), name: z.string().min(2).max(80), description: z.string().max(300).nullable() })
      .parse({ source: form.get('source_role_id'), code: opt(form.get('code')) ?? '', name: opt(form.get('name')) ?? '', description: opt(form.get('description')) });
    const src = await one<{ code: string; permissions: string[] }>(t, `SELECT r.code, coalesce(array_agg(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS permissions FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id WHERE r.id = $1 GROUP BY r.code`, [v.source]);
    if (!src) throw new UserError('Source role not found.');
    const err = checkRolePermissionChange({ roleCode: v.code, isSystem: false, before: [], after: src.permissions, actorPerms: auth.permissions as Set<string>, confirmAdmin: form.get('confirm_admin') === 'on' });
    if (err) throw new UserError(err);
    const r = await one<{ id: string }>(t, 'INSERT INTO roles (tenant_id, code, name, description, is_system) VALUES ($1,$2,$3,$4,false) RETURNING id', [auth.tenantId, v.code, v.name, v.description]);
    for (const p of src.permissions) await t.query('INSERT INTO role_permissions (tenant_id, role_id, permission_code) VALUES ($1,$2,$3)', [auth.tenantId, r!.id, p]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'admin.role_created', entityType: 'role', entityId: r!.id, payload: { code: v.code, name: v.name, cloned_from: src.code, permissions: src.permissions } });
    return `Role ${v.code} created from ${src.code}`;
  }, '/admin/roles');
}

export async function saveRolePermissions(form: FormData) {
  return act(form, ['admin.users', 'admin.settings'], async (auth, t) => {
    const roleId = uuid.parse(form.get('role_id'));
    const after = [...new Set(form.getAll('perm').map(String))].sort();
    const role = await one<{ code: string; is_system: boolean; permissions: string[] }>(t, `SELECT r.code, r.is_system, coalesce(array_agg(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS permissions FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id WHERE r.id = $1 GROUP BY r.code, r.is_system`, [roleId]);
    if (!role) throw new UserError('Role not found.');
    const err = checkRolePermissionChange({ roleCode: role.code, isSystem: role.is_system, before: role.permissions, after, actorPerms: auth.permissions as Set<string>, confirmAdmin: form.get('confirm_admin') === 'on' });
    if (err) throw new UserError(err);
    const myRole = await one<{ role_id: string }>(t, 'SELECT role_id FROM memberships WHERE user_id = $1', [auth.userId]);
    if (myRole?.role_id === roleId && role.permissions.includes('admin.users') && !after.includes('admin.users')) throw new UserError('You cannot remove admin.users from your own role.');
    const added = after.filter((p) => !role.permissions.includes(p)); const removed = role.permissions.filter((p) => !after.includes(p));
    if (!added.length && !removed.length) return `No change to ${role.code}`;
    if (removed.length) await t.query('DELETE FROM role_permissions WHERE role_id = $1 AND permission_code = ANY($2)', [roleId, removed]);
    for (const p of added) await t.query('INSERT INTO role_permissions (tenant_id, role_id, permission_code) VALUES ($1,$2,$3)', [auth.tenantId, roleId, p]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'admin.role_permissions_changed', entityType: 'role', entityId: roleId, payload: { code: role.code, system: role.is_system, added, removed, admin_grant_confirmed: added.some(isAdminPerm) } });
    return `${role.code}: +${added.length} / −${removed.length} permission(s)`;
  }, '/admin/roles');
}

export async function deleteRole(form: FormData) {
  return act(form, ['admin.users', 'admin.settings'], async (auth, t) => {
    const roleId = uuid.parse(form.get('role_id'));
    const role = await one<{ code: string; is_system: boolean }>(t, 'SELECT code, is_system FROM roles WHERE id = $1', [roleId]);
    if (!role) throw new UserError('Role not found.');
    if (role.is_system) throw new UserError('System roles cannot be deleted.');
    if (await one(t, 'SELECT 1 FROM memberships WHERE role_id = $1', [roleId])) throw new UserError('Role is still assigned to members (active or inactive); reassign them first.');
    await t.query('DELETE FROM roles WHERE id = $1', [roleId]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'admin.role_deleted', entityType: 'role', entityId: roleId, payload: { code: role.code } });
    return `Role ${role.code} deleted`;
  }, '/admin/roles');
}

// ---------------------------------------------------------------------------
// Tenant settings (mips_app may UPDATE tenants; RLS restricts to the bound tenant)
// ---------------------------------------------------------------------------
async function currentTenant(t: Tx) {
  return (await one<{ id: string; settings: Record<string, any>; features: Record<string, boolean>; fiscal_year_start_month: number; base_currency: string }>(t, 'SELECT id, settings, features, fiscal_year_start_month, base_currency FROM tenants WHERE id = app_tenant() FOR UPDATE'))!;
}
async function mergeSettings(t: Tx, patch: Record<string, unknown>) { await t.query('UPDATE tenants SET settings = settings || $1::jsonb WHERE id = app_tenant()', [JSON.stringify(patch)]); }

export async function saveAccountingPolicy(form: FormData) {
  return act(form, ['admin.settings'], async (auth, t) => {
    const v = z.object({ revenue_recognition: z.enum(SETTING_FIELDS.revenue_recognition.options), overhead_allocation: z.enum(SETTING_FIELDS.overhead_allocation.options), revenue_policy_note: z.string().min(20, 'a policy note of at least 20 characters is mandatory').max(2000) })
      .parse({ revenue_recognition: form.get('revenue_recognition'), overhead_allocation: form.get('overhead_allocation'), revenue_policy_note: opt(form.get('revenue_policy_note')) ?? '' });
    const cur = await currentTenant(t);
    const changedRecognition = cur.settings.revenue_recognition !== v.revenue_recognition;
    if (changedRecognition && (cur.settings.revenue_policy_note ?? '') === v.revenue_policy_note) throw new UserError('Changing the revenue recognition basis requires an updated policy note explaining the decision and its approval.');
    const before = { revenue_recognition: cur.settings.revenue_recognition, overhead_allocation: cur.settings.overhead_allocation, revenue_policy_note: cur.settings.revenue_policy_note };
    if (JSON.stringify(before) === JSON.stringify(v)) return 'No change';
    await mergeSettings(t, { ...v, revenue_policy_changed_at: changedRecognition ? new Date().toISOString() : cur.settings.revenue_policy_changed_at ?? null, revenue_policy_changed_by: changedRecognition ? auth.userId : cur.settings.revenue_policy_changed_by ?? null });
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: changedRecognition ? 'admin.revenue_recognition_changed' : 'admin.accounting_policy_updated', entityType: 'tenant', entityId: auth.tenantId, payload: { before, after: v } });
    return changedRecognition ? `Revenue recognition changed to ${v.revenue_recognition} (audited)` : 'Accounting policy saved';
  }, '/admin/settings');
}

export async function saveThresholds(form: FormData) {
  return act(form, ['admin.settings'], async (auth, t) => {
    const nn = z.string().regex(DECIMAL_RE, 'decimal number').refine((x) => !x.startsWith('-'), 'must not be negative');
    const pct = nn.refine((x) => Number(x) <= 100, 'must be ≤ 100'); // range check on a percentage input, not money arithmetic
    const v = z.object({ minimum_liquidity: nn, materiality_pct: pct, margin_alert_threshold_pct: pct, revenue_recon_tolerance: nn })
      .parse({ minimum_liquidity: opt(form.get('minimum_liquidity')) ?? '', materiality_pct: opt(form.get('materiality_pct')) ?? '', margin_alert_threshold_pct: opt(form.get('margin_alert_threshold_pct')) ?? '', revenue_recon_tolerance: opt(form.get('revenue_recon_tolerance')) ?? '' });
    const cur = await currentTenant(t);
    const changes = Object.fromEntries(Object.entries(v).filter(([k, x]) => String(cur.settings[k] ?? '') !== x).map(([k, x]) => [k, { from: cur.settings[k] ?? null, to: x }]));
    if (!Object.keys(changes).length) return 'No change';
    await mergeSettings(t, v);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'admin.settings_updated', entityType: 'tenant', entityId: auth.tenantId, payload: { changes } });
    return `Saved ${Object.keys(changes).join(', ')}`;
  }, '/admin/settings');
}

export async function saveFiscal(form: FormData) {
  return act(form, ['admin.settings'], async (auth, t) => {
    const month = z.coerce.number().int().min(1).max(12).parse(form.get('fiscal_year_start_month'));
    const ccy = opt(form.get('base_currency'));
    const cur = await currentTenant(t);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (month !== cur.fiscal_year_start_month) changes.fiscal_year_start_month = { from: cur.fiscal_year_start_month, to: month };
    if (ccy && ccy !== cur.base_currency) {
      if (await tenantHasFinancialData(t)) throw new UserError('Base currency is read-only once transactions, GL entries or bank data exist.');
      if (!(await one(t, 'SELECT 1 FROM currencies WHERE code = $1', [ccy]))) throw new UserError(`Unknown currency ${ccy}.`);
      changes.base_currency = { from: cur.base_currency, to: ccy };
    }
    if (!Object.keys(changes).length) return 'No change';
    await t.query('UPDATE tenants SET fiscal_year_start_month = $1, base_currency = $2 WHERE id = app_tenant()', [month, ccy ?? cur.base_currency]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'admin.fiscal_settings_updated', entityType: 'tenant', entityId: auth.tenantId, payload: { changes } });
    return `Saved ${Object.keys(changes).join(', ')}`;
  }, '/admin/settings');
}

export async function saveFeatures(form: FormData) {
  return act(form, ['admin.settings'], async (auth, t) => {
    const cur = await currentTenant(t);
    const keys = [...new Set([...Object.keys(DEFAULT_FEATURES), ...Object.keys(cur.features ?? {})])];
    const on = new Set(form.getAll('feature').map(String));
    const unknown = [...on].filter((k) => !keys.includes(k));
    if (unknown.length) throw new UserError(`Unknown feature flag(s): ${unknown.join(', ')}`);
    const next = Object.fromEntries(keys.map((k) => [k, on.has(k)]));
    const changes = Object.fromEntries(keys.filter((k) => Boolean(cur.features?.[k]) !== next[k]).map((k) => [k, { from: Boolean(cur.features?.[k]), to: next[k] }]));
    if (!Object.keys(changes).length) return 'No change';
    await t.query('UPDATE tenants SET features = $1::jsonb WHERE id = app_tenant()', [JSON.stringify(next)]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'admin.features_updated', entityType: 'tenant', entityId: auth.tenantId, payload: { changes } });
    return `Feature flags saved (${Object.keys(changes).join(', ')})`;
  }, '/admin/settings');
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
function refInput(form: FormData) {
  const key = String(form.get('table') ?? '');
  const cfg = REFERENCE_TABLES[key];
  if (!cfg) throw new UserError('Unknown reference table.');
  const values: Record<string, unknown> = {};
  for (const f of cfg.fields) {
    const raw = opt(form.get(f.key));
    if (f.kind === 'bool') { values[f.key] = form.get(f.key) === 'on'; continue; }
    if (f.required && !raw) throw new UserError(`${f.label} is required.`);
    if (raw && raw.length > 200) throw new UserError(`${f.label} is too long.`);
    if (f.kind === 'enum' && raw && !f.options!.includes(raw)) throw new UserError(`Invalid ${f.label}.`);
    if (f.kind === 'country' && raw && !/^[A-Z]{2}$/.test(raw.toUpperCase())) throw new UserError('Country must be a 2-letter ISO code.');
    values[f.key] = f.kind === 'country' && raw ? raw.toUpperCase() : raw;
  }
  return { cfg, values };
}
export async function addReference(form: FormData) {
  return act(form, ['admin.settings'], async (auth, t) => {
    const { cfg, values } = refInput(form);
    const code = opt(form.get('code')) ?? '';
    if (!REF_CODE_RE.test(code)) throw new UserError('Code: 1–40 characters, letters/digits/_ . - only.');
    const cols = ['tenant_id', 'code', ...Object.keys(values)];
    const r = await one<{ id: string }>(t, `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, [auth.tenantId, code, ...Object.values(values)]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'admin.reference_added', entityType: cfg.table, entityId: r!.id, payload: { code, ...values } });
    return `${cfg.label}: ${code} added`;
  }, '/admin/reference-data');
}
export async function updateReference(form: FormData) {
  return act(form, ['admin.settings'], async (auth, t) => {
    const { cfg, values } = refInput(form);
    const id = uuid.parse(form.get('id'));
    const before = await one<Record<string, any>>(t, `SELECT * FROM ${cfg.table} WHERE id = $1 FOR UPDATE`, [id]);
    if (!before) throw new UserError('Record not found.');
    const code = opt(form.get('code')) ?? before.code;
    if (code !== before.code) {
      if (!REF_CODE_RE.test(code)) throw new UserError('Code: 1–40 characters, letters/digits/_ . - only.');
      const used = await referenceUsage(t, cfg, id, before.code);
      if (used.length) throw new UserError(`Code ${before.code} is immutable: it is referenced by ${used.join(', ')}.`);
    }
    const sets = ['code', ...Object.keys(values)];
    await t.query(`UPDATE ${cfg.table} SET ${sets.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, code, ...Object.values(values)]);
    const changes = Object.fromEntries(Object.entries({ code, ...values }).filter(([k, v]) => (before[k] ?? null) !== (v ?? null)).map(([k, v]) => [k, { from: before[k] ?? null, to: v }]));
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'admin.reference_updated', entityType: cfg.table, entityId: id, payload: { code: before.code, changes } });
    return `${cfg.label}: ${code} saved`;
  }, '/admin/reference-data');
}
export async function setReferenceActive(form: FormData) {
  return act(form, ['admin.settings'], async (auth, t) => {
    const cfg = REFERENCE_TABLES[String(form.get('table') ?? '')];
    if (!cfg) throw new UserError('Unknown reference table.');
    const id = uuid.parse(form.get('id')); const active = form.get('active') === 'true';
    const row = await one<{ code: string }>(t, `SELECT code FROM ${cfg.table} WHERE id = $1`, [id]);
    if (!row) throw new UserError('Record not found.');
    if (cfg.hasActive) await t.query(`UPDATE ${cfg.table} SET is_active = $2 WHERE id = $1`, [id, active]);
    else {
      const cur = await currentTenant(t);
      const set = new Set(inactiveCodes(cur.settings, cfg.table));
      if (active) set.delete(row.code); else set.add(row.code);
      await mergeSettings(t, { reference_inactive: { ...(cur.settings.reference_inactive ?? {}), [cfg.table]: [...set].sort() } });
    }
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: active ? 'admin.reference_reactivated' : 'admin.reference_deactivated', entityType: cfg.table, entityId: id, payload: { code: row.code } });
    return `${cfg.label}: ${row.code} ${active ? 'reactivated' : 'deactivated'}`;
  }, '/admin/reference-data');
}

// ---------------------------------------------------------------------------
// KPI registry
// ---------------------------------------------------------------------------
export async function resyncKpiRegistry(form: FormData) {
  return act(form, ['kpi.calculate'], async (auth, t) => {
    const r = await syncKpiRegistry(t, auth.tenantId, auth.userId);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'kpi.registry_resynced', entityType: 'kpi_definitions', payload: { new_formula_versions: r.created } });
    return r.created.length ? `Registry re-synced: new formula versions for ${r.created.join(', ')}` : 'Registry re-synced: all formula hashes unchanged';
  }, '/admin/kpis');
}

// ---------------------------------------------------------------------------
// Financial periods
// ---------------------------------------------------------------------------
export async function periodAction(form: FormData) {
  return act(form, ['finance.lock_period'], async (auth, t) => {
    const period = z.string().regex(/^\d{4}-\d{2}-01$/).parse(form.get('period'));
    const op = z.enum(['soft_close', 'lock', 'unlock', 'reopen']).parse(form.get('op')) as PeriodOp;
    const reason = opt(form.get('reason'));
    const cur = await one<{ status: string }>(t, 'SELECT status FROM financial_periods WHERE period = $1 FOR UPDATE', [period]);
    if (!cur) throw new UserError('Period not found.');
    const to = periodTransition(cur.status, op);
    if (!to) throw new UserError(`Cannot ${op.replace('_', ' ')} a period that is ${cur.status.replace('_', ' ')}.`);
    if ((op === 'unlock' || op === 'reopen') && (!reason || reason.length < 10)) throw new UserError(`${op === 'unlock' ? 'Unlocking a locked' : 'Re-opening a soft-closed'} period requires a reason (at least 10 characters).`);
    if (to === 'locked') await t.query(`UPDATE financial_periods SET status = 'locked', locked_by = $2, locked_at = now() WHERE period = $1`, [period, auth.userId]);
    else await t.query('UPDATE financial_periods SET status = $2, locked_by = NULL, locked_at = NULL WHERE period = $1', [period, to]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: `finance.period_${op === 'lock' ? 'locked' : op === 'unlock' ? 'unlocked' : op === 'soft_close' ? 'soft_closed' : 'reopened'}`, entityType: 'financial_period', entityId: period, payload: { from: cur.status, to, reason } });
    return `${period.slice(0, 7)}: ${cur.status.replace('_', ' ')} → ${to.replace('_', ' ')}`;
  }, '/admin/periods');
}

// ---------------------------------------------------------------------------
// Audit chain
// ---------------------------------------------------------------------------
export interface VerifyState { ok?: boolean; checked?: number; brokenAt?: string | null; at?: string; err?: string }
export async function verifyChainAction(_: VerifyState): Promise<VerifyState> {
  const auth = await requireAuth('admin.audit');
  try {
    const r = await withTenant(tctx(auth), async (t) => {
      const res = await verifyAuditChain(t);
      await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'audit.chain_verified', entityType: 'audit_events', payload: res });
      return res;
    });
    return { ok: r.ok, checked: r.checked, brokenAt: r.brokenAt, at: new Date().toISOString() };
  } catch (e) { unstable_rethrow(e); return { err: readableError(e) }; }
}

// ---------------------------------------------------------------------------
// Demo reset (demo tenants only)
// ---------------------------------------------------------------------------
export interface ResetState { ok?: string; err?: string; seconds?: number }
export async function demoResetAction(_: ResetState, form: FormData): Promise<ResetState> {
  const auth = await requireAuth('admin.demo_reset');
  const typed = String(form.get('confirm_code') ?? '').trim();
  if (typed !== auth.tenantCode) return { err: `Confirmation does not match. Type the tenant code "${auth.tenantCode}" exactly to confirm.` };
  const t0 = Date.now();
  try {
    await withTenant(tctx(auth), async (t) => {
      const tenant = await one<{ id: string; code: string; is_demo: boolean }>(t, 'SELECT id, code, is_demo FROM tenants WHERE id = app_tenant()');
      if (!tenant?.is_demo) throw new UserError('This tenant is not a demo tenant. Demo reset is never available for real tenants.');
      await t.query("SET LOCAL statement_timeout = '600s'");               // pool default (30 s) is too short for the purge statement
      const members = await q<{ user_id: string; role_code: string }>(t, 'SELECT m.user_id, r.code AS role_code FROM memberships m JOIN roles r ON r.id = m.role_id WHERE m.is_active ORDER BY m.created_at');
      const users = demoUsersFromMemberships(members, auth.userId);
      await t.query('SELECT purge_demo_tenant_data($1)', [tenant.id]);   // DB function refuses non-demo tenants as well
      if (tenant.code === 'mips-demo') await seedDemoTenant(t, tenant.id, users);
      else await seedSecondaryTenant(t, tenant.id, users.cfo);
      await audit(t, { tenantId: tenant.id, userId: auth.userId, action: 'demo.reset', entityType: 'tenant', entityId: tenant.id, payload: { code: tenant.code, seconds: Math.round((Date.now() - t0) / 1000), generator: tenant.code === 'mips-demo' ? 'seedDemoTenant' : 'seedSecondaryTenant' } });
    });
  } catch (e) {
    unstable_rethrow(e);
    logger.error('demo_reset_failed', { tenant: auth.tenantCode, error: String((e as Error)?.message ?? e) });
    return { err: e instanceof UserError ? e.message : readableError(e) };
  }
  revalidatePath('/', 'layout');
  return { ok: `Demo data for ${auth.tenantCode} was purged and regenerated.`, seconds: Math.round((Date.now() - t0) / 1000) };
}
