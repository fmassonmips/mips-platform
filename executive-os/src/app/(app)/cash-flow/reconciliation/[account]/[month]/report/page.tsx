import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { fmtMoney, monthLabel } from '@/lib/format';
import { dec, sum } from '@/lib/money';
import { monthEnd } from '@/lib/dates';
import { findAccount, getRecon, reconSummary } from '@/lib/services/treasury';
import { PrintButton } from '../../../../_components/print-button';

export const dynamic = 'force-dynamic';

export default async function ReconReport({ params, searchParams }: { params: Promise<{ account: string; month: string }>; searchParams: SP }) {
  const { account, month } = await params;
  const { auth } = await pageContext(searchParams, 'finance.view');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  const period = `${month}-01`;
  const data = await tx(auth, async (t) => {
    const acc = await findAccount(t, decodeURIComponent(account));
    if (!acc) return null;
    const recon = await getRecon(t, acc.id, period);
    if (!recon) return { acc, recon: null };
    const s = await reconSummary(t, recon);
    const tenant = await q<{ name: string }>(t, 'SELECT name FROM tenants WHERE id = app_tenant()');
    return { acc, recon, s, tenant: tenant[0]?.name ?? '' };
  });
  if (!data) notFound();
  if (!data.recon || !data.s) return <div className="p-6 text-sm">No reconciliation exists for this account and month. <Link className="link" href={`/cash-flow/reconciliation/${account}/${month}`}>Open workspace</Link></div>;
  const { acc, recon, s } = data;
  const ccy = acc.currency; const b = s.balances;
  const byId = new Map([...s.items.bank, ...s.items.ledger].map((x) => [x.id, x]));
  const live = s.liveExceptions;
  const group = (pred: (e: (typeof live)[number]) => boolean) => live.filter(pred);
  const sections: [string, typeof live][] = [
    ['Add: deposits in transit (in ledger, not yet on statement)', group((e) => e.side === 'ledger' && e.kind === 'unmatched' && dec(e.amount).gt(0))],
    ['Less: uncleared payments (in ledger, not yet on statement)', group((e) => e.side === 'ledger' && e.kind === 'unmatched' && dec(e.amount).lt(0))],
    ['Bank-only items: unidentified receipts / unrecorded debits', group((e) => e.side === 'bank' && e.kind === 'unmatched')],
    ['Duplicate statement lines', group((e) => e.kind === 'duplicate')],
    ['Amount differences (bank line vs ledger item)', group((e) => e.kind === 'amount_difference')],
  ];
  const diffs = s.matches.filter((m) => m.status === 'confirmed' && !dec(m.difference).isZero());
  const row = (l: string, v: string, strong = false) => <tr className={strong ? 'font-semibold' : ''}><td className="td">{l}</td><td className="td num text-right">{fmtMoney(v, ccy, { dp: 2 })}</td></tr>;
  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between"><Link className="link text-sm" href={`/cash-flow/reconciliation/${acc.code}/${month}`}>← Back to workspace</Link><div className="flex gap-2"><a className="btn" href={`/cash-flow/reconciliation/${acc.code}/${month}/export`}>CSV export</a><PrintButton /></div></div>
      <div className="card p-6">
        <div className="text-2xs uppercase tracking-widest text-gold">Bank reconciliation report</div>
        <h1 className="text-lg font-semibold">{data.tenant} — {acc.code} {acc.name}</h1>
        <p className="text-sm text-muted">{acc.bank_name} · {acc.masked_number} · {ccy} · class {acc.account_class} · period {monthLabel(period)} ({period} → {monthEnd(period)})</p>
        <p className="mt-1 text-sm">Status: <b>{recon.status.replace('_', ' ')}</b> · Prepared by: <b>{recon.prepared_by_name ?? '—'}</b> · Approved by: <b>{recon.approved_by_name ?? '—'}</b>{recon.approved_at && ` on ${recon.approved_at.slice(0, 16)}`}</p>
        {auth.isDemo && <p className="mt-1 text-2xs font-semibold text-warn">DEMO data — synthetic, not actual MIPSIT Digital Ltd records.</p>}

        <h2 className="mt-5 text-sm font-semibold">Summary</h2>
        <table className="mt-1 w-full border-collapse text-sm"><tbody>
          {row('Opening statement balance', s.items.openingStatement)}
          {row(`Statement lines in period (${s.items.bank.length})`, sum(s.items.bank.map((x) => x.amount)).toString())}
          {row('Closing statement balance', b.statementBalance.toString(), true)}
          {row(`Ledger (cash book) items in period (${s.items.ledger.length})`, sum(s.items.ledger.map((x) => x.amount)).toString())}
          {row('Ledger balance (opening statement + ledger items)', b.ledgerBalance.toString(), true)}
          {row('Difference (statement − ledger)', b.difference.toString(), true)}
          {row('Explained: resolved exceptions and recorded match differences', b.explainedResolved.toString())}
          {row('Unresolved difference', b.unresolvedDifference.toString(), true)}
        </tbody></table>
        <p className="mt-1 text-2xs text-muted">Matches: {s.matches.filter((m) => m.status === 'confirmed').length} confirmed ({s.matches.filter((m) => m.status === 'confirmed' && m.match_type === 'auto').length} auto, {s.matches.filter((m) => m.status === 'confirmed' && m.match_type === 'manual').length} manual), {s.matches.filter((m) => m.status === 'proposed').length} proposed, {s.matches.filter((m) => m.status === 'rejected').length} rejected. No differences have been written off.</p>

        <h2 className="mt-5 text-sm font-semibold">Reconciling items</h2>
        {sections.map(([title, list]) => (
          <div key={title} className="mt-2">
            <div className="text-xs font-semibold">{title} — {fmtMoney(sum(list.map((e) => e.amount)).toString(), ccy, { dp: 2 })}</div>
            {list.length === 0 ? <div className="text-xs text-muted">None</div> : (
              <table className="mt-1 w-full border-collapse text-xs"><thead><tr><th className="th">Date</th><th className="th">Reference</th><th className="th">Description</th><th className="th text-right">Amount</th><th className="th">Status</th><th className="th">Resolution</th></tr></thead>
                <tbody>{list.map((e) => { const it = byId.get(e.item_id); return <tr key={e.id}><td className="td">{it?.date}</td><td className="td">{it?.reference}</td><td className="td whitespace-normal">{it?.description}</td><td className="td num text-right">{fmtMoney(e.amount, '', { dp: 2 })}</td><td className="td">{e.status}</td><td className="td whitespace-normal">{e.resolution ?? '—'}{e.resolved_by_name ? ` (${e.resolved_by_name})` : ''}</td></tr>; })}</tbody></table>
            )}
          </div>
        ))}
        {diffs.length > 0 && <div className="mt-2"><div className="text-xs font-semibold">Manual matches with explicitly recorded differences</div>
          <table className="mt-1 w-full border-collapse text-xs"><tbody>{diffs.map((m) => <tr key={m.id}><td className="td whitespace-normal">{m.rule}</td><td className="td num text-right">{fmtMoney(m.difference, '', { dp: 2 })}</td><td className="td">{m.confirmed_by_name}</td></tr>)}</tbody></table></div>}
        <div className="mt-8 grid grid-cols-2 gap-8 text-xs">
          <div className="border-t border-border pt-2">Prepared by: {recon.prepared_by_name ?? '________________'}</div>
          <div className="border-t border-border pt-2">Approved by: {recon.approved_by_name ?? '________________'}</div>
        </div>
        <p className="mt-4 text-2xs text-muted">Generated {new Date().toISOString().slice(0, 16)} UTC by MIPS Executive OS from reconciliations / recon_matches / recon_exceptions / bank_transactions / cash_ledger_items. Management reconciliation — not an audit opinion.</p>
      </div>
    </div>
  );
}
