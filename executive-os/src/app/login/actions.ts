'use server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { withoutTenant, withTenant, one, q } from '@/lib/db';
import { verifyPassword, DUMMY_HASH } from '@/lib/auth/password';
import { verifyTotp } from '@/lib/auth/totp';
import { createSession, setSessionCookie, clearSession, clientMeta, hashToken, SESSION_COOKIE, getAuth } from '@/lib/auth/session';
import { audit } from '@/lib/audit';
import { logger } from '@/lib/logger';

const MAX_EMAIL_FAILS = 5, MAX_IP_FAILS = 30, WINDOW_MIN = 15;
export interface LoginState { error?: string }

export async function loginAction(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) }).safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return { error: 'Enter a valid email and password.' };
  const { email, password } = parsed.data;
  const { ip, ua } = await clientMeta();
  const result = await withoutTenant(async (tx) => {
    const fails = await one<{ e: number; i: number }>(tx, `SELECT
      (SELECT count(*)::int FROM login_attempts WHERE lower(email) = lower($1) AND NOT success AND attempted_at > now() - interval '${WINDOW_MIN} minutes') AS e,
      (SELECT count(*)::int FROM login_attempts WHERE ip = $2 AND NOT success AND attempted_at > now() - interval '${WINDOW_MIN} minutes') AS i`, [email, ip]);
    if ((fails?.e ?? 0) >= MAX_EMAIL_FAILS || (fails?.i ?? 0) >= MAX_IP_FAILS) return { error: `Too many failed attempts. Try again in ${WINDOW_MIN} minutes.` };
    const u = await one<any>(tx, 'SELECT id, password_hash, is_active, mfa_enabled FROM users WHERE lower(email) = lower($1)', [email]);
    const ok = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
    await tx.query('INSERT INTO login_attempts (email, ip, success) VALUES ($1,$2,$3)', [email, ip, Boolean(u && u.is_active && ok)]);
    if (!u || !u.is_active || !ok) return { error: 'Invalid email or password.' };
    const memberships = await q<any>(tx, 'SELECT * FROM auth_user_memberships($1)', [u.id]);
    if (!memberships.length) return { error: 'Your account has no active tenant membership.' };
    const token = await createSession(tx, u.id, memberships[0].tenant_id, !u.mfa_enabled, ip, ua);
    await tx.query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
    return { token, mfa: u.mfa_enabled as boolean, tenantId: memberships[0].tenant_id as string, userId: u.id as string };
  });
  if ('error' in result) return { error: result.error };
  await setSessionCookie(result.token!);
  await withTenant({ tenantId: result.tenantId!, userId: result.userId! }, (tx) => audit(tx, { tenantId: result.tenantId!, userId: result.userId!, action: 'auth.login', entityType: 'user', entityId: result.userId!, payload: { ip, mfa_pending: result.mfa } }));
  logger.info('login', { userId: result.userId, ip });
  redirect(result.mfa ? '/mfa' : '/executive');
}

export async function mfaAction(_: LoginState, form: FormData): Promise<LoginState> {
  const code = String(form.get('code') ?? '').trim();
  const c = await cookies(); const token = c.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');
  const ok = await withoutTenant(async (tx) => {
    const s = await one<any>(tx, `SELECT s.id, u.mfa_secret FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`, [hashToken(token!)]);
    if (!s?.mfa_secret || !verifyTotp(s.mfa_secret, code)) return false;
    await tx.query('UPDATE sessions SET mfa_verified = true WHERE id = $1', [s.id]);
    return true;
  });
  if (!ok) return { error: 'Invalid or expired code.' };
  redirect('/executive');
}

export async function logoutAction() {
  await clearSession();
  redirect('/login');
}

export async function switchTenantAction(form: FormData) {
  const auth = await getAuth(); if (!auth) redirect('/login');
  const target = String(form.get('tenantId') ?? '');
  await withoutTenant(async (tx) => {
    const m = await q<any>(tx, 'SELECT tenant_id FROM auth_user_memberships($1)', [auth.userId]);
    if (!m.some((x) => x.tenant_id === target)) throw new Error('Not a member of the requested tenant');
    await tx.query('UPDATE sessions SET tenant_id = $1 WHERE id = $2', [target, auth.sessionId]);
  });
  await withTenant({ tenantId: target, userId: auth.userId }, (tx) => audit(tx, { tenantId: target, userId: auth.userId, action: 'auth.tenant_switched', entityType: 'session', entityId: auth.sessionId }));
  redirect('/executive');
}
