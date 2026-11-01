/**
 * Strategy module UI building blocks (server components). Forms post to the
 * server actions in ./actions.ts; permission checks happen there.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Callout } from '@/components/ui/page-header';
import { StatusBadge, Badge, ConfidenceBadge } from '@/components/ui/badge';
import { fmtPct, fmtValue } from '@/lib/format';
import { spGet } from '@/lib/page';
import {
  THEMES, OBJECTIVE_STATUSES, INITIATIVE_STATUSES, RISK_LEVELS, SOURCE_TYPES, KR_UNITS, label, allowedActionTransitions,
  type UserOpt, type Objective, type KeyResult, type EnrichedInitiative, type ActionItem, type MeasuredKr,
} from '@/lib/services/strategy';
import { saveObjective, saveKeyResult, deleteKeyResult, saveInitiative, postInitiativeUpdate, createAction, updateAction, setActionStatus } from './actions';
import { SubmitButton } from './_client';

export interface Options {
  users: UserOpt[];
  kpis: { code: string; name: string; unit: string }[];
  departments: { code: string; name: string }[];
  decisions: { id: string; code: string; title: string; status: string }[];
  objectives: { id: string; code: string; title: string }[];
  initiatives: { id: string; code: string; title: string; status: string }[];
}

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = spGet(sp, 'ok'); const err = spGet(sp, 'err');
  if (!ok && !err) return null;
  return <div className="no-print mb-4">{err ? <Callout tone="neg" title="Not saved">{err}</Callout> : <Callout tone="pos" title={ok!} />}</div>;
}

export function Progress({ pct, tone }: { pct: string | number | null; tone?: 'pos' | 'warn' | 'neg' | 'info' }) {
  if (pct === null) return <span className="text-xs text-muted">—</span>;
  const w = Math.max(0, Math.min(100, Number(pct))); // presentation width only
  const bar = { pos: 'bg-pos', warn: 'bg-warn', neg: 'bg-neg', info: 'bg-info' }[tone ?? 'info'];
  return (
    <div className="flex min-w-[110px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-surface-2"><div className={`h-full ${bar}`} style={{ width: `${w}%` }} /></div>
      <span className="num w-11 text-right text-xs">{typeof pct === 'number' ? pct : pct}%</span>
    </div>
  );
}
export const krTone = (s: string) => (s === 'achieved' || s === 'on_track' ? 'pos' : s === 'at_risk' ? 'warn' : s === 'off_track' ? 'neg' : 'info') as 'pos' | 'warn' | 'neg' | 'info';
export const initTone = (s: string) => (s === 'done' || s === 'on_track' ? 'pos' : s === 'at_risk' ? 'warn' : s === 'blocked' ? 'neg' : 'info') as 'pos' | 'warn' | 'neg' | 'info';

/** Key-result value formatting: percent KPIs are fractions (0.9995 → 99.95 %). */
export function krFmt(v: string | null, unit: string, ccy: string): string {
  if (v === null || v === undefined) return '—';
  if (unit === 'percent') return fmtPct(v, 2);
  return fmtValue(v, unit, ccy, false);
}

export function MeasuredValue({ kr, ccy, range }: { kr: MeasuredKr; ccy: string; range?: string }) {
  if (kr.source === 'manual') return <div><span className="num">{krFmt(kr.current, kr.unit, ccy)}</span><div className="text-2xs text-muted">manual entry</div></div>;
  if (!kr.measured) return <div><span className="text-muted">not measured</span><div className="text-2xs text-warn">no current monthly result for {kr.kpi_code}</div></div>;
  const m = kr.measured;
  return (
    <div>
      <div className="flex items-center gap-1.5"><span className="num font-medium">{krFmt(m.value, kr.unit, ccy)}</span><ConfidenceBadge value={m.confidence} note={m.status_note} /></div>
      <div className="text-2xs text-muted">
        {m.period_start.slice(0, 7)} · run <Link className="link" href={`/formula-audit?run=${m.calc_run_id}`}>{m.calc_run_id.slice(0, 8)}</Link> · <Link className="link" href={`/proof/kpi/${encodeURIComponent(m.code)}${range ? `?range=${encodeURIComponent(range)}` : ''}`}>proof</Link>
      </div>
    </div>
  );
}

function Field({ label: l, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`block ${wide ? 'sm:col-span-2 lg:col-span-3' : ''}`}><span className="label">{l}</span>{children}</label>;
}
function UserSelect({ name, users, value, required }: { name: string; users: UserOpt[]; value?: string | null; required?: boolean }) {
  return <select name={name} className="input" defaultValue={value ?? ''} required={required}><option value="">— Unassigned —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role_code})</option>)}</select>;
}
function Enum({ name, values, value, required }: { name: string; values: readonly string[]; value?: string | null; required?: boolean }) {
  return <select name={name} className="input" defaultValue={value ?? values[0]} required={required}>{values.map((v) => <option key={v} value={v}>{label(v)}</option>)}</select>;
}
function KpiSelect({ name, kpis, value, emptyLabel = '— none —' }: { name: string; kpis: Options['kpis']; value?: string | null; emptyLabel?: string }) {
  return <select name={name} className="input" defaultValue={value ?? ''}><option value="">{emptyLabel}</option>{kpis.map((k) => <option key={k.code} value={k.code}>{k.code} — {k.name} ({k.unit})</option>)}</select>;
}
export function Disclosure({ summary, children, open, className = '' }: { summary: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  return (
    <details className={`no-print group ${className}`} open={open}>
      <summary className="cursor-pointer select-none text-xs font-medium text-info hover:underline">{summary}</summary>
      <div className="mt-2 rounded-md border border-border bg-surface-2 p-3">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------------------
export function ObjectiveForm({ o, users, returnTo, defaultFy }: { o?: Objective; users: UserOpt[]; returnTo: string; defaultFy: number }) {
  return (
    <form action={saveObjective} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="returnTo" value={returnTo} />
      {o && <input type="hidden" name="id" value={o.id} />}
      <Field label="Title"><input name="title" className="input" required minLength={3} maxLength={200} defaultValue={o?.title} /></Field>
      <Field label="Theme"><Enum name="theme" values={THEMES} value={o?.theme} /></Field>
      <Field label="Fiscal year"><input name="fiscal_year" type="number" min={2000} max={2100} className="input" required defaultValue={o?.fiscal_year ?? defaultFy} /></Field>
      <Field label="Owner"><UserSelect name="owner_user_id" users={users} value={o?.owner_user_id} /></Field>
      <Field label="Status"><Enum name="status" values={OBJECTIVE_STATUSES} value={o?.status ?? 'active'} /></Field>
      <Field label="Description" wide><textarea name="description" className="input" rows={2} maxLength={2000} defaultValue={o?.description ?? ''} /></Field>
      <div><SubmitButton>{o ? 'Save objective' : 'Create objective'}</SubmitButton></div>
    </form>
  );
}

export function KeyResultForm({ kr, objectiveId, kpis, returnTo, defaultQuarter }: { kr?: KeyResult; objectiveId: string; kpis: Options['kpis']; returnTo: string; defaultQuarter: string }) {
  return (
    <form action={saveKeyResult} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="objective_id" value={objectiveId} />
      {kr && <input type="hidden" name="id" value={kr.id} />}
      <Field label="Key result"><input name="title" className="input" required minLength={3} maxLength={200} defaultValue={kr?.title} /></Field>
      <Field label="Quarter (e.g. 2026-Q4)"><input name="quarter" className="input" required pattern="\d{4}-Q[1-4]" defaultValue={kr?.quarter ?? defaultQuarter} /></Field>
      <Field label="Linked KPI (measured automatically)"><KpiSelect name="kpi_code" kpis={kpis} value={kr?.kpi_code} emptyLabel="— manual measurement —" /></Field>
      <Field label="Unit (ignored when a KPI is linked)"><Enum name="unit" values={KR_UNITS} value={kr?.unit ?? 'count'} /></Field>
      <Field label="Baseline"><input name="baseline" className="input" inputMode="decimal" defaultValue={kr?.baseline ? stripZeros(kr.baseline) : ''} /></Field>
      <Field label="Target"><input name="target" className="input" inputMode="decimal" required defaultValue={kr?.target ? stripZeros(kr.target) : ''} /></Field>
      <Field label="Current (manual key results only)"><input name="current_value" className="input" inputMode="decimal" defaultValue={kr?.current_value ? stripZeros(kr.current_value) : ''} /></Field>
      <div className="flex items-end"><SubmitButton>{kr ? 'Save key result' : 'Add key result'}</SubmitButton></div>
      <p className="text-2xs text-muted sm:col-span-2 lg:col-span-4">Percent values are fractions (0.96 = 96 %); bps as basis points; money in the base currency.</p>
    </form>
  );
}
export function DeleteKrButton({ id, returnTo }: { id: string; returnTo: string }) {
  return <form action={deleteKeyResult}><input type="hidden" name="id" value={id} /><input type="hidden" name="returnTo" value={returnTo} /><SubmitButton className="btn-danger py-1 text-xs" pendingLabel="Removing…" confirm="Remove this key result?">Remove</SubmitButton></form>;
}
export const stripZeros = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);

export function InitiativeForm({ i, o, returnTo }: { i?: EnrichedInitiative; o: Options; returnTo: string }) {
  const others = o.initiatives.filter((x) => x.id !== i?.id);
  return (
    <form action={saveInitiative} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="returnTo" value={returnTo} />
      {i && <input type="hidden" name="id" value={i.id} />}
      <Field label="Title"><input name="title" className="input" required minLength={3} maxLength={200} defaultValue={i?.title} /></Field>
      <Field label="Objective"><select name="objective_id" className="input" defaultValue={i?.objective_id ?? ''}><option value="">— none —</option>{o.objectives.map((x) => <option key={x.id} value={x.id}>{x.code} — {x.title}</option>)}</select></Field>
      <Field label="Owner"><UserSelect name="owner_user_id" users={o.users} value={i?.owner_user_id} /></Field>
      <Field label="Department"><select name="department" className="input" defaultValue={i?.department ?? ''}><option value="">— none —</option>{o.departments.map((d) => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}</select></Field>
      <Field label="Status"><Enum name="status" values={INITIATIVE_STATUSES} value={i?.status ?? 'not_started'} /></Field>
      <Field label="Progress %"><input name="progress_pct" type="number" min={0} max={100} className="input" defaultValue={i?.progress_pct ?? 0} /></Field>
      <Field label="Budget (base currency)"><input name="budget_base" className="input" inputMode="decimal" defaultValue={i ? stripZeros(i.budget_base) : '0'} /></Field>
      <Field label="Spent to date"><input name="spent_base" className="input" inputMode="decimal" defaultValue={i ? stripZeros(i.spent_base) : '0'} /></Field>
      <Field label="Deadline"><input name="deadline" type="date" className="input" defaultValue={i?.deadline ?? ''} /></Field>
      <Field label="Target"><input name="target" className="input" maxLength={300} defaultValue={i?.target ?? ''} /></Field>
      <Field label="Linked KPI"><KpiSelect name="kpi_code" kpis={o.kpis} value={i?.kpi_code} /></Field>
      <Field label="Risk level"><Enum name="risk_level" values={RISK_LEVELS} value={i?.risk_level ?? 'medium'} /></Field>
      <Field label="Linked decision"><select name="decision_id" className="input" defaultValue={i?.decision_id ?? ''}><option value="">— none —</option>{o.decisions.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.title} ({label(d.status)})</option>)}</select></Field>
      <Field label="Expected business impact"><input name="expected_impact" className="input" maxLength={1000} defaultValue={i?.expected_impact ?? ''} /></Field>
      <Field label="Next action"><input name="next_action" className="input" maxLength={500} defaultValue={i?.next_action ?? ''} /></Field>
      <Field label="Blockers (required when blocked)" wide><textarea name="blockers" className="input" rows={2} maxLength={2000} defaultValue={i?.blockers ?? ''} /></Field>
      <Field label="Description" wide><textarea name="description" className="input" rows={2} maxLength={4000} defaultValue={i?.description ?? ''} /></Field>
      <fieldset className="sm:col-span-2 lg:col-span-3">
        <legend className="label">Depends on (other initiatives)</legend>
        {others.length === 0 ? <p className="text-xs text-muted">No other initiatives.</p> : (
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((x) => <label key={x.id} className="flex items-center gap-2 text-xs"><input type="checkbox" name="depends_on" value={x.id} defaultChecked={i?.depends_on.includes(x.id)} /> {x.code} — {x.title} <StatusBadge status={x.status} /></label>)}
          </div>
        )}
      </fieldset>
      <div><SubmitButton>{i ? 'Save initiative' : 'Create initiative'}</SubmitButton></div>
    </form>
  );
}

export function UpdateForm({ i, returnTo, compact }: { i: { id: string; code: string; status: string; progress_pct: number; blockers: string | null; next_action: string | null; spent_base?: string }; returnTo: string; compact?: boolean }) {
  return (
    <form action={postInitiativeUpdate} className={`grid gap-2 ${compact ? 'sm:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="initiative_id" value={i.id} />
      <Field label="Status"><Enum name="status" values={INITIATIVE_STATUSES} value={i.status} /></Field>
      <Field label="Progress %"><input name="progress_pct" type="number" min={0} max={100} className="input" defaultValue={i.progress_pct} required /></Field>
      {!compact && <Field label="Spent to date (optional)"><input name="spent_base" className="input" inputMode="decimal" placeholder={i.spent_base ? stripZeros(i.spent_base) : ''} /></Field>}
      <Field label="Next action"><input name="next_action" className="input" maxLength={500} defaultValue={i.next_action ?? ''} /></Field>
      <Field label="Blockers"><input name="blockers" className="input" maxLength={2000} defaultValue={i.blockers ?? ''} /></Field>
      <label className={`block ${compact ? 'sm:col-span-3' : 'sm:col-span-2 lg:col-span-3'}`}><span className="label">Update note</span><textarea name="note" className="input" rows={compact ? 1 : 2} required minLength={3} maxLength={4000} placeholder={`What changed on ${i.code} this week?`} /></label>
      <div className="flex items-end"><SubmitButton pendingLabel="Posting…">Post update</SubmitButton></div>
    </form>
  );
}

export function NewActionForm({ o, returnTo, preset }: { o: Options; returnTo: string; preset?: { source_type: string; source_id?: string } }) {
  return (
    <form action={createAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="block lg:col-span-2"><span className="label">Action</span><input name="title" className="input" required minLength={3} maxLength={300} /></label>
      <Field label="Owner"><UserSelect name="owner_user_id" users={o.users} required /></Field>
      <Field label="Due date"><input name="due_date" type="date" className="input" required /></Field>
      {preset?.source_id ? (<>
        <input type="hidden" name="source_type" value={preset.source_type} /><input type="hidden" name="source_id" value={preset.source_id} />
      </>) : (<>
        <Field label="Source"><Enum name="source_type" values={SOURCE_TYPES} value={preset?.source_type ?? 'war_room'} /></Field>
        <Field label="Linked initiative / decision"><select name="source_id" className="input" defaultValue=""><option value="">— none —</option>
          <optgroup label="Initiatives (source = initiative)">{o.initiatives.map((x) => <option key={x.id} value={x.id}>{x.code} — {x.title}</option>)}</optgroup>
          <optgroup label="Decisions (source = decision)">{o.decisions.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.title}</option>)}</optgroup>
        </select></Field>
      </>)}
      <div className="flex items-end"><SubmitButton pendingLabel="Creating…">Create action</SubmitButton></div>
    </form>
  );
}

export function ActionStatusButtons({ a, returnTo, quick }: { a: ActionItem; returnTo: string; quick?: boolean }) {
  const allowed = allowedActionTransitions(a.status).filter((s) => !quick || s === 'done' || s === 'in_progress');
  return (
    <div className="no-print flex flex-wrap gap-1">
      {allowed.map((s) => (
        <form key={s} action={setActionStatus}>
          <input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value={s} /><input type="hidden" name="returnTo" value={returnTo} />
          <SubmitButton className={`btn py-0.5 text-2xs ${s === 'done' ? 'border-pos/40 text-pos' : s === 'cancelled' ? 'text-muted' : ''}`} pendingLabel="…">{s === 'done' ? 'Mark done' : s === 'open' && (a.status === 'done' || a.status === 'cancelled') ? 'Reopen' : label(s)}</SubmitButton>
        </form>
      ))}
    </div>
  );
}

export function EditActionForm({ a, users, returnTo }: { a: ActionItem; users: UserOpt[]; returnTo: string }) {
  return (
    <form action={updateAction} className="grid gap-2 sm:grid-cols-4">
      <input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="id" value={a.id} />
      <label className="block sm:col-span-2"><span className="label">Action</span><input name="title" className="input" required minLength={3} maxLength={300} defaultValue={a.title} /></label>
      <Field label="Owner"><UserSelect name="owner_user_id" users={users} value={a.owner_user_id} /></Field>
      <Field label="Due date"><input name="due_date" type="date" className="input" defaultValue={a.due_date ?? ''} /></Field>
      <div><SubmitButton>Save</SubmitButton></div>
    </form>
  );
}

export function ActionTable({ actions, users, returnTo, canManage, quick }: { actions: ActionItem[]; users: UserOpt[]; returnTo: string; canManage: boolean; quick?: boolean }) {
  if (!actions.length) return <p className="px-4 py-6 text-center text-sm text-muted">No actions.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead><tr><th className="th">Code</th><th className="th">Action</th><th className="th">Source</th><th className="th">Owner</th><th className="th">Due</th><th className="th">Status</th>{canManage && <th className="th no-print">Update</th>}</tr></thead>
        <tbody>
          {actions.map((a) => (
            <tr key={a.id} className="align-top hover:bg-surface-2">
              <td className="td whitespace-nowrap font-mono text-xs">{a.code}</td>
              <td className="td">
                <div>{a.title}</div>
                {canManage && !quick && <Disclosure summary="Edit / reassign" className="mt-1"><EditActionForm a={a} users={users} returnTo={returnTo} /></Disclosure>}
              </td>
              <td className="td text-xs">{label(a.source_type)}{a.source_label && <div>{a.source_href ? <Link className="link" href={a.source_href}>{a.source_label}</Link> : a.source_label}</div>}</td>
              <td className="td text-xs">{a.owner_name ?? <span className="text-warn">unassigned</span>}</td>
              <td className="td whitespace-nowrap text-xs">{a.due_date ?? '—'}{a.overdue && <div><Badge tone="neg">overdue</Badge></div>}</td>
              <td className="td"><StatusBadge status={a.status} />{a.completed_at && <div className="text-2xs text-muted">{a.completed_at.slice(0, 10)}</div>}</td>
              {canManage && <td className="td"><ActionStatusButtons a={a} returnTo={returnTo} quick={quick} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DependencyList({ i }: { i: EnrichedInitiative }) {
  if (!i.dep.deps.length) return <span className="text-xs text-muted">none</span>;
  return (
    <ul className="space-y-0.5 text-xs">
      {i.dep.deps.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-1.5">
          <Link className="link" href={`/strategy/initiatives/${d.id}`}>{d.code}</Link> <StatusBadge status={d.status} />
          {d.deadline && <span className="text-muted">due {d.deadline}</span>}
          {d.issue && <span className={d.blocking ? 'text-neg' : 'text-warn'}>— {d.issue}</span>}
        </li>
      ))}
    </ul>
  );
}
