import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { merchantInfo, merchantTransactions, merchantTransactionsSummary, merchantTxnFacets } from '@/lib/services/merchants';
import { parseTxnFilter, UUID } from './filters';
import { one } from '@/lib/db';
import { PageHeader, Callout } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { MerchantTabs, MerchantBadges } from '../tabs';
import { KeepParams } from '../../shared';
import { fmtMoney, fmtNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';
const PAGE = 100;

export default async function MerchantTransactionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'merchant.view');
  const f = parseTxnFilter(sp);
  const page = Math.max(1, Math.min(100000, Number.parseInt(spGet(sp, 'page') ?? '1', 10) || 1));
  const d = await tx(auth, async (t) => {
    const m = await merchantInfo(t, id);
    if (!m) return null;
    const [rows, sum, facets] = await Promise.all([merchantTransactions(t, id, period.start, period.end, { ...f, limit: PAGE, offset: (page - 1) * PAGE }), merchantTransactionsSummary(t, id, period.start, period.end, f), merchantTxnFacets(t, id)]);
    const fsRef = f.feeScheduleId ? await one<any>(t, 'SELECT schedule_ref, wholesale_bps::text FROM fee_schedules WHERE id = $1', [f.feeScheduleId]) : null;
    const paRef = f.pricingAgreementId ? await one<any>(t, 'SELECT contract_ref, mdr_bps::text FROM pricing_agreements WHERE id = $1', [f.pricingAgreementId]) : null;
    return { m, rows, sum, facets, fsRef, paRef };
  });
  if (!d) notFound();
  const { m, rows, sum, facets, fsRef, paRef } = d;
  const total = Number(sum.n); const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (over: Record<string, string | null>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && v) p.set(k, v); for (const [k, v] of Object.entries(over)) { if (v === null) p.delete(k); else p.set(k, v); } return p.toString(); };
  const view = rows.map((r: any) => ({ ...r, event_at: r.event_at instanceof Date ? r.event_at.toISOString().replace('T', ' ').slice(0, 19) : String(r.event_at), source: r.source_file ? `${r.source_file} (batch ${String(r.import_batch_id).slice(0, 8)}${r.source_row_id ? `, row ${String(r.source_row_id).slice(0, 8)}` : ''})` : r.is_demo ? 'DEMO generator — no import batch' : 'Direct entry / API' }));

  return (
    <div>
      <PageHeader eyebrow={`Merchant ${m.code}`} title={`${m.name} — transactions`} subtitle={<>Every successful transaction stores the pricing agreement and acquirer fee schedule that priced it; amounts are frozen (immutable by trigger). {period.label}.</>}
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} />
      <MerchantTabs id={id} active="transactions" range={period.key} />
      <div className="mb-3"><MerchantBadges m={m} /></div>

      <form method="get" className="card no-print mb-3 flex flex-wrap items-end gap-3 p-3">
        <KeepParams sp={sp} except={['region', 'acquirer', 'status', 'method', 'page']} />
        <div><label className="label" htmlFor="region">Card region</label><select id="region" name="region" defaultValue={f.region ?? ''} className="input w-auto py-1 text-xs"><option value="">All</option>{facets.regions.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="label" htmlFor="acquirer">Acquirer</label><select id="acquirer" name="acquirer" defaultValue={f.acquirer ?? ''} className="input w-auto py-1 text-xs"><option value="">All</option>{facets.acquirers.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="label" htmlFor="status">Status</label><select id="status" name="status" defaultValue={f.status ?? ''} className="input w-auto py-1 text-xs"><option value="">All</option>{facets.statuses.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="label" htmlFor="method">Method</label><select id="method" name="method" defaultValue={f.method ?? ''} className="input w-auto py-1 text-xs"><option value="">All</option>{facets.methods.map((x) => <option key={x}>{x}</option>)}</select></div>
        <button className="btn-primary py-1 text-xs" type="submit">Filter</button>
        <Link className="btn py-1 text-xs" href={`/merchants/${id}/transactions?range=${encodeURIComponent(period.key)}`}>Clear</Link>
        <a className="btn py-1 text-xs" href={`/merchants/${id}/transactions/export?${qs({ page: null })}`}>Download all {fmtNumber(total)} rows (CSV)</a>
      </form>
      {(fsRef || paRef) && <div className="mb-3"><Callout tone="info" title="Filtered by contract">{fsRef && <>Fee schedule <b>{fsRef.schedule_ref}</b> ({fsRef.wholesale_bps} bps) <Link className="link" href={`?${qs({ fs: null, page: null })}`}>remove</Link>. </>}{paRef && <>Pricing agreement <b>{paRef.contract_ref}</b> ({paRef.mdr_bps} bps) <Link className="link" href={`?${qs({ pa: null, page: null })}`}>remove</Link>.</>}</Callout></div>}

      <Card>
        <CardHeader title={`${fmtNumber(total)} transactions · page ${page} of ${pages}`}
          subtitle={<>Filtered totals: GPV {fmtMoney(sum.gpv)} · MDR {fmtMoney(sum.mdr, 'MUR', { dp: 2 })} · wholesale {fmtMoney(sum.wholesale, 'MUR', { dp: 2 })} · processing {fmtMoney(sum.processing, 'MUR', { dp: 2 })} · contribution {fmtMoney(sum.contribution, 'MUR', { dp: 2 })} (excl. SaaS)</>}
          actions={<div className="no-print flex items-center gap-2 text-xs">{page > 1 ? <Link className="btn py-1 text-xs" href={`?${qs({ page: String(page - 1) })}`}>Prev</Link> : <span className="btn py-1 text-xs opacity-50">Prev</span>}{page < pages ? <Link className="btn py-1 text-xs" href={`?${qs({ page: String(page + 1) })}`}>Next</Link> : <span className="btn py-1 text-xs opacity-50">Next</span>}</div>} />
        <DataTable rows={view} filename={`${m.code}-transactions-page${page}`} pageSize={PAGE} dense columns={[
          { key: 'external_ref', label: 'Reference' }, { key: 'event_at', label: 'Event (auth) time UTC' }, { key: 'accounting_date', label: 'Accounting date', kind: 'date' }, { key: 'settlement_date', label: 'Settlement', kind: 'date' },
          { key: 'status', label: 'Status', kind: 'badge' }, { key: 'method', label: 'Method' }, { key: 'card_region', label: 'Region' }, { key: 'acquirer', label: 'Acquirer' }, { key: 'product', label: 'Product' },
          { key: 'txn_currency', label: 'Ccy' }, { key: 'amount', label: 'Amount (txn ccy)', kind: 'money', dp: 2 }, { key: 'fx_rate_to_base', label: 'FX → MUR', kind: 'number', dp: 4 }, { key: 'amount_base', label: 'Amount MUR', kind: 'money', dp: 2 },
          { key: 'mdr_fee_base', label: 'MDR fee', kind: 'money', dp: 2 }, { key: 'wholesale_fee_base', label: 'Wholesale fee', kind: 'money', dp: 2 }, { key: 'processing_cost_base', label: 'Processing', kind: 'money', dp: 2 }, { key: 'contribution', label: 'Contribution', kind: 'money', dp: 2 },
          { key: 'pricing_ref', label: 'Pricing agreement', href: `/merchants/${id}/transactions?range=${encodeURIComponent(period.key)}&pa={pricing_agreement_id}` }, { key: 'mdr_bps', label: 'MDR bps', kind: 'bps', dp: 2 },
          { key: 'fee_ref', label: 'Fee schedule', href: `/merchants/${id}/transactions?range=${encodeURIComponent(period.key)}&fs={fee_schedule_id}` }, { key: 'wholesale_bps', label: 'Wholesale bps', kind: 'bps', dp: 2 },
          { key: 'source', label: 'Source file / batch' },
        ]} />
        <p className="border-t border-border px-4 py-2 text-2xs text-muted">MDR fee = amount MUR × agreement bps (+ fixed fee) on successful transactions; wholesale fee = amount MUR × fee-schedule bps; processing cost applies to every attempt. Contribution here excludes merchant SaaS fees (recognised monthly per agreement). The page CSV exports the visible page; “Download all” exports every filtered row.</p>
      </Card>
    </div>
  );
}
