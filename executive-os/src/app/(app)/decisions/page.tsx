import Link from 'next/link';
import { pageContext, tx, type SP } from '@/lib/page';
import { listScenarios, listDecisions } from '@/lib/services/decisions';
import { TEMPLATES } from '@/lib/engine/scenarios';
import { PageHeader, Section, EmptyState } from '@/components/ui/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { fmtMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DecisionCenter({ searchParams }: { searchParams: SP }) {
  const { auth } = await pageContext(searchParams, 'dashboard.view');
  const { scenarios, decisions } = await tx(auth, async (t) => ({ scenarios: await listScenarios(t), decisions: await listDecisions(t) }));
  const canScenario = auth.permissions.has('scenario.manage');
  const groups = Object.entries(TEMPLATES).reduce<Record<string, [string, (typeof TEMPLATES)[keyof typeof TEMPLATES]][]>>((acc, [k, v]) => { (acc[v.category] ??= []).push([k, v]); return acc; }, {});
  return (
    <div>
      <PageHeader eyebrow="CEO Decision Center" title="Simulate, compare, decide, measure" subtitle="Every scenario is computed by the server-side scenario engine from trailing actuals (base / proposed / downside). Approved decisions create an initiative and an action in Strategy Execution and are measured against actual results." />
      {canScenario && (
        <Section title="Start a scenario">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(groups).map(([cat, items]) => (
              <Card key={cat} className="p-3">
                <div className="mb-2 text-2xs font-semibold uppercase tracking-widest text-gold">{cat}</div>
                <ul className="space-y-1.5">{items.map(([k, v]) => <li key={k}><Link className="link text-sm" href={`/decisions/new?template=${k}`}>{v.label}</Link><div className="text-2xs text-muted">{v.description}</div></li>)}</ul>
              </Card>
            ))}
          </div>
        </Section>
      )}
      <Section title="Scenarios">
        {scenarios.length === 0 ? <EmptyState title="No scenarios yet">Pick a template above.</EmptyState> : (
          <form action="/decisions/compare" method="get">
            <Card>
              <CardHeader title="Saved scenarios" subtitle="Select 2–4 and compare side by side" actions={<button className="btn-primary text-xs">Compare selected</button>} />
              <div className="overflow-x-auto"><table className="w-full">
                <thead><tr><th className="th w-8"></th><th className="th">Code</th><th className="th">Name</th><th className="th">Template</th><th className="th text-right">Horizon EBITDA</th><th className="th text-right">Horizon cash</th><th className="th text-right">Downside EBITDA</th><th className="th">Payback</th><th className="th">Status</th><th className="th">Decision</th></tr></thead>
                <tbody>{scenarios.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-2">
                    <td className="td"><input type="checkbox" name="ids" value={s.id} aria-label={`Select ${s.code}`} /></td>
                    <td className="td"><Link className="link" href={`/decisions/scenarios/${s.id}`}>{s.code}</Link></td>
                    <td className="td">{s.name}{s.comparison_group && <span className="ml-1 text-2xs text-muted">[{s.comparison_group}]</span>}</td>
                    <td className="td text-xs text-muted">{(TEMPLATES as any)[s.template]?.label ?? s.template}</td>
                    <td className={`td num text-right ${Number(s.ebitda) < 0 ? 'text-neg' : ''}`}>{fmtMoney(s.ebitda)}</td>
                    <td className={`td num text-right ${Number(s.cash) < 0 ? 'text-neg' : ''}`}>{fmtMoney(s.cash)}</td>
                    <td className="td num text-right">{fmtMoney(s.downside_ebitda)}</td>
                    <td className="td">{s.payback === null ? 'not within horizon' : s.payback === '0' ? 'immediate' : `month ${s.payback}`}</td>
                    <td className="td"><StatusBadge status={s.status} /></td>
                    <td className="td">{s.decision_code ?? '—'}</td>
                  </tr>))}</tbody>
              </table></div>
            </Card>
          </form>
        )}
      </Section>
      <Section title="Decision register">
        <Card>
          <DataTable filename="decision-register" rows={decisions.map((d) => ({ ...d, expected: d.expected_impact?.monthly_ebitda_delta ?? null, actual: d.actual_outcome?.actual_uplift_vs_baseline ?? d.actual_outcome?.actual_monthly_delta ?? null, outcome: d.actual_outcome?.status ?? 'not measured' }))}
            columns={[{ key: 'code', label: 'Decision', href: '/decisions/{id}' }, { key: 'title', label: 'Description' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'owner', label: 'Owner' }, { key: 'approver', label: 'Approver' }, { key: 'approved_at', label: 'Approved', kind: 'date' }, { key: 'implementation_deadline', label: 'Deadline', kind: 'date' }, { key: 'expected', label: 'Expected EBITDA / mo', kind: 'money' }, { key: 'actual', label: 'Actual uplift / mo', kind: 'money' }, { key: 'outcome', label: 'Outcome' }]} />
        </Card>
      </Section>
      <p className="mt-3 text-2xs text-muted"><Badge tone="info">Method</Badge> Scenario outputs are management estimates based on documented assumptions; they are not forecasts of actual results until measured.</p>
    </div>
  );
}
