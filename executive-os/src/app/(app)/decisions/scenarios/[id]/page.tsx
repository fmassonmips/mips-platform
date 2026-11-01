import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { getScenario, tenantUsers, expectationsFromScenario } from '@/lib/services/decisions';
import { one } from '@/lib/db';
import { TEMPLATES } from '@/lib/engine/scenarios';
import { FIELD_META } from '@/lib/engine/scenario-fields';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { TrendChart } from '@/components/ui/charts';
import { fmtMoney } from '@/lib/format';
import { addMonths } from '@/lib/dates';
import { CaseTable } from '../../scenario-view';
import { DecisionForm } from '../../forms';
import { rerunScenarioAction, shortlistAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ScenarioDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { auth } = await pageContext(searchParams, 'dashboard.view');
  const { id } = await params;
  const data = await tx(auth, async (t) => {
    const s = await getScenario(t, id); if (!s) return null;
    const decision = await one<any>(t, 'SELECT id, code, status FROM executive_decisions WHERE scenario_id = $1', [id]);
    return { s, users: await tenantUsers(t), decision };
  });
  if (!data) notFound();
  const { s, users, decision } = data;
  const r = s.results;
  const def = (TEMPLATES as any)[s.template];
  const chart = r.proposed.months.map((m: any, i: number) => ({ month: `M${m.m}`, proposed: m.cumulativeCash, downside: r.downside.months[i].cumulativeCash, ebitda: m.ebitda }));
  const exp = expectationsFromScenario(s);
  const ctxM = r.context?.merchant;
  const owner = users.find((u) => u.role === 'cfo')?.id; const approver = users.find((u) => u.role === 'ceo')?.id;
  const evidence = [
    `calculation|scenario:${s.code}|${s.engine_version}; base ${s.base_period_start}→${s.base_period_end}`,
    ...(ctxM ? [`note|merchant:${ctxM.name}|base monthly GPV ${ctxM.gpv}, MDR ${ctxM.mdr}, wholesale ${ctxM.wholesale}`] : []),
  ].join('\n');
  return (
    <div>
      <PageHeader eyebrow={`Scenario ${s.code} · ${def?.label ?? s.template}`} title={s.name}
        subtitle={<>Base period {s.base_period_start} → {s.base_period_end} (monthly averages of actuals) · engine {s.engine_version} · created by {s.created_by_name} · <StatusBadge status={s.status} /></>}
        actions={<>
          {auth.permissions.has('scenario.manage') && <form action={rerunScenarioAction}><input type="hidden" name="id" value={s.id} /><button className="btn">Recalculate on latest data</button></form>}
          {auth.permissions.has('scenario.manage') && s.status === 'draft' && <form action={shortlistAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value="shortlisted" /><button className="btn">Shortlist</button></form>}
          {s.comparison_group && <Link className="btn" href={`/decisions/compare?group=${encodeURIComponent(s.comparison_group)}`}>Compare group</Link>}
        </>} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader title="Financial impact — base vs proposed vs downside" subtitle={`Incremental to status quo over ${r.horizonMonths} months, ${r.currency}`} /><CaseTable outputs={[r]} labels={[s.code]} /></Card>
        <Card><CardHeader title="Assumptions" /><CardBody><dl className="space-y-1 text-sm">{Object.entries(s.assumptions).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{FIELD_META[k]?.label ?? k}</dt><dd className="num text-right">{k === 'merchantId' ? (ctxM?.name ?? String(v)) : String(v)}</dd></div>)}</dl></CardBody></Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader title="Cumulative cash impact" subtitle="Proposed vs downside" /><CardBody><TrendChart data={chart} x="month" series={[{ key: 'proposed', label: 'Proposed', type: 'line' }, { key: 'downside', label: 'Downside', type: 'line', color: '#c43131' }, { key: 'ebitda', label: 'Monthly EBITDA (proposed)', type: 'bar', color: '#b8923d' }]} refLine={0} /></CardBody></Card>
        <Card><CardHeader title="Sensitivities (horizon totals)" /><div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Case</th><th className="th text-right">EBITDA</th><th className="th text-right">Cash</th></tr></thead><tbody>{r.sensitivities.map((x: any) => <tr key={x.label}><td className="td">{x.label}</td><td className="td num text-right">{fmtMoney(x.ebitda)}</td><td className="td num text-right">{fmtMoney(x.cashFlow)}</td></tr>)}</tbody></table></div>
          <CardBody><div className="text-xs text-muted">Risk exposure (downside − proposed cash): <b className="text-fg">{fmtMoney(r.riskExposure)}</b></div></CardBody></Card>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card><CardHeader title="Operational impact" /><CardBody><dl className="space-y-1 text-sm">{Object.entries(r.operational).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k.replace(/_/g, ' ')}</dt><dd className="num">{String(v)}</dd></div>)}{Object.keys(r.operational).length === 0 && <div className="text-muted">No operational metrics for this template.</div>}</dl></CardBody></Card>
        <Card><CardHeader title="Risks & uncertainty" /><CardBody><ul className="list-disc space-y-1 pl-4 text-sm">{r.risks.map((x: string) => <li key={x}>{x}</li>)}<li>All outputs are estimates based on the assumptions shown; they are not actual results.</li></ul></CardBody></Card>
      </div>
      <Section title="Monthly projection (proposed)">
        <Card><div className="overflow-x-auto"><table className="w-full"><thead><tr>{['Month', 'Revenue', 'Costs', 'Contribution', 'EBITDA', 'PBT', 'Cash flow', 'Cumulative cash'].map((h) => <th key={h} className="th text-right first:text-left">{h}</th>)}</tr></thead>
          <tbody>{r.proposed.months.map((m: any) => <tr key={m.m}><td className="td">M{m.m}</td>{['revenue', 'costs', 'contribution', 'ebitda', 'pbt', 'cashFlow', 'cumulativeCash'].map((k) => <td key={k} className={`td num text-right ${Number(m[k]) < 0 ? 'text-neg' : ''}`}>{fmtMoney(m[k])}</td>)}</tr>)}</tbody></table></div></Card>
      </Section>
      <Section title="Record a management decision">
        {decision ? <Callout tone="info" title={`Decision ${decision.code} recorded from this scenario`}><Link className="link" href={`/decisions/${decision.id}`}>Open decision →</Link> (<StatusBadge status={decision.status} />)</Callout>
          : auth.permissions.has('decision.propose') ? (
            <Card><CardHeader title="Decision register entry" subtitle={`Expected impact will be frozen from this scenario: monthly EBITDA ${fmtMoney(exp.expected.monthly_ebitda_delta)}, measurement: ${exp.measurement.type}`} /><CardBody>
              <DecisionForm scenarioId={s.id} users={users} defaults={{ title: s.name, description: `Implement scenario ${s.code}: ${s.name}.`, rationale: s.description || 'Selected after comparing scenario outcomes on revenue, contribution, EBITDA and cash impact, including the downside case.', deadline: addMonths(new Date().toISOString().slice(0, 10), 1), evidence, owner, approver }} />
            </CardBody></Card>
          ) : <Callout tone="info" title="You do not have permission to propose decisions." />}
      </Section>
    </div>
  );
}
