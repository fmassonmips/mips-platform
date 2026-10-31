import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { fmtMoney, monthLabel } from '@/lib/format';
import { dec } from '@/lib/money';
import { findAccount, getRecon, reconSummary, reconItems, reconBalances, type ReconItemRow } from '@/lib/services/treasury';
import { Flash, ReturnTo, currentUrl, Provenance } from '../../../_components/flash';
import { ManualMatch } from '../../../_components/manual-match';
import {
  startReconAction, autoMatchAction, confirmMatchAction, confirmAllExactAction, rejectMatchAction, manualMatchAction,
  investigateExceptionAction, resolveExceptionAction, submitReconAction, approveReconAction, returnReconAction,
} from '../../../actions';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = { duplicate: 'Duplicate statement line', amount_difference: 'Amount difference', unmatched: 'Unmatched', date_difference: 'Date difference' };
function excLabel(kind: string, side: string, amount: string) {
  if (kind !== 'unmatched') return KIND_LABEL[kind] ?? kind;
  if (side === 'bank') return dec(amount).gt(0) ? 'Unidentified receipt (bank only)' : 'Unrecorded bank debit (bank only)';
  return dec(amount).lt(0) ? 'Uncleared payment (ledger only)' : 'Deposit in transit (ledger only)';
}

export default async function ReconWorkspace({ params, searchParams }: { params: Promise<{ account: string; month: string }>; searchParams: SP }) {
  const { account, month } = await params;
  const { auth, sp } = await pageContext(searchParams, 'finance.view');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  const period = `${month}-01`;
  const data = await tx(auth, async (t) => {
    const acc = await findAccount(t, decodeURIComponent(account));
    if (!acc) return null;
    const recon = await getRecon(t, acc.id, period);
    if (recon) {
      const s = await reconSummary(t, recon);
      const history = await q<any>(t, `SELECT a.created_at::text AS at, a.action, coalesce(u.name, a.actor_label) AS actor, a.payload FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE a.entity_type = 'reconciliation' AND a.entity_id = $1 ORDER BY a.id DESC LIMIT 100`, [recon.id]);
      return { acc, recon, ...s, history };
    }
    const items = await reconItems(t, acc.id, period);
    const balances = reconBalances({ openingStatement: items.openingStatement, bankAmounts: items.bank.map((b) => b.amount), ledgerAmounts: items.ledger.map((l) => l.amount), exceptions: [], confirmedMatchDifferences: [] });
    return { acc, recon: null, items, matches: [], exceptions: [], liveExceptions: [], balances, unclassified: [], history: [] };
  });
  if (!data) notFound();
  const { acc, recon, items, matches, exceptions, balances: b } = data;
  const here = currentUrl(`/cash-flow/reconciliation/${acc.code}/${month}`, sp);
  const canPrep = auth.permissions.has('treasury.reconcile');
  const canApprove = auth.permissions.has('finance.approve');
  const isOpen = !recon || recon.status === 'open';
  const editable = canPrep && isOpen;
  const ccy = acc.currency;
  const byId = new Map<string, ReconItemRow & { side: string }>([...items.bank.map((x) => [x.id, { ...x, side: 'bank' }] as const), ...items.ledger.map((x) => [x.id, { ...x, side: 'ledger' }] as const)]);
  const proposed = matches.filter((m) => m.status === 'proposed');
  const confirmed = matches.filter((m) => m.status === 'confirmed');
  const rejected = matches.filter((m) => m.status === 'rejected');
  const activeIds = new Set([...items.bank, ...items.ledger].filter((i) => i.match_id).map((i) => i.id));
  const freeBank = items.bank.filter((i) => !i.match_id);
  const freeLedger = items.ledger.filter((i) => !i.match_id);
  const exactCount = proposed.filter((m) => m.cardinality === 'one_to_one' && m.rule === 'reference_and_amount' && dec(m.difference).isZero()).length;
  const prevMonth = (() => { const d = new Date(`${period}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const nextMonth = (() => { const d = new Date(`${period}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
  const hidden = <><ReturnTo value={here} /><input type="hidden" name="account" value={acc.code} /><input type="hidden" name="month" value={month} /></>;
  const itemCell = (id: string) => { const it = byId.get(id); return it ? <span><span className="text-muted">{it.date}</span> {it.reference ?? '—'} <span className="text-muted">{it.description}</span> <b className={`num ${dec(it.amount).lt(0) ? 'text-neg' : ''}`}>{fmtMoney(it.amount, '', { dp: 2 })}</b></span> : <span className="text-muted">{id.slice(0, 8)} (outside period)</span>; };
  const counterpart = (e: { kind: string; side: string; item_id: string }) => {
    if (e.kind !== 'amount_difference' && e.kind !== 'duplicate') return null;
    const it = byId.get(e.item_id); if (!it) return null;
    const pool = e.kind === 'duplicate' ? items.bank.filter((x) => x.id !== it.id && x.date === it.date && x.amount === it.amount && (x.reference ?? '') === (it.reference ?? '')) : (e.side === 'bank' ? items.ledger : items.bank).filter((x) => (x.reference ?? '').toUpperCase() === (it.reference ?? '').toUpperCase());
    return pool[0] ? `${e.kind === 'duplicate' ? 'duplicate of' : 'vs'} ${pool[0].reference ?? ''} ${fmtMoney(pool[0].amount, '', { dp: 2 })}${e.kind === 'amount_difference' ? ` (Δ ${fmtMoney(dec(it.amount).minus(pool[0].amount).toString(), '', { dp: 2 })})` : ''}` : null;
  };

  return (
    <div>
      <PageHeader eyebrow={`Treasury · Bank reconciliation · ${acc.bank_name}`} title={`${acc.code} — ${monthLabel(period)}`}
        subtitle={<>{acc.name} ({ccy}, {acc.masked_number ?? 'no number'}, class <b>{acc.account_class}</b>). Status {recon ? <StatusBadge status={recon.status} /> : <Badge>not started</Badge>}{recon?.prepared_by_name && <> · prepared by <b>{recon.prepared_by_name}</b></>}{recon?.approved_by_name && <> · approved by <b>{recon.approved_by_name}</b> on {recon.approved_at?.slice(0, 16)}</>}. <Link className="link" href={`/cash-flow/reconciliation/${acc.code}/${prevMonth}`}>← {prevMonth}</Link> · <Link className="link" href={`/cash-flow/reconciliation/${acc.code}/${nextMonth}`}>{nextMonth} →</Link></>}
        actions={<>
          {recon && <Link className="btn" href={`/cash-flow/reconciliation/${acc.code}/${month}/report`}>Report</Link>}
          {recon && <a className="btn" href={`/cash-flow/reconciliation/${acc.code}/${month}/export`}>CSV export</a>}
          {canPrep && !recon && <form action={startReconAction}>{hidden}<button className="btn">Start reconciliation</button></form>}
          {editable && <form action={autoMatchAction}>{hidden}<button className="btn-primary">Run auto-match</button></form>}
        </>} />
      <Flash sp={sp} />
      {!canPrep && isOpen && <Callout tone="info" title="Read-only">You can view this reconciliation; preparing it requires the treasury.reconcile permission.</Callout>}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[['Opening statement balance', items.openingStatement], ['Statement balance (closing)', b.statementBalance.toString()], ['Ledger balance', b.ledgerBalance.toString()], ['Difference (statement − ledger)', b.difference.toString()], ['Explained (resolved / recorded)', b.explainedResolved.toString()], ['Unresolved difference', b.unresolvedDifference.toString()]].map(([l, v], i) => (
          <Card key={l}><CardBody className="p-3"><div className="text-2xs text-muted">{l}</div><div className={`mt-1 text-base font-semibold num ${i === 5 && !dec(v).isZero() ? 'text-warn' : ''}`}>{fmtMoney(v, ccy, { dp: 2 })}</div></CardBody></Card>
        ))}
      </div>
      <Provenance>Statement = opening balance + {items.bank.length} statement line(s) in {month}. Ledger = opening statement balance + {items.ledger.length} cash-ledger item(s) in {month}. Difference = bank-only items ({fmtMoney(b.bankOnlyItems.toString(), '', { dp: 2 })}) − ledger-only items ({fmtMoney(b.ledgerOnlyItems.toString(), '', { dp: 2 })}) + recorded match differences ({fmtMoney(b.recordedMatchDifferences.toString(), '', { dp: 2 })}) + unclassified ({fmtMoney(b.unexplained.toString(), '', { dp: 2 })}). Resolving an exception explains it — it never posts a write-off.</Provenance>

      {recon && (
        <Card className="mt-4">
          <CardHeader title="Review & approval" subtitle="Preparer submits; a different user with finance.approve approves (database CHECK: approver ≠ preparer)." />
          <CardBody className="flex flex-wrap items-end gap-3 text-sm">
            <div>Proposed matches pending: <b>{proposed.length}</b> · open exceptions: <b>{data.liveExceptions.filter((e) => e.status === 'open').length}</b> · investigating: <b>{data.liveExceptions.filter((e) => e.status === 'investigating').length}</b> · unclassified items: <b>{data.unclassified.length}</b></div>
            {recon.status === 'open' && canPrep && <form action={submitReconAction}><ReturnTo value={here} /><input type="hidden" name="reconId" value={recon.id} /><button className="btn-gold">Submit for review</button></form>}
            {recon.status === 'in_review' && canApprove && <>
              <form action={approveReconAction}><ReturnTo value={here} /><input type="hidden" name="reconId" value={recon.id} /><button className="btn-primary">Approve reconciliation</button></form>
              <form action={returnReconAction} className="flex items-center gap-2"><ReturnTo value={here} /><input type="hidden" name="reconId" value={recon.id} /><input className="input w-64" name="note" placeholder="Reason for returning (required)" required minLength={5} /><button className="btn">Return to preparer</button></form>
            </>}
            {recon.status === 'in_review' && !canApprove && <span className="text-muted">Awaiting approval by a user with finance.approve.</span>}
            {recon.status === 'approved' && <span className="text-pos">Approved — locked. Unresolved difference at approval: {fmtMoney(recon.unresolved_difference, ccy, { dp: 2 })}.</span>}
          </CardBody>
        </Card>
      )}

      <Section title={`Exceptions (${exceptions.length})`}>
        <Card>
          {exceptions.length === 0 ? <CardBody className="text-sm text-muted">{recon ? 'No exceptions. Run auto-match to classify statement and ledger items.' : 'Start the reconciliation and run auto-match.'}</CardBody> : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr><th className="th">Type</th><th className="th">Side</th><th className="th">Item</th><th className="th text-right">Amount</th><th className="th">Status</th><th className="th">Resolution</th><th className="th no-print">Action</th></tr></thead>
                <tbody>
                  {exceptions.map((e) => (
                    <tr key={e.id} className={activeIds.has(e.item_id) ? 'opacity-60' : ''}>
                      <td className="td"><b>{excLabel(e.kind, e.side, e.amount)}</b>{counterpart(e) && <div className="text-2xs text-muted">{counterpart(e)}</div>}{activeIds.has(e.item_id) && <div className="text-2xs text-info">item now in a match</div>}</td>
                      <td className="td">{e.side}</td>
                      <td className="td whitespace-normal">{itemCell(e.item_id)}</td>
                      <td className={`td num text-right ${dec(e.amount).lt(0) ? 'text-neg' : ''}`}>{fmtMoney(e.amount, '', { dp: 2 })}</td>
                      <td className="td"><StatusBadge status={e.status} /></td>
                      <td className="td max-w-[280px] whitespace-normal">{e.resolution ? <>{e.resolution}<div className="text-2xs text-muted">{e.resolved_by_name} · {e.resolved_at?.slice(0, 16)}</div></> : <span className="text-muted">—</span>}</td>
                      <td className="td no-print">
                        {editable && e.status !== 'resolved' && (
                          <div className="flex flex-col gap-1">
                            {e.status === 'open' && <form action={investigateExceptionAction} className="flex gap-1"><ReturnTo value={here} /><input type="hidden" name="exceptionId" value={e.id} /><input className="input w-40 py-1 text-xs" name="note" placeholder="Note (optional)" /><button className="btn py-1 text-xs">Investigate</button></form>}
                            <form action={resolveExceptionAction} className="flex gap-1"><ReturnTo value={here} /><input type="hidden" name="exceptionId" value={e.id} /><input className="input w-56 py-1 text-xs" name="resolution" placeholder="Resolution note (required)" required minLength={5} /><button className="btn py-1 text-xs">Resolve</button></form>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <p className="mt-1 text-2xs text-muted">Resolving records an explanation (e.g. timing difference, bank to reverse duplicate) and stamps the resolver. It does not create a write-off, adjustment or journal; correcting entries, if needed, follow the adjustment workflow.</p>
      </Section>

      <Section title={`Proposed matches (${proposed.length})`} actions={editable && exactCount > 0 && recon ? <form action={confirmAllExactAction}><ReturnTo value={here} /><input type="hidden" name="reconId" value={recon.id} /><button className="btn py-1 text-xs">Confirm all {exactCount} exact reference + amount 1:1 proposals</button></form> : undefined}>
        <Card>
          {proposed.length === 0 ? <CardBody className="text-sm text-muted">No proposals awaiting confirmation.</CardBody> : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr><th className="th">Type</th><th className="th">Rule</th><th className="th">Bank side</th><th className="th">Ledger side</th><th className="th text-right">Difference</th><th className="th no-print">Action</th></tr></thead>
                <tbody>{proposed.map((m) => (
                  <tr key={m.id} className="align-top">
                    <td className="td"><Badge tone="info">{m.cardinality.replace(/_/g, ' ')}</Badge></td><td className="td">{m.rule}</td>
                    <td className="td whitespace-normal">{m.items.filter((i) => i.side === 'bank').map((i) => <div key={i.item_id}>{itemCell(i.item_id)}</div>)}</td>
                    <td className="td whitespace-normal">{m.items.filter((i) => i.side === 'ledger').map((i) => <div key={i.item_id}>{itemCell(i.item_id)}</div>)}</td>
                    <td className="td num text-right">{fmtMoney(m.difference, '', { dp: 2 })}</td>
                    <td className="td no-print">{editable && <div className="flex gap-1"><form action={confirmMatchAction}><ReturnTo value={here} /><input type="hidden" name="matchId" value={m.id} /><button className="btn-primary py-1 text-xs">Confirm</button></form><form action={rejectMatchAction}><ReturnTo value={here} /><input type="hidden" name="matchId" value={m.id} /><button className="btn py-1 text-xs">Reject</button></form></div>}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </Card>
      </Section>

      {recon && editable && (
        <Section title="Manual matching">
          <Card><CardBody>
            <p className="mb-3 text-xs text-muted">Select unmatched bank lines and ledger items (1:1, 1:many, many:1 or many:many). Totals must be equal unless you explicitly record the difference with an explanation; nothing is written off. Items in a proposed match must be rejected first.</p>
            <ManualMatch reconId={recon.id} returnTo={here} action={manualMatchAction} bank={freeBank.map((x) => ({ id: x.id, date: x.date, amount: x.amount, reference: x.reference, description: x.description }))} ledger={freeLedger.map((x) => ({ id: x.id, date: x.date, amount: x.amount, reference: x.reference, description: x.description }))} />
          </CardBody></Card>
        </Section>
      )}

      <Section title={`Confirmed matches (${confirmed.length})`}>
        <Card>
          {confirmed.length === 0 ? <CardBody className="text-sm text-muted">None yet.</CardBody> : (
            <details open={confirmed.length <= 12}>
              <summary className="cursor-pointer px-4 py-2 text-xs text-muted">Show / hide {confirmed.length} confirmed match(es)</summary>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead><tr><th className="th">Type</th><th className="th">Origin / rule</th><th className="th">Bank side</th><th className="th">Ledger side</th><th className="th text-right">Recorded difference</th><th className="th">Confirmed by</th><th className="th no-print"></th></tr></thead>
                  <tbody>{confirmed.map((m) => (
                    <tr key={m.id} className="align-top">
                      <td className="td">{m.cardinality.replace(/_/g, ' ')}</td><td className="td max-w-[220px] whitespace-normal">{m.match_type} · {m.rule}</td>
                      <td className="td whitespace-normal">{m.items.filter((i) => i.side === 'bank').map((i) => <div key={i.item_id}>{itemCell(i.item_id)}</div>)}</td>
                      <td className="td whitespace-normal">{m.items.filter((i) => i.side === 'ledger').map((i) => <div key={i.item_id}>{itemCell(i.item_id)}</div>)}</td>
                      <td className={`td num text-right ${dec(m.difference).isZero() ? '' : 'text-warn'}`}>{fmtMoney(m.difference, '', { dp: 2 })}</td>
                      <td className="td">{m.confirmed_by_name}</td>
                      <td className="td no-print">{editable && <form action={rejectMatchAction}><ReturnTo value={here} /><input type="hidden" name="matchId" value={m.id} /><button className="btn py-1 text-xs">Unmatch</button></form>}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </details>
          )}
        </Card>
        {rejected.length > 0 && <p className="mt-1 text-2xs text-muted">{rejected.length} rejected pairing(s) are kept for audit and are not re-proposed by auto-match.</p>}
      </Section>

      <Section title="History (audit trail)">
        <Card>
          {data.history.length === 0 ? <CardBody className="text-sm text-muted">No actions recorded yet.</CardBody> : (
            <table className="w-full border-collapse text-xs">
              <thead><tr><th className="th">When</th><th className="th">Who</th><th className="th">Action</th><th className="th">Details</th></tr></thead>
              <tbody>{data.history.map((h: any, i: number) => <tr key={i}><td className="td">{h.at.slice(0, 19)}</td><td className="td">{h.actor}</td><td className="td">{h.action.replace('treasury.', '')}</td><td className="td max-w-[600px] truncate" title={JSON.stringify(h.payload)}>{JSON.stringify(h.payload)}</td></tr>)}</tbody>
            </table>
          )}
        </Card>
      </Section>
    </div>
  );
}
