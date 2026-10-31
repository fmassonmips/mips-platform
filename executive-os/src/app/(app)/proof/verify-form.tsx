'use client';
import { useActionState } from 'react';
import { verifyKpiAction, type VState } from './actions';
export function VerifyForm({ code, start, end }: { code: string; start: string; end: string }) {
  const [s, action, pending] = useActionState<VState, FormData>(verifyKpiAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="code" value={code} /><input type="hidden" name="start" value={start} /><input type="hidden" name="end" value={end} />
      <div><label className="label" htmlFor="status">Classification</label><select id="status" name="status" className="input"><option>VERIFIED</option><option>DISPUTED</option><option>ESTIMATED</option><option>PENDING</option></select></div>
      <div><label className="label" htmlFor="basis">Evidence basis</label><textarea id="basis" name="basis" className="input" rows={2} placeholder="e.g. Agreed to bank statement MCB-OPS Oct 2026 and approved reconciliation" required /></div>
      <div><label className="label" htmlFor="refs">Evidence references (one per line)</label><textarea id="refs" name="refs" className="input font-mono text-xs" rows={2} /></div>
      {s.error && <p role="alert" className="text-xs text-neg">{s.error}</p>}{s.ok && <p className="text-xs text-pos">{s.ok}</p>}
      <button type="submit" className="btn-primary text-xs" disabled={pending}>Record management verification</button>
      <p className="text-2xs text-muted">Management verification only — it is not an external audit opinion.</p>
    </form>
  );
}
