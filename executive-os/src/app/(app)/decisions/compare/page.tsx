import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { PageHeader, EmptyState, Section } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { TrendChart } from '@/components/ui/charts';
import { FIELD_META } from '@/lib/engine/scenario-fields';
import { CaseTable } from '../scenario-view';
import { fmtMoney } from '@/lib/format';
import { dec } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function Compare({ searchParams }: { searchParams: SP }) {
  const { auth, sp } = await pageContext(searchParams, 'dashboard.view');
  const raw = sp.ids; const ids = (Array.isArray(raw) ? raw : raw ? String(raw).split(',') : []).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 4);
  const group = spGet(sp, 'group');
  const rows = await tx(auth, (t) => group ? q<any>(t, 'SELECT * FROM scenarios WHERE comparison_group = $1 ORDER BY created_at LIMIT 6', [group]) : ids.length ? q<any>(t, 'SELECT * FROM scenarios WHERE id = ANY($1::uuid[]) ORDER BY created_at', [ids]) : Promise.resolve([]));
  if (rows.length < 2) return <div><PageHeader title="Compare scenarios" actions={<Link className="btn" href="/decisions">Back</Link>} /><EmptyState title="Select at least two scenarios">Tick scenarios in the Decision Center list, or open a comparison group.</EmptyState></div>;
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.assumptions)))).filter((k) => !k.startsWith('downside') && k !== 'horizonMonths' && k !== 'taxRate');
  const chart = rows[0].results.proposed.months.map((_: any, i: number) => Object.fromEntries([['month', `M${i + 1}`], ...rows.map((r) => [r.code, r.results.proposed.months[i]?.cumulativeCash ?? null])]));
  const best = [...rows].sort((a, b) => dec(b.results.proposed.totals.ebitda).cmp(dec(a.results.proposed.totals.ebitda)))[0];
  const safest = [...rows].sort((a, b) => dec(b.results.downside.totals.cashFlow).cmp(dec(a.results.downside.totals.cashFlow)))[0];
  return (
    <div>
      <PageHeader eyebrow="CEO Decision Center" title={`Scenario comparison${group ? ` — ${group}` : ''}`} subtitle="Side-by-side engine outputs. Trade-offs: highest proposed EBITDA vs most resilient downside." actions={<Link className="btn" href="/decisions">Back</Link>} />
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4"><div className="text-xs text-muted">Highest horizon EBITDA (proposed)</div><div className="mt-1 font-semibold">{best.code} · {best.name}</div><div className="num text-lg">{fmtMoney(best.results.proposed.totals.ebitda)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">Most resilient downside (cash)</div><div className="mt-1 font-semibold">{safest.code} · {safest.name}</div><div className="num text-lg">{fmtMoney(safest.results.downside.totals.cashFlow)}</div></Card>
      </div>
      <Section title="Assumptions">
        <Card><div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Assumption</th>{rows.map((r) => <th key={r.id} className="th text-right"><Link className="link" href={`/decisions/scenarios/${r.id}`}>{r.code}</Link><div className="normal-case font-normal">{r.name}</div></th>)}</tr></thead>
          <tbody>{keys.map((k) => <tr key={k}><td className="td text-muted">{FIELD_META[k]?.label ?? k}</td>{rows.map((r) => <td key={r.id} className="td num text-right">{k === 'merchantId' ? (r.results.context?.merchant?.name ?? '—') : (r.assumptions[k] ?? '—')}</td>)}</tr>)}</tbody></table></div></Card>
      </Section>
      <Section title="Financial impact"><Card><CaseTable outputs={rows.map((r) => r.results)} labels={rows.map((r) => r.code)} /></Card></Section>
      <Section title="Cumulative cash (proposed)"><Card><CardBody><TrendChart data={chart} x="month" series={rows.map((r) => ({ key: r.code, label: `${r.code} ${r.name}`, type: 'line' as const }))} refLine={0} /></CardBody></Card></Section>
      <Section title="Sensitivities (horizon EBITDA)">
        <Card><div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Sensitivity</th>{rows.map((r) => <th key={r.id} className="th text-right">{r.code}</th>)}</tr></thead>
          <tbody>{rows[0].results.sensitivities.map((sx: any, i: number) => <tr key={sx.label}><td className="td">{sx.label}</td>{rows.map((r) => <td key={r.id} className="td num text-right">{fmtMoney(r.results.sensitivities[i]?.ebitda)}</td>)}</tr>)}</tbody></table></div></Card>
      </Section>
      <Section title="Strategic trade-offs">
        <Card><CardBody><ul className="list-disc space-y-1 pl-4 text-sm">{rows.map((r) => <li key={r.id}><b>{r.code}</b>: {r.results.risks.join(' · ')} — risk exposure {fmtMoney(r.results.riskExposure)}.</li>)}</ul></CardBody></Card>
      </Section>
    </div>
  );
}
