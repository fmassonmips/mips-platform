'use client';
import { useActionState, useState } from 'react';
import { inviteUser, verifyChainAction, demoResetAction, type InviteState, type VerifyState, type ResetState } from './actions';

export function InviteForm({ roles, departments }: { roles: { id: string; code: string; name: string }[]; departments: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteUser, {});
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block"><span className="label">Email</span><input name="email" type="email" required maxLength={254} className="input" autoComplete="off" /></label>
        <label className="block"><span className="label">Full name</span><input name="name" required minLength={2} maxLength={120} className="input" autoComplete="off" /></label>
        <label className="block"><span className="label">Role</span><select name="role_id" required className="input" defaultValue={roles.find((r) => r.code === 'viewer')?.id}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}</select></label>
        <label className="block"><span className="label">Department</span><select name="department" className="input" defaultValue=""><option value="">— none —</option>{departments.map((d) => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}</select></label>
        <div className="flex items-end"><button className="btn-primary" disabled={pending}>{pending ? 'Creating…' : 'Create user'}</button></div>
      </form>
      {state.err && <p role="alert" className="text-sm text-neg">{state.err}</p>}
      {state.ok && !state.password && <p className="text-sm text-pos">{state.ok}</p>}
      {state.password && (
        <div role="status" className="rounded-lg border border-warn/50 bg-warn/5 p-3 text-sm">
          <div className="font-semibold text-warn">{state.ok} One-time password — shown once, not stored in clear anywhere</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-surface px-2 py-1 font-mono text-base tracking-wide">{state.password}</code>
            <button type="button" className="btn py-1 text-xs" onClick={() => { navigator.clipboard?.writeText(state.password!).then(() => setCopied(true)); }}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <p className="mt-2 text-xs text-muted">Hand it to {state.email} over a separate secure channel. They should change it immediately under Account → Password. It meets the password policy (≥ 12 characters, upper, lower, digit). Leaving or reloading this page discards it.</p>
        </div>
      )}
    </div>
  );
}

export function VerifyChain() {
  const [state, action, pending] = useActionState<VerifyState>(verifyChainAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button className="btn-primary" disabled={pending}>{pending ? 'Verifying…' : 'Verify audit chain'}</button>
      {state.err && <span role="alert" className="text-sm text-neg">{state.err}</span>}
      {state.ok === true && <span role="status" className="text-sm font-medium text-pos">Chain intact — {state.checked} events recomputed, every hash and back-link matches ({state.at?.slice(0, 19).replace('T', ' ')} UTC).</span>}
      {state.ok === false && <span role="alert" className="text-sm font-medium text-neg">Chain BROKEN at event #{state.brokenAt} ({state.checked} events checked). Records from that point cannot be relied upon — escalate to the auditor.</span>}
    </form>
  );
}

export function DemoResetForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(demoResetAction, {});
  const [typed, setTyped] = useState('');
  return (
    <form action={action} className="space-y-3" onSubmit={(e) => { if (!window.confirm(`Purge and regenerate ALL data of ${code}? This takes about 45 seconds.`)) e.preventDefault(); }}>
      <label className="block max-w-sm"><span className="label">Type the tenant code <code>{code}</code> to confirm</span>
        <input name="confirm_code" className="input font-mono" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={pending} /></label>
      <button className="btn-danger" disabled={pending || typed.trim() === ''} aria-busy={pending}>{pending ? 'Resetting demo data… (≈ 45 s, do not close this page)' : 'Reset demo data'}</button>
      {pending && <div className="h-1 w-full max-w-sm overflow-hidden rounded bg-surface-2"><div className="h-full w-1/3 animate-pulse bg-warn" /></div>}
      {state.err && <p role="alert" className="text-sm text-neg">{state.err}</p>}
      {state.ok && <p role="status" className="text-sm text-pos">{state.ok} ({state.seconds} s)</p>}
    </form>
  );
}
