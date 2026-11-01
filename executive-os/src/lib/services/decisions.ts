/**
 * CEO Decision Center services: scenario context from actuals, scenario runs,
 * decision register, approval workflow, linkage to strategy execution and
 * actual-versus-expected outcome measurement.
 */
import type { Tx } from '../db';
import { q, one } from '../db';
import { audit } from '../audit';
import { dec, safeDiv, sum, ZERO, type Dec } from '../money';
import { addDays, addMonths, monthEnd, monthStart, monthsInRange } from '../dates';
import { runScenario, TEMPLATES, ENGINE_VERSION, type TemplateKey, type ScenarioContext, type ScenarioOutput } from '../engine/scenarios';
import { SAAS_CTE, tenantInfo } from './facts';

/** Trailing monthly-average context (base period = n complete months ending baseEnd). */
export async function scenarioContext(tx: Tx, baseStart: string, baseEnd: string): Promise<ScenarioContext> {
  const t = await tenantInfo(tx);
  const n = monthsInRange(baseStart, baseEnd).length;
  const avg = (v: string | null) => dec(v ?? 0).div(n).toDecimalPlaces(4).toString();
  const p = await one<any>(tx, `SELECT coalesce(sum(amount_base) FILTER (WHERE status='success'),0)::text AS gpv, count(*) FILTER (WHERE status='success')::text AS successes, count(*)::text AS attempts,
      coalesce(sum(mdr_fee_base),0)::text AS mdr, coalesce(sum(wholesale_fee_base),0)::text AS wholesale, coalesce(sum(processing_cost_base),0)::text AS processing,
      count(DISTINCT merchant_id) FILTER (WHERE status='success')::text AS merchants
    FROM transactions WHERE accounting_date BETWEEN $1 AND $2`, [baseStart, baseEnd]);
  const saas = await one<any>(tx, `WITH ${SAAS_CTE} SELECT coalesce(sum(fee),0)::text AS v FROM saas`, [baseStart, baseEnd]);
  const gl = await one<any>(tx, `SELECT coalesce(sum(CASE WHEN a.pl_line='revenue' THEN e.credit_base - e.debit_base END),0)::text AS revenue,
      coalesce(sum(CASE WHEN a.pl_line IN ('opex','d_and_a') THEN e.debit_base - e.credit_base END),0)::text AS opex,
      coalesce(sum(CASE WHEN a.pl_line = 'd_and_a' THEN e.debit_base - e.credit_base END),0)::text AS da
    FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id WHERE e.entry_date BETWEEN $1 AND $2`, [baseStart, baseEnd]);
  const ms = await q<any>(tx, `WITH ${SAAS_CTE}, s AS (SELECT merchant_id, sum(fee) AS saas FROM saas GROUP BY 1),
      t AS (SELECT merchant_id, coalesce(sum(amount_base) FILTER (WHERE status='success'),0) AS gpv, count(*) FILTER (WHERE status='success') AS successes,
        sum(mdr_fee_base) AS mdr, sum(wholesale_fee_base) AS wholesale, sum(processing_cost_base) AS processing FROM transactions WHERE accounting_date BETWEEN $1 AND $2 GROUP BY 1),
      ar AS (SELECT merchant_id, sum((amount - amount_paid) * fx_rate_to_base) AS open FROM customer_invoices WHERE status <> 'void' AND amount_paid < amount GROUP BY 1)
    SELECT m.id, m.name, coalesce(t.gpv,0)::text AS gpv, coalesce(t.successes,0)::text AS successes, coalesce(t.mdr,0)::text AS mdr, coalesce(t.wholesale,0)::text AS wholesale,
      coalesce(t.processing,0)::text AS processing, coalesce(s.saas,0)::text AS saas, coalesce(ar.open,0)::text AS receivables
    FROM merchants m LEFT JOIN t ON t.merchant_id = m.id LEFT JOIN s ON s.merchant_id = m.id LEFT JOIN ar ON ar.merchant_id = m.id
    WHERE t.merchant_id IS NOT NULL OR s.merchant_id IS NOT NULL`, [baseStart, baseEnd]);
  const credit = await one<any>(tx, `SELECT coalesce(sum(amount * fx_rate_to_base),0)::text AS v FROM customer_invoices WHERE issue_date BETWEEN $1 AND $2 AND status <> 'void'`, [baseStart, baseEnd]);
  const days = monthsInRange(baseStart, baseEnd).length * 30.4;
  const merchants: ScenarioContext['merchants'] = {};
  let cmTotal = ZERO;
  for (const m of ms) {
    merchants[m.id] = { name: m.name, gpv: avg(m.gpv), successes: avg(m.successes), mdr: avg(m.mdr), wholesale: avg(m.wholesale), processing: avg(m.processing), saas: avg(m.saas), receivables: m.receivables };
    cmTotal = cmTotal.plus(dec(m.mdr).minus(m.wholesale).minus(m.processing).plus(m.saas));
  }
  const active = Math.max(1, Number(p.merchants));
  return {
    currency: t.base_currency,
    portfolio: { gpv: avg(p.gpv), successes: avg(p.successes), mdr: avg(p.mdr), wholesale: avg(p.wholesale), processing: avg(p.processing), saas: avg(saas.v), activeMerchants: p.merchants, monthlyRevenue: avg(gl.revenue), monthlyOpex: avg(gl.opex), depreciation: avg(gl.da), attempts: avg(p.attempts) },
    merchants,
    avgContributionPerMerchant: cmTotal.div(n).div(active).toDecimalPlaces(2).toString(),
    creditSalesPerDay: dec(credit.v).div(days).toDecimalPlaces(2).toString(),
  };
}

/** Default base period: the 3 most recent complete months with transactions. */
export async function defaultBasePeriod(tx: Tx): Promise<{ start: string; end: string }> {
  const r = await one<{ d: string | null }>(tx, 'SELECT max(accounting_date)::text AS d FROM transactions');
  const last = r?.d ?? new Date().toISOString().slice(0, 10);
  const lastFull = monthEnd(last) === last ? monthStart(last) : addMonths(monthStart(last), -1);
  return { start: addMonths(lastFull, -2), end: monthEnd(lastFull) };
}

async function nextCode(tx: Tx, table: 'scenarios' | 'executive_decisions' | 'action_items' | 'initiatives', prefix: string): Promise<string> {
  const r = await one<{ n: number }>(tx, `SELECT count(*)::int + 1 AS n FROM ${table} WHERE code LIKE $1`, [`${prefix}%`]);
  return `${prefix}${String(r!.n).padStart(3, '0')}`;
}

export async function createScenario(tx: Tx, a: { tenantId: string; userId: string }, input: { name: string; template: TemplateKey; description?: string; assumptions: Record<string, unknown>; comparisonGroup?: string; baseStart?: string; baseEnd?: string }) {
  if (!TEMPLATES[input.template]) throw new Error('Unknown template');
  const base = input.baseStart && input.baseEnd ? { start: input.baseStart, end: input.baseEnd } : await defaultBasePeriod(tx);
  const ctx = await scenarioContext(tx, base.start, base.end);
  const parsed = TEMPLATES[input.template].schema.parse(input.assumptions);
  const results = runScenario(input.template, parsed, ctx);
  const code = await nextCode(tx, 'scenarios', `SCN-${new Date().getUTCFullYear()}-`);
  const row = await one<{ id: string }>(tx, `INSERT INTO scenarios (tenant_id, code, name, template, description, assumptions, results, engine_version, base_period_start, base_period_end, status, comparison_group, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12) RETURNING id`,
    [a.tenantId, code, input.name, input.template, input.description ?? null, JSON.stringify(parsed), JSON.stringify({ ...results, context: summariseContext(ctx, parsed) }), ENGINE_VERSION, base.start, base.end, input.comparisonGroup ?? null, a.userId]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'scenario.created', entityType: 'scenarios', entityId: row!.id, payload: { code, template: input.template, assumptions: parsed, base } });
  return { id: row!.id, code };
}

function summariseContext(ctx: ScenarioContext, a: any) {
  const m = a.merchantId ? ctx.merchants[a.merchantId] : null;
  return { portfolio: ctx.portfolio, merchant: m ? { id: a.merchantId, ...m } : null, avgContributionPerMerchant: ctx.avgContributionPerMerchant };
}

export async function rerunScenario(tx: Tx, a: { tenantId: string; userId: string }, id: string) {
  const s = await one<any>(tx, 'SELECT * FROM scenarios WHERE id = $1', [id]);
  if (!s) throw new Error('Scenario not found');
  const ctx = await scenarioContext(tx, s.base_period_start, s.base_period_end);
  const results = runScenario(s.template, s.assumptions, ctx);
  await tx.query('UPDATE scenarios SET results = $2, engine_version = $3, updated_at = now() WHERE id = $1', [id, JSON.stringify({ ...results, context: summariseContext(ctx, s.assumptions) }), ENGINE_VERSION]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'scenario.recalculated', entityType: 'scenarios', entityId: id });
}

export async function listScenarios(tx: Tx) {
  return q<any>(tx, `SELECT s.id, s.code, s.name, s.template, s.status, s.comparison_group, s.base_period_start, s.base_period_end, s.created_at, u.name AS created_by,
      s.results->'proposed'->'totals'->>'ebitda' AS ebitda, s.results->'proposed'->'totals'->>'cashFlow' AS cash, s.results->'proposed'->>'paybackMonth' AS payback,
      s.results->'downside'->'totals'->>'ebitda' AS downside_ebitda, s.results->>'horizonMonths' AS horizon,
      (SELECT d.code FROM executive_decisions d WHERE d.scenario_id = s.id LIMIT 1) AS decision_code
    FROM scenarios s LEFT JOIN users u ON u.id = s.created_by ORDER BY s.created_at DESC`);
}

export async function getScenario(tx: Tx, id: string) {
  return one<any>(tx, `SELECT s.*, u.name AS created_by_name FROM scenarios s LEFT JOIN users u ON u.id = s.created_by WHERE s.id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Decision register
// ---------------------------------------------------------------------------
export interface DecisionInput { title: string; description: string; rationale: string; scenarioId?: string | null; ownerUserId: string; approverUserId: string; deadline: string; evidence: { kind: string; ref: string; note?: string }[]; measurement?: Record<string, unknown> }

/** Derive expected impact and measurement spec from a scenario. */
export function expectationsFromScenario(s: { template: string; assumptions: any; results: ScenarioOutput & { context?: any }; base_period_start: string; base_period_end: string }) {
  const r = s.results;
  const expected = {
    monthly_revenue_delta: r.proposed.steadyStateMonthly.revenue,
    monthly_contribution_delta: r.proposed.steadyStateMonthly.contribution,
    monthly_ebitda_delta: r.proposed.steadyStateMonthly.ebitda,
    annualised_ebitda: r.proposed.annualised.ebitda,
    horizon_cash_flow: r.proposed.totals.cashFlow,
    payback_month: r.proposed.paybackMonth,
    downside_horizon_cash_flow: r.downside.totals.cashFlow,
    currency: r.currency,
  };
  let measurement: Record<string, unknown>;
  if (s.template === 'merchant_repricing' && s.assumptions.merchantId) {
    const m = r.context?.merchant;
    const baseCm = m ? dec(m.mdr).minus(m.wholesale).minus(m.processing).plus(m.saas) : ZERO;
    measurement = { type: 'merchant_contribution', merchant_id: s.assumptions.merchantId, merchant_name: m?.name, baseline_start: s.base_period_start, baseline_end: s.base_period_end, baseline_monthly_contribution: baseCm.toFixed(2), expected_monthly_contribution: baseCm.plus(dec(r.proposed.steadyStateMonthly.contribution)).toFixed(2), downside_monthly_contribution: baseCm.plus(dec(r.downside.steadyStateMonthly.contribution)).toFixed(2) };
  } else {
    measurement = { type: 'kpi_delta', kpi_code: 'FIN.EBITDA', baseline_start: s.base_period_start, baseline_end: s.base_period_end, expected_monthly_delta: r.proposed.steadyStateMonthly.ebitda };
  }
  return { expected, measurement };
}

export async function createDecision(tx: Tx, a: { tenantId: string; userId: string }, d: DecisionInput) {
  const code = await nextCode(tx, 'executive_decisions', `DEC-${new Date().getUTCFullYear()}-`);
  let expected: Record<string, unknown> = {}; let measurement: Record<string, unknown> = d.measurement ?? {};
  if (d.scenarioId) {
    const s = await getScenario(tx, d.scenarioId);
    if (!s) throw new Error('Scenario not found');
    const e = expectationsFromScenario(s);
    expected = e.expected; measurement = { ...e.measurement, ...(d.measurement ?? {}) };
    await tx.query("UPDATE scenarios SET status = 'selected', updated_at = now() WHERE id = $1", [d.scenarioId]);
    if (s.comparison_group) await tx.query("UPDATE scenarios SET status = 'rejected', updated_at = now() WHERE comparison_group = $1 AND id <> $2 AND status IN ('draft','shortlisted')", [s.comparison_group, d.scenarioId]);
  }
  const row = await one<{ id: string }>(tx, `INSERT INTO executive_decisions (tenant_id, code, title, description, rationale, scenario_id, evidence, owner_user_id, approver_user_id, proposed_by, expected_impact, measurement, implementation_deadline, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'proposed') RETURNING id`,
    [a.tenantId, code, d.title, d.description, d.rationale, d.scenarioId ?? null, JSON.stringify(d.evidence), d.ownerUserId, d.approverUserId, a.userId, JSON.stringify(expected), JSON.stringify(measurement), d.deadline]);
  for (const ev of d.evidence) await tx.query(`INSERT INTO evidence_records (tenant_id, subject_type, subject_id, kind, reference, description, created_by) VALUES ($1,'decision',$2,$3,$4,$5,$6)`, [a.tenantId, row!.id, ev.kind, ev.ref, ev.note ?? null, a.userId]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'decision.proposed', entityType: 'executive_decisions', entityId: row!.id, payload: { code, scenario: d.scenarioId, expected } });
  return { id: row!.id, code };
}

/** Approve (approver must differ from proposer — enforced by DB). Creates the execution trail. */
export async function approveDecision(tx: Tx, a: { tenantId: string; userId: string }, id: string, note?: string) {
  const d = await one<any>(tx, 'SELECT * FROM executive_decisions WHERE id = $1 FOR UPDATE', [id]);
  if (!d) throw new Error('Decision not found');
  if (d.status !== 'proposed') throw new Error(`Decision is ${d.status}; only proposed decisions can be approved`);
  if (d.proposed_by === a.userId) throw new Error('Segregation of duties: the proposer cannot approve their own decision');
  if (d.approver_user_id && d.approver_user_id !== a.userId) throw new Error('Only the designated approver can approve this decision');
  await tx.query(`UPDATE executive_decisions SET status = 'approved', approver_user_id = $2, approved_at = now(), updated_at = now() WHERE id = $1`, [id, a.userId]);
  // Execution trail: initiative + action item for the owner (Strategy Execution module)
  const iniCode = await nextCode(tx, 'initiatives', 'INI-D');
  const ini = await one<{ id: string }>(tx, `INSERT INTO initiatives (tenant_id, code, decision_id, title, description, owner_user_id, target, kpi_code, deadline, status, progress_pct, next_action, expected_impact, risk_level)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'not_started',0,$10,$11,'medium') RETURNING id`,
    [a.tenantId, iniCode, id, `Implement ${d.code}: ${d.title}`, d.description, d.owner_user_id,
     d.measurement?.type === 'merchant_contribution' ? `Monthly contribution ≥ ${d.measurement.expected_monthly_contribution}` : `EBITDA +${d.expected_impact?.monthly_ebitda_delta ?? '?'} / month`,
     d.measurement?.type === 'merchant_contribution' ? 'PAY.CONTRIBUTION' : 'FIN.EBITDA', d.implementation_deadline, 'Prepare implementation plan', `Expected monthly EBITDA impact ${d.expected_impact?.monthly_ebitda_delta ?? 'n/a'} ${d.expected_impact?.currency ?? ''}`]);
  const actCode = await nextCode(tx, 'action_items', 'ACT-D');
  await tx.query(`INSERT INTO action_items (tenant_id, code, title, source_type, source_id, owner_user_id, due_date, status, created_by) VALUES ($1,$2,$3,'decision',$4,$5,$6,'open',$7)`,
    [a.tenantId, actCode, `Execute decision ${d.code}: ${d.title}`, id, d.owner_user_id, d.implementation_deadline, a.userId]);
  await tx.query(`INSERT INTO evidence_records (tenant_id, subject_type, subject_id, kind, reference, description, created_by) VALUES ($1,'decision',$2,'approval',$3,$4,$5)`, [a.tenantId, id, `approval:${d.code}`, note ?? 'Approved', a.userId]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'decision.approved', entityType: 'executive_decisions', entityId: id, payload: { code: d.code, initiative: iniCode, action: actCode, note } });
  return { initiativeId: ini!.id };
}

export async function rejectDecision(tx: Tx, a: { tenantId: string; userId: string }, id: string, reason: string) {
  const d = await one<any>(tx, 'SELECT status, code, approver_user_id FROM executive_decisions WHERE id = $1', [id]);
  if (!d || d.status !== 'proposed') throw new Error('Only proposed decisions can be rejected');
  if (d.approver_user_id && d.approver_user_id !== a.userId) throw new Error('Only the designated approver can reject this decision');
  await tx.query(`UPDATE executive_decisions SET status = 'rejected', updated_at = now() WHERE id = $1`, [id]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'decision.rejected', entityType: 'executive_decisions', entityId: id, payload: { code: d.code, reason } });
}

const TRANSITIONS: Record<string, string[]> = { approved: ['in_progress', 'cancelled'], in_progress: ['implemented', 'cancelled'], implemented: ['closed'] };
export async function transitionDecision(tx: Tx, a: { tenantId: string; userId: string }, id: string, to: string, note?: string) {
  const d = await one<any>(tx, 'SELECT status, code FROM executive_decisions WHERE id = $1', [id]);
  if (!d) throw new Error('Decision not found');
  if (!(TRANSITIONS[d.status] ?? []).includes(to)) throw new Error(`Cannot move a ${d.status} decision to ${to}`);
  await tx.query('UPDATE executive_decisions SET status = $2, updated_at = now() WHERE id = $1', [id, to]);
  if (to === 'in_progress') await tx.query(`UPDATE initiatives SET status = 'on_track', updated_at = now() WHERE decision_id = $1 AND status = 'not_started'`, [id]);
  if (to === 'implemented') await tx.query(`UPDATE initiatives SET status = 'done', progress_pct = 100, updated_at = now() WHERE decision_id = $1`, [id]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: `decision.${to}`, entityType: 'executive_decisions', entityId: id, payload: { code: d.code, note } });
}

export async function listDecisions(tx: Tx) {
  return q<any>(tx, `SELECT d.id, d.code, d.title, d.status, d.implementation_deadline, d.approved_at, d.expected_impact, d.actual_outcome, d.outcome_measured_at,
      o.name AS owner, ap.name AS approver, s.code AS scenario_code, s.id AS scenario_id
    FROM executive_decisions d LEFT JOIN users o ON o.id = d.owner_user_id LEFT JOIN users ap ON ap.id = d.approver_user_id LEFT JOIN scenarios s ON s.id = d.scenario_id
    ORDER BY d.created_at DESC`);
}

export async function getDecision(tx: Tx, id: string) {
  const d = await one<any>(tx, `SELECT d.*, o.name AS owner_name, ap.name AS approver_name, pr.name AS proposer_name, s.code AS scenario_code, s.name AS scenario_name
    FROM executive_decisions d LEFT JOIN users o ON o.id = d.owner_user_id LEFT JOIN users ap ON ap.id = d.approver_user_id LEFT JOIN users pr ON pr.id = d.proposed_by LEFT JOIN scenarios s ON s.id = d.scenario_id WHERE d.id = $1`, [id]);
  if (!d) return null;
  const initiatives = await q<any>(tx, `SELECT i.id, i.code, i.title, i.status, i.progress_pct, i.deadline, u.name AS owner FROM initiatives i LEFT JOIN users u ON u.id = i.owner_user_id WHERE i.decision_id = $1`, [id]);
  const actions = await q<any>(tx, `SELECT a.code, a.title, a.status, a.due_date, u.name AS owner FROM action_items a LEFT JOIN users u ON u.id = a.owner_user_id WHERE a.source_type = 'decision' AND a.source_id = $1`, [id]);
  const evidence = await q<any>(tx, `SELECT e.kind, e.reference, e.description, e.created_at, u.name AS by FROM evidence_records e LEFT JOIN users u ON u.id = e.created_by WHERE e.subject_type = 'decision' AND e.subject_id = $1 ORDER BY e.created_at`, [id]);
  const history = await q<any>(tx, `SELECT a.action, a.created_at, a.payload, u.name AS actor FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.entity_type = 'executive_decisions' AND a.entity_id = $1 ORDER BY a.id`, [id]);
  return { ...d, initiatives, actions, evidence, history };
}

/**
 * Actual vs expected outcome. Uses complete months AFTER the approval month (or
 * from an explicit measure_from). Returns null fields when no post-decision data yet.
 */
export async function measureOutcome(tx: Tx, a: { tenantId: string; userId: string }, id: string, persist = true) {
  const d = await one<any>(tx, 'SELECT * FROM executive_decisions WHERE id = $1', [id]);
  if (!d) throw new Error('Decision not found');
  const m = d.measurement ?? {};
  const fromApproval = d.approved_at ? addMonths(monthStart(new Date(d.approved_at).toISOString().slice(0, 10)), 1) : null;
  const from: string | null = m.measure_from ?? fromApproval;
  const last = await one<{ d: string | null }>(tx, 'SELECT max(accounting_date)::text AS d FROM transactions');
  const lastDate = last?.d ?? null;
  if (!from || !lastDate || from > lastDate) {
    const out = { status: 'awaiting_data', message: from ? `No data yet for the measurement window starting ${from}` : 'Decision not approved yet', measured_through: lastDate };
    if (persist) await tx.query('UPDATE executive_decisions SET actual_outcome = $2, outcome_measured_at = now() WHERE id = $1', [id, JSON.stringify(out)]);
    return out;
  }
  const to = lastDate;
  const months = monthsInRange(from, to);
  let result: Record<string, unknown>;
  if (m.type === 'merchant_contribution') {
    const series = await q<any>(tx, `WITH ${SAAS_CTE}, s AS (SELECT month, sum(fee) AS saas FROM saas WHERE merchant_id = $3 GROUP BY 1),
      t AS (SELECT date_trunc('month', accounting_date)::date AS month, sum(mdr_fee_base - wholesale_fee_base - processing_cost_base) AS cm, coalesce(sum(amount_base) FILTER (WHERE status='success'),0) AS gpv, sum(mdr_fee_base) AS mdr
            FROM transactions WHERE merchant_id = $3 AND accounting_date BETWEEN $1 AND $2 GROUP BY 1)
      SELECT t.month::text, (t.cm + coalesce(s.saas,0))::text AS contribution, t.gpv::text, t.mdr::text FROM t LEFT JOIN s USING (month) ORDER BY 1`, [from, to, m.merchant_id]);
    const actualAvg = series.length ? sum(series.map((x) => x.contribution)).div(series.length) : null;
    // Partial latest month: scale it to a full month (calendar days) to give a comparable run-rate.
    const partial = monthEnd(to) !== to;
    let runRate: ReturnType<typeof sum> | null = null;
    if (partial && series.length) {
      const lastM = series[series.length - 1]; const dim = Number(monthEnd(to).slice(8, 10)); const covered = Number(to.slice(8, 10));
      const scaled = series.map((x) => (x === lastM ? dec(x.contribution).times(dim).div(covered) : dec(x.contribution)));
      runRate = sum(scaled).div(series.length);
    }
    const expected = dec(m.expected_monthly_contribution ?? 0), baseline = dec(m.baseline_monthly_contribution ?? 0);
    result = { status: 'measured', type: m.type, window: { from, to, months: series.length }, series, baseline_monthly: baseline.toFixed(2), expected_monthly: expected.toFixed(2), actual_monthly: actualAvg?.toFixed(2) ?? null,
      variance_vs_expected: actualAvg ? actualAvg.minus(expected).toFixed(2) : null, actual_uplift_vs_baseline: actualAvg ? actualAvg.minus(baseline).toFixed(2) : null,
      expected_uplift_vs_baseline: expected.minus(baseline).toFixed(2), achievement_ratio: actualAvg ? safeDiv(actualAvg.minus(baseline), expected.minus(baseline))?.toFixed(4) ?? null : null,
      partial_month: partial, actual_monthly_run_rate: runRate?.toFixed(2) ?? null, variance_vs_expected_run_rate: runRate ? runRate.minus(expected).toFixed(2) : null,
      note: partial ? 'Latest month is partial; compare the run-rate, and re-measure after month end.' : undefined };
  } else if (m.type === 'kpi') {
    const vals = await q<any>(tx, `SELECT r.period_start::text AS month, r.value::text FROM kpi_results r JOIN kpi_definitions k ON k.id = r.kpi_id
      WHERE k.code = $1 AND r.is_current AND r.dimension = 'total' AND r.period_start = ANY($2::date[]) AND r.period_end = (date_trunc('month', r.period_start) + interval '1 month - 1 day')::date ORDER BY 1`, [m.kpi_code, months]);
    const base = await q<any>(tx, `SELECT r.value::text FROM kpi_results r JOIN kpi_definitions k ON k.id = r.kpi_id
      WHERE k.code = $1 AND r.is_current AND r.dimension = 'total' AND r.period_start BETWEEN $2 AND $3 AND r.period_end = (date_trunc('month', r.period_start) + interval '1 month - 1 day')::date`, [m.kpi_code, m.baseline_start, m.baseline_end]);
    const avg = (xs: any[]) => (xs.length ? sum(xs.map((x) => x.value)).div(xs.length) : null);
    const actual = avg(vals), baseline = avg(base);
    result = { status: 'measured', type: 'kpi', kpi_code: m.kpi_code, window: { from, to, months: vals.length }, series: vals, baseline_monthly: baseline?.toFixed(4) ?? null, expected_value: m.expected_value ?? null, actual_monthly: actual?.toFixed(4) ?? null,
      variance_vs_expected: actual && m.expected_value ? actual.minus(dec(m.expected_value)).toFixed(4) : null };
  } else {
    const vals = await q<any>(tx, `SELECT r.period_start::text AS month, r.value::text FROM kpi_results r JOIN kpi_definitions k ON k.id = r.kpi_id
      WHERE k.code = $1 AND r.is_current AND r.dimension = 'total' AND r.period_start = ANY($2::date[]) AND r.period_end = (date_trunc('month', r.period_start) + interval '1 month - 1 day')::date ORDER BY 1`, [m.kpi_code ?? 'FIN.EBITDA', months]);
    const base = await q<any>(tx, `SELECT r.value::text FROM kpi_results r JOIN kpi_definitions k ON k.id = r.kpi_id
      WHERE k.code = $1 AND r.is_current AND r.dimension = 'total' AND r.period_start BETWEEN $2 AND $3 AND r.period_end = (date_trunc('month', r.period_start) + interval '1 month - 1 day')::date`, [m.kpi_code ?? 'FIN.EBITDA', m.baseline_start, m.baseline_end]);
    const avg = (xs: any[]) => (xs.length ? sum(xs.map((x) => x.value)).div(xs.length) : null);
    const actual = avg(vals), baseline = avg(base);
    const actualDelta = actual && baseline ? actual.minus(baseline) : null;
    result = { status: 'measured', type: 'kpi_delta', kpi_code: m.kpi_code ?? 'FIN.EBITDA', window: { from, to, months: vals.length }, series: vals, baseline_monthly: baseline?.toFixed(2) ?? null, actual_monthly: actual?.toFixed(2) ?? null,
      expected_monthly_delta: m.expected_monthly_delta ?? null, actual_monthly_delta: actualDelta?.toFixed(2) ?? null,
      variance_vs_expected: actualDelta && m.expected_monthly_delta ? actualDelta.minus(dec(m.expected_monthly_delta)).toFixed(2) : null,
      caveat: 'Portfolio KPI deltas include effects unrelated to this decision; attribution is indicative only.' };
  }
  if (persist) {
    await tx.query('UPDATE executive_decisions SET actual_outcome = $2, outcome_measured_at = now(), updated_at = now() WHERE id = $1', [id, JSON.stringify(result)]);
    await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'decision.outcome_measured', entityType: 'executive_decisions', entityId: id, payload: result });
  }
  return result;
}

export async function tenantUsers(tx: Tx) {
  return q<{ id: string; name: string; email: string; role: string }>(tx, `SELECT u.id, u.name, u.email, r.code AS role FROM memberships m JOIN users u ON u.id = m.user_id JOIN roles r ON r.id = m.role_id WHERE m.is_active ORDER BY u.name`);
}
export { addDays };
