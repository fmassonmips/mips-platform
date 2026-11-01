import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { ensureRun } from '@/lib/services/kpi';
import { proofCatalogue } from '@/lib/services/proof';
import { getDecision } from '@/lib/services/decisions';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { PeriodFilter } from '@/components/ui/period-filter';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { fmtValue } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProofCenter({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'proof.view');
  const batch = spGet(sp, 'batch'); if (batch && /^[0-9a-f-]{36}$/.test(batch)) redirect(`/integrations/batches/${batch}`);
  const decisionId = spGet(sp, 'decision');
  const data = await tx(auth, async (t) => {
    const { runId } = await ensureRun(t, { tenantId: auth.tenantId, userId: auth.userId, start: period.start, end: period.end, reason: 'proof center catalogue' });
    return { rows: await proofCatalogue(t, runId), runId, decision: decisionId && /^[0-9a-f-]{36}$/.test(decisionId) ? await getDecision(t, decisionId) : null };
  });
  const counts = data.rows.reduce<Record<string, number>>((a, r) => { a[r.confidence] = (a[r.confidence] ?? 0) + 1; return a; }, {});
  const d = data.decision; const merchantId = d?.measurement?.merchant_id;
  return (
    <div>
      <PageHeader eyebrow="Financial Proof Center" title="Can every number be verified?" subtitle="Open any KPI to see its definition, formula version, sources, import batches, supporting records, controls, adjustments, verification history — and export an evidence package." actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} />
      {d && (
        <Callout tone="info" title={`Evidence trail for decision ${d.code}`}>
          Scenario <Link className="link" href={`/decisions/scenarios/${d.scenario_id}`}>{d.scenario_code}</Link> used trailing actuals {d.measurement?.baseline_start} → {d.measurement?.baseline_end}.
          {merchantId && <> Verify the merchant economics against original transactions and contracts: <Link className="link" href={`/proof/merchant/${merchantId}?range=c:${d.measurement.baseline_start}..${d.measurement.baseline_end}`}>re-perform fee calculation →</Link></>}
          {' '}Related KPIs: <Link className="link" href={`/proof/kpi/PAY.CONTRIBUTION?range=c:${d.measurement?.baseline_start}..${d.measurement?.baseline_end}`}>PAY.CONTRIBUTION</Link>, <Link className="link" href={`/proof/kpi/PAY.TAKE_RATE?range=c:${d.measurement?.baseline_start}..${d.measurement?.baseline_end}`}>PAY.TAKE_RATE</Link>.
        </Callout>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(['VERIFIED', 'PENDING', 'DISPUTED', 'ESTIMATED'] as const).map((c) => <Card key={c} className="p-4"><div className="text-xs text-muted">{c}</div><div className="text-2xl font-semibold num">{counts[c] ?? 0}</div></Card>)}
      </div>
      <Section title={`KPI results — ${period.label}`}>
        <Card><DataTable filename={`proof-${period.key}`} pageSize={50} rows={data.rows.map((r) => ({ ...r, display: fmtValue(r.value, r.unit) }))}
          columns={[{ key: 'code', label: 'KPI', href: `/proof/kpi/{code}?range=${encodeURIComponent(period.key)}` }, { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }, { key: 'display', label: 'Value', align: 'right' }, { key: 'confidence', label: 'Confidence', kind: 'badge' }, { key: 'version', label: 'Formula v.' }, { key: 'owner', label: 'Owner' }, { key: 'status_note', label: 'Basis' }]} /></Card>
      </Section>
      <Card className="mt-4"><CardHeader title="Classification policy" /><CardBody className="grid gap-2 text-sm md:grid-cols-2">
        <div><Badge tone="pos">VERIFIED</Badge> All controls affecting the KPI’s sources pass and every month is locked, or a management verification was recorded for identical inputs.</div>
        <div><Badge tone="warn">PENDING</Badge> Period open or awaiting verification.</div>
        <div><Badge tone="neg">DISPUTED</Badge> A control affecting the KPI’s sources failed (conflicting evidence). Cannot be overridden to VERIFIED.</div>
        <div><Badge tone="info">ESTIMATED</Badge> Depends on documented assumptions (e.g. direct-processing cost model).</div>
        <div className="md:col-span-2 text-xs text-muted">These are management-information classifications. A VERIFIED KPI is not an externally audited figure.</div>
      </CardBody></Card>
    </div>
  );
}
