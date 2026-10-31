import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { one } from '@/lib/db';
import { verifyMerchantFees } from '@/lib/services/proof';
import { PageHeader, Callout, Section } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { PeriodFilter } from '@/components/ui/period-filter';
import { DataTable } from '@/components/ui/data-table';
import { fmtMoney } from '@/lib/format';
import { dec } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function MerchantProof({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { auth, period, months, fyears } = await pageContext(searchParams, 'proof.view');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await tx(auth, async (t) => {
    const m = await one<any>(t, 'SELECT id, code, name FROM merchants WHERE id = $1', [id]);
    if (!m) return null;
    return { m, v: await verifyMerchantFees(t, id, period.start, period.end) };
  });
  if (!data) notFound();
  const { m, v } = data;
  const ok = v.mismatchCount === 0;
  const row = (label: string, a: string, b: string) => <tr><td className="td">{label}</td><td className="td num text-right">{fmtMoney(a, 'MUR', { dp: 2 })}</td><td className="td num text-right">{fmtMoney(b, 'MUR', { dp: 2 })}</td><td className={`td num text-right ${dec(a).eq(dec(b)) ? 'text-pos' : 'text-neg'}`}>{fmtMoney(dec(b).minus(dec(a)).toString(), 'MUR', { dp: 4 })}</td></tr>;
  return (
    <div>
      <PageHeader eyebrow="Financial Proof Center · Merchant economics" title={`Re-perform fee calculation — ${m.name}`} subtitle="Every transaction’s MDR, wholesale and processing cost is recomputed independently from the effective-dated pricing agreements, acquirer fee schedules and processing-cost rates, then compared with the stored values." actions={<><PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} /><Link className="btn" href={`/merchants/${id}?range=${encodeURIComponent(period.key)}`}>Merchant analysis</Link></>} />
      <Callout tone={ok ? 'pos' : 'neg'} title={ok ? `Verified: ${v.transactions.toLocaleString('en-US')} transactions recomputed — 0 mismatches` : `${v.mismatchCount}${v.mismatchCount >= 50 ? '+' : ''} mismatches found in ${v.transactions} transactions`}>
        Contribution (stored) {fmtMoney(v.stored.contribution, 'MUR', { dp: 2 })} vs recomputed {fmtMoney(v.recomputed.contribution, 'MUR', { dp: 2 })}.
      </Callout>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Stored vs recomputed" /><table className="w-full"><thead><tr><th className="th">Component</th><th className="th text-right">Stored</th><th className="th text-right">Recomputed</th><th className="th text-right">Difference</th></tr></thead><tbody>
          {row('Gross acquiring fees (MDR)', v.stored.mdr, v.recomputed.mdr)}{row('Wholesale acquiring cost', v.stored.wholesale, v.recomputed.wholesale)}{row('Direct processing cost', v.stored.processing, v.recomputed.processing)}{row('Contribution (excl. SaaS)', v.stored.contribution, v.recomputed.contribution)}
        </tbody></table></Card>
        <Card><CardHeader title="Acquirer fee schedules applied" subtitle="Effective-dated wholesale terms used by the engine" /><DataTable searchable={false} rows={v.schedulesUsed} columns={[{ key: 'schedule_ref', label: 'Schedule' }, { key: 'acquirer', label: 'Acquirer' }, { key: 'card_region', label: 'Region' }, { key: 'wholesale_bps', label: 'bps', kind: 'bps' }, { key: 'effective_from', label: 'From', kind: 'date' }, { key: 'effective_to', label: 'To', kind: 'date' }, { key: 'txns', label: 'Txns', kind: 'number' }, { key: 'wholesale', label: 'Wholesale', kind: 'money', dp: 2 }]} /></Card>
      </div>
      <Section title="Pricing agreements (merchant contract terms)">
        <Card><DataTable searchable={false} rows={v.agreements.map((a: any) => ({ ...a }))} columns={[{ key: 'id', label: 'Agreement id' }, { key: 'payment_method_id', label: 'Method id' }, { key: 'card_region', label: 'Region' }, { key: 'mdr_bps', label: 'MDR bps', kind: 'bps' }, { key: 'fixed_fee', label: 'Fixed fee', kind: 'money', dp: 2 }, { key: 'effective_from', label: 'From', kind: 'date' }, { key: 'effective_to', label: 'To', kind: 'date' }]} /></Card>
      </Section>
      {v.mismatches.length > 0 && <Section title="Mismatches (first 50)"><Card><CardBody><pre className="max-h-96 overflow-auto text-xs">{JSON.stringify(v.mismatches, null, 2)}</pre></CardBody></Card></Section>}
    </div>
  );
}
