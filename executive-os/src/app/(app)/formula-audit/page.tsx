import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { q, one } from '@/lib/db';
import { ensureRun } from '@/lib/services/kpi';
import { KPIS, formulaHash, KPI_ENGINE_VERSION } from '@/lib/engine/kpis';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { PeriodFilter } from '@/components/ui/period-filter';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { fmtDate } from '@/lib/format';
import { runChecksAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function FormulaAudit({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'proof.view');
  const runParam = spGet(sp, 'run');
  const data = await tx(auth, async (t) => {
    const runId = runParam && /^[0-9a-f-]{36}$/.test(runParam) ? runParam : (await ensureRun(t, { tenantId: auth.tenantId, userId: auth.userId, start: period.start, end: period.end, reason: 'formula audit' })).runId;
    const run = await one<any>(t, `SELECT c.*, u.name AS by FROM calc_runs c LEFT JOIN users u ON u.id = c.triggered_by WHERE c.id = $1`, [runId]);
    const runs = await q<any>(t, `SELECT c.id, c.period_start, c.period_end, c.started_at, c.trigger_reason, c.engine_version, jsonb_array_length(c.checks) AS n,
        (SELECT count(*) FROM jsonb_array_elements(c.checks) x WHERE x->>'status' = 'fail')::int AS fails, u.name AS by
      FROM calc_runs c LEFT JOIN users u ON u.id = c.triggered_by ORDER BY c.started_at DESC LIMIT 40`);
    const fv = await q<any>(t, `SELECT d.code, f.version, f.formula_hash, f.effective_from FROM kpi_definitions d JOIN LATERAL (SELECT * FROM formula_versions WHERE kpi_id = d.id ORDER BY version DESC LIMIT 1) f ON true`);
    const nulls = run ? await q<any>(t, `SELECT d.code, r.status_note FROM kpi_results r JOIN kpi_definitions d ON d.id = r.kpi_id WHERE r.calc_run_id = $1 AND r.value IS NULL`, [run.id]) : [];
    return { run, runs, fv, nulls };
  });
  const { run, runs, fv, nulls } = data;
  const fvMap = new Map(fv.map((f) => [f.code, f]));
  const registry = KPIS.map((k) => { const db = fvMap.get(k.code); const h = formulaHash(k); return { code: k.code, name: k.name, unit: k.unit, formula: k.formula, numerator: k.numerator ?? '—', denominator: k.denominator ?? '—', source: k.dataSource, grain: k.grain, period: k.periodBasis, currency: k.currencyRule, rounding: k.rounding, owner: k.owner, version: db?.version ?? '—', validation: k.validation.join('; ') || '—', hash_status: db?.formula_hash === h ? 'pass' : 'fail' }; });
  const checks = (run?.checks ?? []) as any[];
  const fails = checks.filter((c) => c.status === 'fail');
  return (
    <div>
      <PageHeader eyebrow="Formula Audit Engine" title="Centralised calculation engine & controls" subtitle={`Engine ${KPI_ENGINE_VERSION}. Every KPI has a unique identifier, definition, formula, numerator/denominator, source, grain, period basis, currency and rounding rules, a hashed formula version, validation rules and an owner. Calculations are unit-tested (tests/unit) and reproducible.`}
        actions={<><PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />{auth.permissions.has('kpi.calculate') && <form action={runChecksAction}><input type="hidden" name="range" value={period.key} /><button className="btn-primary">Run calculation & controls now</button></form>}</>} />
      {run && <Callout tone={fails.length ? 'neg' : 'pos'} title={`Run ${run.id.slice(0, 8)} · ${run.period_start} → ${run.period_end} · ${fails.length ? `${fails.length} failing control(s)` : 'all controls passed or warned'}`}>
        Triggered {fmtDate(run.started_at)} by {run.by ?? 'system'} ({run.trigger_reason}) · input fingerprint <code className="text-xs">{run.input_fingerprint}</code>
      </Callout>}
      <Section title="Automated controls">
        <Card><DataTable searchable={false} rows={checks.map((c) => ({ ...c, affects: c.affects.join(', '), samples: (c.samples ?? []).join(' | ') }))} columns={[{ key: 'code', label: 'Control' }, { key: 'category', label: 'Category' }, { key: 'name', label: 'Check' }, { key: 'status', label: 'Result', kind: 'badge' }, { key: 'count', label: 'Exceptions', kind: 'number' }, { key: 'detail', label: 'Detail' }, { key: 'samples', label: 'Samples' }, { key: 'affects', label: 'Affects sources' }]} /></Card>
        {nulls.length > 0 && <p className="mt-2 text-xs text-muted">Not computable in this run (null-safe, never ∞/NaN): {nulls.map((n) => `${n.code} (${n.status_note})`).join('; ')}</p>}
      </Section>
      <Section title="KPI formula registry">
        <Card><CardHeader title={`${registry.length} registered KPIs`} subtitle="hash_status = registered formula version matches the engine definition" actions={<Link className="link text-xs" href="/admin/kpis">Definitions & history</Link>} />
          <DataTable filename="kpi-formula-registry" pageSize={50} rows={registry} columns={[{ key: 'code', label: 'KPI', href: `/proof/kpi/{code}?range=${encodeURIComponent(period.key)}` }, { key: 'name', label: 'Name' }, { key: 'formula', label: 'Formula' }, { key: 'numerator', label: 'Numerator' }, { key: 'denominator', label: 'Denominator' }, { key: 'source', label: 'Source' }, { key: 'grain', label: 'Grain' }, { key: 'period', label: 'Period basis' }, { key: 'currency', label: 'Currency' }, { key: 'rounding', label: 'Rounding' }, { key: 'version', label: 'v.' }, { key: 'validation', label: 'Validation' }, { key: 'owner', label: 'Owner' }, { key: 'hash_status', label: 'Hash', kind: 'badge' }]} /></Card>
      </Section>
      <Section title="Calculation run history">
        <Card><DataTable filename="calc-runs" rows={runs.map((r) => ({ ...r, status: r.fails ? 'fail' : 'pass' }))} columns={[{ key: 'id', label: 'Run', href: '/formula-audit?run={id}' }, { key: 'period_start', label: 'From', kind: 'date' }, { key: 'period_end', label: 'To', kind: 'date' }, { key: 'started_at', label: 'Started', kind: 'date' }, { key: 'trigger_reason', label: 'Reason' }, { key: 'by', label: 'By' }, { key: 'fails', label: 'Failing', kind: 'number' }, { key: 'status', label: 'Status', kind: 'badge' }]} /></Card>
      </Section>
      <p className="mt-3 text-2xs text-muted"><Badge>Rounding policy</Badge> Internal precision 40 significant digits (Decimal.js); money stored at 4 dp, KPI values at 8 dp; presentation ROUND_HALF_UP. FX: explicit rate stored on each foreign-currency record.</p>
    </div>
  );
}
