'use server';
/**
 * Account self-service: profile, password change, TOTP MFA enrolment.
 * users/sessions are not tenant-scoped → withoutTenant; audit events go to the current tenant.
 */
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { requireAuth, tctx, type AuthContext } from '@/lib/auth/session';
import { withoutTenant, withTenant, one, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { validatePasswordPolicy, hashPassword, verifyPassword } from '@/lib/auth/password';
import { generateSecret, verifyTotp } from '@/lib/auth/totp';
import { readableError, flashUrl, UserError } from '@/lib/services/admin';

async function act(form: FormData | null, fn: (auth: AuthContext, t: Tx) => Promise<{ msg: string; audit?: { action: string; payload?: unknown } }>): Promise<never> {
  const auth = await requireAuth();
  let msg: { ok?: string; err?: string };
  try {
    const r = await withoutTenant((t) => fn(auth, t));
    if (r.audit) await withTenant(tctx(auth), (t) => audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: r.audit!.action, entityType: 'user', entityId: auth.userId, payload: r.audit!.payload }));
    msg = { ok: r.msg };
  } catch (e) { unstable_rethrow(e); msg = { err: e instanceof UserError ? e.message : readableError(e) }; }
  revalidatePath('/', 'layout');
  redirect(flashUrl('/account', '/account', msg));
}
const user = (t: Tx, id: string) => one<{ name: string; password_hash: string; mfa_secret: string | null; mfa_enabled: boolean }>(t, 'SELECT name, password_hash, mfa_secret, mfa_enabled FROM users WHERE id = $1 FOR UPDATE', [id]);

export async function updateProfile(form: FormData) {
  return act(form, async (auth, t) => {
    const name = z.string().trim().min(2, 'name must have at least 2 characters').max(120).parse(form.get('name') ?? '');
    const u = await user(t, auth.userId);
    if (u!.name === name) return { msg: 'No change' };
    await t.query('UPDATE users SET name = $2 WHERE id = $1', [auth.userId, name]);
    return { msg: 'Profile updated', audit: { action: 'account.profile_updated', payload: { name: { from: u!.name, to: name } } } };
  });
}

export async function changePassword(form: FormData) {
  return act(form, async (auth, t) => {
    const current = String(form.get('current_password') ?? ''); const next = String(form.get('new_password') ?? ''); const confirm = String(form.get('confirm_password') ?? '');
    if (next.length > 200) throw new UserError('Password is too long.');
    const u = await user(t, auth.userId);
    if (!u || !(await verifyPassword(current, u.password_hash))) throw new UserError('Current password is incorrect.');
    if (next !== confirm) throw new UserError('New password and confirmation do not match.');
    const policy = validatePasswordPolicy(next);
    if (policy) throw new UserError(policy);
    if (await verifyPassword(next, u.password_hash)) throw new UserError('The new password must differ from the current one.');
    await t.query('UPDATE users SET password_hash = $2 WHERE id = $1', [auth.userId, await hashPassword(next)]);
    const revoked = (await t.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL', [auth.userId, auth.sessionId])).rowCount ?? 0;
    return { msg: `Password changed. ${revoked} other session(s) signed out.`, audit: { action: 'account.password_changed', payload: { other_sessions_revoked: revoked } } };
  });
}

export async function startMfaEnrollment(form: FormData) {
  return act(form, async (auth, t) => {
    const u = await user(t, auth.userId);
    if (u!.mfa_enabled) throw new UserError('MFA is already enabled.');
    await t.query('UPDATE users SET mfa_secret = $2 WHERE id = $1', [auth.userId, generateSecret()]);
    return { msg: 'New authenticator secret generated — add it to your app, then confirm with a code.', audit: { action: 'account.mfa_enrolment_started' } };
  });
}

export async function cancelMfaEnrollment(form: FormData) {
  return act(form, async (auth, t) => {
    const u = await user(t, auth.userId);
    if (u!.mfa_enabled) throw new UserError('MFA is enabled; use “Disable MFA”.');
    await t.query('UPDATE users SET mfa_secret = NULL WHERE id = $1', [auth.userId]);
    return { msg: 'Enrolment cancelled', audit: { action: 'account.mfa_enrolment_cancelled' } };
  });
}

export async function confirmMfa(form: FormData) {
  return act(form, async (auth, t) => {
    const code = String(form.get('code') ?? '').replace(/\s/g, '');
    const u = await user(t, auth.userId);
    if (u!.mfa_enabled) throw new UserError('MFA is already enabled.');
    if (!u!.mfa_secret) throw new UserError('Start the enrolment first.');
    if (!verifyTotp(u!.mfa_secret, code)) throw new UserError('That code is not valid for this secret. Check the device clock and try the current 6-digit code.');
    await t.query('UPDATE users SET mfa_enabled = true WHERE id = $1', [auth.userId]);
    await t.query('UPDATE sessions SET mfa_verified = true WHERE id = $1', [auth.sessionId]); // this session just proved possession
    return { msg: 'Two-factor authentication enabled. You will be asked for a code at each sign-in.', audit: { action: 'account.mfa_enabled' } };
  });
}

export async function disableMfa(form: FormData) {
  return act(form, async (auth, t) => {
    const u = await user(t, auth.userId);
    if (!u!.mfa_enabled || !u!.mfa_secret) throw new UserError('MFA is not enabled.');
    if (!(await verifyPassword(String(form.get('current_password') ?? ''), u!.password_hash))) throw new UserError('Current password is incorrect.');
    if (!verifyTotp(u!.mfa_secret, String(form.get('code') ?? '').replace(/\s/g, ''))) throw new UserError('Invalid authenticator code.');
    await t.query('UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1', [auth.userId]);
    return { msg: 'Two-factor authentication disabled.', audit: { action: 'account.mfa_disabled' } };
  });
}
