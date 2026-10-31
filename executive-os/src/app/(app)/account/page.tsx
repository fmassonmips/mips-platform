import { requireAuth } from '@/lib/auth/session';
import { withoutTenant, one, q } from '@/lib/db';
import { otpauthUri } from '@/lib/auth/totp';
import { PASSWORD_MIN } from '@/lib/auth/password';
import type { SP } from '@/lib/page';
import { PageHeader, Callout } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flash } from '../strategy/_ui';
import { SubmitButton } from '../strategy/_client';
import { updateProfile, changePassword, startMfaEnrollment, cancelMfaEnrollment, confirmMfa, disableMfa } from './actions';

export const dynamic = 'force-dynamic';

export default async function AccountPage({ searchParams }: { searchParams: SP }) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const d = await withoutTenant(async (t) => ({
    u: (await one<{ email: string; name: string; mfa_enabled: boolean; mfa_secret: string | null; last_login_at: string | null; created_at: string }>(t, 'SELECT email, name, mfa_enabled, mfa_secret, last_login_at::text, created_at::text FROM users WHERE id = $1', [auth.userId]))!,
    sessions: await q<{ id: string; ip: string | null; user_agent: string | null; created_at: string; last_seen_at: string }>(t, `SELECT id, ip, user_agent, created_at::text, last_seen_at::text FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() AND last_seen_at > now() - interval '30 minutes' ORDER BY last_seen_at DESC`, [auth.userId]),
    tenants: await q<{ tenant_name: string; role_code: string; is_demo: boolean }>(t, 'SELECT tenant_name, role_code, is_demo FROM auth_user_memberships($1)', [auth.userId]),
  }));
  const pending = !d.u.mfa_enabled && d.u.mfa_secret;
  const mfaRequired = (auth.settings.mfa_required_roles ?? []).includes(auth.roleCode);
  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Account" title={d.u.name} subtitle={<>{d.u.email} · {auth.roleName} in {auth.tenantName} · member of {d.tenants.length} tenant{d.tenants.length === 1 ? '' : 's'} ({d.tenants.map((x) => `${x.tenant_name}: ${x.role_code}`).join('; ')}) · last login {d.u.last_login_at?.slice(0, 16).replace('T', ' ') ?? '—'}</>} />
      <Flash sp={sp} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <CardBody>
            <form action={updateProfile} className="flex flex-wrap items-end gap-3">
              <label className="block flex-1"><span className="label">Display name</span><input name="name" className="input" required minLength={2} maxLength={120} defaultValue={d.u.name} /></label>
              <SubmitButton>Save</SubmitButton>
            </form>
            <p className="mt-2 text-2xs text-muted">The email address identifies your account and can only be changed by an administrator.</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Change password" subtitle={`At least ${PASSWORD_MIN} characters with upper-case, lower-case and digits. Your other sessions are signed out.`} />
          <CardBody>
            <form action={changePassword} className="grid gap-3 sm:grid-cols-3">
              <label className="block"><span className="label">Current password</span><input name="current_password" type="password" autoComplete="current-password" required className="input" /></label>
              <label className="block"><span className="label">New password</span><input name="new_password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} className="input" /></label>
              <label className="block"><span className="label">Confirm new password</span><input name="confirm_password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} className="input" /></label>
              <div><SubmitButton pendingLabel="Changing…">Change password</SubmitButton></div>
            </form>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={<span className="flex items-center gap-2">Two-factor authentication (TOTP) {d.u.mfa_enabled ? <Badge tone="pos">enabled</Badge> : pending ? <Badge tone="warn">enrolment pending</Badge> : <Badge tone="neutral">off</Badge>}</span>}
            subtitle="RFC 6238 time-based codes (SHA-1, 6 digits, 30 s) — works with standard authenticator apps." />
          <CardBody className="space-y-3">
            {mfaRequired && !d.u.mfa_enabled && <Callout tone="warn" title={`Tenant policy requires MFA for the ${auth.roleCode} role`}>Enrol now to comply with your organisation’s policy.</Callout>}
            {!d.u.mfa_enabled && !pending && (
              <form action={startMfaEnrollment}><SubmitButton pendingLabel="Generating…">Start MFA enrolment</SubmitButton></form>
            )}
            {pending && (
              <div className="space-y-3">
                <Callout tone="info" title="Step 1 — add this secret to your authenticator app">
                  No QR-code library is installed in this deployment, so the secret is shown as text: choose “enter a setup key” in your app and type the base32 secret below (time-based, 6 digits), or paste the otpauth URI into an app/tool that accepts it.
                </Callout>
                <dl className="grid gap-2 text-sm">
                  <div><dt className="label">Base32 secret</dt><dd><code className="select-all break-all rounded bg-surface-2 px-2 py-1 font-mono text-base tracking-widest">{d.u.mfa_secret!.replace(/(.{4})/g, '$1 ').trim()}</code></dd></div>
                  <div><dt className="label">otpauth URI</dt><dd><code className="select-all break-all rounded bg-surface-2 px-2 py-1 font-mono text-xs">{otpauthUri(d.u.mfa_secret!, d.u.email)}</code></dd></div>
                </dl>
                <form action={confirmMfa} className="flex flex-wrap items-end gap-3">
                  <label className="block"><span className="label">Step 2 — enter the current 6-digit code</span><input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" className="input w-40 text-center font-mono text-lg tracking-[0.3em]" /></label>
                  <SubmitButton pendingLabel="Verifying…">Confirm & enable MFA</SubmitButton>
                </form>
                <form action={cancelMfaEnrollment}><SubmitButton className="btn py-1 text-xs" pendingLabel="…">Cancel enrolment</SubmitButton></form>
              </div>
            )}
            {d.u.mfa_enabled && (
              <form action={disableMfa} className="flex flex-wrap items-end gap-3">
                <label className="block"><span className="label">Current password</span><input name="current_password" type="password" autoComplete="current-password" required className="input" /></label>
                <label className="block"><span className="label">Authenticator code</span><input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required className="input w-32 text-center font-mono" /></label>
                <SubmitButton className="btn-danger" pendingLabel="…" confirm="Disable two-factor authentication?">Disable MFA</SubmitButton>
              </form>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={`Active sessions (${d.sessions.length})`} subtitle="Sessions expire after 30 minutes idle or 12 hours. Changing your password signs out all other sessions." />
          <div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr><th className="th">Started</th><th className="th">Last seen</th><th className="th">IP</th><th className="th">Client</th></tr></thead>
            <tbody>{d.sessions.map((s) => <tr key={s.id}><td className="td text-xs">{s.created_at.slice(0, 16).replace('T', ' ')}{s.id === auth.sessionId && <Badge tone="gold" className="ml-1">this session</Badge>}</td><td className="td text-xs">{s.last_seen_at.slice(0, 16).replace('T', ' ')}</td><td className="td text-xs">{s.ip ?? '—'}</td><td className="td max-w-md truncate text-xs" title={s.user_agent ?? ''}>{s.user_agent ?? '—'}</td></tr>)}</tbody></table></div>
        </Card>
      </div>
    </div>
  );
}
