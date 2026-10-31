import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { getReport } from '@/lib/services/reports';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { fmtDate } from '@/lib/format';
import { SectionView } from './view';
export const dynamic = 'force-dynamic';
export default async function ReportView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { auth } = await pageContext(searchParams, 'dashboard.view');
  const { id } = await params; if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await tx(auth, (t) => getReport(t, id)); if (!r) notFound();
  const c = r.content;
  return (
    <div>
      <PageHeader eyebrow={`Report · ${r.kind}`} title={c.title} subtitle={<>Period {c.period.start} → {c.period.end} · generated {fmtDate(r.generated_at)} by {r.generated_by_name} · SHA-256 <code className="text-2xs">{r.content_sha256.slice(0, 16)}…</code></>}
        actions={<><a className="btn-gold" href={`/api/v1/reports/${id}/export?format=pdf`}>PDF</a><a className="btn" href={`/api/v1/reports/${id}/export?format=xlsx`}>Excel</a><Link className="btn" href={`/reports/${id}/present`}>Presentation</Link><Link className="btn" href="/reports">Back</Link></>} />
      {c.is_demo && <div className="mb-3 rounded border border-gold/50 bg-gold-soft px-3 py-2 text-xs font-semibold">DEMO DATA — synthetic figures, not actual MIPSIT Digital Ltd results.</div>}
      <Card><CardBody className="text-xs text-muted">Data refresh: run {c.data_refresh.calculation_run} at {String(c.data_refresh.calculated_at)} · latest transaction {c.data_refresh.latest_transaction} · GL {c.data_refresh.latest_gl_entry} · bank {c.data_refresh.latest_bank_line}. Validation: <b className="text-fg">{r.data_status}</b> ({Object.entries(c.validation.confidence_counts).map(([k, v]) => `${k} ${v}`).join(', ')}). {c.validation.note}</CardBody></Card>
      <Card className="mt-4"><CardBody>{c.sections.map((s: any, i: number) => <SectionView key={i} s={s} />)}</CardBody></Card>
      <Card className="mt-4"><CardBody className="space-y-3 text-sm">
        <div><b>Financial definitions</b><ul className="mt-1 list-disc pl-5 text-xs">{c.definitions.map((d: any) => <li key={d.code}><b>{d.code}</b> {d.name}: {d.definition} <i>({d.formula})</i></li>)}</ul></div>
        <div><b>Material assumptions</b><ul className="mt-1 list-disc pl-5 text-xs">{c.assumptions.map((a: string) => <li key={a}>{a}</li>)}</ul></div>
        <div><b>Failing controls</b>: {c.validation.failing_controls.length ? c.validation.failing_controls.map((f: any) => `${f.code} ${f.name}`).join('; ') : 'none'}</div>
        <div><b>Evidence references</b><div className="mt-1 break-all font-mono text-2xs">{c.evidence_refs.join(' · ')}</div></div>
      </CardBody></Card>
    </div>
  );
}
