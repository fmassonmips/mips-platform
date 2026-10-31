/**
 * KPI calculation service: registry sync, persisted calculation runs, confidence
 * classification and retrieval with period comparison.
 */
import { createHash } from 'node:crypto';
import type { Tx } from '../db';
import { q, one } from '../db';
import { audit } from '../audit';
import { KPIS, KPI_BY_CODE, KPI_ENGINE_VERSION, computeKpis, formulaHash, type KpiDef } from '../engine/kpis';
import { loadPeriodFacts, inputFingerprint } from './facts';
import { runChecks, type CheckResult } from './checks';
import { addDays, daysBetween, monthsInRange } from '../dates';

export type Confidence = 'VERIFIED' | 'PENDING' | 'DISPUTED' | 'ESTIMATED';

/** Upsert KPI definitions and create a new formula version whenever the hash changes. */
export async function syncKpiRegistry(tx: Tx, tenantId: string, userId: string | null = null): Promise<{ created: string[] }> {
  const created: string[] = [];
  for (const k of KPIS) {
    const def = await one<{ id: string }>(tx,
      `INSERT INTO kpi_definitions (tenant_id, code, name, category, definition, unit, direction, owner, materiality_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, definition = EXCLUDED.definition, unit = EXCLUDED.unit, direction = EXCLUDED.direction
       RETURNING id`, [tenantId, k.code, k.name, k.category, k.definition, k.unit, k.direction, k.owner, k.materialityPct ?? 5]);
    const hash = formulaHash(k);
    const latest = await one<{ version: number; formula_hash: string }>(tx, 'SELECT version, formula_hash FROM formula_versions WHERE kpi_id = $1 ORDER BY version DESC LIMIT 1', [def!.id]);
    if (latest?.formula_hash === hash) continue;
    await tx.query(
      `INSERT INTO formula_versions (tenant_id, kpi_id, version, formula, numerator, denominator, data_source, grain, period_basis, currency_rule, rounding, validation_rules, engine_ref, formula_hash, effective_from, approved_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,current_date,$15)`,
      [tenantId, def!.id, (latest?.version ?? 0) + 1, k.formula, k.numerator ?? null, k.denominator ?? null, k.dataSource, k.grain, k.periodBasis, k.currencyRule, k.rounding, JSON.stringify(k.validation), `${KPI_ENGINE_VERSION}#${k.code}`, hash, userId]);
    created.push(k.code);
  }
  if (created.length) await audit(tx, { tenantId, userId, action: 'kpi.formula_versions_registered', entityType: 'formula_versions', payload: { codes: created, engine: KPI_ENGINE_VERSION } });
  return { created };
}

function hashInputs(v: unknown): string { return createHash('sha256').update(JSON.stringify(v)).digest('hex'); }

async function periodLockState(tx: Tx, start: string, end: string): Promise<boolean> {
  const months = monthsInRange(start, end);
  const r = await one<{ n: number }>(tx, `SELECT count(*)::int AS n FROM financial_periods WHERE status = 'locked' AND period = ANY($1::date[])`, [months]);
  return (r?.n ?? 0) === months.length;
}

function classify(k: KpiDef, checks: CheckResult[], locked: boolean, value: string | null, manual?: { status: Confidence; input_hash: string } | null, inputHash?: string): { confidence: Confidence; reason: string } {
  const failing = checks.filter((c) => c.status === 'fail' && c.affects.some((s) => k.sources.includes(s)));
  if (failing.length) return { confidence: 'DISPUTED', reason: `Failing control(s): ${failing.map((c) => c.code).join(', ')}` };
  if (manual && manual.input_hash === inputHash) return { confidence: manual.status, reason: 'Management verification recorded for identical inputs' };
  if (value === null) return { confidence: 'PENDING', reason: 'Not computable for this period' };
  if (k.sources.includes('cost_model')) return { confidence: 'ESTIMATED', reason: 'Depends on the documented direct-processing cost model (estimate)' };
  if (k.sources.includes('budget') && !locked) return { confidence: 'PENDING', reason: 'Actuals not yet locked' };
  if (locked) return { confidence: 'VERIFIED', reason: 'All controls passed; periods locked; sources reconciled' };
  return { confidence: 'PENDING', reason: 'Period open — awaiting close and verification' };
}

export interface RunOptions { start: string; end: string; reason: string; userId: string | null; tenantId: string }

/** Execute and persist a calculation run (immutable results). */
export async function runCalculation(tx: Tx, o: RunOptions): Promise<string> {
  const fingerprint = await inputFingerprint(tx, o.start, o.end);
  const run = await one<{ id: string }>(tx,
    `INSERT INTO calc_runs (tenant_id, engine_version, period_start, period_end, triggered_by, trigger_reason, input_fingerprint) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [o.tenantId, KPI_ENGINE_VERSION, o.start, o.end, o.userId, o.reason, fingerprint]);
  const days = daysBetween(o.start, o.end);
  const priorEnd = addDays(o.start, -1); const priorStart = addDays(priorEnd, -days);
  const facts = await loadPeriodFacts(tx, o.start, o.end);
  const prior = await loadPeriodFacts(tx, priorStart, priorEnd);
  const checks = await runChecks(tx, o.start, o.end);
  const locked = await periodLockState(tx, o.start, o.end);
  const values = computeKpis(facts, prior);
  const defs = await q<{ id: string; code: string; fv: string }>(tx, `SELECT d.id, d.code, (SELECT id FROM formula_versions WHERE kpi_id = d.id ORDER BY version DESC LIMIT 1) AS fv FROM kpi_definitions d WHERE d.tenant_id = app_tenant()`);
  const defMap = new Map(defs.map((d) => [d.code, d]));
  const manual = await q<any>(tx, `SELECT DISTINCT ON (v.kpi_id) d.code, v.status, r.input_hash FROM kpi_verifications v JOIN kpi_definitions d ON d.id = v.kpi_id
    LEFT JOIN kpi_results r ON r.id = v.kpi_result_id WHERE v.period_start = $1 ORDER BY v.kpi_id, v.created_at DESC`, [o.start]);
  const manualMap = new Map(manual.map((m) => [m.code, m]));
  await tx.query(`UPDATE kpi_results SET is_current = false WHERE is_current AND period_start = $1 AND period_end = $2`, [o.start, o.end]);
  for (const v of values) {
    const d = defMap.get(v.code); if (!d || !d.fv) continue;
    const k = KPI_BY_CODE[v.code];
    const inputHash = hashInputs({ code: v.code, dim: v.dimension, inputs: v.inputs, start: o.start, end: o.end });
    const c = classify(k, checks, locked, v.value, manualMap.get(v.code), inputHash);
    await tx.query(
      `INSERT INTO kpi_results (tenant_id, calc_run_id, kpi_id, formula_version_id, period_start, period_end, dimension, value, currency, inputs, input_hash, status_note, confidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [o.tenantId, run!.id, d.id, d.fv, o.start, o.end, v.dimension, v.value, k.unit === 'money' ? facts.currency : null, JSON.stringify(v.inputs), inputHash, [v.note, c.reason].filter(Boolean).join(' · '), c.confidence]);
  }
  await tx.query(`UPDATE calc_runs SET status = 'completed', finished_at = now(), checks = $2 WHERE id = $1`, [run!.id, JSON.stringify(checks)]);
  await audit(tx, { tenantId: o.tenantId, userId: o.userId, action: 'kpi.calculation_run', entityType: 'calc_runs', entityId: run!.id, payload: { start: o.start, end: o.end, reason: o.reason, fingerprint, failing_checks: checks.filter((c) => c.status === 'fail').map((c) => c.code) } });
  return run!.id;
}

/** Returns the current run for a range, recalculating if inputs changed since it ran. */
export async function ensureRun(tx: Tx, o: RunOptions): Promise<{ runId: string; recalculated: boolean }> {
  const fp = await inputFingerprint(tx, o.start, o.end);
  const r = await one<{ id: string; input_fingerprint: string }>(tx,
    `SELECT id, input_fingerprint FROM calc_runs WHERE status='completed' AND period_start = $1 AND period_end = $2 AND engine_version = $3 ORDER BY started_at DESC LIMIT 1`, [o.start, o.end, KPI_ENGINE_VERSION]);
  if (r && r.input_fingerprint === fp) return { runId: r.id, recalculated: false };
  return { runId: await runCalculation(tx, o), recalculated: true };
}

export interface KpiRow { id: string; code: string; name: string; category: string; unit: string; direction: string; dimension: string; value: string | null; currency: string | null; inputs: Record<string, string | null>; confidence: Confidence; status_note: string | null; period_start: string; period_end: string; formula_version: number; formula: string; data_source: string; owner: string; calc_run_id: string; computed_at: string }

export async function resultsForRun(tx: Tx, runId: string): Promise<KpiRow[]> {
  return q<KpiRow>(tx, `SELECT r.id, d.code, d.name, d.category, d.unit, d.direction, r.dimension, r.value::text, r.currency, r.inputs, r.confidence, r.status_note,
      r.period_start, r.period_end, f.version AS formula_version, f.formula, f.data_source, d.owner, r.calc_run_id, r.computed_at
    FROM kpi_results r JOIN kpi_definitions d ON d.id = r.kpi_id JOIN formula_versions f ON f.id = r.formula_version_id
    WHERE r.calc_run_id = $1 ORDER BY d.category, d.code, r.dimension`, [runId]);
}

/** Current + comparison period KPI sets and a monthly trend for sparklines. */
export async function kpiDashboard(tx: Tx, o: RunOptions, compare: 'prior' | 'yoy' = 'prior') {
  const cur = await ensureRun(tx, o);
  const days = daysBetween(o.start, o.end);
  let cs: string, ce: string;
  if (compare === 'yoy') { cs = `${Number(o.start.slice(0, 4)) - 1}${o.start.slice(4)}`; ce = `${Number(o.end.slice(0, 4)) - 1}${o.end.slice(4)}`; if (ce.endsWith('-02-29')) ce = ce.replace('-02-29', '-02-28'); }
  else { ce = addDays(o.start, -1); cs = addDays(ce, -days); }
  const cmp = await ensureRun(tx, { ...o, start: cs, end: ce, reason: `comparison for ${o.start}..${o.end}` });
  const [current, comparison] = await Promise.all([resultsForRun(tx, cur.runId), resultsForRun(tx, cmp.runId)]);
  const run = await one<any>(tx, 'SELECT id, checks, started_at, finished_at, input_fingerprint, engine_version FROM calc_runs WHERE id = $1', [cur.runId]);
  return { current, comparison, comparisonRange: { start: cs, end: ce }, run, recalculated: cur.recalculated };
}

/** Monthly series of selected KPIs (persisted monthly runs) for trends. */
export async function monthlySeries(tx: Tx, tenantId: string, userId: string | null, months: string[], codes: string[]) {
  const out: Record<string, { period: string; value: string | null; confidence: string }[]> = {};
  for (const c of codes) out[c] = [];
  for (const m of months) {
    const end = addDays(monthsInRange(m, m)[0].slice(0, 7) + '-01', 0);
    const mEnd = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const { runId } = await ensureRun(tx, { tenantId, userId, start: end, end: mEnd, reason: 'monthly series' });
    const rows = await q<any>(tx, `SELECT d.code, r.value::text, r.confidence FROM kpi_results r JOIN kpi_definitions d ON d.id = r.kpi_id WHERE r.calc_run_id = $1 AND r.dimension = 'total' AND d.code = ANY($2)`, [runId, codes]);
    for (const c of codes) { const r = rows.find((x) => x.code === c); out[c].push({ period: m, value: r?.value ?? null, confidence: r?.confidence ?? 'PENDING' }); }
  }
  return out;
}
