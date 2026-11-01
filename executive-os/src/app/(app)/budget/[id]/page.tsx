import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { tx, spGet, type SP } from '@/lib/page';
import {
  budgetVersions, budgetLines, glAccountMonthly, plAccounts, varianceCommentary, lastActualMonth, fiscalYearMonths, costsByDepartment, departments, productsList,
  plStatement, sumBase, sumBasePresent, variance, isMaterial, covered, materialityPct, higherIsBetter, PL_LAYOUT, PL_LABEL, s, type PlKey, type PlBaseLine, seq,
} from '@/lib/services/finance';
import { PageHeader, Callout, EmptyState } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { TrendChart } from '@/components/ui/charts';
import { DataTable } from '@/components/ui/data-table';
import { FinanceNav, Provenance, Stat, Amt, VarAmt } from '../../financial-performance/_components/finance-ui';
import { ParamSelect } from '../../financial-performance/_components/param-select';
import { submitVersionAction, approveVersionAction, returnVersionAction, deleteDraftAction, createRevisionAction, saveLinesAction, addCommentAction } from '../actions';
import { todayISO } from '@/lib/period';
import { addMonths, monthEnd, monthStart } from '@/lib/dates';
import { fmtMoney, fmtDate, monthLabel } from '@/lib/format';
import { dec, sum, ZERO, type Dec } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Lock, Unlock } from 'lucide-react';

export const dynamic = 'force-dynamic';
type View = 'summary' | 'grid' | 'edit' | 'variances' | 'dimensions';
type Metric = 'budget' | 'actual' | 'variance' | 'variance_pct' | 'py' | 'forecast';

export default async function BudgetVersionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const auth = await requireAuth('finance.view');
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canManage = auth.permissions.has('finance.manage'), canApprove = auth.permissions.has('finance.approve');
  const mat = materialityPct(auth.settings);

  const data = await tx(auth, async (t) => {
    const [v] = await budgetVersions(t, id);
    if (!v) return null;
    const fyMonths = fiscalYearMonths(v.fiscal_year, auth.fyStartMonth);
    const fyEnd = monthEnd(fyMonths[11]);
    const [lines, actual, py, accts, comments, last, deps, prods, deptCosts] = await seq(() => budgetLines(t, id), () => glAccountMonthly(t, fyMonths[0], fyEnd), () => glAccountMonthly(t, addMonths(fyMonths[0], -12), monthEnd(addMonths(fyMonths[11], -12))), () => plAccounts(t), () => varianceCommentary(t, { versionIds: [id] }), () => lastActualMonth(t, todayISO()), () => departments(t), () => productsList(t), () => costsByDepartment(t, fyMonths[0], fyEnd));
    const family = (await budgetVersions(t)).filter((x) => x.fiscal_year === v.fiscal_year && x.kind === v.kind);
    return { v, fyMonths, lines, actual, py, accts, comments, last: last ?? monthStart(todayISO()), deps, prods, deptCosts, family };
  });
  if (!data) notFound();
  const { v, fyMonths, lines, actual, py, accts, comments, last, deps, prods, deptCosts, family } = data;
  const ccy = auth.baseCurrency;
  const locked = v.status === 'approved' || v.status === 'superseded';
  const isDraft = v.status === 'draft';
  const viewRaw = spGet(sp, 'view') as View | undefined;
  const view: View = viewRaw && ['summary', 'grid', 'edit', 'variances', 'dimensions'].includes(viewRaw) ? (viewRaw === 'edit' && !(isDraft && canManage) ? 'summary' : viewRaw) : 'summary';
  const metric: Metric = (['budget', 'actual', 'variance', 'variance_pct', 'py', 'forecast'] as const).find((m) => m === spGet(sp, 'metric')) ?? 'budget';
  const ok = spGet(sp, 'ok'), err = spGet(sp, 'error');
  const actualMonths = fyMonths.filter((m) => m <= last);
  const isActual = (m: string) => m <= last;

  // ---- maps: account → month → amount (FY month keys; PY shifted +12 months)
  const put = (map: Map<string, Map<string, Dec>>, k: string, m: string, a: string) => { if (!map.has(k)) map.set(k, new Map()); const x = map.get(k)!; x.set(m, (x.get(m) ?? ZERO).plus(dec(a))); };
  const plan = new Map<string, Map<string, Dec>>(), act = new Map<string, Map<string, Dec>>(), prev = new Map<string, Map<string, Dec>>();
  for (const l of lines) put(plan, l.code, l.period, l.amount);
  for (const r of actual) put(act, r.code, r.period, r.amount);
  for (const r of py) put(prev, r.code, addMonths(r.period, 12), r.amount);
  const acctByCode = new Map(accts.map((a) => [a.code, a]));
  const usedCodes = accts.filter((a) => plan.has(a.code) || act.has(a.code)).map((a) => a.code);
  const get = (m: Map<string, Map<string, Dec>>, k: string, month: string) => m.get(k)?.get(month) ?? null;
  const sumM = (m: Map<string, Map<string, Dec>>, k: string, months: string[]) => { const mm = m.get(k); if (!mm) return null; let any = false, acc = ZERO; for (const x of months) { const v2 = mm.get(x); if (v2) { any = true; acc = acc.plus(v2); } } return any ? acc : null; };
  const forecastOf = (k: string, months: string[]) => { let acc = ZERO; for (const m of months) acc = acc.plus(isActual(m) ? get(act, k, m) ?? ZERO : get(plan, k, m) ?? ZERO); return acc; };

  // line-level aggregates via plStatement (null when a component line has no plan)
  const rowsFor = (src: Map<string, Map<string, Dec>>, months: string[], present: boolean) => {
    const rows: { pl_line: string; amount: string }[] = [];
    for (const [code, mm] of src) { const a = acctByCode.get(code); if (!a) continue; for (const m of months) { const x = mm.get(m); if (x) rows.push({ pl_line: a.pl_line, amount: x.toString() }); } }
    return present ? plStatement(sumBasePresent(rows)) : plStatement(sumBase(rows));
  };
  const fcastRows = (months: string[]) => { const rows: { pl_line: string; amount: string }[] = []; for (const code of usedCodes) { const a = acctByCode.get(code)!; rows.push({ pl_line: a.pl_line, amount: forecastOf(code, months).toString() }); } return plStatement(sumBase(rows)); };

  const ytdPlan = rowsFor(plan, actualMonths, true), ytdAct = rowsFor(act, actualMonths, false), ytdPy = rowsFor(prev, actualMonths, false), fyPlan = rowsFor(plan, fyMonths, true), fyFc = fcastRows(fyMonths);
  const vRev = variance(ytdAct.revenue, ytdPlan.revenue, true), vEb = variance(ytdAct.ebitda, ytdPlan.ebitda, true);

  // ---- material variances (actual months), account & line level
  type MatRow = { period: string; key: string; label: string; actual: string; plan: string; varAbs: string | null; varPct: string | null; favourable: boolean | null; commented: boolean };
  const matRows: MatRow[] = [];
  for (const m of actualMonths) {
    for (const code of usedCodes) {
      const a = acctByCode.get(code)!; const p = get(plan, code, m); if (p === null) continue;
      const x = get(act, code, m) ?? ZERO;
      if (!isMaterial(x, p, mat)) continue;
      const vv = variance(x, p, higherIsBetter(a.pl_line));
      matRows.push({ period: m, key: code, label: `${code} ${a.name}`, actual: x.toString(), plan: p.toString(), varAbs: s(vv.abs), varPct: s(vv.pct, 6), favourable: vv.favourable, commented: covered(comments, v.id, m, [code, a.pl_line, ...(a.cost_category ? [`cat:${a.cost_category}`] : [])]) });
    }
    const pm = rowsFor(plan, [m], true), am = rowsFor(act, [m], false);
    for (const L of PL_LAYOUT) {
      if (pm[L.key] === null) continue;
      if (!isMaterial(am[L.key], pm[L.key], mat)) continue;
      const vv = variance(am[L.key], pm[L.key], higherIsBetter(L.key));
      matRows.push({ period: m, key: L.key, label: `${L.label} (line)`, actual: s(am[L.key])!, plan: s(pm[L.key])!, varAbs: s(vv.abs), varPct: s(vv.pct, 6), favourable: vv.favourable, commented: covered(comments, v.id, m, [L.key]) });
    }
  }
  matRows.sort((a, b) => b.period.localeCompare(a.period) || a.key.localeCompare(b.key));
  const uncommented = matRows.filter((r) => !r.commented);

  // ---- chart
  const chart = fyMonths.map((m) => { const p = rowsFor(plan, [m], true), a = rowsFor(act, [m], false); return { month: monthLabel(m), plan_rev: s(p.revenue), act_rev: isActual(m) ? s(a.revenue) : null, plan_eb: s(p.ebitda), act_eb: isActual(m) ? s(a.ebitda) : null }; });

  // ---- tabs
  const tab = (k: View, label: string, show = true) => show && <Link key={k} href={`/budget/${v.id}?view=${k}`} className={cn('-mb-px border-b-2 px-3 py-1.5 text-sm', view === k ? 'border-gold font-medium' : 'border-transparent text-muted hover:text-fg')}>{label}</Link>;
  const prevApproved = family.find((x) => x.id !== v.id && x.status === 'approved');

  const cellMetric = (code: string, m: string): Dec | null => {
    const p = get(plan, code, m), a = isActual(m) ? get(act, code, m) ?? ZERO : null;
    switch (metric) {
      case 'budget': return p;
      case 'actual': return a;
      case 'py': return get(prev, code, m);
      case 'forecast': return isActual(m) ? a : p;
      case 'variance': return a !== null && p !== null ? a.minus(p) : null;
      case 'variance_pct': return a !== null && p !== null && !p.isZero() ? a.minus(p).div(p.abs()) : null;
    }
  };
  const lineMetric = (k: PlKey, m: string): Dec | null => {
    const p = rowsFor(plan, [m], true)[k], a = isActual(m) ? rowsFor(act, [m], false)[k] : null;
    switch (metric) {
      case 'budget': return p;
      case 'actual': return a;
      case 'py': return rowsFor(prev, [m], false)[k];
      case 'forecast': return isActual(m) ? a : p;
      case 'variance': return a !== null && p !== null ? a.minus(p) : null;
      case 'variance_pct': return a !== null && p !== null && !p.isZero() ? a.minus(p).div(p.abs()) : null;
    }
  };
  const fmtCell = (x: Dec | null, fav?: boolean | null) => metric === 'variance_pct' ? (x === null ? <span className="text-muted">—</span> : <VarAmt v={s(x, 6)} favourable={fav ?? null} pct />) : metric === 'variance' ? <VarAmt v={s(x)} favourable={fav ?? null} /> : <Amt v={s(x)} />;

  return (
    <div>
      <PageHeader eyebrow={`Budget & forecast · FY${v.fiscal_year} ${v.kind}`} title={v.name}
        subtitle={<>Revision {v.revision}{v.parent_version_id && <> of <Link className="link" href={`/budget/${v.parent_version_id}`}>{v.parent_name}</Link></>} · {v.lines} lines · created by {v.created_by_name ?? '—'} {fmtDate(v.created_at)}{v.submitted_by_name && <> · submitted by {v.submitted_by_name}</>}{v.approved_by_name && <> · approved by {v.approved_by_name} {fmtDate(v.approved_at)}</>}{v.notes && <> · <i>{v.notes}</i></>}</>}
        actions={<><StatusBadge status={v.status} />{locked ? <Badge tone="navy"><Lock className="h-3 w-3" />locked by DB</Badge> : <Badge tone="info"><Unlock className="h-3 w-3" />{isDraft ? 'editable draft' : 'awaiting approval'}</Badge>}</>} />
      <FinanceNav current="/budget" />
      <div className="mb-3"><Link className="link text-sm" href="/budget">← All versions</Link></div>

      <div className="grid gap-3 lg:grid-cols-2">
        {ok && <Callout tone="pos" title={ok} />}
        {err && <Callout tone="neg" title="Action rejected">{err}</Callout>}
        <Callout tone={locked ? 'info' : isDraft ? 'pos' : 'warn'} title={locked ? 'Locked: approved/superseded versions cannot change' : isDraft ? 'Draft — lines can be edited' : 'Submitted — awaiting approval'}>
          {locked ? <>Any insert, update or delete of its budget lines is rejected by the database trigger <code>trg_budget_line_guard</code> (VERSION_LOCKED). Changes require a new revision.</>
            : isDraft ? <>Edits are audited (<code>budget.lines_edited</code>). Submit when ready; a different person with finance.approve must approve.</>
            : <>Editing is disabled while submitted. An approver can approve (locks the version) or return it to draft. The database rejects approval by the submitter.</>}
          {v.status === 'superseded' && <div className="mt-1">Superseded by a later approved version of FY{v.fiscal_year} {v.kind}{prevApproved ? <>: <Link className="link" href={`/budget/${prevApproved.id}`}>{prevApproved.name}</Link></> : ''}.</div>}
        </Callout>
        {uncommented.length > 0 && <Callout tone="warn" title={`${uncommented.length} material variance(s) without commentary (≥ ${mat.toString()}%)`}><Link className="link" href={`/budget/${v.id}?view=variances`}>Review and comment →</Link></Callout>}
      </div>

      {/* workflow actions */}
      <Card className="mt-4">
        <CardHeader title="Workflow" subtitle="draft → submitted → approved (locked) → superseded by a later approval" />
        <CardBody className="flex flex-wrap items-end gap-3">
          {isDraft && canManage && <form action={submitVersionAction}><input type="hidden" name="id" value={v.id} /><button className="btn-primary" type="submit">Submit for approval</button></form>}
          {isDraft && canManage && <form action={deleteDraftAction}><input type="hidden" name="id" value={v.id} /><button className="btn-danger" type="submit">Delete draft</button></form>}
          {v.status === 'submitted' && canApprove && <form action={approveVersionAction}><input type="hidden" name="id" value={v.id} /><button className="btn-gold" type="submit">Approve &amp; lock</button>{prevApproved && <span className="ml-2 text-xs text-muted">will supersede {prevApproved.name}</span>}{v.submitted_by === auth.userId && <span className="ml-2 text-xs text-warn">You submitted this version — the database will reject your approval (segregation of duties).</span>}</form>}
          {v.status === 'submitted' && canApprove && <form action={returnVersionAction} className="flex items-end gap-2"><input type="hidden" name="id" value={v.id} /><label><span className="label">Return reason</span><input name="reason" className="input" required minLength={3} maxLength={1000} placeholder="What must change" /></label><button className="btn" type="submit">Return to draft</button></form>}
          {v.status === 'approved' && canManage && <form action={createRevisionAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={v.id} /><label><span className="label">Revision name</span><input name="name" className="input" required minLength={3} maxLength={120} defaultValue={`${v.name.replace(/\s+(v\d+|rev\s*\d+)$/i, '')} rev ${v.revision + 1}`} /></label><button className="btn-primary" type="submit">Create revision (draft)</button></form>}
          {!canManage && !canApprove && <span className="text-sm text-muted">Read-only: workflow actions require finance.manage / finance.approve.</span>}
          {v.status === 'submitted' && !canApprove && <span className="text-sm text-muted">Awaiting a user with finance.approve.</span>}
          {v.status === 'superseded' && <span className="text-sm text-muted">Superseded versions are retained as evidence; create a revision from the current approved version.</span>}
        </CardBody>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={`Revenue YTD (${actualMonths.length} m)`} value={fmtMoney(s(ytdAct.revenue), ccy, { compact: true })} sub={<>plan {fmtMoney(s(ytdPlan.revenue), ccy, { compact: true })} · <VarAmt v={s(vRev.pct, 6)} favourable={vRev.favourable} pct /></>} />
        <Stat label="EBITDA YTD" value={fmtMoney(s(ytdAct.ebitda), ccy, { compact: true })} sub={<>plan {fmtMoney(s(ytdPlan.ebitda), ccy, { compact: true })} · <VarAmt v={s(vEb.pct, 6)} favourable={vEb.favourable} pct /></>} />
        <Stat label="FY revenue plan" value={fmtMoney(s(fyPlan.revenue), ccy, { compact: true })} sub={`version total, ${fyMonths[0].slice(0, 7)} → ${fyMonths[11].slice(0, 7)}`} />
        <Stat label="FY revenue forecast" value={fmtMoney(s(fyFc.revenue), ccy, { compact: true })} sub="actual YTD + remaining plan months" tone={fyFc.revenue && fyPlan.revenue && fyFc.revenue.lt(fyPlan.revenue) ? 'neg' : 'pos'} />
        <Stat label="FY EBITDA forecast" value={fmtMoney(s(fyFc.ebitda), ccy, { compact: true })} sub={<>plan {fmtMoney(s(fyPlan.ebitda), ccy, { compact: true })}</>} tone={fyFc.ebitda && fyPlan.ebitda && fyFc.ebitda.lt(fyPlan.ebitda) ? 'neg' : 'pos'} />
        <Stat label="Material variances" value={`${matRows.length}`} sub={`${uncommented.length} uncommented · threshold ${mat.toString()}%`} tone={uncommented.length ? 'warn' : undefined} />
      </div>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-border" aria-label="Version views">
        {tab('summary', 'Summary by account')}{tab('grid', 'Monthly grid')}{tab('edit', 'Edit lines', isDraft && canManage)}{tab('variances', `Variances & commentary (${comments.length})`)}{tab('dimensions', 'Departments & products')}
      </nav>

      {view === 'summary' && (<>
        <Card className="mt-4">
          <CardHeader title={`Plan vs actual — FY${v.fiscal_year} (${ccy})`} subtitle={`YTD = booked months ${actualMonths.length ? `${actualMonths[0].slice(0, 7)} → ${actualMonths[actualMonths.length - 1].slice(0, 7)}` : '(none yet)'}; prior year = same months one year earlier; full-year forecast = actual YTD + this version's remaining months`} />
          <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
            <thead><tr><th className="th min-w-[220px]">Account / line</th><th className="th text-right">FY plan</th><th className="th text-right">Plan YTD</th><th className="th text-right">Actual YTD</th><th className="th text-right">Var</th><th className="th text-right">Var %</th><th className="th text-right">PY YTD</th><th className="th text-right">FY forecast</th><th className="th text-right">Fcst − plan</th></tr></thead>
            <tbody>{PL_LAYOUT.map((L) => {
              const hb = higherIsBetter(L.key);
              const lv = variance(ytdAct[L.key], ytdPlan[L.key], hb), fv = variance(fyFc[L.key], fyPlan[L.key], hb);
              const accRows = L.kind === 'base' ? usedCodes.filter((c) => acctByCode.get(c)!.pl_line === L.key) : [];
              return [
                <tr key={L.key} className={cn('hover:bg-surface-2', L.kind === 'subtotal' ? 'bg-surface-2/60 font-semibold' : 'font-medium')}>
                  <td className="td">{L.label}</td><td className="td text-right"><Amt v={s(fyPlan[L.key])} /></td><td className="td text-right"><Amt v={s(ytdPlan[L.key])} /></td><td className="td text-right"><Amt v={s(ytdAct[L.key])} /></td>
                  <td className="td text-right"><VarAmt v={s(lv.abs)} favourable={lv.favourable} /></td><td className="td text-right"><VarAmt v={s(lv.pct, 6)} favourable={lv.favourable} pct />{isMaterial(ytdAct[L.key], ytdPlan[L.key], mat) && <Badge tone="warn" className="ml-1">M</Badge>}</td>
                  <td className="td text-right"><Amt v={s(ytdPy[L.key])} /></td><td className="td text-right"><Amt v={s(fyFc[L.key])} /></td><td className="td text-right"><VarAmt v={s(fv.abs)} favourable={fv.favourable} /></td>
                </tr>,
                ...accRows.map((code) => {
                  const a = acctByCode.get(code)!; const pY = sumM(plan, code, actualMonths), aY = sumM(act, code, actualMonths) ?? ZERO, fyP = sumM(plan, code, fyMonths), fc = forecastOf(code, fyMonths);
                  const av = variance(aY, pY, higherIsBetter(a.pl_line)), afv = variance(fc, fyP, higherIsBetter(a.pl_line));
                  return (
                    <tr key={`${L.key}-${code}`} className="text-xs hover:bg-surface-2">
                      <td className="td pl-7"><Link className="link" href={`/pnl/entries?account=${code}&range=fy:${v.fiscal_year}`}>{code} {a.name}</Link></td><td className="td text-right"><Amt v={s(fyP)} /></td><td className="td text-right"><Amt v={s(pY)} /></td><td className="td text-right"><Amt v={s(aY)} /></td>
                      <td className="td text-right"><VarAmt v={s(av.abs)} favourable={av.favourable} /></td><td className="td text-right"><VarAmt v={s(av.pct, 6)} favourable={av.favourable} pct />{isMaterial(aY, pY, mat) && <Badge tone="warn" className="ml-1">M</Badge>}</td>
                      <td className="td text-right"><Amt v={s(sumM(prev, code, actualMonths))} /></td><td className="td text-right"><Amt v={s(fc)} /></td><td className="td text-right"><VarAmt v={s(afv.abs)} favourable={afv.favourable} /></td>
                    </tr>
                  );
                }),
              ];
            })}</tbody>
          </table></div>
        </Card>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card><CardHeader title="Revenue: plan vs actual by month" /><CardBody><TrendChart data={chart} x="month" series={[{ key: 'act_rev', label: 'Actual', type: 'bar' }, { key: 'plan_rev', label: 'Plan (this version)', type: 'line', color: '#c43131' }]} /></CardBody></Card>
          <Card><CardHeader title="EBITDA: plan vs actual by month" /><CardBody><TrendChart data={chart} x="month" series={[{ key: 'act_eb', label: 'Actual', type: 'bar', color: '#b8923d' }, { key: 'plan_eb', label: 'Plan (this version)', type: 'line', color: '#c43131' }]} /></CardBody></Card>
        </div>
      </>)}

      {view === 'grid' && (
        <Card className="mt-4">
          <CardHeader title={`Monthly grid — ${({ budget: 'plan (this version)', actual: 'actual (GL)', variance: 'variance actual − plan', variance_pct: 'variance %', py: 'previous year actual', forecast: 'forecast: actual where booked, plan after' } as Record<Metric, string>)[metric]}`} subtitle={`Months after ${last.slice(0, 7)} have no actuals. ${ccy}.`}
            actions={<ParamSelect name="metric" label="Show" value={metric} options={[{ value: 'budget', label: 'Plan' }, { value: 'actual', label: 'Actual' }, { value: 'variance', label: 'Variance' }, { value: 'variance_pct', label: 'Variance %' }, { value: 'py', label: 'Previous year' }, { value: 'forecast', label: 'Forecast' }]} />} />
          <div className="overflow-x-auto"><table className="w-full border-collapse text-xs">
            <thead><tr><th className="th sticky left-0 z-10 min-w-[200px]">Account</th>{fyMonths.map((m) => <th key={m} className={cn('th text-right', !isActual(m) && 'opacity-70')}>{monthLabel(m)}</th>)}<th className="th text-right">FY</th></tr></thead>
            <tbody>{PL_LAYOUT.map((L) => {
              const lineTotal = (() => { if (metric === 'variance_pct') { const a = rowsFor(act, actualMonths, false)[L.key], p = rowsFor(plan, actualMonths, true)[L.key]; return a && p && !p.isZero() ? a.minus(p).div(p.abs()) : null; } const vals = fyMonths.map((m) => lineMetric(L.key, m)); return vals.every((x) => x === null) ? null : sum(vals.filter(Boolean) as Dec[]); })();
              const hb = higherIsBetter(L.key);
              const fav = (x: Dec | null) => (x === null || x.isZero() ? null : hb ? x.gt(0) : x.lt(0));
              return [
                <tr key={L.key} className={cn(L.kind === 'subtotal' ? 'bg-surface-2/60 font-semibold' : 'font-medium')}><td className={cn('td sticky left-0 z-10', L.kind === 'subtotal' ? 'bg-surface-2' : 'bg-surface')}>{L.label}</td>{fyMonths.map((m) => { const x = lineMetric(L.key, m); return <td key={m} className="td text-right">{fmtCell(x, fav(x))}</td>; })}<td className="td text-right">{fmtCell(lineTotal, fav(lineTotal))}</td></tr>,
                ...(L.kind === 'base' ? usedCodes.filter((c) => acctByCode.get(c)!.pl_line === L.key).map((code) => {
                  const vals = fyMonths.map((m) => cellMetric(code, m));
                  const tot = metric === 'variance_pct' ? (() => { const a = sumM(act, code, actualMonths) ?? ZERO, p = sumM(plan, code, actualMonths); return p && !p.isZero() ? a.minus(p).div(p.abs()) : null; })() : vals.every((x) => x === null) ? null : sum(vals.filter(Boolean) as Dec[]);
                  return <tr key={code} className="hover:bg-surface-2"><td className="td sticky left-0 z-10 bg-surface pl-6">{code} {acctByCode.get(code)!.name}</td>{vals.map((x, i) => <td key={i} className="td text-right">{fmtCell(x, fav(x))}</td>)}<td className="td text-right font-medium">{fmtCell(tot, fav(tot))}</td></tr>;
                }) : []),
              ];
            })}</tbody>
          </table></div>
          <CardBody className="pt-2"><Provenance>Plan values: budget_lines of this version (company-level and dimension lines summed). Actual: gl_entries natural sign. Previous year: same calendar month one year earlier. Variance % relative to |plan|; FY column of Variance % uses booked months only.</Provenance></CardBody>
        </Card>
      )}

      {view === 'edit' && isDraft && canManage && (
        <Card className="mt-4">
          <CardHeader title="Edit draft lines (company level)" subtitle="Enter amounts in base currency (positive = income for revenue accounts, cost for expense accounts). Leave blank to remove a line. Only changed cells are written; each save is audited. Lines tagged with a department/product are not edited here." />
          <form action={saveLinesAction}>
            <input type="hidden" name="id" value={v.id} />
            <div className="overflow-x-auto"><table className="w-full border-collapse text-xs">
              <thead><tr><th className="th sticky left-0 z-10 min-w-[200px]">Account</th>{fyMonths.map((m) => <th key={m} className="th text-right">{monthLabel(m)}</th>)}</tr></thead>
              <tbody>{accts.map((a) => (
                <tr key={a.id}><td className="td sticky left-0 z-10 bg-surface"><span className="text-muted">{PL_LABEL[a.pl_line as PlBaseLine]} · </span>{a.code} {a.name}</td>
                  {fyMonths.map((m) => {
                    const l = lines.find((x) => x.account_id === a.id && x.period === m && !x.department_id && !x.product_id);
                    const val = l ? dec(l.amount).toDecimalPlaces(2).toFixed(2) : '';
                    return <td key={m} className="td p-0.5"><input type="hidden" name={`orig:${a.id}:${m}`} value={val} /><input aria-label={`${a.code} ${m}`} name={`amt:${a.id}:${m}`} defaultValue={val} inputMode="decimal" className="input w-24 px-1.5 py-0.5 text-right text-xs" /></td>;
                  })}
                </tr>
              ))}</tbody>
            </table></div>
            <div className="flex items-center justify-end gap-2 border-t border-border p-3"><Link className="btn" href={`/budget/${v.id}`}>Cancel</Link><button className="btn-primary" type="submit">Save changes</button></div>
          </form>
        </Card>
      )}

      {view === 'variances' && (<>
        <Card className="mt-4">
          <CardHeader title={`Material deviations — ${matRows.length} (${uncommented.length} without commentary)`} subtitle={`|actual − plan| ≥ ${mat.toString()}% of plan (tenant materiality_pct), booked months only, at account and P&L-line level. A comment on the account code, its P&L line or its cost category covers the deviation.`} />
          {matRows.length === 0 ? <CardBody><EmptyState title="No material deviations">Every booked month is within {mat.toString()}% of plan.</EmptyState></CardBody> : (
            <DataTable rows={matRows.map((r) => ({ ...r, month: r.period.slice(0, 7), status: r.commented ? 'commented' : 'uncommented', id: v.id }))} filename={`variances-${v.name}`} pageSize={25} dense
              rowHref={`/budget/{id}?view=variances&ck={key}&cp={period}#comment`}
              columns={[{ key: 'month', label: 'Month' }, { key: 'label', label: 'Account / line' }, { key: 'actual', label: 'Actual', kind: 'money' }, { key: 'plan', label: 'Plan', kind: 'money' }, { key: 'varAbs', label: 'Var', kind: 'money' }, { key: 'varPct', label: 'Var %', kind: 'pct' }, { key: 'status', label: 'Commentary', kind: 'badge' }]} />
          )}
        </Card>
        <Card className="mt-4" id="comment">
          <CardHeader title={`Variance commentary (${comments.length})`} subtitle="Stored in variance_commentary for this version; audited (budget.variance_commented)" />
          <CardBody>
            {comments.length === 0 ? <p className="text-sm text-muted">No commentary yet.</p> : <ul className="space-y-2 text-sm">{comments.map((c) => <li key={c.id} className="border-b border-border pb-2"><Badge>{c.period.slice(0, 7)}</Badge> <Badge tone="navy">{c.line_key}</Badge> {c.comment} <span className="text-2xs text-muted">— {c.author ?? 'system'}, {c.created_at.slice(0, 16).replace('T', ' ')}</span></li>)}</ul>}
            {canManage ? (
              <form action={addCommentAction} className="mt-4 grid gap-2 md:grid-cols-[150px_260px_1fr_auto] md:items-end">
                <input type="hidden" name="id" value={v.id} />
                <label><span className="label">Month</span><select name="period" className="input" defaultValue={spGet(sp, 'cp') ?? actualMonths[actualMonths.length - 1] ?? fyMonths[0]}>{fyMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
                <label><span className="label">Line / account</span><select name="lineKey" className="input" defaultValue={spGet(sp, 'ck') ?? 'revenue'}>{PL_LAYOUT.map((L) => <option key={L.key} value={L.key}>{L.label} (line)</option>)}{accts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select></label>
                <label><span className="label">Explanation</span><input name="comment" className="input" required minLength={5} maxLength={2000} placeholder="Root cause, owner and expected recurrence" /></label>
                <button className="btn-primary" type="submit">Add commentary</button>
              </form>
            ) : <p className="mt-3 text-xs text-muted">Adding commentary requires finance.manage.</p>}
          </CardBody>
        </Card>
      </>)}

      {view === 'dimensions' && (() => {
        const dimLines = lines.filter((l) => l.department_id || l.product_id);
        const byDept = new Map<string, Dec>(), byProd = new Map<string, Dec>();
        for (const l of dimLines) { if (l.department) byDept.set(l.department, (byDept.get(l.department) ?? ZERO).plus(dec(l.amount))); if (l.product) byProd.set(l.product, (byProd.get(l.product) ?? ZERO).plus(dec(l.amount))); }
        const actDept = new Map<string, { name: string; amount: Dec }>();
        for (const r of deptCosts) { const e = actDept.get(r.key) ?? { name: r.name, amount: ZERO }; e.amount = e.amount.plus(dec(r.amount)); actDept.set(r.key, e); }
        const deptRows = [...deps.map((d) => ({ key: d.code, name: d.name })), { key: '(unassigned)', name: '(no department tag)' }].map((d) => ({ key: d.key, name: d.name, plan: s(byDept.get(d.name) ?? null), actual: s(actDept.get(d.key)?.amount ?? null) })).filter((r) => r.plan || r.actual);
        return (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card><CardHeader title="Department view" subtitle="Plan lines carrying department_id vs FY actual expense GL by department" />
              {byDept.size === 0 && <CardBody className="pb-0"><Callout tone="info" title="This version holds no department-level lines">All {v.lines} lines are company-level (department_id is NULL), so a department plan cannot be shown. Actual departmental costs are listed for reference; to plan by department, import budget lines with a department code.</Callout></CardBody>}
              <DataTable rows={deptRows} filename={`budget-departments-${v.name}`} dense searchable={false} rowHref={`/pnl?dept={key}&range=fy:${v.fiscal_year}`} columns={[{ key: 'name', label: 'Department' }, { key: 'plan', label: 'Plan (dimension lines)', kind: 'money' }, { key: 'actual', label: `Actual FY${v.fiscal_year} to date`, kind: 'money' }]} /></Card>
            <Card><CardHeader title="Product view" subtitle="Plan lines carrying product_id" />
              {byProd.size === 0 ? <CardBody><Callout tone="info" title="This version holds no product-level lines">Revenue and cost plans are held at account level only. Product revenue actuals are on <Link className="link" href={`/revenue?by=product&range=fy:${v.fiscal_year}`}>Revenue intelligence</Link>; product costs on <Link className="link" href={`/costs?range=fy:${v.fiscal_year}`}>Operating costs</Link>.</Callout></CardBody>
                : <DataTable rows={[...byProd.entries()].map(([k, a]) => ({ key: k, name: prods.find((p) => p.code === k)?.name ?? k, plan: a.toString() }))} filename={`budget-products-${v.name}`} dense searchable={false} columns={[{ key: 'name', label: 'Product' }, { key: 'plan', label: 'Plan', kind: 'money' }]} />}
            </Card>
          </div>
        );
      })()}
      <Provenance>Version {v.id}. Fiscal year FY{v.fiscal_year} = {fyMonths[0]} → {monthEnd(fyMonths[11])} (FY start month {auth.fyStartMonth}). All mutations write audit events; approved versions are immutable in the database.</Provenance>
    </div>
  );
}
