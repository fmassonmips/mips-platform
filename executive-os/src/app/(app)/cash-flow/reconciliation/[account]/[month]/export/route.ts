import { NextResponse } from 'next/server';
import { requireAuth, tctx } from '@/lib/auth/session';
import { withTenant } from '@/lib/db';
import { findAccount, getRecon, reconSummary, logAudit } from '@/lib/services/treasury';

export const dynamic = 'force-dynamic';

const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** CSV export of a reconciliation: every statement line and ledger item with its match/exception status. */
export async function GET(_req: Request, { params }: { params: Promise<{ account: string; month: string }> }) {
  const auth = await requireAuth('finance.view');
  const { account, month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return new NextResponse('Invalid month', { status: 400 });
  const out = await withTenant(tctx(auth), async (t) => {
    const acc = await findAccount(t, decodeURIComponent(account));
    if (!acc) return null;
    const recon = await getRecon(t, acc.id, `${month}-01`);
    if (!recon) return null;
    const s = await reconSummary(t, recon);
    const matchOf = new Map<string, (typeof s.matches)[number]>();
    for (const m of s.matches.filter((x) => x.status !== 'rejected')) for (const i of m.items) matchOf.set(`${i.side}:${i.item_id}`, m);
    const excOf = new Map<string, typeof s.exceptions>();
    for (const e of s.exceptions) excOf.set(`${e.side}:${e.item_id}`, [...(excOf.get(`${e.side}:${e.item_id}`) ?? []), e]);
    const lines = [['section', 'side', 'date', 'reference', 'description', 'amount', 'currency', 'match_id', 'match_status', 'match_type', 'cardinality', 'rule', 'exception', 'exception_status', 'resolution'].join(',')];
    const b = s.balances;
    for (const [k, v] of [['opening_statement_balance', s.items.openingStatement], ['statement_balance', b.statementBalance.toFixed(2)], ['ledger_balance', b.ledgerBalance.toFixed(2)], ['difference', b.difference.toFixed(2)], ['explained_resolved', b.explainedResolved.toFixed(2)], ['unresolved_difference', b.unresolvedDifference.toFixed(2)], ['status', recon.status], ['prepared_by', recon.prepared_by_name ?? ''], ['approved_by', recon.approved_by_name ?? '']]) lines.push(['summary', '', '', k, '', v, acc.currency, '', '', '', '', '', '', '', ''].map(esc).join(','));
    const push = (side: 'bank' | 'ledger', it: (typeof s.items.bank)[number]) => {
      const m = matchOf.get(`${side}:${it.id}`); const ex = excOf.get(`${side}:${it.id}`) ?? [];
      lines.push(['item', side, it.date, it.reference, it.description, it.amount, acc.currency, m?.id ?? '', m?.status ?? '', m?.match_type ?? '', m?.cardinality ?? '', m?.rule ?? '', ex.map((e) => e.kind).join('|'), ex.map((e) => e.status).join('|'), ex.map((e) => e.resolution ?? '').join('|')].map(esc).join(','));
    };
    for (const it of s.items.bank) push('bank', it);
    for (const it of s.items.ledger) push('ledger', it);
    await logAudit(t, auth, 'treasury.reconciliation_exported', 'reconciliation', recon.id, { format: 'csv', rows: lines.length - 1 });
    return { csv: lines.join('\n'), name: `reconciliation-${acc.code}-${month}.csv` };
  });
  if (!out) return new NextResponse('Reconciliation not found', { status: 404 });
  return new NextResponse(out.csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${out.name}"` } });
}
