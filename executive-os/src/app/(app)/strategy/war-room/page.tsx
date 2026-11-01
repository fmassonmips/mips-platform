import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { todayISO } from '@/lib/period';
import { addDays, daysBetween } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { warRoom, weekBounds, strategyOptions, label } from '@/lib/services/strategy';
import { Flash, Progress, initTone, krTone, krFmt, MeasuredValue, Disclosure, UpdateForm, NewActionForm, ActionTable, DependencyList } from '../_ui';
import { PrintButton } from '../_client';

export const dynamic = 'force-dynamic';

export default async function WarRoomPage({ searchParams }: { searchParams: SP }) {
  const { auth, sp, period } = await pageContext(searchParams, 'strategy.view');
  const canManage = auth.permissions.has('strategy.manage');
  const today = todayISO();
  const week = weekBounds(spGet(sp, 'week'), today);
  const thisWeek = weekBounds(today, today);
  const data = await tx(auth, async (t) => ({ wr: await warRoom(t, auth, week, today), options: await strategyOptions(t) }));
  const { wr, options } = data;
  const ccy = auth.baseCurrency;
  const returnTo = `/strategy/war-room?week=${week.start}`;
  const flagged = wr.attention.filter((i) => i.flagged);
  const others = wr.attention.filter((i) => !i.flagged);

  return (
    <div className="war-room">
      <PageHeader eyebrow="Weekly management War Room" title={`Week of ${week.start} → ${week.end}`}
        subtitle={<>One screen for the weekly management meeting: initiatives needing attention first, overdue and due actions, decisions being implemented, key-result KPIs vs target and last week’s updates. Generated {today} for {auth.tenantName}.</>}
        actions={<>
          <Link className="btn" href={`/strategy/war-room?week=${addDays(week.start, -7)}`}>← Previous week</Link>
          {week.start !== thisWeek.start && <Link className="btn" href="/strategy/war-room">This week</Link>}
          <Link className="btn" href={`/strategy/war-room?week=${addDays(week.start, 7)}`}>Next week →</Link>
          <form method="get" className="flex items-center gap-1"><input aria-label="Week containing date" type="date" name="week" defaultValue={week.start} className="input w-auto py-1 text-xs" /><button className="btn py-1 text-xs">Go</button></form>
          <PrintButton label="Print / PDF" />
          <Link className="btn" href="/strategy">Strategy</Link>
        </>} />
      <Flash sp={sp} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile title="Initiatives needing attention" value={flagged.length} tone={flagged.length ? 'warn' : 'pos'} />
        <Tile title="Overdue actions" value={wr.overdue.length} tone={wr.overdue.length ? 'neg' : 'pos'} />
        <Tile title="Actions due this week" value={wr.dueThisWeek.length} />
        <Tile title="Decisions in implementation" value={wr.decisions.length} />
        <Tile title="Actions completed this week" value={wr.completedThisWeek.length} tone="pos" />
      </div>

      <Section title="1 · Initiatives at risk or blocked">
        {flagged.length === 0 ? <Callout tone="pos" title="No initiative is at risk, blocked, dependency-blocked or overdue" /> : (
          <div className="space-y-3">
            {flagged.map((i) => (
              <Card key={i.id} className="break-inside-avoid">
                <CardHeader title={<span className="flex flex-wrap items-center gap-2"><Link className="link font-mono text-xs" href={`/strategy/initiatives/${i.id}`}>{i.code}</Link>{i.title}<StatusBadge status={i.status} />{i.dep.blockedByDependency && <Badge tone="neg">blocked by dependency</Badge>}{i.overdue && <Badge tone="neg">past deadline</Badge>}<Badge tone={i.risk_level === 'high' ? 'neg' : 'neutral'}>{i.risk_level} risk</Badge></span>}
                  subtitle={<>Owner {i.owner_name ?? 'unassigned'} · {i.department ?? '—'} · deadline {i.deadline ?? '—'} · spent {fmtMoney(i.spent_base, ccy, { compact: true })} of {fmtMoney(i.budget_base, ccy, { compact: true })}{i.decision_id && <> · decision <Link className="link" href={`/decisions/${i.decision_id}`}>{i.decision_code}</Link></>}</>}
                  actions={<div className="w-40"><Progress pct={i.progress_pct} tone={initTone(i.status)} /></div>} />
                <CardBody className="space-y-2 text-sm">
                  <div className="grid gap-2 md:grid-cols-3">
                    <div><div className="text-2xs font-semibold uppercase text-muted">Blockers</div><div className={i.blockers ? 'text-neg' : 'text-muted'}>{i.blockers ?? 'none recorded'}</div></div>
                    <div><div className="text-2xs font-semibold uppercase text-muted">Next action</div><div>{i.next_action ?? '—'}</div></div>
                    <div><div className="text-2xs font-semibold uppercase text-muted">Dependencies</div><DependencyList i={i} /></div>
                  </div>
                  <div className="text-xs text-muted">Last update: {i.lastUpdateAt ? i.lastUpdateAt.slice(0, 10) : 'never'}{i.lastUpdateAt && daysBetween(i.lastUpdateAt.slice(0, 10), today) > 14 && <span className="text-warn"> — stale (&gt; 14 days)</span>}</div>
                  {canManage && <Disclosure summary={`Post update for ${i.code}`}><UpdateForm i={i} returnTo={returnTo} compact /></Disclosure>}
                </CardBody>
              </Card>
            ))}
          </div>
        )}
        {others.length > 0 && (
          <Card className="mt-3">
            <CardHeader title="Other live initiatives" subtitle="On track / not started" />
            <div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr><th className="th">Code</th><th className="th">Initiative</th><th className="th">Owner</th><th className="th">Deadline</th><th className="th">Status</th><th className="th">Progress</th><th className="th no-print" /></tr></thead>
              <tbody>{others.map((i) => (
                <tr key={i.id} className="align-top"><td className="td font-mono text-xs"><Link className="link" href={`/strategy/initiatives/${i.id}`}>{i.code}</Link></td><td className="td">{i.title}{i.dep.warnings.length > 0 && <div className="text-2xs text-warn">{i.dep.warnings.join(' · ')}</div>}</td><td className="td text-xs">{i.owner_name ?? '—'}</td><td className="td text-xs">{i.deadline ?? '—'}</td><td className="td"><StatusBadge status={i.status} /></td><td className="td"><Progress pct={i.progress_pct} tone={initTone(i.status)} /></td>
                  <td className="td no-print">{canManage && <Disclosure summary="Update"><UpdateForm i={i} returnTo={returnTo} compact /></Disclosure>}</td></tr>
              ))}</tbody></table></div>
          </Card>
        )}
      </Section>

      <Section title="2 · Actions — overdue and due this week">
        <div className="grid gap-4 xl:grid-cols-2">
          <Card><CardHeader title={`Overdue (due before ${week.start})`} subtitle="Open or in progress" /><ActionTable actions={wr.overdue} users={options.users} returnTo={returnTo} canManage={canManage} quick /></Card>
          <Card><CardHeader title={`Due ${week.start} → ${week.end}`} /><ActionTable actions={wr.dueThisWeek} users={options.users} returnTo={returnTo} canManage={canManage} quick /></Card>
        </div>
        {canManage && <Card className="no-print mt-3"><CardHeader title="Create action from this meeting" subtitle="Source: War Room (or link an initiative/decision)" /><CardBody><NewActionForm o={options} returnTo={returnTo} preset={{ source_type: 'war_room' }} /></CardBody></Card>}
        {wr.completedThisWeek.length > 0 && <p className="mt-2 text-xs text-muted">Completed this week: {wr.completedThisWeek.map((a) => `${a.code} ${a.title}`).join(' · ')}</p>}
      </Section>

      <Section title="3 · Decisions in progress">
        <Card>
          {wr.decisions.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">No executive decision is approved or in implementation.</p> : (
            <div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr><th className="th">Decision</th><th className="th">Owner</th><th className="th">Status</th><th className="th">Approved</th><th className="th">Implementation deadline</th><th className="th text-right">Initiatives</th></tr></thead>
              <tbody>{wr.decisions.map((d) => {
                const left = d.implementation_deadline ? daysBetween(today, d.implementation_deadline) : null;
                return (
                  <tr key={d.id}><td className="td"><Link className="link font-mono text-xs" href={`/decisions/${d.id}`}>{d.code}</Link> {d.title}</td><td className="td text-xs">{d.owner_name ?? '—'}</td><td className="td"><StatusBadge status={d.status} /></td><td className="td text-xs">{d.approved_at?.slice(0, 10) ?? '—'}</td>
                    <td className="td text-xs">{d.implementation_deadline ?? '—'}{left !== null && <span className={left < 0 ? ' text-neg' : left <= 14 ? ' text-warn' : ' text-muted'}> ({left < 0 ? `${-left} d overdue` : `${left} d left`})</span>}</td><td className="td num text-right">{d.initiatives}</td></tr>
                );
              })}</tbody></table></div>
          )}
        </Card>
      </Section>

      <Section title="4 · Key-result KPIs vs target">
        <Card>
          {wr.kpis.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">No KPI-linked key results on active objectives.</p> : (
            <div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr><th className="th">Objective</th><th className="th">Key result</th><th className="th">KPI</th><th className="th text-right">Target</th><th className="th">Measured</th><th className="th">Progress</th><th className="th">Status</th></tr></thead>
              <tbody>{wr.kpis.map((k) => (
                <tr key={k.id} className="align-top"><td className="td font-mono text-xs"><Link className="link" href={`/strategy#${k.objective_code}`}>{k.objective_code}</Link></td><td className="td">{k.title}<div className="text-2xs text-muted">{k.quarter}</div></td>
                  <td className="td text-xs"><Link className="link" href={`/proof/kpi/${encodeURIComponent(k.kpi_code!)}?range=${encodeURIComponent(period.key)}`}>{k.kpi_code}</Link></td><td className="td num text-right text-xs">{krFmt(k.target, k.unit, ccy)}</td>
                  <td className="td text-xs"><MeasuredValue kr={k} ccy={ccy} range={period.key} /></td><td className="td"><Progress pct={k.progress.pct} tone={krTone(k.status)} /></td><td className="td"><StatusBadge status={k.status} /></td></tr>
              ))}</tbody></table></div>
          )}
        </Card>
      </Section>

      <Section title={`5 · Updates since ${addDays(week.start, -7)}`}>
        <Card>
          {wr.updates.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">No initiative updates posted last week or this week.</p> : (
            <ul className="divide-y divide-border">
              {wr.updates.map((u) => (
                <li key={u.id} className="px-4 py-2 text-sm"><div className="flex flex-wrap items-center gap-2"><Link className="link font-mono text-xs" href={`/strategy/initiatives/${u.initiative_id}`}>{u.initiative_code}</Link><span className="font-medium">{u.initiative_title}</span><StatusBadge status={u.status} /><span className="num text-xs">{u.progress_pct}%</span><span className="text-xs text-muted">{u.created_at.slice(0, 16).replace('T', ' ')} · {u.author_name ?? 'system'}</span></div><div className="mt-0.5 text-fg/90">{u.note}</div></li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
      <p className="mt-4 text-2xs text-muted">Sources: initiatives, initiative_updates, action_items, executive_decisions (status approved / in progress), key_results + latest current monthly kpi_results. Status labels: {['on_track', 'at_risk', 'blocked'].map(label).join(', ')}. Week = Monday–Sunday.</p>
    </div>
  );
}

function Tile({ title, value, tone }: { title: string; value: number; tone?: 'pos' | 'neg' | 'warn' }) {
  return <div className="card p-3.5"><div className="text-xs font-medium text-muted">{title}</div><div className={`mt-1 text-2xl font-semibold num ${tone === 'neg' ? 'text-neg' : tone === 'warn' ? 'text-warn' : ''}`}>{value}</div></div>;
}
