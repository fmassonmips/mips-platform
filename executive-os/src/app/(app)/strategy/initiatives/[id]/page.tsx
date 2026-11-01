import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { StatusBadge, Badge, ConfidenceBadge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { todayISO } from '@/lib/period';
import { fmtMoney, fmtPct } from '@/lib/format';
import { listInitiatives, initiativeUpdates, listActions, measureKpis, strategyOptions, label } from '@/lib/services/strategy';
import { Flash, Progress, initTone, krFmt, Disclosure, InitiativeForm, UpdateForm, NewActionForm, ActionTable, DependencyList } from '../../_ui';

export const dynamic = 'force-dynamic';

export default async function InitiativePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { auth, sp, period } = await pageContext(searchParams, 'strategy.view');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canManage = auth.permissions.has('strategy.manage');
  const today = todayISO();
  const data = await tx(auth, async (t) => {
    const all = await listInitiatives(t, today);
    const i = all.find((x) => x.id === id);
    if (!i) return null;
    const updates = await initiativeUpdates(t, id);
    const actions = await listActions(t, today, { sourceType: 'initiative', sourceId: id });
    const meas = i.kpi_code ? (await measureKpis(t, auth, [i.kpi_code], today)).get(i.kpi_code) ?? null : null;
    const dependents = all.filter((x) => x.depends_on.includes(id));
    const options = await strategyOptions(t);
    return { i, updates, actions, meas, dependents, options };
  });
  if (!data) notFound();
  const { i, updates, actions, meas, dependents, options } = data;
  const ccy = auth.baseCurrency;
  const returnTo = `/strategy/initiatives/${id}`;

  return (
    <div>
      <PageHeader eyebrow={`Initiative ${i.code}`} title={i.title}
        subtitle={<>{i.objective_code ? <>Objective <Link className="link" href={`/strategy#${i.objective_code}`}>{i.objective_code}</Link> · </> : null}Owner {i.owner_name ?? 'unassigned'} · {i.department ?? 'no department'} · last updated {i.updated_at.slice(0, 16).replace('T', ' ')}</>}
        actions={<><Link className="btn" href="/strategy">← Strategy</Link><Link className="btn" href="/strategy/war-room">War Room</Link></>} />
      <Flash sp={sp} />
      {i.dep.blockedByDependency && <div className="mb-4"><Callout tone="neg" title="Blocked by a dependency">{i.dep.deps.filter((d) => d.blocking).map((d) => d.issue).join(' · ')}</Callout></div>}
      {i.overdue && <div className="mb-4"><Callout tone="warn" title={`Deadline ${i.deadline} has passed`}>The initiative is not done. Post an update with a revised plan or status.</Callout></div>}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Initiative" actions={<><StatusBadge status={i.status} /><Badge tone={i.risk_level === 'high' ? 'neg' : i.risk_level === 'medium' ? 'warn' : 'pos'}>{i.risk_level} risk</Badge></>} />
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Item k="Progress"><Progress pct={i.progress_pct} tone={initTone(i.status)} /></Item>
              <Item k="Deadline">{i.deadline ?? '—'}{i.overdue && <> <Badge tone="neg">overdue</Badge></>}</Item>
              <Item k="Target">{i.target ?? '—'}</Item>
              <Item k="Budget">{fmtMoney(i.budget_base, ccy)}</Item>
              <Item k="Spent">{fmtMoney(i.spent_base, ccy)} {i.budgetUse && <span className={Number(i.budgetUse) > 1 ? 'text-neg' : 'text-muted'}>({fmtPct(i.budgetUse, 0)} used{Number(i.budgetUse) > 1 ? ' — over budget' : ''})</span>}</Item>
              <Item k="Expected business impact">{i.expected_impact ?? '—'}</Item>
              <Item k="Next action">{i.next_action ?? '—'}</Item>
              <Item k="Blockers"><span className={i.blockers ? 'text-neg' : ''}>{i.blockers ?? 'none'}</span></Item>
              <Item k="Linked decision">{i.decision_id ? <><Link className="link" href={`/decisions/${i.decision_id}`}>{i.decision_code}</Link> {i.decision_status && <StatusBadge status={i.decision_status} />}<div className="text-xs text-muted">{i.decision_title}</div></> : '—'}</Item>
              <Item k="Depends on" wide><DependencyList i={i} /></Item>
              <Item k="Required by" wide>{dependents.length ? <span className="text-xs">{dependents.map((d, n) => <span key={d.id}>{n ? ', ' : ''}<Link className="link" href={`/strategy/initiatives/${d.id}`}>{d.code}</Link> ({label(d.status)})</span>)}</span> : <span className="text-xs text-muted">no dependent initiatives</span>}</Item>
              {i.description && <Item k="Description" wide>{i.description}</Item>}
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Linked KPI" subtitle="Latest current monthly result (dimension total)" />
          <CardBody>
            {!i.kpi_code ? <p className="text-sm text-muted">No KPI linked.</p> : !meas ? <p className="text-sm text-warn">No current monthly result for {i.kpi_code}.</p> : (
              <div className="space-y-1 text-sm">
                <div className="text-xs text-muted">{meas.name} ({meas.code})</div>
                <div className="flex items-center gap-2 text-xl font-semibold num">{krFmt(meas.value, meas.unit, ccy)} <ConfidenceBadge value={meas.confidence} note={meas.status_note} /></div>
                <div className="text-xs text-muted">{meas.period_start} → {meas.period_end} · {meas.direction === 'down' ? 'lower is better' : meas.direction === 'up' ? 'higher is better' : 'neutral'}</div>
                <div className="text-xs">Run <Link className="link" href={`/formula-audit?run=${meas.calc_run_id}`}>{meas.calc_run_id.slice(0, 8)}</Link> · <Link className="link" href={`/proof/kpi/${encodeURIComponent(meas.code)}?range=${encodeURIComponent(period.key)}`}>Source & proof →</Link></div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {canManage && (
        <Section title="Post a progress update">
          <Card><CardBody><UpdateForm i={i} returnTo={returnTo} /><p className="mt-2 text-2xs text-muted">Posting appends to the update history and sets the initiative’s status and progress (done ⇒ 100 %). Audited.</p></CardBody></Card>
        </Section>
      )}

      <Section title={`Update history (${updates.length})`}>
        <Card>
          <DataTable rows={updates.map((u) => ({ ...u, created_at: u.created_at.slice(0, 16).replace('T', ' ') }))} filename={`${i.code}-updates`} pageSize={15} columns={[
            { key: 'created_at', label: 'When' }, { key: 'author_name', label: 'By' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'progress_pct', label: 'Progress %', kind: 'number' }, { key: 'note', label: 'Note' },
          ]} />
        </Card>
      </Section>

      <Section title="Actions from this initiative">
        <Card>
          {canManage && <div className="border-b border-border p-3"><Disclosure summary="+ New action for this initiative"><NewActionForm o={options} returnTo={returnTo} preset={{ source_type: 'initiative', source_id: id }} /></Disclosure></div>}
          <ActionTable actions={actions} users={options.users} returnTo={returnTo} canManage={canManage} />
        </Card>
      </Section>

      {canManage && (
        <Section title="Edit initiative">
          <Card><CardBody><InitiativeForm i={i} o={options} returnTo={returnTo} /></CardBody></Card>
        </Section>
      )}
    </div>
  );
}

function Item({ k, children, wide }: { k: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? 'sm:col-span-2 lg:col-span-3' : ''}><dt className="text-2xs font-semibold uppercase tracking-wide text-muted">{k}</dt><dd className="mt-0.5">{children}</dd></div>;
}
