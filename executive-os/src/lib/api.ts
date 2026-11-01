/**
 * REST API helpers (/api/v1). Auth: session cookie (browser) or
 * `Authorization: Bearer <api key>` (machine clients; key hash looked up via a
 * SECURITY DEFINER function). Every response is JSON; errors never leak stack traces.
 */
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { contextFromToken, SESSION_COOKIE, type AuthContext } from './auth/session';
import type { Permission } from './auth/permissions';
import { withoutTenant, one, q } from './db';
import { logger } from './logger';

export async function apiAuth(req: Request, perm: Permission): Promise<AuthContext | Response> {
  let ctx: AuthContext | null = null;
  const authz = req.headers.get('authorization');
  if (authz?.startsWith('Bearer ')) {
    const key = authz.slice(7).trim();
    const hash = createHash('sha256').update(key).digest('hex');
    const k = await withoutTenant((tx) => one<any>(tx, 'SELECT * FROM auth_api_key_lookup($1)', [hash]));
    if (k) ctx = await contextForApiKey(k.tenant_id, k.user_id, k.key_id);
  } else {
    // CSRF defence for cookie-authenticated mutations: Origin must match Host.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.get('origin'); const host = req.headers.get('host');
      if (!origin || !host || new URL(origin).host !== host) return NextResponse.json({ error: 'csrf_origin_mismatch' }, { status: 403 });
    }
    const cookie = req.headers.get('cookie') ?? '';
    const m = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    ctx = await contextFromToken(m ? decodeURIComponent(m[1]) : undefined);
    if (ctx && ctx.mfaEnabled && !ctx.mfaVerified) ctx = null;
  }
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!ctx.permissions.has(perm)) return NextResponse.json({ error: 'forbidden', permission: perm }, { status: 403 });
  return ctx;
}

async function contextForApiKey(tenantId: string, userId: string, keyId: string): Promise<AuthContext | null> {
  return withoutTenant(async (tx) => {
    await tx.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await tx.query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [keyId]);
    const t = await one<any>(tx, `SELECT t.*, r.code AS role_code, r.name AS role_name, r.id AS role_id, u.email, u.name AS user_name FROM tenants t JOIN memberships m ON m.tenant_id = t.id AND m.user_id = $1 AND m.is_active JOIN roles r ON r.id = m.role_id JOIN users u ON u.id = m.user_id AND u.is_active WHERE t.id = $2`, [userId, tenantId]);
    if (!t) return null;
    const perms = await q<any>(tx, 'SELECT permission_code FROM role_permissions WHERE role_id = $1', [t.role_id]);
    return { sessionId: `api:${keyId}`, userId, email: t.email, name: t.user_name, tenantId, tenantCode: t.code, tenantName: t.name, isDemo: t.is_demo, baseCurrency: t.base_currency, fyStartMonth: t.fiscal_year_start_month, settings: t.settings, features: t.features, roleCode: t.role_code, roleName: t.role_name, permissions: new Set(perms.map((p: any) => p.permission_code)), mfaEnabled: false, mfaVerified: true };
  });
}

export function apiError(e: unknown): Response {
  const msg = (e as Error)?.message ?? 'error';
  const status = (e as any)?.status ?? (/not found/i.test(msg) ? 404 : /IMMUTABLE_RECORD|PERIOD_LOCKED|VERSION_LOCKED|violates check|Segregation/i.test(msg) ? 409 : /invalid|must|required/i.test(msg) ? 400 : 500);
  if (status >= 500) logger.error('api_error', { error: msg });
  return NextResponse.json({ error: status >= 500 ? 'internal_error' : msg }, { status });
}
export function json(data: unknown, status = 200) { return NextResponse.json(data, { status }); }
