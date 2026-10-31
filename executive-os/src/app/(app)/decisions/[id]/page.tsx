import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { getDecision, measureOutcome } from '@/lib/services/decisions';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { TrendChart } from '@/components/ui/charts';
import { fmtMoney, fmtDate, fmtPct, monthLabel } from '@/lib/format';
import { WorkflowButton } from '../forms';

export const dynamic = 'force-dynamic';

export default async function DecisionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { auth } = await pageContext(searchParams, 'dashboard.view');
  const { id } = await params;
  const d = await tx(auth, async (t) => {
    const x = await getDecision(t, id); if (!x) return null;
    const preview = ['approved', 'in_progress', 'implemented', 'closed'].includes(x.status) ? await measureOutcome(t, { tenantId: auth.tenantId, userId: auth.userId }, id, false) : null;
    return { ...x, preview };
  });
  if (!d) notFound();
  const e = d.expected_impact ?? {}; const m = d.measurement ?? {}; const o: any = d.actual_outcome ?? d.preview;
  const canApprove = auth.permissions.has('decision.approve'); const canPropose = auth.permissions.has('decision.propose');
  const chart = o?.series?.map((p: any) => ({ month: monthLabel(p.month), actual: p.contribution ?? p.value, expected: o.expected_monthly ?? null, baseline: o.baseline_monthly ?? null })) ?? [];
  const field = (label: string, value: React.ReactNode) => <div className="flex justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0"><dt className="text-muted">{label}</dt><dd className="text-right">{value}</dd></div>;
  return (
    <div>
      <PageHeader eyebrow={`Decision register · ${d.code}`} title={d.title} subtitle={<><StatusBadge status={d.status} /> · proposed by {d.proposer_name} · {fmtDate(d.created_at)}</>} actions={<Link className="btn" href="/decisions">Back</Link>} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader title="Decision" /><CardBody className="space-y-3 text-sm">
          <div><div className="label">Description</div><p>{d.description}</p></div>
          <div><div className="label">Business rationale</div><p className="whitespace-pre-line">{d.rationale}</p></div>
          <div><div className="label">Supporting evidence</div><ul className="space-y-1">{d.evidence.map((ev: any, i: number) => <li key={i} className="flex gap-2"><Badge>{ev.kind}</Badge><span className="font-mono text-xs">{ev.reference}</span><span className="text-muted">{ev.description}</span></li>)}</ul>
            {d.scenario_id && <p className="mt-2"><Link className="link" href={`/decisions/scenarios/${d.scenario_id}`}>Scenario {d.scenario_code} — {d.scenario_name}</Link> · <Link className="link" href={`/proof?decision=${d.id}`}>Verify in Proof Center</Link></p>}</div>
        </CardBody></Card>
        <Card><CardHeader title="Register fields" /><CardBody><dl>
          {field('Decision ID', d.code)}{field('Owner', d.owner_name ?? '—')}{field('Approver', d.approver_name ?? '—')}{field('Approval date', d.approved_at ? fmtDate(d.approved_at) : 'not approved')}
          {field('Implementation deadline', fmtDate(d.implementation_deadline))}{field('Status', <StatusBadge status={d.status} />)}
          {field('Expected monthly EBITDA', fmtMoney(e.monthly_ebitda_delta))}{field('Expected annualised EBITDA', fmtMoney(e.annualised_ebitda))}{field('Expected horizon cash', fmtMoney(e.horizon_cash_flow))}{field('Downside horizon cash', fmtMoney(e.downside_horizon_cash_flow))}
          {field('Measurement', m.type === 'merchant_contribution' ? `Merchant contribution — ${m.merchant_name}` : `${m.kpi_code ?? '—'} (${m.type ?? 'n/a'})`)}
        </dl></CardBody></Card>
      </div>
      <Section title="Workflow">
        <Card><CardBody className="flex flex-wrap items-center gap-3">
          {d.status === 'proposed' && canApprove && <><WorkflowButton id={d.id} op="approve" label="Approve decision" tone="btn-gold" withNote notePlaceholder="Approval note" /><WorkflowButton id={d.id} op="reject" label="Reject" tone="btn-danger" withNote notePlaceholder="Reason" /></>}
          {d.status === 'proposed' && !canApprove && <span className="text-sm text-muted">Awaiting approval by {d.approver_name}.</span>}
          {d.status === 'approved' && canPropose && <WorkflowButton id={d.id} op="in_progress" label="Start implementation" />}
          {d.status === 'in_progress' && canPropose && <WorkflowButton id={d.id} op="implemented" label="Mark implemented" withNote notePlaceholder="Implementation evidence (e.g. new pricing agreement ref)" />}
          {d.status === 'implemented' && canPropose && <WorkflowButton id={d.id} op="closed" label="Close decision" />}
          {['approved', 'in_progress', 'implemented', 'closed'].includes(d.status) && <WorkflowButton id={d.id} op="measure" label="Measure actual outcome now" />}
          <span className="text-2xs text-muted">Approver must differ from proposer (segregation of duties, enforced in the database).</span>
        </CardBody></Card>
      </Section>
      <Section title="Expected vs actual outcome">
        {!o ? <Callout tone="info" title="Not measured yet">Outcomes are measured on complete data after approval.</Callout>
          : o.status === 'awaiting_data' ? <Callout tone="info" title="Awaiting post-decision data">{o.message}. Data available through {o.measured_through}.</Callout>
          : <div className="grid gap-4 xl:grid-cols-3">
              <Card><CardHeader title="Outcome" subtitle={`Window ${o.window.from} → ${o.window.to} (${o.window.months} month(s))${o.partial_month ? ' · latest month partial' : ''}`} /><CardBody><dl>
                {o.type === 'merchant_contribution' ? <>
                  {field('Baseline monthly contribution', fmtMoney(o.baseline_monthly))}{field('Expected monthly contribution', fmtMoney(o.expected_monthly))}{field('Actual monthly contribution', fmtMoney(o.actual_monthly))}{o.partial_month && field('Run-rate (partial month scaled)', fmtMoney(o.actual_monthly_run_rate))}{o.partial_month && field('Variance vs expected (run-rate)', fmtMoney(o.variance_vs_expected_run_rate))}
                  {field('Variance vs expected', <span className={Number(o.variance_vs_expected) < 0 ? 'text-neg' : 'text-pos'}>{fmtMoney(o.variance_vs_expected)}</span>)}{field('Actual uplift vs baseline', fmtMoney(o.actual_uplift_vs_baseline))}{field('Achievement of expected uplift', o.achievement_ratio ? fmtPct(o.achievement_ratio) : '—')}
                </> : <>
                  {field('KPI', o.kpi_code)}{field('Baseline (monthly avg)', o.baseline_monthly)}{field('Actual (monthly avg)', o.actual_monthly)}{field('Expected', o.expected_value ?? o.expected_monthly_delta ?? '—')}{field('Variance vs expected', o.variance_vs_expected ?? '—')}
                </>}
              </dl>{o.caveat && <p className="mt-2 text-2xs text-muted">{o.caveat}</p>}<p className="mt-2 text-2xs text-muted">{d.actual_outcome ? `Last persisted measurement: ${fmtDate(d.outcome_measured_at)}` : 'Live preview — click “Measure actual outcome now” to record it in the register.'}</p></CardBody></Card>
              <Card className="xl:col-span-2"><CardHeader title="Actual vs expected by month" /><CardBody><TrendChart data={chart} x="month" series={[{ key: 'actual', label: 'Actual', type: 'bar' }, { key: 'expected', label: 'Expected', type: 'line', color: '#b8923d' }, { key: 'baseline', label: 'Baseline', type: 'line', color: '#64748b' }]} /></CardBody></Card>
            </div>}
      </Section>
      <Section title="Execution (Strategy module)">
        <Card><div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Item</th><th className="th">Title</th><th className="th">Owner</th><th className="th">Due</th><th className="th">Status</th></tr></thead><tbody>
          {d.initiatives.map((i: any) => <tr key={i.code}><td className="td"><Link className="link" href={`/strategy?initiative=${i.id}`}>{i.code}</Link></td><td className="td">{i.title}</td><td className="td">{i.owner}</td><td className="td">{fmtDate(i.deadline)}</td><td className="td"><StatusBadge status={i.status} /> {i.progress_pct}%</td></tr>)}
          {d.actions.map((a: any) => <tr key={a.code}><td className="td">{a.code}</td><td className="td">{a.title}</td><td className="td">{a.owner}</td><td className="td">{fmtDate(a.due_date)}</td><td className="td"><StatusBadge status={a.status} /></td></tr>)}
          {d.initiatives.length + d.actions.length === 0 && <tr><td className="td text-muted" colSpan={5}>Initiative and action are created automatically on approval.</td></tr>}
        </tbody></table></div></Card>
      </Section>
      <Section title="Approval & audit history">
        <Card><ul className="divide-y divide-border">{d.history.map((h: any, i: number) => <li key={i} className="flex justify-between px-4 py-2 text-sm"><span><b>{h.action}</b> by {h.actor ?? 'system'}</span><span className="text-muted">{fmtDate(h.created_at)} {new Date(h.created_at).toISOString().slice(11, 16)} UTC</span></li>)}</ul></Card>
      </Section>
    </div>
  );
}
