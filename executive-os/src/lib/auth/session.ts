/**
 * Session management. Cookie holds a 256-bit random token; DB stores SHA-256(token).
 * Sessions are bound to a selected tenant; switching tenant requires a valid membership.
 */
import { createHash, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { withoutTenant, one, q, type Tx } from '../db';
import type { Permission } from './permissions';

export const SESSION_COOKIE = 'mips_eos_session';
const IDLE_MINUTES = 30;
const ABSOLUTE_HOURS = 12;

export interface AuthContext {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  isDemo: boolean;
  baseCurrency: string;
  fyStartMonth: number;
  settings: Record<string, any>;
  features: Record<string, boolean>;
  roleCode: string;
  roleName: string;
  permissions: Set<Permission>;
  mfaEnabled: boolean;
  mfaVerified: boolean;
}

export function hashToken(t: string): string { return createHash('sha256').update(t).digest('hex'); }

export async function createSession(tx: Tx, userId: string, tenantId: string | null, mfaVerified: boolean, ip: string, ua: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await tx.query(
    `INSERT INTO sessions (token_hash, user_id, tenant_id, mfa_verified, ip, user_agent, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6, now() + interval '${ABSOLUTE_HOURS} hours')`,
    [hashToken(token), userId, tenantId, mfaVerified, ip, ua.slice(0, 300)],
  );
  return token;
}

export async function setSessionCookie(token: string) {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: ABSOLUTE_HOURS * 3600,
  });
}

export async function clearSession() {
  const c = await cookies();
  const t = c.get(SESSION_COOKIE)?.value;
  if (t) await withoutTenant((tx) => tx.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1', [hashToken(t)]));
  c.delete(SESSION_COOKIE);
}

export async function clientMeta() {
  const h = await headers();
  return { ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'local', ua: h.get('user-agent') ?? '' };
}

/** Resolve the auth context from a raw session token. Null if invalid/expired/idle. */
export async function contextFromToken(token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  return withoutTenant(async (tx) => {
    const s = await one<any>(tx,
      `SELECT s.id, s.user_id, s.tenant_id, s.mfa_verified, s.last_seen_at, u.email, u.name, u.mfa_enabled, u.is_active
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
         AND s.last_seen_at > now() - interval '${IDLE_MINUTES} minutes'`, [hashToken(token)]);
    if (!s || !s.is_active || !s.tenant_id) return null;
    await tx.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [s.id]);
    // Tenant + role lookup in the tenant's RLS context
    await tx.query("SELECT set_config('app.tenant_id', $1, true)", [s.tenant_id]);
    const t = await one<any>(tx,
      `SELECT t.id, t.code, t.name, t.is_demo, t.base_currency, t.fiscal_year_start_month, t.settings, t.features, r.code AS role_code, r.name AS role_name, r.id AS role_id
       FROM tenants t JOIN memberships m ON m.tenant_id = t.id AND m.user_id = $1 AND m.is_active
       JOIN roles r ON r.id = m.role_id WHERE t.id = $2 AND t.status = 'active'`, [s.user_id, s.tenant_id]);
    if (!t) return null;
    const perms = await q<{ permission_code: Permission }>(tx, 'SELECT permission_code FROM role_permissions WHERE role_id = $1', [t.role_id]);
    return {
      sessionId: s.id, userId: s.user_id, email: s.email, name: s.name,
      tenantId: t.id, tenantCode: t.code, tenantName: t.name, isDemo: t.is_demo,
      baseCurrency: t.base_currency, fyStartMonth: t.fiscal_year_start_month,
      settings: t.settings ?? {}, features: t.features ?? {},
      roleCode: t.role_code, roleName: t.role_name,
      permissions: new Set(perms.map((p) => p.permission_code)),
      mfaEnabled: s.mfa_enabled, mfaVerified: s.mfa_verified,
    };
  });
}

export async function getAuth(): Promise<AuthContext | null> {
  const c = await cookies();
  const ctx = await contextFromToken(c.get(SESSION_COOKIE)?.value);
  if (ctx && ctx.mfaEnabled && !ctx.mfaVerified) return null;
  return ctx;
}

/** For server components/actions: returns context or redirects to login. */
export async function requireAuth(perm?: Permission): Promise<AuthContext> {
  const ctx = await getAuth();
  if (!ctx) redirect('/login');
  // Tenant policy: roles listed in settings.mfa_required_roles must enrol MFA before using the app.
  const required: string[] = Array.isArray(ctx.settings?.mfa_required_roles) ? ctx.settings.mfa_required_roles : [];
  if (required.includes(ctx.roleCode) && !ctx.mfaEnabled) {
    const path = (await headers()).get('x-pathname') ?? '';
    if (!path.startsWith('/account')) redirect('/account?mfa=required');
  }
  if (perm && !ctx.permissions.has(perm)) redirect(`/forbidden?p=${encodeURIComponent(perm)}`);
  return ctx;
}

export class ForbiddenError extends Error { status = 403; constructor(p: string) { super(`Missing permission: ${p}`); } }
export function assertPermission(ctx: AuthContext, perm: Permission) {
  if (!ctx.permissions.has(perm)) throw new ForbiddenError(perm);
}
export const tctx = (a: AuthContext) => ({ tenantId: a.tenantId, userId: a.userId });
