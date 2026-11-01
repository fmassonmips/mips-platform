import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { tx, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { KPI_ENGINE_VERSION } from '@/lib/engine/kpis';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flash, Disclosure } from '../../strategy/_ui';
import { SubmitButton } from '../../strategy/_client';
import { resyncKpiRegistry } from '../actions';

export const dynamic = 'force-dynamic';

interface Def { id: string; code: string; name: string; category: string; unit: string; direction: string; owner: string; is_active: boolean; materiality_pct: string; definition: string }
interface Ver { kpi_id: string; version: number; formula: string; numerator: string | null; denominator: string | null; data_source: string; grain: string; period_basis: string; currency_rule: string; rounding: string; engine_ref: string; formula_hash: string; effective_from: string; approved_by_name: string | null; created_at: string }

export default async function KpiDefinitionsPage({ searchParams }: { searchParams: SP }) {
  const auth = await requireAuth('admin.settings');
  const sp = await searchParams;
  const { defs, versions } = await tx(auth, async (t) => ({
    defs: await q<Def>(t, 'SELECT id, code, name, category, unit, direction, owner, is_active, materiality_pct::text, definition FROM kpi_definitions ORDER BY category, code'),
    versions: await q<Ver>(t, `SELECT f.kpi_id, f.version, f.formula, f.numerator, f.denominator, f.data_source, f.grain, f.period_basis, f.currency_rule, f.rounding, f.engine_ref, f.formula_hash, f.effective_from, u.name AS approved_by_name, f.created_at::text
      FROM formula_versions f LEFT JOIN users u ON u.id = f.approved_by ORDER BY f.kpi_id, f.version DESC`),
  }));
  const byKpi = new Map<string, Ver[]>();
  for (const v of versions) { if (!byKpi.has(v.kpi_id)) byKpi.set(v.kpi_id, []); byKpi.get(v.kpi_id)!.push(v); }
  const canSync = auth.permissions.has('kpi.calculate');
  return (
    <div>
      <PageHeader eyebrow="Administration" title="KPI definitions & formula versions" subtitle={<>Registry of {defs.length} KPIs maintained from the calculation engine <code>{KPI_ENGINE_VERSION}</code>. Formula versions are immutable and identified by a SHA-256 hash of the formula specification; a new version is registered whenever the engine’s formula changes. Each KPI links to its proof page.</>}
        actions={canSync ? <form action={resyncKpiRegistry}><input type="hidden" name="returnTo" value="/admin/kpis" /><SubmitButton pendingLabel="Re-syncing…">Re-sync registry</SubmitButton></form> : <span className="text-xs text-muted">Re-sync requires kpi.calculate</span>} />
      <Flash sp={sp} />
      <Card>
        <CardHeader title="Registry" subtitle="Current version shown; expand for the full version history" />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className="th">KPI</th><th className="th">Category</th><th className="th">Unit</th><th className="th">Better</th><th className="th">Owner</th><th className="th text-right">Materiality %</th><th className="th">Current version</th><th className="th">Formula hash</th></tr></thead>
            <tbody>
              {defs.map((d) => {
                const vs = byKpi.get(d.id) ?? []; const cur = vs[0];
                return (
                  <tr key={d.id} className="align-top">
                    <td className="td"><Link className="link font-mono text-xs" href={`/proof/kpi/${encodeURIComponent(d.code)}`}>{d.code}</Link>{!d.is_active && <Badge className="ml-1">inactive</Badge>}<div className="text-sm">{d.name}</div>
                      <Disclosure summary={`Definition & ${vs.length} version${vs.length === 1 ? '' : 's'}`} className="mt-1">
                        <p className="mb-2 text-xs">{d.definition}</p>
                        <table className="w-full border-collapse text-xs"><thead><tr><th className="th">v</th><th className="th">Formula</th><th className="th">Source / grain / basis</th><th className="th">Currency / rounding</th><th className="th">Effective</th><th className="th">SHA-256</th></tr></thead>
                          <tbody>{vs.map((v) => (
                            <tr key={v.version} className="align-top"><td className="td">{v.version}</td><td className="td"><code>{v.formula}</code>{v.numerator && <div className="text-muted">num: {v.numerator}</div>}{v.denominator && <div className="text-muted">den: {v.denominator}</div>}<div className="text-muted">engine: {v.engine_ref}</div></td>
                              <td className="td">{v.data_source} · {v.grain} · {v.period_basis}</td><td className="td">{v.currency_rule} · {v.rounding}</td><td className="td whitespace-nowrap">{v.effective_from}<div className="text-muted">{v.approved_by_name ? `by ${v.approved_by_name}` : 'system'}</div></td><td className="td break-all font-mono text-2xs">{v.formula_hash}</td></tr>
                          ))}</tbody></table>
                      </Disclosure>
                    </td>
                    <td className="td text-xs">{d.category}</td><td className="td text-xs">{d.unit}</td><td className="td text-xs">{d.direction}</td><td className="td text-xs">{d.owner}</td><td className="td num text-right text-xs">{d.materiality_pct.replace(/\.?0+$/, '')}</td>
                    <td className="td text-xs">{cur ? <>v{cur.version} · {cur.effective_from}</> : <span className="text-neg">no version</span>}</td>
                    <td className="td font-mono text-2xs" title={cur?.formula_hash}>{cur?.formula_hash.slice(0, 16)}…</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
