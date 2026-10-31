'use server';
/**
 * Strategy execution mutations. Every action: permission check (strategy.manage),
 * zod validation, tenant transaction, audit event, revalidate + flash redirect.
 */
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { requireAuth, tctx, type AuthContext } from '@/lib/auth/session';
import { withTenant, one, q, type Tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { todayISO } from '@/lib/period';
import { dec } from '@/lib/money';
import { readableError, flashUrl, UserError, DECIMAL_RE } from '@/lib/services/admin';
import {
  THEMES, OBJECTIVE_STATUSES, INITIATIVE_STATUSES, ACTION_STATUSES, RISK_LEVELS, SOURCE_TYPES, KR_UNITS,
  nextCode, wouldCreateCycle, canTransitionAction,
} from '@/lib/services/strategy';

const opt = (v: FormDataEntryValue | null) => { const s = typeof v === 'string' ? v.trim() : ''; return s === '' ? null : s; };
const uuid = z.string().uuid();
const optUuid = uuid.nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const decimal = z.string().regex(DECIMAL_RE, 'expected a decimal number');
const nonNegDecimal = decimal.refine((v) => !v.startsWith('-'), 'must not be negative');

async function act(form: FormData, fn: (auth: AuthContext, t: Tx) => Promise<string>): Promise<never> {
  const auth = await requireAuth('strategy.manage');
  const returnTo = String(form.get('returnTo') ?? '/strategy');
  let msg: { ok?: string; err?: string };
  try {
    msg = { ok: await withTenant(tctx(auth), (t) => fn(auth, t)) };
  } catch (e) {
    unstable_rethrow(e);
    msg = { err: e instanceof UserError ? e.message : readableError(e) };
  }
  revalidatePath('/strategy', 'layout');
  redirect(flashUrl(returnTo, '/strategy', msg));
}

async function assertMember(t: Tx, userId: string | null) {
  if (!userId) return;
  const m = await one(t, 'SELECT 1 FROM memberships WHERE user_id = $1 AND is_active', [userId]);
  if (!m) throw new UserError('Owner must be an active member of this tenant.');
}
async function assertKpi(t: Tx, code: string | null) {
  if (!code) return null;
  const k = await one<{ unit: string }>(t, 'SELECT unit FROM kpi_definitions WHERE code = $1', [code]);
  if (!k) throw new UserError(`Unknown KPI code ${code}.`);
  return k;
}
function diff(before: Record<string, any> | null, after: Record<string, any>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    const b = before?.[k];
    if (JSON.stringify(b ?? null) !== JSON.stringify(v ?? null)) out[k] = { from: b ?? null, to: v ?? null };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------
const objectiveSchema = z.object({
  id: optUuid, title: z.string().min(3).max(200), description: z.string().max(2000).nullable(),
  theme: z.enum(THEMES), fiscal_year: z.coerce.number().int().min(2000).max(2100), owner_user_id: optUuid, status: z.enum(OBJECTIVE_STATUSES),
});
export async function saveObjective(form: FormData) {
  return act(form, async (auth, t) => {
    const v = objectiveSchema.parse({ id: opt(form.get('id')), title: opt(form.get('title')) ?? '', description: opt(form.get('description')), theme: form.get('theme'), fiscal_year: form.get('fiscal_year'), owner_user_id: opt(form.get('owner_user_id')), status: form.get('status') ?? 'active' });
    await assertMember(t, v.owner_user_id);
    const fields = { title: v.title, description: v.description, theme: v.theme, fiscal_year: v.fiscal_year, owner_user_id: v.owner_user_id, status: v.status };
    if (v.id) {
      const before = await one<any>(t, 'SELECT code, title, description, theme, fiscal_year, owner_user_id, status FROM strategic_objectives WHERE id = $1 FOR UPDATE', [v.id]);
      if (!before) throw new UserError('Objective not found.');
      await t.query('UPDATE strategic_objectives SET title=$2, description=$3, theme=$4, fiscal_year=$5, owner_user_id=$6, status=$7 WHERE id=$1', [v.id, v.title, v.description, v.theme, v.fiscal_year, v.owner_user_id, v.status]);
      await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'strategy.objective_updated', entityType: 'strategic_objective', entityId: v.id, payload: { code: before.code, changes: diff(before, fields) } });
      return `Objective ${before.code} updated`;
    }
    await t.query("SELECT pg_advisory_xact_lock(hashtext('obj:' || $1))", [auth.tenantId]);
    const code = nextCode('OBJ-', (await q<{ code: string }>(t, 'SELECT code FROM strategic_objectives')).map((r) => r.code), 1);
    const r = await one<{ id: string }>(t, `INSERT INTO strategic_objectives (tenant_id, code, title, description, theme, fiscal_year, owner_user_id, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [auth.tenantId, code, v.title, v.description, v.theme, v.fiscal_year, v.owner_user_id, v.status]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'strategy.objective_created', entityType: 'strategic_objective', entityId: r!.id, payload: { code, ...fields } });
    return `Objective ${code} created`;
  });
}

// ---------------------------------------------------------------------------
// Key results
// ---------------------------------------------------------------------------
const krSchema = z.object({
  id: optUuid, objective_id: uuid, title: z.string().min(3).max(200), kpi_code: z.string().max(80).nullable(),
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/, 'expected e.g. 2026-Q4'), baseline: decimal.nullable(), target: decimal, current_value: decimal.nullable(), unit: z.enum(KR_UNITS),
});
export async function saveKeyResult(form: FormData) {
  return act(form, async (auth, t) => {
    const v = krSchema.parse({ id: opt(form.get('id')), objective_id: form.get('objective_id'), title: opt(form.get('title')) ?? '', kpi_code: opt(form.get('kpi_code')), quarter: opt(form.get('quarter')) ?? '', baseline: opt(form.get('baseline')), target: opt(form.get('target')) ?? '', current_value: opt(form.get('current_value')), unit: form.get('unit') ?? 'count' });
    const obj = await one<{ code: string }>(t, 'SELECT code FROM strategic_objectives WHERE id = $1', [v.objective_id]);
    if (!obj) throw new UserError('Objective not found.');
    const kpi = await assertKpi(t, v.kpi_code);
    const unit = kpi ? kpi.unit : v.unit;                 // a KPI-linked key result always uses the KPI's unit
    const current = v.kpi_code ? null : v.current_value;  // measured automatically when linked
    const fields = { objective_id: v.objective_id, title: v.title, kpi_code: v.kpi_code, quarter: v.quarter, baseline: v.baseline, target: v.target, current_value: current, unit };
    if (v.id) {
      const before = await one<any>(t, 'SELECT objective_id, title, kpi_code, quarter, baseline::text, target::text, current_value::text, unit FROM key_results WHERE id = $1 FOR UPDATE', [v.id]);
      if (!before) throw new UserError('Key result not found.');
      await t.query('UPDATE key_results SET objective_id=$2, title=$3, kpi_code=$4, quarter=$5, baseline=$6, target=$7, current_value=$8, unit=$9 WHERE id=$1', [v.id, v.objective_id, v.title, v.kpi_code, v.quarter, v.baseline, v.target, current, unit]);
      await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'strategy.key_result_updated', entityType: 'key_result', entityId: v.id, payload: { objective: obj.code, changes: diff(before, fields) } });
      return `Key result "${v.title}" updated`;
    }
    const r = await one<{ id: string }>(t, 'INSERT INTO key_results (tenant_id, objective_id, title, kpi_code, quarter, baseline, target, current_value, unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [auth.tenantId, v.objective_id, v.title, v.kpi_code, v.quarter, v.baseline, v.target, current, unit]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'strategy.key_result_created', entityType: 'key_result', entityId: r!.id, payload: { objective: obj.code, ...fields } });
    return `Key result "${v.title}" added to ${obj.code}`;
  });
}
export async function deleteKeyResult(form: FormData) {
  return act(form, async (auth, t) => {
    const id = uuid.parse(form.get('id'));
    const before = await one<any>(t, 'SELECT k.title, k.kpi_code, k.quarter, k.baseline::text, k.target::text, o.code AS objective FROM key_results k JOIN strategic_objectives o ON o.id = k.objective_id WHERE k.id = $1', [id]);
    if (!before) throw new UserError('Key result not found.');
    await t.query('DELETE FROM key_results WHERE id = $1', [id]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'strategy.key_result_deleted', entityType: 'key_result', entityId: id, payload: before });
    return `Key result "${before.title}" removed`;
  });
}

// ---------------------------------------------------------------------------
// Initiatives
// ---------------------------------------------------------------------------
const initiativeSchema = z.object({
  id: optUuid, objective_id: optUuid, decision_id: optUuid, title: z.string().min(3).max(200), description: z.string().max(4000).nullable(),
  owner_user_id: optUuid, department: z.string().max(40).nullable(), budget_base: nonNegDecimal, spent_base: nonNegDecimal, target: z.string().max(300).nullable(),
  kpi_code: z.string().max(80).nullable(), deadline: date.nullable(), status: z.enum(INITIATIVE_STATUSES), progress_pct: z.coerce.number().int().min(0).max(100),
  blockers: z.string().max(2000).nullable(), next_action: z.string().max(500).nullable(), expected_impact: z.string().max(1000).nullable(),
  depends_on: z.array(uuid).max(50), risk_level: z.enum(RISK_LEVELS),
});
export async function saveInitiative(form: FormData) {
  return act(form, async (auth, t) => {
    const g = (k: string) => opt(form.get(k));
    const v = initiativeSchema.parse({
      id: g('id'), objective_id: g('objective_id'), decision_id: g('decision_id'), title: g('title') ?? '', description: g('description'), owner_user_id: g('owner_user_id'), department: g('department'),
      budget_base: g('budget_base') ?? '0', spent_base: g('spent_base') ?? '0', target: g('target'), kpi_code: g('kpi_code'), deadline: g('deadline'), status: g('status') ?? 'not_started', progress_pct: g('progress_pct') ?? '0',
      blockers: g('blockers'), next_action: g('next_action'), expected_impact: g('expected_impact'), depends_on: [...new Set(form.getAll('depends_on').map(String).filter(Boolean))], risk_level: g('risk_level') ?? 'medium',
    });
    await assertMember(t, v.owner_user_id);
    await assertKpi(t, v.kpi_code);
    if (v.department && !(await one(t, 'SELECT 1 FROM departments WHERE code = $1', [v.department]))) throw new UserError(`Unknown department ${v.department}.`);
    if (v.objective_id && !(await one(t, 'SELECT 1 FROM strategic_objectives WHERE id = $1', [v.objective_id]))) throw new UserError('Objective not found.');
    if (v.decision_id && !(await one(t, 'SELECT 1 FROM executive_decisions WHERE id = $1', [v.decision_id]))) throw new UserError('Decision not found.');
    if (v.status === 'blocked' && !v.blockers) throw new UserError('A blocked initiative must state its blockers.');
    const progress = v.status === 'done' ? 100 : v.progress_pct;
    const all = await q<{ id: string; depends_on: string[] }>(t, 'SELECT id, depends_on::text[] AS depends_on FROM initiatives');
    const byId = new Map(all.map((r) => [r.id, r]));
    const missing = v.depends_on.filter((d) => !byId.has(d));
    if (missing.length) throw new UserError('A selected dependency no longer exists.');
    const selfId = v.id ?? '00000000-0000-0000-0000-000000000000';
    if (v.depends_on.includes(selfId) || wouldCreateCycle(selfId, v.depends_on, byId)) throw new UserError('These dependencies would create a circular dependency.');
    const fields = { objective_id: v.objective_id, decision_id: v.decision_id, title: v.title, description: v.description, owner_user_id: v.owner_user_id, department: v.department, budget_base: v.budget_base, spent_base: v.spent_base, target: v.target, kpi_code: v.kpi_code, deadline: v.deadline, status: v.status, progress_pct: progress, blockers: v.blockers, next_action: v.next_action, expected_impact: v.expected_impact, depends_on: v.depends_on, risk_level: v.risk_level };
    const vals = [v.objective_id, v.decision_id, v.title, v.description, v.owner_user_id, v.department, v.budget_base, v.spent_base, v.target, v.kpi_code, v.deadline, v.status, progress, v.blockers, v.next_action, v.expected_impact, v.depends_on, v.risk_level];
    if (v.id) {
      const before = await one<any>(t, `SELECT code, objective_id, decision_id, title, description, owner_user_id, department, budget_base::text, spent_base::text, target, kpi_code, deadline, status, progress_pct, blockers, next_action, expected_impact, depends_on::text[] AS depends_on, risk_level FROM initiatives WHERE id = $1 FOR UPDATE`, [v.id]);
      if (!before) throw new UserError('Initiative not found.');
      await t.query(`UPDATE initiatives SET objective_id=$2, decision_id=$3, title=$4, description=$5, owner_user_id=$6, department=$7, budget_base=$8, spent_base=$9, target=$10, kpi_code=$11, deadline=$12, status=$13, progress_pct=$14, blockers=$15, next_action=$16, expected_impact=$17, depends_on=$18::uuid[], risk_level=$19, updated_at=now() WHERE id=$1`, [v.id, ...vals]);
      const n = (x: string) => dec(x).toString();
      const changes = diff({ ...before, budget_base: n(before.budget_base), spent_base: n(before.spent_base) }, { ...fields, budget_base: n(v.budget_base), spent_base: n(v.spent_base) });
      await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'strategy.initiative_updated', entityType: 'initiative', entityId: v.id, payload: { code: before.code, changes } });
      return `Initiative ${before.code} saved`;
    }
    await t.query("SELECT pg_advisory_xact_lock(hashtext('ini:' || $1))", [auth.tenantId]);
    const code = nextCode('INI-', (await q<{ code: string }>(t, 'SELECT code FROM initiatives')).map((r) => r.code), 2);
    const r = await one<{ id: string }>(t, `INSERT INTO initiatives (tenant_id, code, objective_id, decision_id, title, description, owner_user_id, department, budget_base, spent_base, target, kpi_code, deadline, status, progress_pct, blockers, next_action, expected_impact, depends_on, risk_level)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::uuid[],$20) RETURNING id`, [auth.tenantId, code, ...vals]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'strategy.initiative_created', entityType: 'initiative', entityId: r!.id, payload: { code, ...fields } });
    return `Initiative ${code} created`;
  });
}

const updateSchema = z.object({
  initiative_id: uuid, status: z.enum(INITIATIVE_STATUSES), progress_pct: z.coerce.number().int().min(0).max(100), note: z.string().min(3, 'an update note is required').max(4000),
  blockers: z.string().max(2000).nullable(), next_action: z.string().max(500).nullable(), spent_base: nonNegDecimal.nullable(),
});
/** Post a progress update: appends to initiative_updates and moves the initiative's status/progress. */
export async function postInitiativeUpdate(form: FormData) {
  return act(form, async (auth, t) => {
    const v = updateSchema.parse({ initiative_id: form.get('initiative_id'), status: form.get('status'), progress_pct: form.get('progress_pct'), note: opt(form.get('note')) ?? '', blockers: opt(form.get('blockers')), next_action: opt(form.get('next_action')), spent_base: opt(form.get('spent_base')) });
    const before = await one<any>(t, 'SELECT code, status, progress_pct, blockers, next_action, spent_base::text FROM initiatives WHERE id = $1 FOR UPDATE', [v.initiative_id]);
    if (!before) throw new UserError('Initiative not found.');
    const progress = v.status === 'done' ? 100 : v.progress_pct;
    const blockers = form.has('blockers') ? v.blockers : before.blockers;
    if (v.status === 'blocked' && !blockers) throw new UserError('State the blocker when marking an initiative blocked.');
    const nextAction = form.has('next_action') ? v.next_action : before.next_action;
    await t.query('INSERT INTO initiative_updates (tenant_id, initiative_id, status, progress_pct, note, author_id) VALUES ($1,$2,$3,$4,$5,$6)', [auth.tenantId, v.initiative_id, v.status, progress, v.note, auth.userId]);
    await t.query('UPDATE initiatives SET status=$2, progress_pct=$3, blockers=$4, next_action=$5, spent_base=coalesce($6::numeric, spent_base), updated_at=now() WHERE id=$1', [v.initiative_id, v.status, progress, blockers, nextAction, v.spent_base]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'strategy.initiative_update_posted', entityType: 'initiative', entityId: v.initiative_id,
      payload: { code: before.code, status: { from: before.status, to: v.status }, progress: { from: before.progress_pct, to: progress }, note: v.note, ...(v.spent_base ? { spent: { from: before.spent_base, to: v.spent_base } } : {}) } });
    return `Update posted to ${before.code} (${v.status.replace(/_/g, ' ')}, ${progress}%)`;
  });
}

// ---------------------------------------------------------------------------
// Executive action register
// ---------------------------------------------------------------------------
const actionSchema = z.object({
  title: z.string().min(3).max(300), owner_user_id: optUuid, due_date: date.nullable(), source_type: z.enum(SOURCE_TYPES), source_id: optUuid,
});
async function validateSource(t: Tx, type: string, id: string | null): Promise<string | null> {
  if (type === 'initiative' || type === 'decision') {
    if (!id) throw new UserError(`Select the ${type} this action comes from.`);
    const tbl = type === 'initiative' ? 'initiatives' : 'executive_decisions';
    const r = await one<{ code: string }>(t, `SELECT code FROM ${tbl} WHERE id = $1`, [id]);
    if (!r) throw new UserError(`The selected ${type} was not found.`);
    return id;
  }
  return null; // other source types carry no link
}
export async function createAction(form: FormData) {
  return act(form, async (auth, t) => {
    const src = String(form.get('source_type') ?? 'other');
    const v = actionSchema.parse({ title: opt(form.get('title')) ?? '', owner_user_id: opt(form.get('owner_user_id')), due_date: opt(form.get('due_date')), source_type: src, source_id: opt(form.get(src === 'decision' ? 'source_decision_id' : src === 'initiative' ? 'source_initiative_id' : 'source_id')) ?? opt(form.get('source_id')) });
    await assertMember(t, v.owner_user_id);
    const sourceId = await validateSource(t, v.source_type, v.source_id);
    await t.query("SELECT pg_advisory_xact_lock(hashtext('act:' || $1))", [auth.tenantId]);
    const code = nextCode('ACT-', (await q<{ code: string }>(t, 'SELECT code FROM action_items')).map((r) => r.code), 4);
    const r = await one<{ id: string }>(t, `INSERT INTO action_items (tenant_id, code, title, source_type, source_id, owner_user_id, due_date, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8) RETURNING id`,
      [auth.tenantId, code, v.title, v.source_type, sourceId, v.owner_user_id, v.due_date, auth.userId]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'strategy.action_created', entityType: 'action_item', entityId: r!.id, payload: { code, title: v.title, source_type: v.source_type, source_id: sourceId, owner_user_id: v.owner_user_id, due_date: v.due_date } });
    return `Action ${code} created`;
  });
}
export async function updateAction(form: FormData) {
  return act(form, async (auth, t) => {
    const id = uuid.parse(form.get('id'));
    const v = z.object({ title: z.string().min(3).max(300), owner_user_id: optUuid, due_date: date.nullable() }).parse({ title: opt(form.get('title')) ?? '', owner_user_id: opt(form.get('owner_user_id')), due_date: opt(form.get('due_date')) });
    await assertMember(t, v.owner_user_id);
    const before = await one<any>(t, 'SELECT code, title, owner_user_id, due_date FROM action_items WHERE id = $1 FOR UPDATE', [id]);
    if (!before) throw new UserError('Action not found.');
    await t.query('UPDATE action_items SET title=$2, owner_user_id=$3, due_date=$4 WHERE id=$1', [id, v.title, v.owner_user_id, v.due_date]);
    const changes = diff(before, v);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: changes.owner_user_id ? 'strategy.action_reassigned' : 'strategy.action_updated', entityType: 'action_item', entityId: id, payload: { code: before.code, changes } });
    return `Action ${before.code} updated`;
  });
}
export async function setActionStatus(form: FormData) {
  return act(form, async (auth, t) => {
    const id = uuid.parse(form.get('id'));
    const to = z.enum(ACTION_STATUSES).parse(form.get('status'));
    const before = await one<{ code: string; status: string; due_date: string | null }>(t, 'SELECT code, status, due_date FROM action_items WHERE id = $1 FOR UPDATE', [id]);
    if (!before) throw new UserError('Action not found.');
    if (!canTransitionAction(before.status, to)) throw new UserError(`An action cannot move from "${before.status.replace(/_/g, ' ')}" to "${to.replace(/_/g, ' ')}".`);
    await t.query(`UPDATE action_items SET status=$2, completed_at = CASE WHEN $2 = 'done' THEN now() ELSE NULL END WHERE id=$1`, [id, to]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'strategy.action_status_changed', entityType: 'action_item', entityId: id, payload: { code: before.code, from: before.status, to, overdue_at_change: Boolean(before.due_date && before.due_date < todayISO()) } });
    return `Action ${before.code} → ${to.replace(/_/g, ' ')}`;
  });
}
