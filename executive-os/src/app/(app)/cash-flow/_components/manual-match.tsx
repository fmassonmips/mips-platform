'use client';
/**
 * Manual matching selector. Running totals are shown for convenience only;
 * the server re-validates (totals must be equal unless the difference is
 * explicitly recorded with an explanation — never written off).
 */
import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';

export interface MMItem { id: string; date: string; amount: string; reference: string | null; description: string | null }

const fmt = (d: Decimal) => d.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function ManualMatch({ bank, ledger, action, returnTo, reconId, disabled }: { bank: MMItem[]; ledger: MMItem[]; action: (f: FormData) => void | Promise<void>; returnTo: string; reconId: string; disabled?: boolean }) {
  const [b, setB] = useState<Set<string>>(new Set());
  const [l, setL] = useState<Set<string>>(new Set());
  const [rec, setRec] = useState(false);
  const tot = (items: MMItem[], s: Set<string>) => items.filter((i) => s.has(i.id)).reduce((a, i) => a.plus(i.amount), new Decimal(0));
  const bt = useMemo(() => tot(bank, b), [bank, b]);
  const lt = useMemo(() => tot(ledger, l), [ledger, l]);
  const diff = bt.minus(lt);
  const toggle = (s: Set<string>, set: (x: Set<string>) => void, id: string) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); set(n); };
  const table = (title: string, items: MMItem[], sel: Set<string>, set: (x: Set<string>) => void, name: string) => (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-xs font-semibold text-muted">{title} ({items.length})</div>
      <div className="max-h-80 overflow-auto rounded border border-border">
        <table className="w-full border-collapse text-xs">
          <thead><tr><th className="th w-6"></th><th className="th">Date</th><th className="th">Reference</th><th className="th">Description</th><th className="th text-right">Amount</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={sel.has(i.id) ? 'bg-gold-soft' : 'hover:bg-surface-2'}>
                <td className="td py-1"><input type="checkbox" name={name} value={i.id} checked={sel.has(i.id)} onChange={() => toggle(sel, set, i.id)} disabled={disabled} aria-label={`Select ${i.reference ?? i.id}`} /></td>
                <td className="td py-1">{i.date}</td><td className="td py-1">{i.reference ?? '—'}</td><td className="td max-w-[220px] truncate py-1" title={i.description ?? ''}>{i.description ?? '—'}</td>
                <td className={`td num py-1 text-right ${Number(i.amount) < 0 ? 'text-neg' : ''}`}>{fmt(new Decimal(i.amount))}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td className="td text-center text-muted" colSpan={5}>No unmatched items</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="reconId" value={reconId} />
      <div className="flex flex-col gap-3 xl:flex-row">
        {table('Bank statement lines', bank, b, setB, 'bank')}
        {table('Ledger (cash book) items', ledger, l, setL, 'ledger')}
      </div>
      <div className="flex flex-wrap items-end gap-4 rounded border border-border bg-surface-2 p-3 text-sm">
        <div>Bank selected: <b className="num">{fmt(bt)}</b> ({b.size})</div>
        <div>Ledger selected: <b className="num">{fmt(lt)}</b> ({l.size})</div>
        <div className={diff.isZero() ? 'text-pos' : 'text-neg'}>Difference: <b className="num">{fmt(diff)}</b></div>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="recordDifference" value="1" checked={rec} onChange={(e) => setRec(e.target.checked)} disabled={disabled} />Record the difference explicitly (no write-off)</label>
        <input className="input w-72" name="note" placeholder={rec ? 'Explanation of the difference (required)' : 'Note (optional)'} maxLength={500} disabled={disabled} />
        <button className="btn-primary" disabled={disabled || b.size === 0 || l.size === 0 || (!diff.isZero() && !rec)}>Create manual match</button>
      </div>
    </form>
  );
}
