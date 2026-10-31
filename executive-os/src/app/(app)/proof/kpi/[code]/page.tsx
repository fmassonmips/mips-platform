import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { kpiProof, supportingRecords, reproduce } from '@/lib/services/proof';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { ConfidenceBadge, StatusBadge, Badge } from '@/components/ui/badge';
import { PeriodFilter } from '@/components/ui/period-filter';
import { DataTable } from '@/components/ui/data-table';
import { fmtValue, fmtMoney, fmtDate } from '@/lib/format';
import { VerifyForm } from '../../verify-form';

export const dynamic = 'force-dynamic';

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <Card className="mt-4"><CardHeader title={<span><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-navy-2 text-2xs text-white">{n}</span>{title}</span>} /><CardBody>{children}</CardBody></Card>
);

export default async function KpiProofPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: SP }) {
  const { auth, period, months, fyears } = await pageContext(searchParams, 'proof.view');
  const code = decodeURIComponent((await params).code);
  const data = await tx(auth, async (t) => {
    const p = await kpiProof(t, { tenantId: auth.tenantId, userId: auth.userId }, code, period.start, period.end);
    if (!p) return null;
    const rec = await supportingRecords(t, code, period.start, period.end);
    const rep = p.result ? await reproduce(t, code, period.start, period.end, { value: p.result.value, inputs: p.result.inputs }) : null;
    return { p, rec, rep };
  });
  if (!data) notFound();
  const { p, rec, rep } = data; const r = p.result; const def = p.def;
  const kv = (k: string, v: React.ReactNode) => <div className="grid grid-cols-3 gap-2 border-b border-border py-1.5 text-sm last:border-0"><dt className="text-muted">{k}</dt><dd className="col-span-2">{v}</dd></div>;
  return (
    <div>
      <PageHeader eyebrow={`Proof · ${code}`} title={def.name} subtitle={<>{period.label} · {r ? <ConfidenceBadge value={r.confidence} note={r.status_note} /> : 'no result'} {r?.status_note && <span className="text-xs text-muted">— {r.status_note}</span>}</>}
        actions={<><PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />{auth.permissions.has('proof.export') && <><a className="btn-gold" href={`/api/v1/proof/kpi/${encodeURIComponent(code)}/package?range=${encodeURIComponent(period.key)}`}>Export evidence package (JSON)</a><a className="btn" href={`/api/v1/proof/kpi/${encodeURIComponent(code)}/package?range=${encodeURIComponent(period.key)}&format=xlsx`}>XLSX</a></>}</>} />
      <div className="card p-5"><div className="text-xs text-muted">Value</div><div className="text-3xl font-semibold num">{fmtValue(r?.value ?? null, def.unit, r?.currency ?? 'MUR', false)}</div><div className="mt-1 text-xs text-muted">Result {r?.id} · calculation run <Link className="link" href={`/formula-audit?run=${p.run.id}`}>{p.run.id.slice(0, 8)}</Link> · {p.run.engine_version} · computed {r && fmtDate(r.computed_at)}</div></div>

      <Step n={1} title="KPI definition"><dl>{kv('Business definition', def.definition)}{kv('Unit', def.unit)}{kv('Owner', def.owner)}{kv('Materiality threshold', `${r?.materiality_pct ?? 5} %`)}{kv('Validation rules', def.validation.length ? def.validation.join(' · ') : '—')}</dl></Step>
      <Step n={2} title="Formula & version"><dl>{kv('Formula', <code className="text-xs">{def.formula}</code>)}{kv('Numerator', def.numerator ?? '—')}{kv('Denominator', def.denominator ?? '—')}{kv('Grain', def.grain)}{kv('Period basis', def.periodBasis)}{kv('Currency rule', def.currencyRule)}{kv('Rounding', def.rounding)}
        {kv('Formula version', <>v{r?.version} · effective {fmtDate(r?.effective_from)} · <code className="text-2xs">{r?.formula_hash?.slice(0, 16)}…</code> {p.registryHashMatches ? <Badge tone="pos">matches registry</Badge> : <Badge tone="neg">differs from registry</Badge>}</>)}
        {kv('Inputs used', <div className="grid grid-cols-2 gap-x-4 font-mono text-xs">{Object.entries(r?.inputs ?? {}).map(([k, v]) => <div key={k} className="flex justify-between gap-2"><span className="text-muted">{k}</span><span>{String(v ?? '—')}</span></div>)}</div>)}
        {kv('Reproducibility', rep ? (rep.identical ? <Badge tone="pos">Re-computed from source: identical</Badge> : <><Badge tone="neg">Re-computation differs</Badge> <span className="text-xs">now {rep.recomputed} — a new calculation run will be created on next view</span></>) : '—')}
      </dl>
        {p.versions.length > 1 && <div className="mt-3 text-xs"><div className="label">Version history</div>{p.versions.map((v: any) => <div key={v.version}>v{v.version} · {fmtDate(v.effective_from)} · {v.formula_hash.slice(0, 12)}… · {v.formula}</div>)}</div>}
      </Step>
      <Step n={3} title="Source systems & import batches">
        <p className="mb-2 text-sm text-muted">Data source: {def.dataSource}</p>
        <DataTable searchable={false} rows={p.batches.map((b: any) => ({ ...b, link: b.batch_id }))} columns={[{ key: 'kind', label: 'Records' }, { key: 'batch_id', label: 'Import batch', href: '/integrations/batches/{batch_id}' }, { key: 'filename', label: 'Original file' }, { key: 'file_sha256', label: 'SHA-256' }, { key: 'status', label: 'Status' }, { key: 'approved_by', label: 'Approved by' }, { key: 'records', label: 'Records in period', kind: 'number' }]} />
        {p.batches.some((b: any) => b.batch_id === 'generator') && <p className="mt-2 text-2xs text-muted">“generator” = DEMO records created by the synthetic data generator (no source file).</p>}
      </Step>
      <Step n={4} title="Supporting records">
        {rec.kind === 'gl' && <><DataTable filename={`${code}-gl-lines`} searchable={false} rows={(rec as any).lines} columns={[{ key: 'code', label: 'Account', href: `/pnl/entries?account={code}&range=${encodeURIComponent(period.key)}` }, { key: 'name', label: 'Name' }, { key: 'pl_line', label: 'P&L line' }, { key: 'entries', label: 'Entries', kind: 'number' }, { key: 'debit', label: 'Debit', kind: 'money', dp: 2 }, { key: 'credit', label: 'Credit', kind: 'money', dp: 2 }]} />
          <div className="label mt-3">Revenue journal lines</div><DataTable filename={`${code}-entries`} rows={(rec as any).entries} columns={[{ key: 'journal_ref', label: 'Journal' }, { key: 'line_no', label: '#' }, { key: 'entry_date', label: 'Date', kind: 'date' }, { key: 'account', label: 'Account' }, { key: 'description', label: 'Description' }, { key: 'debit', label: 'Debit', kind: 'money', dp: 2 }, { key: 'credit', label: 'Credit', kind: 'money', dp: 2 }, { key: 'source_system', label: 'Source' }]} /></>}
        {rec.kind === 'transactions' && <><DataTable filename={`${code}-by-merchant`} rows={(rec as any).byMerchant} columns={[{ key: 'name', label: 'Merchant', href: `/proof/merchant/{id}?range=${encodeURIComponent(period.key)}` }, { key: 'txns', label: 'Txns', kind: 'number' }, { key: 'gpv', label: 'GPV', kind: 'money' }, { key: 'mdr', label: 'MDR fees', kind: 'money', dp: 2 }, { key: 'wholesale', label: 'Wholesale', kind: 'money', dp: 2 }, { key: 'processing', label: 'Processing', kind: 'money', dp: 2 }]} />
          <div className="label mt-3">Largest transactions (with contract references applied)</div><DataTable searchable={false} pageSize={10} rows={(rec as any).sample} columns={[{ key: 'external_ref', label: 'Reference' }, { key: 'accounting_date', label: 'Date', kind: 'date' }, { key: 'merchant', label: 'Merchant' }, { key: 'status', label: 'Status' }, { key: 'amount_base', label: 'Amount', kind: 'money', dp: 2 }, { key: 'mdr_fee_base', label: 'MDR', kind: 'money', dp: 2 }, { key: 'wholesale_fee_base', label: 'Wholesale', kind: 'money', dp: 2 }, { key: 'contract_ref', label: 'Pricing agreement' }, { key: 'schedule_ref', label: 'Fee schedule' }]} /></>}
        {rec.kind === 'bank' && <DataTable searchable={false} rows={(rec as any).accounts} columns={[{ key: 'code', label: 'Account' }, { key: 'name', label: 'Name' }, { key: 'account_class', label: 'Class' }, { key: 'currency', label: 'Ccy' }, { key: 'opening_balance', label: 'Opening', kind: 'money', dp: 2 }, { key: 'movements', label: 'Movements to period end', kind: 'money', dp: 2 }, { key: 'lines', label: 'Lines in period', kind: 'number' }]} />}
        {rec.kind === 'ar' && <DataTable rows={(rec as any).invoices} columns={[{ key: 'number', label: 'Invoice' }, { key: 'merchant', label: 'Customer' }, { key: 'issue_date', label: 'Issued', kind: 'date' }, { key: 'due_date', label: 'Due', kind: 'date' }, { key: 'amount', label: 'Amount', kind: 'money', dp: 2 }, { key: 'amount_paid', label: 'Paid', kind: 'money', dp: 2 }, { key: 'paid_date', label: 'Paid on', kind: 'date' }, { key: 'status', label: 'Status' }]} />}
        {rec.kind === 'ops' && <p className="text-sm text-muted">Operational source tables: merchants, onboarding_cases, support_incidents, platform_uptime.</p>}
        {p.dims.length > 0 && <><div className="label mt-3">Dimension breakdown</div><DataTable searchable={false} rows={p.dims} columns={[{ key: 'dimension', label: 'Dimension' }, { key: 'value', label: 'Value', kind: 'money' }, { key: 'confidence', label: 'Confidence', kind: 'badge' }]} /></>}
      </Step>
      <Step n={5} title="Reconciliation & validation results">
        <DataTable searchable={false} rows={p.checks} columns={[{ key: 'code', label: 'Control' }, { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }, { key: 'status', label: 'Result', kind: 'badge' }, { key: 'detail', label: 'Detail' }]} />
        {p.checks.filter((c: any) => c.status !== 'pass' && c.samples?.length).map((c: any) => <Callout key={c.code} tone={c.status === 'fail' ? 'neg' : 'warn'} title={`${c.code} exceptions`}>{c.samples.map((s: string) => <div key={s} className="font-mono text-xs">{s}</div>)}</Callout>)}
      </Step>
      <Step n={6} title="Adjustments">
        <p className="text-sm">GL adjustment entries in period: <b>{p.glAdjustments.n}</b> (net {fmtMoney(p.glAdjustments.net, 'MUR', { dp: 2 })}).</p>
        {p.adjustments.length > 0 ? <DataTable searchable={false} rows={p.adjustments} columns={[{ key: 'reference', label: 'Ref' }, { key: 'kind', label: 'Kind' }, { key: 'description', label: 'Description' }, { key: 'amount_base', label: 'Amount', kind: 'money', dp: 2 }, { key: 'status', label: 'Status' }]} /> : <p className="text-sm text-muted">No proposed or approved adjustments in this period. Evidence is never modified silently: corrections are separate, approved records.</p>}
      </Step>
      <Step n={7} title="Approval & verification history">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="label">Period status</div>
            <div className="flex flex-wrap gap-2">{p.periods.map((x: any) => <span key={x.period} className="text-xs">{x.period.slice(0, 7)} <StatusBadge status={x.status} /></span>)}</div>
            <div className="label mt-3">Management verifications</div>
            {p.verifications.length === 0 ? <p className="text-sm text-muted">None recorded for this period.</p> : <ul className="space-y-1 text-sm">{p.verifications.map((v: any, i: number) => <li key={i}><ConfidenceBadge value={v.status} /> {v.basis} — {v.verified_by}, {fmtDate(v.created_at)}{v.same_result ? '' : ' (earlier result)'}</li>)}</ul>}
            <div className="label mt-3">Result history (immutable)</div>
            <ul className="space-y-0.5 text-xs">{p.history.map((h: any) => <li key={h.calc_run_id} className={h.is_current ? 'font-semibold' : 'text-muted'}>{fmtDate(h.computed_at)} · {h.value} · {h.confidence} · {h.trigger_reason}{h.is_current ? ' (current)' : ''}</li>)}</ul>
          </div>
          {auth.permissions.has('kpi.verify') ? <div><div className="label">Record verification</div><VerifyForm code={code} start={period.start} end={period.end} /></div> : <p className="text-sm text-muted">Verification requires the kpi.verify permission.</p>}
        </div>
      </Step>
      <Step n={8} title="Export evidence package"><p className="text-sm">The package contains the definition, formula version and hash, inputs, result, calculation run fingerprint, re-computation, controls, source batches with file hashes, supporting records, adjustments, verification and result history — with a SHA-256 manifest per section. Each export is logged in the evidence register and audit trail.</p></Step>
    </div>
  );
}
