'use client';
import { useActionState } from 'react';
import { saveBreakEvenSnapshot, type SnapshotState } from './actions';

/** Records the current computation as an evidence snapshot (recomputed server-side). */
export function SnapshotForm({ range, params }: { range: string; params: Record<string, string> }) {
  const [state, action, pending] = useActionState<SnapshotState, FormData>(saveBreakEvenSnapshot, { ok: false, message: null });
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="range" value={range} />
      {Object.entries(params).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div><label className="label" htmlFor="label">Snapshot name</label><input id="label" name="label" className="input w-72" placeholder="e.g. Board pack — hire COO case" required minLength={3} /></div>
      <button className="btn" type="submit" disabled={pending}>{pending ? 'Recording…' : 'Record as evidence'}</button>
      {state.message && <span role="status" className={`text-sm ${state.ok ? 'text-pos' : 'text-neg'}`}>{state.message}</span>}
    </form>
  );
}
