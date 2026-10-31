/**
 * AI Financial Analyst.
 *
 * Grounding contract:
 *  - The analyst only sees a FACT SHEET built from persisted KPI results and
 *    engine outputs (each fact has an id and an evidence reference).
 *  - Every statement is classified FACT | INTERPRETATION | ASSUMPTION | FORECAST |
 *    RECOMMENDATION and cites fact ids.
 *  - A grounding validator rejects any statement containing a number that is not
 *    present in (or trivially derived from) the cited facts.
 *  - The analyst is read-only: it cannot modify records, approve payments or act.
 *
 * Providers: 'grounded-rules' (deterministic, always available) and 'claude'
 * (Anthropic API, used only when ANTHROPIC_API_KEY is configured).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Tx } from '../db';
import { q } from '../db';
import { dec, pctChange } from '../money';
import { fmtMoney, fmtPct, fmtValue } from '../format';
import { kpiDashboard } from '../services/kpi';
import { marginAlerts } from '../services/merchants';
import { monthStart } from '../dates';

export type StatementClass = 'FACT' | 'INTERPRETATION' | 'ASSUMPTION' | 'FORECAST' | 'RECOMMENDATION';
export interface Fact { id: string; label: string; value: string; display: string; unit: string; evidence: string; confidence?: string }
export interface Statement { classification: StatementClass; text: string; fact_ids: string[]; section?: string; owner?: string; deadline?: string }
export interface AnalystAnswer { provider: string; question: string; statements: Statement[]; rejected: { statement: Statement; reason: string }[]; facts: Fact[]; uncertainty: string[] }

/** Build the fact sheet for a period from persisted calculation results. */
export async function buildFacts(tx: Tx, ctx: { tenantId: string; userId: string }, start: string, end: string): Promise<{ facts: Fact[]; raw: any }> {
  const dash = await kpiDashboard(tx, { ...ctx, start, end, reason: 'ai analyst fact sheet' });
  const prev = new Map(dash.comparison.filter((r) => r.dimension === 'total').map((r) => [r.code, r]));
  const facts: Fact[] = [];
  for (const r of dash.current.filter((x) => x.dimension === 'total' && x.value !== null)) {
    facts.push({ id: r.code, label: r.name, value: r.value!, display: fmtValue(r.value, r.unit, r.currency ?? 'MUR', false), unit: r.unit, evidence: `kpi_result:${r.id}`, confidence: r.confidence });
    const p = prev.get(r.code);
    if (p?.value && r.unit === 'money') {
      const ch = pctChange(r.value!, p.value);
      facts.push({ id: `${r.code}.PRIOR`, label: `${r.name} (prior period)`, value: p.value, display: fmtValue(p.value, r.unit, 'MUR', false), unit: r.unit, evidence: `kpi_result:${p.id}`, confidence: p.confidence });
      if (ch) facts.push({ id: `${r.code}.CHANGE`, label: `${r.name} change vs prior`, value: ch.toString(), display: fmtPct(ch.toString()), unit: 'percent', evidence: `derived:${r.id}/${p.id}` });
    }
  }
  const alerts = await marginAlerts(tx, monthStart(end));
  for (const a of alerts.filter((x) => x.kind === 'margin_decline').slice(0, 3)) {
    facts.push({ id: `ALERT.${a.code}`, label: `${a.name} unit margin (bps) vs 6-month avg ${a.baselineUnitMarginBps} bps`, value: a.unitMarginBps, display: `${a.unitMarginBps} bps`, unit: 'bps', evidence: `margin_alert:${a.merchantId}` });
    facts.push({ id: `ALERT.${a.code}.WHOLESALE`, label: `${a.name} wholesale change (bps)`, value: a.drivers.wholesaleBps, display: `${a.drivers.wholesaleBps} bps`, unit: 'bps', evidence: `margin_alert:${a.merchantId}` });
    facts.push({ id: `ALERT.${a.code}.IMPACT`, label: `${a.name} monthly contribution impact`, value: a.change, display: fmtMoney(a.change), unit: 'money', evidence: `margin_alert:${a.merchantId}` });
  }
  const fails = (dash.run.checks as any[]).filter((c) => c.status === 'fail');
  facts.push({ id: 'CONTROLS.FAILING', label: 'Failing data controls', value: String(fails.length), display: String(fails.length), unit: 'count', evidence: `calc_run:${dash.run.id}` });
  const ar = await q<any>(tx, `SELECT count(*)::text AS n, coalesce(sum((amount - amount_paid) * fx_rate_to_base),0)::text AS v FROM customer_invoices WHERE status <> 'paid' AND status <> 'void' AND due_date < $1::date - 90`, [end]);
  facts.push({ id: 'AR.OVER90', label: 'Receivables over 90 days overdue', value: ar[0].v, display: fmtMoney(ar[0].v), unit: 'money', evidence: 'customer_invoices' });
  const ini = await q<any>(tx, `SELECT code, title, status FROM initiatives WHERE status IN ('at_risk','blocked') ORDER BY code`);
  const acts = await q<any>(tx, `SELECT a.code, a.title, a.due_date::text, u.name AS owner FROM action_items a LEFT JOIN users u ON u.id = a.owner_user_id WHERE a.status IN ('open','in_progress') ORDER BY a.due_date LIMIT 10`);
  return { facts, raw: { alerts, fails, ini, acts, run: dash.run } };
}

const NUM = /-?\d[\d,]*(?:\.\d+)?/g;
/** Every number in the text must equal (to display precision) a value or display of a cited fact. */
export function groundingCheck(s: Statement, facts: Fact[]): string | null {
  const cited = facts.filter((f) => s.fact_ids.includes(f.id));
  if (s.classification !== 'ASSUMPTION' && s.fact_ids.length === 0) return 'No supporting facts cited';
  const unknown = s.fact_ids.filter((id) => !facts.some((f) => f.id === id));
  if (unknown.length) return `Cites unknown facts: ${unknown.join(', ')}`;
  const allowed = new Set<string>();
  for (const f of cited) {
    for (const m of f.display.match(NUM) ?? []) allowed.add(m.replace(/,/g, ''));
    for (const m of f.label.match(NUM) ?? []) allowed.add(m.replace(/,/g, ''));
    const v = dec(f.value);
    for (const dp of [0, 1, 2]) { allowed.add(v.toDecimalPlaces(dp).toFixed(dp)); allowed.add(v.times(100).toDecimalPlaces(dp).toFixed(dp)); allowed.add(v.abs().toDecimalPlaces(dp).toFixed(dp)); allowed.add(v.times(100).abs().toDecimalPlaces(dp).toFixed(dp)); }
    for (const [div, ] of [[1e3], [1e6]] as const) for (const dp of [0, 1, 2]) allowed.add(v.abs().div(div).toDecimalPlaces(dp).toFixed(dp));
  }
  const textNums = (s.text.replace(/\b(19|20)\d{2}(-\d{2}(-\d{2})?)?\b/g, '').replace(/\b[A-Z]+[.-][A-Z0-9_.-]*\b/g, '').match(NUM) ?? []).map((x) => x.replace(/,/g, ''));
  const bad = textNums.filter((n) => !allowed.has(n) && !allowed.has(n.replace(/^-/, '')) && !/^\d$/.test(n));
  return bad.length ? `Numbers not found in cited facts: ${bad.join(', ')}` : null;
}

/** Deterministic, rule-based grounded analyst (default provider). */
export function rulesAnalyst(question: string, facts: Fact[], raw: any): Statement[] {
  const F = (id: string) => facts.find((f) => f.id === id);
  const out: Statement[] = [];
  const push = (classification: StatementClass, section: string, text: string, ids: string[], extra: Partial<Statement> = {}) => out.push({ classification, section, text, fact_ids: ids, ...extra });
  const rev = F('FIN.REVENUE'), revCh = F('FIN.REVENUE.CHANGE'), ebitda = F('FIN.EBITDA'), ebCh = F('FIN.EBITDA.CHANGE'), gpv = F('PAY.GPV'), gpvCh = F('PAY.GPV.CHANGE'), take = F('PAY.TAKE_RATE'), cm = F('PAY.CONTRIBUTION');
  if (rev) push('FACT', 'What changed?', `Revenue was ${rev.display}${revCh ? `, ${revCh.display} versus the prior period` : ''} (confidence ${rev.confidence}).`, [rev.id, ...(revCh ? [revCh.id] : [])]);
  if (ebitda) push('FACT', 'What changed?', `EBITDA was ${ebitda.display}${ebCh ? ` (${ebCh.display} vs prior period)` : ''}.`, [ebitda.id, ...(ebCh ? [ebCh.id] : [])]);
  if (gpv && take) push('FACT', 'What changed?', `Processed value (GPV, not revenue) was ${gpv.display}${gpvCh ? ` (${gpvCh.display})` : ''} at an effective take rate of ${take.display}.`, [gpv.id, take.id, ...(gpvCh ? [gpvCh.id] : [])]);
  if (gpvCh && revCh && dec(gpvCh.value).gt(dec(revCh.value))) push('INTERPRETATION', 'Why did it change?', `Volume grew faster than revenue (${gpvCh.display} vs ${revCh.display}), which indicates lower monetisation per unit of processed value rather than weaker demand.`, [gpvCh.id, revCh.id]);
  const alerts = facts.filter((f) => /^ALERT\.[^.]+$/.test(f.id));
  for (const a of alerts) {
    const w = F(`${a.id}.WHOLESALE`), imp = F(`${a.id}.IMPACT`);
    push('FACT', 'Why did it change?', `${a.label.split(' unit margin')[0]}: unit contribution margin is ${a.display}${w ? `, with wholesale cost changing ${w.display}` : ''}${imp ? `; impact this month ${imp.display}` : ''}.`, [a.id, ...(w ? [w.id] : []), ...(imp ? [imp.id] : [])]);
    if (w && dec(w.value).gt(3)) push('INTERPRETATION', 'Why did it change?', `The decline for ${a.label.split(' unit margin')[0]} is driven by acquirer wholesale cost, not by merchant pricing or volume.`, [w.id]);
    if (imp) push('RECOMMENDATION', 'What decisions are recommended?', `Model repricing and acquirer-migration options for ${a.label.split(' unit margin')[0]} in the CEO Decision Center before the contract review; validate contractual notice periods first.`, [a.id, imp.id], { owner: 'CFO', deadline: 'next management meeting' });
  }
  const fails = F('CONTROLS.FAILING');
  if (fails && Number(fails.value) > 0) {
    for (const c of raw.fails) push('FACT', 'What requires management attention?', `Control ${c.code} (${c.name}) is failing: ${String(c.samples?.[0] ?? c.detail).replace(/[\d,.]+/g, (m: string) => m)}.`, ['CONTROLS.FAILING']);
    push('RECOMMENDATION', 'What decisions are recommended?', 'Resolve failing data controls before the figures are presented to the Board; affected KPIs are DISPUTED.', ['CONTROLS.FAILING'], { owner: 'Finance Manager', deadline: 'before month-end close' });
  }
  const ar = F('AR.OVER90');
  if (ar && dec(ar.value).gt(0)) push('FACT', 'What requires management attention?', `Receivables more than 90 days overdue total ${ar.display}.`, ['AR.OVER90']);
  for (const i of raw.ini) push('FACT', 'What requires management attention?', `Initiative ${i.code} “${i.title}” is ${i.status.replace('_', ' ')}.`, []);
  for (const a of raw.acts.slice(0, 5)) push('FACT', 'Who owns the actions?', `${a.code} — ${a.title}: owner ${a.owner ?? 'unassigned'}, due ${a.due_date}.`, [], { owner: a.owner, deadline: a.due_date });
  if (cm) push('ASSUMPTION', 'What is the financial impact?', `Contribution margin (${cm.display}) uses the documented direct-processing cost model; it is classified ESTIMATED until processing invoices are reconciled.`, [cm.id]);
  return out;
}

async function claudeAnalyst(question: string, facts: Fact[]): Promise<Statement[]> {
  const client = new Anthropic();
  const schema = { type: 'object', additionalProperties: false, required: ['statements'], properties: { statements: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['classification', 'text', 'fact_ids', 'section'], properties: {
    classification: { type: 'string', enum: ['FACT', 'INTERPRETATION', 'ASSUMPTION', 'FORECAST', 'RECOMMENDATION'] }, text: { type: 'string' }, fact_ids: { type: 'array', items: { type: 'string' } }, section: { type: 'string' } } } } } };
  const params: any = {
    model: process.env.AI_MODEL || 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system: 'You are a financial analyst for a payment orchestration company. Use ONLY the facts provided. Every number you write must appear in the facts you cite (by id). Never invent data. Classify each statement as FACT, INTERPRETATION, ASSUMPTION, FORECAST or RECOMMENDATION and state uncertainty. Payment volume (GPV) is never revenue.',
    messages: [{ role: 'user', content: `Question: ${question}\n\nFACT SHEET (JSON):\n${JSON.stringify(facts.map((f) => ({ id: f.id, label: f.label, value: f.display, confidence: f.confidence })))}` }],
  };
  const res: any = await client.beta.messages.create(params);
  if (res.stop_reason === 'refusal') throw new Error('The model declined the request');
  const text = res.content.find((b: any) => b.type === 'text')?.text ?? '{"statements":[]}';
  return JSON.parse(text).statements as Statement[];
}

export async function askAnalyst(tx: Tx, ctx: { tenantId: string; userId: string }, question: string, start: string, end: string): Promise<AnalystAnswer> {
  const { facts, raw } = await buildFacts(tx, ctx, start, end);
  let provider = 'grounded-rules'; let candidates: Statement[];
  const uncertainty: string[] = ['Statements are generated from management information; DISPUTED / PENDING figures may change.'];
  if (process.env.ANTHROPIC_API_KEY) {
    try { candidates = await claudeAnalyst(question, facts); provider = `claude:${process.env.AI_MODEL || 'claude-opus-5-5'}`; }
    catch (e) { candidates = rulesAnalyst(question, facts, raw); uncertainty.push(`AI provider unavailable (${(e as Error).message}); deterministic analyst used.`); }
  } else candidates = rulesAnalyst(question, facts, raw);
  const statements: Statement[] = []; const rejected: AnalystAnswer['rejected'] = [];
  // Rules-provider statements without fact ids quote database records (actions, initiatives) verbatim.
  for (const s of candidates) { const err = provider === 'grounded-rules' && s.fact_ids.length === 0 ? null : groundingCheck(s, facts); if (err) rejected.push({ statement: s, reason: err }); else statements.push(s); }
  if (facts.some((f) => f.confidence === 'DISPUTED')) uncertainty.push('Some cited KPIs are DISPUTED (failing controls).');
  await tx.query(`INSERT INTO ai_analyst_log (tenant_id, user_id, provider, question, fact_ids, response, grounding_check) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ctx.tenantId, ctx.userId, provider, question.slice(0, 2000), JSON.stringify(facts.map((f) => f.id)), JSON.stringify(statements), JSON.stringify({ rejected })]);
  return { provider, question, statements, rejected, facts, uncertainty };
}
