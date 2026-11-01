/**
 * Administration service: users & memberships, roles & permissions, tenant
 * settings, reference data, financial periods, audit log, demo reset.
 * Also hosts small server-action helpers shared by the strategy, admin and
 * account modules (readable DB errors, flash redirects, permission checks).
 */
import { randomInt } from 'node:crypto';
import { redirect } from 'next/navigation';
import type { Tx } from '../db';
import { q, one } from '../db';
import { PERMISSIONS, type Permission } from '../auth/permissions';
import { validatePasswordPolicy } from '../auth/password';
import { requireAuth, type AuthContext } from '../auth/session';

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------
/** Turn database / validation errors into a message a user can act on. */
export function readableError(e: unknown): string {
  const err = e as { code?: string; message?: string; constraint?: string; issues?: { path: (string | number)[]; message: string }[] };
  if (err?.issues && Array.isArray(err.issues)) return err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
  const msg = String(err?.message ?? e ?? 'Unexpected error');
  if (err?.code === '23505') return `Duplicate value — a record with this code already exists${err.constraint ? ` (${err.constraint})` : ''}.`;
  if (err?.code === '23503') return 'This record is referenced by other data (or references a record that does not exist).';
  if (err?.code === '23514') return `Rejected by a database rule${err.constraint ? ` (${err.constraint})` : ''} — check the values (e.g. segregation of duties, allowed statuses, ranges).`;
  if (err?.code === '22P02' || err?.code === '22007' || err?.code === '22008') return 'Invalid value format.';
  if (msg.startsWith('IMMUTABLE_RECORD') || msg.startsWith('PERIOD_LOCKED') || msg.startsWith('DEMO_PURGE_DENIED')) return msg;
  return msg.length > 300 ? msg.slice(0, 300) + '…' : msg;
}

export class UserError extends Error {}

/** Append ok/err message to a return URL. Only same-module relative paths are accepted. */
export function flashUrl(returnTo: string, allowedPrefix: string, msg: { ok?: string; err?: string }): string {
  const safe = typeof returnTo === 'string' && returnTo.startsWith(allowedPrefix) && !returnTo.startsWith('//') ? returnTo : allowedPrefix;
  const [path, query = ''] = safe.split('?');
  const p = new URLSearchParams(query); p.delete('ok'); p.delete('err');
  if (msg.ok) p.set('ok', msg.ok.slice(0, 300));
  if (msg.err) p.set('err', msg.err.slice(0, 400));
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

/** Require at least one of the permissions (server-side); otherwise /forbidden. */
export async function requireAny(perms: Permission[]): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!perms.some((p) => auth.permissions.has(p))) redirect(`/forbidden?p=${encodeURIComponent(perms.join(' | '))}`);
  return auth;
}

export const DECIMAL_RE = /^-?\d{1,18}(\.\d{1,8})?$/;

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ', LOWER = 'abcdefghijkmnopqrstuvwxyz', DIGIT = '23456789', SYM = '-_.!@#%';
/** Cryptographically random one-time password that satisfies the password policy. */
export function generateOneTimePassword(length = 18): string {
  const all = UPPER + LOWER + DIGIT + SYM;
  for (;;) {
    const chars = [UPPER, LOWER, DIGIT, SYM].map((set) => set[randomInt(set.length)]);
    while (chars.length < length) chars.push(all[randomInt(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    const p = chars.join('');
    if (!validatePasswordPolicy(p)) return p;
  }
}

// ---------------------------------------------------------------------------
// Permissions / roles
// ---------------------------------------------------------------------------
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];
export const isAdminPerm = (p: string) => p.startsWith('admin.');

/**
 * Validate a requested permission change for a role.
 * Returns an error message or null. Pure — unit-testable.
 */
export function checkRolePermissionChange(o: {
  roleCode: string; isSystem: boolean; before: string[]; after: string[]; actorPerms: Set<string>; confirmAdmin: boolean;
}): string | null {
  const unknown = o.after.filter((p) => !(p in PERMISSIONS));
  if (unknown.length) return `Unknown permission(s): ${unknown.join(', ')}`;
  if (o.isSystem && !o.actorPerms.has('admin.users')) return 'System role permission sets can only be changed by a user holding admin.users.';
  const added = o.after.filter((p) => !o.before.includes(p));
  const notHeld = added.filter((p) => !o.actorPerms.has(p));
  if (notHeld.length) return `You cannot grant permissions you do not hold yourself: ${notHeld.join(', ')}`;
  const addedAdmin = added.filter(isAdminPerm);
  if (addedAdmin.length && o.roleCode !== 'admin') {
    if (!o.actorPerms.has('admin.users')) return 'Granting admin.* permissions requires admin.users.';
    if (!o.confirmAdmin) return `Granting administrative permission(s) ${addedAdmin.join(', ')} to the non-admin role "${o.roleCode}" requires the explicit confirmation checkbox.`;
  }
  if (o.roleCode === 'admin' && o.before.includes('admin.users') && !o.after.includes('admin.users')) return 'The admin role must keep admin.users (otherwise the tenant could be locked out of user management).';
  return null;
}

export interface RoleRow { id: string; code: string; name: string; description: string | null; is_system: boolean; members: number; permissions: string[] }
export async function listRoles(t: Tx): Promise<RoleRow[]> {
  return q<RoleRow>(t, `SELECT r.id, r.code, r.name, r.description, r.is_system,
      (SELECT count(*)::int FROM memberships m WHERE m.role_id = r.id AND m.is_active) AS members,
      coalesce((SELECT array_agg(permission_code ORDER BY permission_code) FROM role_permissions rp WHERE rp.role_id = r.id), '{}') AS permissions
    FROM roles r ORDER BY r.is_system DESC, r.code`);
}

// ---------------------------------------------------------------------------
// Users & memberships
// ---------------------------------------------------------------------------
export interface MemberRow { user_id: string; email: string; name: string; user_active: boolean; mfa_enabled: boolean; last_login_at: string | null; role_id: string; role_code: string; role_name: string; department: string | null; is_active: boolean; created_at: string }
export async function listMembers(t: Tx): Promise<MemberRow[]> {
  return q<MemberRow>(t, `SELECT m.user_id, u.email, u.name, u.is_active AS user_active, u.mfa_enabled, u.last_login_at::text, m.role_id, r.code AS role_code, r.name AS role_name, m.department, m.is_active, m.created_at::text
    FROM memberships m JOIN users u ON u.id = m.user_id JOIN roles r ON r.id = m.role_id ORDER BY m.is_active DESC, u.name`);
}
/** Active members (other than `exceptUser`) whose role holds admin.users. */
export async function otherActiveUserAdmins(t: Tx, exceptUser: string): Promise<number> {
  const r = await one<{ n: number }>(t, `SELECT count(*)::int AS n FROM memberships m JOIN role_permissions rp ON rp.role_id = m.role_id AND rp.permission_code = 'admin.users'
    JOIN users u ON u.id = m.user_id WHERE m.is_active AND u.is_active AND m.user_id <> $1`, [exceptUser]);
  return r?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Tenant settings
// ---------------------------------------------------------------------------
export const SETTING_FIELDS = {
  revenue_recognition: { label: 'Revenue recognition', kind: 'enum', options: ['agent_net', 'principal_gross'] },
  overhead_allocation: { label: 'Overhead allocation basis', kind: 'enum', options: ['by_revenue', 'by_transactions', 'by_gpv', 'equal'] },
  minimum_liquidity: { label: 'Minimum liquidity (base currency)', kind: 'decimal' },
  materiality_pct: { label: 'Materiality threshold (%)', kind: 'decimal' },
  margin_alert_threshold_pct: { label: 'Margin alert threshold (%)', kind: 'decimal' },
  revenue_recon_tolerance: { label: 'Revenue reconciliation tolerance (base currency)', kind: 'decimal' },
} as const;

export async function tenantHasFinancialData(t: Tx): Promise<boolean> {
  const r = await one<{ x: boolean }>(t, `SELECT EXISTS (SELECT 1 FROM transactions) OR EXISTS (SELECT 1 FROM gl_entries) OR EXISTS (SELECT 1 FROM bank_transactions) AS x`);
  return Boolean(r?.x);
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
export interface RefField { key: string; label: string; kind: 'text' | 'enum' | 'bool' | 'country'; options?: string[]; required?: boolean }
export interface RefTable { table: string; label: string; hasActive: boolean; fields: RefField[]; textRefs?: { table: string; column: string }[] }
export const REFERENCE_TABLES: Record<string, RefTable> = {
  acquirers: { table: 'acquirers', label: 'Acquirers', hasActive: true, fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'country', label: 'Country', kind: 'country' }] },
  payment_methods: { table: 'payment_methods', label: 'Payment methods', hasActive: true, fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'category', label: 'Category', kind: 'enum', options: ['card', 'qr', 'wallet', 'bank_transfer', 'other'], required: true }, { key: 'scheme', label: 'Scheme', kind: 'text' }] },
  products: { table: 'products', label: 'Products', hasActive: true, fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'channel', label: 'Channel', kind: 'enum', options: ['ecommerce', 'pos', 'softpos', 'qr', 'wallet', 'links', 'payouts', 'saas', 'orchestration', 'other'], required: true }, { key: 'is_transactional', label: 'Transactional', kind: 'bool' }] },
  verticals: { table: 'verticals', label: 'Verticals', hasActive: false, fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] },
  merchant_groups: { table: 'merchant_groups', label: 'Merchant groups', hasActive: false, fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] },
  departments: { table: 'departments', label: 'Departments', hasActive: false, fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }], textRefs: [{ table: 'memberships', column: 'department' }, { table: 'initiatives', column: 'department' }] },
};
export const REF_CODE_RE = /^[A-Za-z0-9_.-]{1,40}$/;

/** Foreign keys (table, column) that reference <table>.id — discovered from the catalogue. */
export async function referencingColumns(t: Tx, table: string): Promise<{ tbl: string; col: string }[]> {
  return q<{ tbl: string; col: string }>(t, `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute ref ON ref.attrelid = c.confrelid AND ref.attname = 'id'
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[array_position(c.confkey, ref.attnum)]
    WHERE c.contype = 'f' AND c.confrelid = $1::regclass`, [table]);
}
const IDENT = /^[a-z_][a-z0-9_]*$/;
/** Where a reference row is used; an empty list means its code may still be changed. */
export async function referenceUsage(t: Tx, cfg: RefTable, id: string, code: string): Promise<string[]> {
  const used: string[] = [];
  for (const r of await referencingColumns(t, cfg.table)) {
    if (!IDENT.test(r.tbl) || !IDENT.test(r.col)) continue;
    const x = await one<{ x: boolean }>(t, `SELECT EXISTS (SELECT 1 FROM ${r.tbl} WHERE ${r.col} = $1) AS x`, [id]);
    if (x?.x) used.push(`${r.tbl}.${r.col}`);
  }
  for (const r of cfg.textRefs ?? []) {
    const x = await one<{ x: boolean }>(t, `SELECT EXISTS (SELECT 1 FROM ${r.table} WHERE ${r.column} = $1) AS x`, [code]);
    if (x?.x) used.push(`${r.table}.${r.column}`);
  }
  return used;
}

/** Inactive codes for reference tables without an is_active column (kept in tenants.settings). */
export function inactiveCodes(settings: Record<string, any>, table: string): string[] {
  const v = settings?.reference_inactive?.[table];
  return Array.isArray(v) ? v.map(String) : [];
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------
export type PeriodStatus = 'open' | 'soft_closed' | 'locked';
export type PeriodOp = 'soft_close' | 'lock' | 'unlock' | 'reopen';
/** Allowed period operations and the resulting status. */
export function periodTransition(from: string, op: PeriodOp): PeriodStatus | null {
  if (op === 'soft_close' && from === 'open') return 'soft_closed';
  if (op === 'lock' && (from === 'open' || from === 'soft_closed')) return 'locked';
  if (op === 'unlock' && from === 'locked') return 'soft_closed';
  if (op === 'reopen' && from === 'soft_closed') return 'open';
  return null;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export interface AuditFilter { entity?: string; action?: string; user?: string; from?: string; to?: string; page: number; pageSize: number }
export async function auditPage(t: Tx, f: AuditFilter) {
  const where: string[] = []; const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('$?', `$${params.length}`)); };
  if (f.entity) add('a.entity_type = $?', f.entity);
  if (f.action) add(`a.action ILIKE $?`, `%${f.action.replace(/[%_\\]/g, (m) => '\\' + m)}%`);
  if (f.user === 'system') where.push('a.actor_user_id IS NULL');
  else if (f.user) add('a.actor_user_id = $?::uuid', f.user);
  if (f.from) add('a.created_at >= $?::date', f.from);
  if (f.to) add(`a.created_at < ($?::date + 1)`, f.to);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one<{ n: number }>(t, `SELECT count(*)::int AS n FROM audit_events a ${w}`, params);
  const rows = await q<{ id: string; created_at: string; actor_user_id: string | null; actor: string | null; action: string; entity_type: string; entity_id: string | null; payload: unknown; hash: string; prev_hash: string | null }>(t,
    `SELECT a.id::text, a.created_at::text, a.actor_user_id, coalesce(u.name, a.actor_label) AS actor, a.action, a.entity_type, a.entity_id, a.payload, a.hash, a.prev_hash
     FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id ${w} ORDER BY a.id DESC LIMIT ${Math.max(1, Math.min(200, f.pageSize))} OFFSET ${Math.max(0, (f.page - 1) * f.pageSize)}`, params);
  return { total: total?.n ?? 0, rows };
}

// ---------------------------------------------------------------------------
// Demo reset
// ---------------------------------------------------------------------------
/** Users map expected by seedDemoTenant, resolved from memberships by role code. */
export function demoUsersFromMemberships(rows: { user_id: string; role_code: string }[], fallback: string): Record<string, string> {
  const pick = (code: string) => rows.find((r) => r.role_code === code)?.user_id;
  const admin = pick('admin') ?? fallback;
  return { ceo: pick('ceo') ?? admin, cfo: pick('cfo') ?? admin, finance: pick('finance_manager') ?? pick('cfo') ?? admin, admin, analyst: pick('analyst') ?? admin, auditor: pick('auditor') ?? admin, viewer: pick('viewer') ?? admin };
}
