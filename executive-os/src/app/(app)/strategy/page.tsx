import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { PageHeader, Section, EmptyState } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { todayISO } from '@/lib/period';
import { fiscalYearOf, quarterOf } from '@/lib/dates';
import { fmtMoney, fmtPct } from '@/lib/format';
import { sum } from '@/lib/money';
import {
  listObjectives, listKeyResults, listInitiatives, listActions, measureKpis, measureKr, strategyOptions, fiscalYears, label, budgetUse,
} from '@/lib/services/strategy';
import { Flash, Progress, MeasuredValue, krFmt, krTone, Disclosure, ObjectiveForm, KeyResultForm, DeleteKrButton, InitiativeForm, NewActionForm, ActionTable } from './_ui';
import { AutoSubmitSelect } from './_client';

export const dynamic = 'force-dynamic';

export default async function StrategyPage({ searchParams }: { searchParams: SP }) {
  const { auth, sp, period } = await pageContext(searchParams, 'strategy.view');
  const canManage = auth.permissions.has('strategy.manage');
  const today = todayISO();
  const fyParam = spGet(sp, 'fy');
  const actionsFilter = spGet(sp, 'actions') === 'all' ? 'all' : 'live';
  const data = await tx(auth, async (t) => {
    const years = await fiscalYears(t);
    const currentFy = fiscalYearOf(today, auth.fyStartMonth);
    const fy = fyParam === 'all' ? null : fyParam && /^\d{4}$/.test(fyParam) ? Number(fyParam) : years.includes(currentFy + 1) && !years.includes(currentFy) ? currentFy + 1 : years.includes(currentFy) ? currentFy : years.at(-1) ?? null;
    const objectives = await listObjectives(t, fy);
    const krs = await listKeyResults(t, objectives.map((o) => o.id));
    const kpiDefs = await t.query<{ code: string; direction: 'up' | 'down' | 'neutral' }>('SELECT code, direction FROM kpi_definitions');
    const dirs = new Map(kpiDefs.rows.map((r) => [r.code, r.direction]));
    const meas = await measureKpis(t, auth, krs.map((k) => k.kpi_code ?? ''), today);
    const measured = krs.map((k) => measureKr(k, k.kpi_code ? meas.get(k.kpi_code) : null, today, k.kpi_code ? dirs.get(k.kpi_code) : null));
    const initiatives = await listInitiatives(t, today);
    const actions = await listActions(t, today);
    const options = await strategyOptions(t);
    return { years, fy, currentFy, objectives, measured, initiatives, actions, options };
  });
  const { years, fy, currentFy, objectives, measured, initiatives, actions, options } = data;
  const ccy = auth.baseCurrency;
  const returnTo = `/strategy${fyParam ? `?fy=${encodeURIComponent(fyParam)}` : ''}`;
  const objIds = new Set(objectives.map((o) => o.id));
  const scopedInits = fy === null ? initiatives : initiatives.filter((i) => !i.objective_id || objIds.has(i.objective_id));
  const live = scopedInits.filter((i) => i.status !== 'done' && i.status !== 'cancelled');
  const budget = sum(scopedInits.map((i) => i.budget_base)).toString();
  const spent = sum(scopedInits.map((i) => i.spent_base)).toString();
  const krOk = measured.filter((k) => k.status === 'achieved' || k.status === 'on_track').length;
  const overdueActions = actions.filter((a) => a.overdue);
  const shownActions = actionsFilter === 'all' ? actions : actions.filter((a) => a.status === 'open' || a.status === 'in_progress');
  const defaultQuarter = quarterOf(today);

  const initRows = scopedInits.map((i) => ({
    id: i.id, code: i.code, title: i.title, objective: i.objective_code ?? '—', owner: i.owner_name ?? '—', department: i.department ?? '—', status: i.status, progress: i.progress_pct,
    budget: i.budget_base, spent: i.spent_base, use: i.budgetUse, deadline: i.deadline, risk: i.risk_level,
    deps: i.dep.deps.length ? `${i.dep.deps.map((d) => d.code).join(', ')}${i.dep.blockedByDependency ? ' — BLOCKED BY DEPENDENCY' : ''}` : '—',
    overdue: i.overdue ? 'OVERDUE' : '', decision: i.decision_code ?? '—', decision_id: i.decision_id ?? '', kpi: i.kpi_code ?? '—', next: i.next_action ?? '', blockers: i.blockers ?? '',
  }));

  return (
    <div>
      <PageHeader eyebrow="Strategy Execution" title={`Strategy execution — ${fy ? `FY${fy}` : 'all fiscal years'}`}
        subtitle={<>Objectives → quarterly key results → initiatives → actions. Key results linked to a KPI are <b>measured automatically</b> from the latest current monthly KPI calculation (dimension total) — value, run and confidence shown; progress is direction-aware. Sources: strategic_objectives, key_results, initiatives, initiative_updates, action_items, kpi_results.</>}
        actions={<>
          <form className="flex items-center gap-2" method="get">
            <AutoSubmitSelect name="fy" label="Fiscal year" defaultValue={fyParam ?? (fy ? String(fy) : 'all')} options={[...years.map((y) => ({ value: String(y), label: `FY${y}${y === currentFy ? ' (current)' : ''}` })), { value: 'all', label: 'All fiscal years' }]} />
            <noscript><button className="btn py-1 text-xs">Apply</button></noscript>
          </form>
          <Link className="btn-gold" href="/strategy/war-room">Weekly War Room →</Link>
          <a className="btn" href="/strategy/actions.csv">Actions CSV</a>
        </>} />
      <Flash sp={sp} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat title="Active objectives" value={`${objectives.filter((o) => o.status === 'active').length} / ${objectives.length}`} />
        <Stat title="Key results on track or achieved" value={`${krOk} / ${measured.length}`} tone={krOk < measured.length / 2 ? 'warn' : 'pos'} />
        <Stat title="Initiatives at risk / blocked" value={`${live.filter((i) => i.status === 'at_risk').length} / ${live.filter((i) => i.status === 'blocked').length}`} tone={live.some((i) => i.status === 'blocked') ? 'neg' : 'pos'} />
        <Stat title="Blocked by a dependency" value={String(live.filter((i) => i.dep.blockedByDependency).length)} tone={live.some((i) => i.dep.blockedByDependency) ? 'warn' : 'pos'} />
        <Stat title="Overdue actions" value={String(overdueActions.length)} tone={overdueActions.length ? 'neg' : 'pos'} />
        <Stat title="Initiative budget used" value={budgetUse(budget, spent) ? fmtPct(budgetUse(budget, spent)) : '—'} sub={`${fmtMoney(spent, ccy, { compact: true })} of ${fmtMoney(budget, ccy, { compact: true })}`} />
      </div>

      <Section title="Objectives & key results" actions={canManage ? undefined : <span className="text-2xs text-muted">read-only (strategy.manage required to edit)</span>}>
        {canManage && <Disclosure summary="+ New strategic objective" className="mb-3"><ObjectiveForm users={options.users} returnTo={returnTo} defaultFy={fy ?? currentFy} /></Disclosure>}
        {objectives.length === 0 && <EmptyState title="No objectives for this fiscal year">{canManage ? 'Create the first objective above.' : 'Ask a strategy owner to set objectives.'}</EmptyState>}
        <div className="space-y-4">
          {objectives.map((o) => {
            const ks = measured.filter((k) => k.objective_id === o.id);
            const inits = scopedInits.filter((i) => i.objective_id === o.id);
            return (
              <Card key={o.id} id={o.code}>
                <CardHeader title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted">{o.code}</span>{o.title}<StatusBadge status={o.status} /></span>}
                  subtitle={<>{label(o.theme)} · FY{o.fiscal_year} · owner {o.owner_name ?? 'unassigned'}{o.description ? ` · ${o.description}` : ''} · {inits.length} initiative{inits.length === 1 ? '' : 's'}</>} />
                <CardBody className="space-y-3">
                  {ks.length === 0 ? <p className="text-sm text-muted">No key results yet.</p> : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead><tr><th className="th">Key result</th><th className="th">Quarter</th><th className="th">KPI</th><th className="th text-right">Baseline</th><th className="th text-right">Target</th><th className="th">Current (measured)</th><th className="th">Progress</th><th className="th">Status</th>{canManage && <th className="th no-print" />}</tr></thead>
                        <tbody>
                          {ks.map((k) => (
                            <tr key={k.id} className="align-top">
                              <td className="td">{k.title}<div className="text-2xs text-muted">{k.progress.direction === 'up' ? 'higher is better' : 'lower is better'} · {k.progress.mode === 'improve' ? 'baseline → target' : 'threshold'}</div></td>
                              <td className="td whitespace-nowrap text-xs">{k.quarter}<div className="text-2xs text-muted">{Math.round(k.elapsed * 100)}% elapsed</div></td>
                              <td className="td text-xs">{k.kpi_code ? <Link className="link" href={`/proof/kpi/${encodeURIComponent(k.kpi_code)}?range=${encodeURIComponent(period.key)}`}>{k.kpi_code}</Link> : <span className="text-muted">manual</span>}</td>
                              <td className="td num text-right text-xs">{krFmt(k.baseline, k.unit, ccy)}</td>
                              <td className="td num text-right text-xs">{krFmt(k.target, k.unit, ccy)}</td>
                              <td className="td text-xs"><MeasuredValue kr={k} ccy={ccy} range={period.key} /></td>
                              <td className="td"><Progress pct={k.progress.pct} tone={krTone(k.status)} />{k.progress.rawPct && k.progress.rawPct !== k.progress.pct && Number(k.progress.rawPct) < 0 && <div className="text-2xs text-neg">moving away from target</div>}</td>
                              <td className="td"><StatusBadge status={k.status} /></td>
                              {canManage && <td className="td no-print"><Disclosure summary="Edit"><KeyResultForm kr={k} objectiveId={o.id} kpis={options.kpis} returnTo={returnTo} defaultQuarter={defaultQuarter} /><div className="mt-2"><DeleteKrButton id={k.id} returnTo={returnTo} /></div></Disclosure></td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {inits.length > 0 && <div className="flex flex-wrap gap-2 text-xs">{inits.map((i) => <Link key={i.id} href={`/strategy/initiatives/${i.id}`} className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 hover:bg-surface-2"><span className="font-mono">{i.code}</span> {i.title} <StatusBadge status={i.status} />{i.dep.blockedByDependency && <Badge tone="neg">dep</Badge>}</Link>)}</div>}
                  {canManage && <div className="flex flex-wrap gap-4"><Disclosure summary="+ Add key result"><KeyResultForm objectiveId={o.id} kpis={options.kpis} returnTo={returnTo} defaultQuarter={defaultQuarter} /></Disclosure><Disclosure summary="Edit objective"><ObjectiveForm o={o} users={options.users} returnTo={returnTo} defaultFy={o.fiscal_year} /></Disclosure></div>}
                </CardBody>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section title="Initiatives">
        {canManage && <Disclosure summary="+ New initiative" className="mb-3"><InitiativeForm o={options} returnTo={returnTo} /></Disclosure>}
        <Card>
          <DataTable rows={initRows} filename="initiatives" rowHref="/strategy/initiatives/{id}" columns={[
            { key: 'code', label: 'Code' }, { key: 'title', label: 'Initiative' }, { key: 'objective', label: 'Objective' }, { key: 'owner', label: 'Owner' }, { key: 'department', label: 'Dept' },
            { key: 'status', label: 'Status', kind: 'badge' }, { key: 'progress', label: 'Progress %', kind: 'number' }, { key: 'budget', label: `Budget (${ccy})`, kind: 'money' }, { key: 'spent', label: 'Spent', kind: 'money' },
            { key: 'use', label: 'Used', kind: 'pct', dp: 0 }, { key: 'deadline', label: 'Deadline', kind: 'date' }, { key: 'overdue', label: '' }, { key: 'risk', label: 'Risk', kind: 'badge' }, { key: 'deps', label: 'Depends on' },
            { key: 'kpi', label: 'KPI' }, { key: 'decision', label: 'Decision', href: '/decisions/{decision_id}' }, { key: 'next', label: 'Next action' }, { key: 'blockers', label: 'Blockers' },
          ]} />
        </Card>
        <p className="mt-1 text-2xs text-muted">“Blocked by dependency” = a prerequisite initiative is blocked, cancelled, missing, or due after this initiative’s deadline. Open an initiative for its update history and to post progress.</p>
      </Section>

      <Section title="Executive action register" actions={<div className="flex gap-2 text-xs"><Link className={actionsFilter === 'live' ? 'font-semibold' : 'link'} href={`${returnTo}${returnTo.includes('?') ? '&' : '?'}actions=live#actions`}>Open</Link>·<Link className={actionsFilter === 'all' ? 'font-semibold' : 'link'} href={`${returnTo}${returnTo.includes('?') ? '&' : '?'}actions=all#actions`}>All ({actions.length})</Link></div>}>
        <Card id="actions">
          {canManage && <div className="border-b border-border p-3"><Disclosure summary="+ New action"><NewActionForm o={options} returnTo={returnTo} /></Disclosure></div>}
          <ActionTable actions={shownActions} users={options.users} returnTo={`${returnTo}${actionsFilter === 'all' ? `${returnTo.includes('?') ? '&' : '?'}actions=all` : ''}`} canManage={canManage} />
        </Card>
      </Section>
    </div>
  );
}

function Stat({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: 'pos' | 'neg' | 'warn' }) {
  return (
    <div className="card p-3.5">
      <div className="text-xs font-medium text-muted">{title}</div>
      <div className={`mt-1 text-xl font-semibold num ${tone === 'neg' ? 'text-neg' : tone === 'warn' ? 'text-warn' : ''}`}>{value}</div>
      {sub && <div className="mt-0.5 text-2xs text-muted">{sub}</div>}
    </div>
  );
}
