/**
 * Strategy execution service: objectives, key results (automatically measured
 * from the KPI engine when linked to a KPI), initiatives with dependencies,
 * progress updates, the executive action register and the weekly War Room.
 *
 * Pure functions (progress, status, dependencies, transitions, week bounds,
 * code sequencing) are exported for unit testing (tests/unit/strategy.test.ts).
 */
import type { Tx } from '../db';
import { q, one } from '../db';
import { dec, safeDiv } from '../money';
import { addDays, daysBetween, monthEnd, monthStart, weekStart } from '../dates';
import { ensureRun } from './kpi';

// ---------------------------------------------------------------------------
// Catalogues (mirror DB CHECK constraints in 004_kpi_proof_strategy.sql)
// ---------------------------------------------------------------------------
export const THEMES = ['merchant_acquisition', 'onboarding_automation', 'platform_stability', 'merchant_experience', 'acceptance_expansion', 'revenue_diversification', 'profitability'] as const;
export const OBJECTIVE_STATUSES = ['active', 'achieved', 'missed', 'dropped'] as const;
export const INITIATIVE_STATUSES = ['not_started', 'on_track', 'at_risk', 'blocked', 'done', 'cancelled'] as const;
export const ACTION_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;
export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export const SOURCE_TYPES = ['decision', 'initiative', 'war_room', 'briefing', 'reconciliation', 'other'] as const;
export const KR_UNITS = ['money', 'percent', 'count', 'ratio', 'days', 'bps', 'months'] as const;
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export type Direction = 'up' | 'down' | 'neutral';

export const label = (s: string) => s.replace(/_/g, ' ');

// ---------------------------------------------------------------------------
// Key-result progress (direction aware, decimal-safe)
// ---------------------------------------------------------------------------
export interface KrProgressInput { baseline: string | null; target: string; current: string | null; direction?: Direction | null }
export interface KrProgress {
  /** 0..100, one decimal, null when there is no current value */
  pct: string | null;
  /** unclamped percentage (may be < 0 when moving away from target, > 100 when exceeded) */
  rawPct: string | null;
  direction: 'up' | 'down';
  /** improve: baseline → target path; threshold: hold/reach a floor (up) or ceiling (down) */
  mode: 'improve' | 'threshold';
  achieved: boolean;
}

/** Direction of "better". Neutral/unknown KPIs infer it from baseline → target. */
export function effectiveDirection(direction: Direction | null | undefined, baseline: string | null, target: string): 'up' | 'down' {
  if (direction === 'up' || direction === 'down') return direction;
  if (baseline !== null && baseline !== '' && dec(target).lt(dec(baseline))) return 'down';
  return 'up';
}

export function krProgress(i: KrProgressInput): KrProgress {
  const dir = effectiveDirection(i.direction, i.baseline, i.target);
  const hasBase = i.baseline !== null && i.baseline !== '';
  const target = dec(i.target);
  const improving = hasBase && (dir === 'up' ? target.gt(dec(i.baseline!)) : target.lt(dec(i.baseline!)));
  const mode: KrProgress['mode'] = improving ? 'improve' : 'threshold';
  if (i.current === null || i.current === '') return { pct: null, rawPct: null, direction: dir, mode, achieved: false };
  const cur = dec(i.current);
  const achieved = dir === 'up' ? cur.gte(target) : cur.lte(target);
  let raw;
  if (mode === 'improve') {
    const base = dec(i.baseline!);
    raw = cur.minus(base).div(target.minus(base)).times(100);
  } else if (achieved) {
    raw = dec(100);
  } else if (dir === 'up') {
    raw = (safeDiv(cur, target) ?? dec(0)).times(100);
  } else {
    raw = cur.isZero() ? dec(0) : (safeDiv(target, cur) ?? dec(0)).times(100);
  }
  const clamped = raw.lt(0) ? dec(0) : raw.gt(100) ? dec(100) : raw;
  return { pct: clamped.toDecimalPlaces(1).toFixed(1), rawPct: raw.toDecimalPlaces(2).toFixed(2), direction: dir, mode, achieved };
}

export type KrStatus = 'achieved' | 'on_track' | 'at_risk' | 'off_track' | 'no_data';
/** Status vs target given the elapsed share (0..1) of the key-result quarter. */
export function krStatus(p: KrProgress, elapsed: number): KrStatus {
  if (p.pct === null) return 'no_data';
  if (p.achieved) return 'achieved';
  const pct = Number(p.pct); // presentation threshold on a 0..100 percentage, not money
  const expected = Math.max(0, Math.min(1, elapsed)) * 100;
  if (pct >= expected - 10) return 'on_track';
  if (pct >= expected - 30) return 'at_risk';
  return 'off_track';
}

/** '2026-Q4' → { start: '2026-10-01', end: '2026-12-31' } */
export function quarterBounds(quarter: string): { start: string; end: string } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!m) return null;
  const sm = (Number(m[2]) - 1) * 3 + 1;
  const start = `${m[1]}-${String(sm).padStart(2, '0')}-01`;
  return { start, end: monthEnd(`${m[1]}-${String(sm + 2).padStart(2, '0')}-01`) };
}
export function elapsedFraction(start: string, end: string, today: string): number {
  const total = daysBetween(start, end) + 1;
  const done = daysBetween(start, today) + 1;
  return Math.max(0, Math.min(1, done / total));
}

// ---------------------------------------------------------------------------
// Initiative dependencies
// ---------------------------------------------------------------------------
export interface DepNode { id: string; code: string; title: string; status: string; deadline: string | null; depends_on: string[] }
export interface DepInfo { id: string; code: string; title: string; status: string; deadline: string | null; issue: string | null; blocking: boolean }
export interface DependencyState { deps: DepInfo[]; blockedByDependency: boolean; warnings: string[] }

export function dependencyState(node: DepNode, byId: Map<string, DepNode>): DependencyState {
  const deps: DepInfo[] = []; const warnings: string[] = [];
  for (const id of node.depends_on ?? []) {
    const d = byId.get(id);
    if (!d) { deps.push({ id, code: '?', title: 'Missing initiative', status: 'missing', deadline: null, issue: 'dependency no longer exists', blocking: true }); continue; }
    let issue: string | null = null; let blocking = false;
    if (d.status === 'done') { /* satisfied */ }
    else if (d.status === 'blocked') { issue = `${d.code} is blocked`; blocking = true; }
    else if (d.status === 'cancelled') { issue = `${d.code} was cancelled`; blocking = true; }
    else if (node.deadline && d.deadline && d.deadline > node.deadline) { issue = `${d.code} deadline ${d.deadline} is after this deadline ${node.deadline}`; blocking = true; }
    else if (d.status === 'at_risk') { issue = `${d.code} is at risk`; }
    else if (!d.deadline) { issue = `${d.code} has no deadline`; }
    if (issue && !blocking) warnings.push(issue);
    deps.push({ id: d.id, code: d.code, title: d.title, status: d.status, deadline: d.deadline, issue, blocking });
  }
  return { deps, blockedByDependency: deps.some((d) => d.blocking), warnings };
}

/** True if making `id` depend on `newDeps` would create a dependency cycle (incl. self). */
export function wouldCreateCycle(id: string, newDeps: string[], byId: Map<string, { depends_on: string[] }>): boolean {
  const seen = new Set<string>(); const stack = [...newDeps];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === id) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of byId.get(cur)?.depends_on ?? []) stack.push(n);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Actions, deadlines, weeks, codes
// ---------------------------------------------------------------------------
const TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  open: ['in_progress', 'done', 'cancelled'],
  in_progress: ['open', 'done', 'cancelled'],
  done: ['open'],          // reopen
  cancelled: ['open'],     // reinstate
};
export function canTransitionAction(from: string, to: string): boolean {
  return (TRANSITIONS as Record<string, string[]>)[from]?.includes(to) ?? false;
}
export function allowedActionTransitions(from: string): ActionStatus[] { return (TRANSITIONS as Record<string, ActionStatus[]>)[from] ?? []; }

export function isOverdue(due: string | null, status: string, today: string): boolean {
  return Boolean(due) && due! < today && (status === 'open' || status === 'in_progress');
}
export function initiativeOverdue(deadline: string | null, status: string, today: string): boolean {
  return Boolean(deadline) && deadline! < today && status !== 'done' && status !== 'cancelled';
}

/** ISO week (Monday..Sunday) containing the given date; invalid input → week of today. */
export function weekBounds(input: string | null | undefined, today: string): { start: string; end: string } {
  const valid = typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input) && !Number.isNaN(Date.parse(`${input}T00:00:00Z`));
  const start = weekStart(valid ? input! : today);
  return { start, end: addDays(start, 6) };
}

/** Next sequential code, e.g. nextCode('ACT-', ['ACT-0001','ACT-0003'], 4) → 'ACT-0004'. */
export function nextCode(prefix: string, existing: string[], width: number): string {
  let max = 0;
  for (const c of existing) {
    if (!c.startsWith(prefix)) continue;
    const n = Number(c.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}

/** War Room ordering: blocked, dependency-blocked, at risk, overdue, then by deadline. */
export function attentionRank(i: { status: string; blockedByDependency: boolean; overdue: boolean; risk_level: string }): number {
  if (i.status === 'blocked') return 0;
  if (i.blockedByDependency) return 1;
  if (i.status === 'at_risk') return 2;
  if (i.overdue) return 3;
  if (i.risk_level === 'high') return 4;
  return 5;
}
export function needsAttention(i: { status: string; blockedByDependency: boolean; overdue: boolean }): boolean {
  return i.status === 'blocked' || i.status === 'at_risk' || i.blockedByDependency || i.overdue;
}

/** Budget utilisation (spent / budget) as a fraction string; null when no budget. */
export function budgetUse(budget: string, spent: string): string | null {
  const r = safeDiv(spent, budget);
  return r ? r.toDecimalPlaces(4).toString() : null;
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------
export interface UserOpt { id: string; name: string; email: string; role_code: string }
export interface Objective { id: string; code: string; title: string; description: string | null; theme: string; fiscal_year: number; owner_user_id: string | null; owner_name: string | null; status: string }
export interface KeyResult { id: string; objective_id: string; title: string; kpi_code: string | null; quarter: string; baseline: string | null; target: string; current_value: string | null; unit: string }
export interface Measurement { code: string; name: string; unit: string; direction: Direction; value: string | null; confidence: string; period_start: string; period_end: string; calc_run_id: string; status_note: string | null; computed_at: string }
export interface MeasuredKr extends KeyResult { measured: Measurement | null; current: string | null; source: 'kpi' | 'manual'; progress: KrProgress; status: KrStatus; elapsed: number; kpiMissing: boolean }
export interface Initiative {
  id: string; code: string; objective_id: string | null; objective_code: string | null; decision_id: string | null; decision_code: string | null; decision_title: string | null; decision_status: string | null;
  title: string; description: string | null; owner_user_id: string | null; owner_name: string | null; department: string | null; budget_base: string; spent_base: string; target: string | null; kpi_code: string | null;
  deadline: string | null; status: string; progress_pct: number; blockers: string | null; next_action: string | null; expected_impact: string | null; depends_on: string[]; risk_level: string; updated_at: string; created_at: string;
}
export interface EnrichedInitiative extends Initiative { dep: DependencyState; overdue: boolean; budgetUse: string | null; lastUpdateAt: string | null }
export interface ActionItem { id: string; code: string; title: string; source_type: string; source_id: string | null; source_label: string | null; source_href: string | null; owner_user_id: string | null; owner_name: string | null; due_date: string | null; status: string; created_by_name: string | null; created_at: string; completed_at: string | null; overdue: boolean }

export async function tenantUsers(t: Tx): Promise<UserOpt[]> {
  return q<UserOpt>(t, `SELECT u.id, u.name, u.email, r.code AS role_code FROM memberships m JOIN users u ON u.id = m.user_id JOIN roles r ON r.id = m.role_id
    WHERE m.is_active AND u.is_active ORDER BY u.name`);
}
export async function kpiOptions(t: Tx) {
  return q<{ code: string; name: string; unit: string; direction: Direction }>(t, `SELECT code, name, unit, direction FROM kpi_definitions WHERE is_active ORDER BY code`);
}
export async function departmentOptions(t: Tx) { return q<{ code: string; name: string }>(t, `SELECT code, name FROM departments ORDER BY code`); }
export async function decisionOptions(t: Tx) { return q<{ id: string; code: string; title: string; status: string }>(t, `SELECT id, code, title, status FROM executive_decisions ORDER BY code DESC`); }

export async function listObjectives(t: Tx, fy?: number | null): Promise<Objective[]> {
  return q<Objective>(t, `SELECT o.id, o.code, o.title, o.description, o.theme, o.fiscal_year, o.owner_user_id, u.name AS owner_name, o.status
    FROM strategic_objectives o LEFT JOIN users u ON u.id = o.owner_user_id WHERE ($1::int IS NULL OR o.fiscal_year = $1) ORDER BY length(o.code), o.code`, [fy ?? null]);
}
export async function fiscalYears(t: Tx): Promise<number[]> {
  return (await q<{ fy: number }>(t, `SELECT DISTINCT fiscal_year AS fy FROM strategic_objectives ORDER BY 1`)).map((r) => r.fy);
}

export async function listKeyResults(t: Tx, objectiveIds?: string[]): Promise<KeyResult[]> {
  return q<KeyResult>(t, `SELECT id, objective_id, title, kpi_code, quarter, baseline::text, target::text, current_value::text, unit FROM key_results
    WHERE ($1::uuid[] IS NULL OR objective_id = ANY($1)) ORDER BY quarter, title`, [objectiveIds ?? null]);
}

/**
 * Latest current monthly KPI result (dimension 'total') per code. The latest
 * month's calculation run is first refreshed through the KPI service
 * (ensureRun recalculates only if inputs changed since it ran).
 */
export async function measureKpis(t: Tx, ctx: { tenantId: string; userId: string | null }, codes: string[], today: string): Promise<Map<string, Measurement>> {
  const uniq = [...new Set(codes.filter(Boolean))];
  const out = new Map<string, Measurement>();
  if (!uniq.length) return out;
  const latest = await one<{ p: string }>(t, `SELECT max(period)::text AS p FROM financial_periods WHERE period <= $1`, [today]);
  if (latest?.p) {
    const start = monthStart(latest.p);
    await ensureRun(t, { tenantId: ctx.tenantId, userId: ctx.userId, start, end: monthEnd(start), reason: 'strategy key-result measurement' });
  }
  const rows = await q<Measurement>(t, `SELECT DISTINCT ON (d.code) d.code, d.name, d.unit, d.direction, r.value::text AS value, r.confidence, r.period_start, r.period_end, r.calc_run_id, r.status_note, r.computed_at::text AS computed_at
    FROM kpi_results r JOIN kpi_definitions d ON d.id = r.kpi_id
    WHERE r.is_current AND r.dimension = 'total' AND d.code = ANY($1)
      AND r.period_start = date_trunc('month', r.period_start)::date
      AND r.period_end = (date_trunc('month', r.period_start) + interval '1 month - 1 day')::date
      AND r.period_start <= $2
    ORDER BY d.code, r.period_start DESC, r.computed_at DESC`, [uniq, today]);
  for (const r of rows) out.set(r.code, r);
  return out;
}

export function measureKr(kr: KeyResult, m: Measurement | null | undefined, today: string, kpiDirection?: Direction | null): MeasuredKr {
  const measured = kr.kpi_code ? m ?? null : null;
  const current = kr.kpi_code ? measured?.value ?? null : kr.current_value;
  const progress = krProgress({ baseline: kr.baseline, target: kr.target, current, direction: kr.kpi_code ? (measured?.direction ?? kpiDirection ?? null) : null });
  const qb = quarterBounds(kr.quarter);
  const elapsed = qb ? elapsedFraction(qb.start, qb.end, today) : 1;
  return { ...kr, measured, current, source: kr.kpi_code ? 'kpi' : 'manual', progress, status: krStatus(progress, elapsed), elapsed, kpiMissing: Boolean(kr.kpi_code) && !measured };
}

const INITIATIVE_SQL = `SELECT i.id, i.code, i.objective_id, o.code AS objective_code, i.decision_id, d.code AS decision_code, d.title AS decision_title, d.status AS decision_status,
    i.title, i.description, i.owner_user_id, u.name AS owner_name, i.department, i.budget_base::text, i.spent_base::text, i.target, i.kpi_code, i.deadline, i.status, i.progress_pct,
    i.blockers, i.next_action, i.expected_impact, i.depends_on::text[] AS depends_on, i.risk_level, i.updated_at::text, i.created_at::text,
    (SELECT max(created_at)::text FROM initiative_updates x WHERE x.initiative_id = i.id) AS last_update_at
  FROM initiatives i LEFT JOIN strategic_objectives o ON o.id = i.objective_id LEFT JOIN executive_decisions d ON d.id = i.decision_id LEFT JOIN users u ON u.id = i.owner_user_id`;

export async function listInitiatives(t: Tx, today: string): Promise<EnrichedInitiative[]> {
  const rows = await q<Initiative & { last_update_at: string | null }>(t, `${INITIATIVE_SQL} ORDER BY length(i.code), i.code`);
  return enrich(rows, today);
}
export function enrich(rows: (Initiative & { last_update_at?: string | null })[], today: string): EnrichedInitiative[] {
  const byId = new Map<string, DepNode>(rows.map((r) => [r.id, { id: r.id, code: r.code, title: r.title, status: r.status, deadline: r.deadline, depends_on: r.depends_on ?? [] }]));
  return rows.map((r) => ({ ...r, depends_on: r.depends_on ?? [], dep: dependencyState(byId.get(r.id)!, byId), overdue: initiativeOverdue(r.deadline, r.status, today), budgetUse: budgetUse(r.budget_base, r.spent_base), lastUpdateAt: r.last_update_at ?? null }));
}

export async function initiativeUpdates(t: Tx, initiativeId: string | null, from?: string, to?: string) {
  return q<{ id: string; initiative_id: string; initiative_code: string; initiative_title: string; status: string; progress_pct: number; note: string; author_name: string | null; created_at: string }>(t,
    `SELECT x.id, x.initiative_id, i.code AS initiative_code, i.title AS initiative_title, x.status, x.progress_pct, x.note, u.name AS author_name, x.created_at::text
     FROM initiative_updates x JOIN initiatives i ON i.id = x.initiative_id LEFT JOIN users u ON u.id = x.author_id
     WHERE ($1::uuid IS NULL OR x.initiative_id = $1) AND ($2::date IS NULL OR x.created_at >= $2::date) AND ($3::date IS NULL OR x.created_at < ($3::date + 1))
     ORDER BY x.created_at DESC LIMIT 500`, [initiativeId, from ?? null, to ?? null]);
}

export async function listActions(t: Tx, today: string, filter: { sourceType?: string; sourceId?: string } = {}): Promise<ActionItem[]> {
  const rows = await q<Omit<ActionItem, 'overdue' | 'source_href'> & { src_init_code: string | null; src_dec_code: string | null }>(t,
    `SELECT a.id, a.code, a.title, a.source_type, a.source_id, a.owner_user_id, u.name AS owner_name, a.due_date, a.status, c.name AS created_by_name, a.created_at::text, a.completed_at::text,
       i.code AS src_init_code, d.code AS src_dec_code, coalesce(i.code || ' ' || i.title, d.code || ' ' || d.title) AS source_label
     FROM action_items a LEFT JOIN users u ON u.id = a.owner_user_id LEFT JOIN users c ON c.id = a.created_by
       LEFT JOIN initiatives i ON a.source_type = 'initiative' AND i.id = a.source_id
       LEFT JOIN executive_decisions d ON a.source_type = 'decision' AND d.id = a.source_id
     WHERE ($1::text IS NULL OR a.source_type = $1) AND ($2::uuid IS NULL OR a.source_id = $2)
     ORDER BY (a.status IN ('done','cancelled')), a.due_date NULLS LAST, a.code`, [filter.sourceType ?? null, filter.sourceId ?? null]);
  return rows.map(({ src_init_code, src_dec_code, ...a }) => ({
    ...a,
    source_href: a.source_type === 'initiative' && src_init_code ? `/strategy/initiatives/${a.source_id}` : a.source_type === 'decision' && src_dec_code ? `/decisions/${a.source_id}` : null,
    overdue: isOverdue(a.due_date, a.status, today),
  }));
}

/** Everything the weekly War Room shows, for the week [start, end]. */
export async function warRoom(t: Tx, ctx: { tenantId: string; userId: string | null }, week: { start: string; end: string }, today: string) {
  const initiatives = await listInitiatives(t, today);
  const attention = initiatives.filter((i) => i.status !== 'done' && i.status !== 'cancelled')
    .map((i) => ({ ...i, rank: attentionRank({ status: i.status, blockedByDependency: i.dep.blockedByDependency, overdue: i.overdue, risk_level: i.risk_level }), flagged: needsAttention({ status: i.status, blockedByDependency: i.dep.blockedByDependency, overdue: i.overdue }) }))
    .sort((a, b) => a.rank - b.rank || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
  const actions = await listActions(t, today);
  const live = actions.filter((a) => a.status === 'open' || a.status === 'in_progress');
  const overdue = live.filter((a) => a.due_date && a.due_date < week.start);
  const dueThisWeek = live.filter((a) => a.due_date && a.due_date >= week.start && a.due_date <= week.end);
  const completedThisWeek = actions.filter((a) => a.status === 'done' && a.completed_at && a.completed_at.slice(0, 10) >= week.start && a.completed_at.slice(0, 10) <= week.end);
  const decisions = await q<{ id: string; code: string; title: string; status: string; implementation_deadline: string | null; owner_name: string | null; approved_at: string | null; initiatives: number }>(t,
    `SELECT d.id, d.code, d.title, d.status, d.implementation_deadline, u.name AS owner_name, d.approved_at::text, (SELECT count(*)::int FROM initiatives i WHERE i.decision_id = d.id) AS initiatives
     FROM executive_decisions d LEFT JOIN users u ON u.id = d.owner_user_id WHERE d.status IN ('approved','in_progress') ORDER BY d.implementation_deadline NULLS LAST, d.code`);
  const krs = await listKeyResults(t);
  const objectives = await listObjectives(t, null);
  const objById = new Map(objectives.map((o) => [o.id, o]));
  const linked = krs.filter((k) => k.kpi_code && objById.get(k.objective_id)?.status === 'active');
  const meas = await measureKpis(t, ctx, linked.map((k) => k.kpi_code!), today);
  const kpis = linked.map((k) => ({ ...measureKr(k, meas.get(k.kpi_code!), today), objective_code: objById.get(k.objective_id)?.code ?? '' }));
  const updates = await initiativeUpdates(t, null, addDays(week.start, -7), week.end);
  return { attention, overdue, dueThisWeek, completedThisWeek, decisions, kpis, updates, initiatives };
}

/** Select options used by the strategy forms. */
export async function strategyOptions(t: Tx) {
  const [users, kpis, departments, decisions, objectives, initiatives] = await Promise.all([
    tenantUsers(t), kpiOptions(t), departmentOptions(t), decisionOptions(t),
    q<{ id: string; code: string; title: string }>(t, `SELECT id, code, title FROM strategic_objectives ORDER BY length(code), code`),
    q<{ id: string; code: string; title: string; status: string }>(t, `SELECT id, code, title, status FROM initiatives ORDER BY length(code), code`),
  ]);
  return { users, kpis, departments, decisions, objectives, initiatives };
}
