/**
 * Board Reporting Center. A report is generated once from the calculation engine
 * and frozen (immutable row, SHA-256 of content). PDF, Excel and presentation
 * exports all render the same frozen content, so every format says the same thing.
 *
 * Every report includes: reporting period, data refresh timestamp, financial
 * definitions, material assumptions, data validation status and evidence references.
 */
import { createHash } from 'node:crypto';
import type { Tx } from '../db';
import { q, one } from '../db';
import { audit } from '../audit';
import { dec } from '../money';
import { fmtMoney, fmtValue, fmtPct } from '../format';
import { KPI_BY_CODE } from '../engine/kpis';
import { kpiDashboard } from './kpi';
import { economicsBy, marginAlerts } from './merchants';
import { getDecision, measureOutcome } from './decisions';
import { verifyMerchantFees } from './proof';
import { askAnalyst } from '../ai/analyst';
import { monthStart } from '../dates';
import { runway } from '../engine/runway';
import { concentration } from '../engine/bridge';

export type Section =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'callout'; tone: 'info' | 'warn' | 'neg' | 'pos'; title: string; text: string }
  | { type: 'table'; title?: string; columns: string[]; rows: (string | null)[][]; align?: ('l' | 'r')[] }
  | { type: 'statements'; title?: string; items: { classification: string; text: string; refs: string[]; owner?: string; deadline?: string }[] };

export const REPORT_KINDS = {
  monthly_management: 'Monthly management report', quarterly_board: 'Quarterly Board pack', annual_summary: 'Annual financial summary', budget_performance: 'Budget performance report',
  merchant_profitability: 'Merchant profitability report', liquidity: 'Liquidity report', strategy_execution: 'Strategic execution report', risk_summary: 'Risk summary',
  ceo_briefing: 'CEO briefing', decision_outcome: 'Decision outcome report (issue → evidence → decision → outcome)',
} as const;
export type ReportKind = keyof typeof REPORT_KINDS;

const KPI_SETS = {
  financial: ['FIN.REVENUE', 'FIN.REVENUE_GROWTH', 'FIN.GROSS_MARGIN', 'FIN.EBITDA', 'FIN.OPERATING_PROFIT', 'FIN.NET_PROFIT', 'FIN.CASH_BALANCE', 'FIN.FREE_CASH_FLOW', 'FIN.AR', 'FIN.DSO'],
  payments: ['PAY.GPV', 'PAY.SUCCESS_COUNT', 'PAY.SUCCESS_RATE', 'PAY.NET_REVENUE', 'PAY.TAKE_RATE', 'PAY.CONTRIBUTION', 'PAY.COST_PER_TXN'],
  operations: ['OPS.ACTIVE_MERCHANTS', 'OPS.NEW_MERCHANTS', 'OPS.MERCHANT_CHURN', 'OPS.ONBOARDING_DAYS', 'OPS.UPTIME', 'OPS.SUPPORT_INCIDENTS'],
  budget: ['FIN.REVENUE', 'FIN.BUDGET_VARIANCE_REVENUE', 'FIN.EBITDA', 'FIN.BUDGET_VARIANCE_EBITDA'],
};

interface Ctx { tenantId: string; userId: string }

export async function generateReport(tx: Tx, a: Ctx, kind: ReportKind, start: string, end: string, opts: { decisionId?: string; title?: string } = {}) {
  const dash = await kpiDashboard(tx, { ...a, start, end, reason: `report:${kind}` });
  const cur = new Map(dash.current.filter((r) => r.dimension === 'total').map((r) => [r.code, r]));
  const prev = new Map(dash.comparison.filter((r) => r.dimension === 'total').map((r) => [r.code, r]));
  const evidence = new Set<string>([`calc_run:${dash.run.id}`]);
  const used = new Set<string>();
  const kpiTable = (title: string, codes: string[]): Section => ({
    type: 'table', title, columns: ['KPI', 'Value', 'Comparison', 'Change', 'Confidence'], align: ['l', 'r', 'r', 'r', 'l'],
    rows: codes.filter((c) => cur.has(c)).map((c) => { const r = cur.get(c)!; const p = prev.get(c); used.add(c); evidence.add(`kpi_result:${r.id}`);
      const ch = r.value && p?.value && !dec(p.value).isZero() && r.unit === 'money' ? fmtPct(dec(r.value).minus(p.value).div(dec(p.value).abs()).toString()) : r.value && p?.value ? fmtValue(dec(r.value).minus(p.value).toString(), r.unit) : '—';
      return [r.name, fmtValue(r.value, r.unit, 'MUR', false), fmtValue(p?.value ?? null, r.unit, 'MUR', false), ch, r.confidence]; }),
  });
  const sections: Section[] = [];
  const fails = (dash.run.checks as any[]).filter((c) => c.status === 'fail');
  const briefing = async (q: string) => {
    const ans = await askAnalyst(tx, a, q, start, end);
    const order = ['What changed?', 'Why did it change?', 'What is the financial impact?', 'What requires management attention?', 'What decisions are recommended?', 'Who owns the actions?'];
    const out: Section[] = [];
    for (const sec of order) { const items = ans.statements.filter((s) => (s.section ?? 'What changed?') === sec); if (items.length) out.push({ type: 'statements', title: sec, items: items.map((s) => ({ classification: s.classification, text: s.text, refs: s.fact_ids, owner: s.owner, deadline: s.deadline })) }); }
    const dl = ans.statements.filter((s) => s.deadline); if (dl.length) out.push({ type: 'statements', title: 'What is the deadline?', items: dl.map((s) => ({ classification: 'FACT', text: `${s.owner ?? 'Owner tbc'} — ${s.deadline}: ${s.text}`, refs: s.fact_ids })) });
    out.push({ type: 'paragraph', text: `Analyst provider: ${ans.provider}. ${ans.rejected.length} statement(s) rejected by the grounding validator. ${ans.uncertainty.join(' ')}` });
    return out;
  };
  const merchantTable = async (n = 10) => {
    const e = await economicsBy(tx, start, end, 'merchant');
    return { type: 'table', title: `Merchant contribution (top ${n} of ${e.rows.length}) — overhead allocated ${e.allocation}`, columns: ['Merchant', 'GPV', 'Net revenue', 'Contribution', 'Take rate (bps)', 'Net profit'], align: ['l', 'r', 'r', 'r', 'r', 'r'],
      rows: e.rows.slice(0, n).map((r) => [r.name, fmtMoney(r.gpv), fmtMoney(r.netRevenue), fmtMoney(r.contribution), r.takeRateBps ? dec(r.takeRateBps).toFixed(1) : '—', fmtMoney(r.netProfit)]) } as Section;
  };
  const liquidity = async (): Promise<Section[]> => {
    const months = await q<any>(tx, `SELECT date_trunc('month', bt.txn_date)::date AS m, sum(bt.amount)::text AS v FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id WHERE ba.account_class = 'operating' AND bt.category NOT IN ('loan','equity') AND bt.txn_date BETWEEN ($1::date - interval '12 months') AND $1 GROUP BY 1 ORDER BY 1`, [end]);
    const cash = cur.get('FIN.CASH_BALANCE');
    const r = runway({ unrestrictedCash: cash?.value ?? '0', restrictedCash: cash?.inputs?.restricted_excluded ?? '0', monthlyNetCashFlows: months.map((m) => m.v), minimumLiquidity: '3000000' });
    const req = await q<any>(tx, 'SELECT code, description, minimum_amount_base::text, basis FROM regulatory_requirements ORDER BY code');
    return [{ type: 'table', title: 'Liquidity', columns: ['Measure', 'Value'], align: ['l', 'r'], rows: [['Unrestricted (operating) cash', fmtMoney(r.unrestrictedCash.toString())], ['Restricted / safeguarded / merchant funds (excluded)', fmtMoney(r.restrictedCash.toString())], ['Average monthly operating net cash flow (12 m)', fmtMoney(r.avgMonthlyNetFlow.toFixed(2))], ['Runway', r.status === 'cash_generative' ? 'Cash-generative — no finite runway' : r.runwayMonths ? `${r.runwayMonths.toFixed(1)} months` : '—'], ['Headroom over minimum liquidity', fmtMoney(r.headroom.toString())]] },
      { type: 'table', title: 'Regulatory & policy requirements', columns: ['Code', 'Requirement', 'Minimum', 'Basis'], rows: req.map((x) => [x.code, x.description, fmtMoney(x.minimum_amount_base), x.basis]) }];
  };
  const strategy = async (): Promise<Section[]> => {
    const ini = await q<any>(tx, `SELECT i.code, i.title, i.status, i.progress_pct::text, i.deadline::text, u.name AS owner, coalesce(d.code,'') AS decision FROM initiatives i LEFT JOIN users u ON u.id = i.owner_user_id LEFT JOIN executive_decisions d ON d.id = i.decision_id ORDER BY i.code`);
    const dec_ = await q<any>(tx, `SELECT d.code, d.title, d.status, d.implementation_deadline::text, o.name AS owner, d.expected_impact->>'monthly_ebitda_delta' AS exp, d.actual_outcome->>'variance_vs_expected' AS var FROM executive_decisions d LEFT JOIN users o ON o.id = d.owner_user_id ORDER BY d.created_at DESC LIMIT 15`);
    for (const d of dec_) evidence.add(`decision:${d.code}`);
    return [{ type: 'table', title: 'Decision register', columns: ['Decision', 'Title', 'Status', 'Owner', 'Deadline', 'Expected EBITDA/mo', 'Variance vs expected'], rows: dec_.map((d) => [d.code, d.title, d.status, d.owner, d.implementation_deadline, fmtMoney(d.exp), d.var ? fmtMoney(d.var) : 'not measured']) },
      { type: 'table', title: 'Strategic initiatives', columns: ['Initiative', 'Title', 'Status', 'Progress', 'Owner', 'Deadline', 'Decision'], rows: ini.map((i) => [i.code, i.title, i.status, `${i.progress_pct}%`, i.owner, i.deadline, i.decision]) }];
  };
  const risks = async (): Promise<Section[]> => {
    const e = await economicsBy(tx, start, end, 'merchant');
    const c = concentration(e.rows.map((r) => r.netRevenue));
    const ar = await one<any>(tx, `SELECT coalesce(sum((amount-amount_paid)*fx_rate_to_base) FILTER (WHERE due_date < $1::date - 90),0)::text AS o90, coalesce(sum((amount-amount_paid)*fx_rate_to_base) FILTER (WHERE disputed),0)::text AS disp FROM customer_invoices WHERE status NOT IN ('paid','void')`, [end]);
    const alerts = await marginAlerts(tx, monthStart(end));
    return [{ type: 'table', title: 'Risk register (data-derived)', columns: ['Risk', 'Indicator', 'Assessment'], rows: [
      ['Revenue concentration', `Top merchant ${c.top1Share ? fmtPct(c.top1Share.toString()) : '—'} · top 5 ${c.topShare ? fmtPct(c.topShare.toString()) : '—'} · HHI ${c.hhi?.toFixed(0) ?? '—'}`, c.top1Share && c.top1Share.gt(0.25) ? 'High' : 'Moderate'],
      ['Margin compression', `${alerts.filter((x) => x.kind === 'margin_decline').length} merchant(s) with unit-margin decline ≥ 10 %`, alerts.length ? 'Elevated' : 'Low'],
      ['Collections', `Over 90 days ${fmtMoney(ar.o90)} · disputed ${fmtMoney(ar.disp)}`, dec(ar.o90).gt(0) ? 'Monitor' : 'Low'],
      ['Data integrity', `${fails.length} failing control(s)`, fails.length ? 'Figures DISPUTED until resolved' : 'Controls passing'],
    ] }];
  };

  let title = opts.title ?? `${REPORT_KINDS[kind]} — ${start} to ${end}`;
  switch (kind) {
    case 'monthly_management': case 'quarterly_board': case 'annual_summary':
      sections.push({ type: 'heading', text: 'Executive summary' }, ...(await briefing('Summarise performance for the Board')));
      sections.push({ type: 'heading', text: 'Key performance indicators' }, kpiTable('Financial', KPI_SETS.financial), kpiTable('Payments', KPI_SETS.payments), kpiTable('Operations', KPI_SETS.operations));
      sections.push({ type: 'heading', text: 'Merchant economics' }, await merchantTable(10));
      sections.push({ type: 'heading', text: 'Liquidity' }, ...(await liquidity()));
      sections.push({ type: 'heading', text: 'Decisions & strategic execution' }, ...(await strategy()));
      sections.push({ type: 'heading', text: 'Risks' }, ...(await risks()));
      break;
    case 'budget_performance': {
      sections.push({ type: 'heading', text: 'Budget performance' }, kpiTable('Actual vs approved budget', KPI_SETS.budget));
      const com = await q<any>(tx, `SELECT c.period::text, c.line_key, c.comment, u.name FROM variance_commentary c LEFT JOIN users u ON u.id = c.author_id WHERE c.period BETWEEN date_trunc('month',$1::date) AND $2 ORDER BY c.period`, [start, end]);
      sections.push({ type: 'table', title: 'Variance commentary', columns: ['Period', 'Line', 'Commentary', 'Author'], rows: com.map((c) => [c.period.slice(0, 7), c.line_key, c.comment, c.name]) });
      break;
    }
    case 'merchant_profitability': {
      sections.push({ type: 'heading', text: 'Merchant profitability' }, kpiTable('Portfolio', ['PAY.GPV', 'PAY.NET_REVENUE', 'PAY.TAKE_RATE', 'PAY.CONTRIBUTION']), await merchantTable(30));
      const al = await marginAlerts(tx, monthStart(end));
      sections.push({ type: 'table', title: 'Margin alerts', columns: ['Merchant', 'Unit margin (bps)', '6-m avg (bps)', 'Wholesale Δ (bps)', 'Impact', 'Driver'], rows: al.map((x) => [x.name, x.unitMarginBps, x.baselineUnitMarginBps, x.drivers.wholesaleBps, fmtMoney(x.change), x.primaryDriver]) });
      break;
    }
    case 'liquidity': sections.push({ type: 'heading', text: 'Liquidity & treasury' }, kpiTable('Cash KPIs', ['FIN.CASH_BALANCE', 'FIN.FREE_CASH_FLOW', 'FIN.AR', 'FIN.DSO']), ...(await liquidity())); break;
    case 'strategy_execution': sections.push({ type: 'heading', text: 'Strategic execution' }, ...(await strategy()), kpiTable('Linked KPIs', ['OPS.ACTIVE_MERCHANTS', 'OPS.ONBOARDING_DAYS', 'OPS.UPTIME', 'PAY.SUCCESS_RATE', 'PAY.TAKE_RATE', 'FIN.EBITDA'])); break;
    case 'risk_summary': sections.push({ type: 'heading', text: 'Risk summary' }, ...(await risks())); break;
    case 'ceo_briefing': sections.push({ type: 'heading', text: 'CEO briefing' }, ...(await briefing('Monthly CEO briefing: what changed, why, impact, attention, decisions, owners, deadlines'))); break;
    case 'decision_outcome': {
      if (!opts.decisionId) throw new Error('Select a decision for a decision outcome report');
      const d = await getDecision(tx, opts.decisionId); if (!d) throw new Error('Decision not found');
      const outcome: any = await measureOutcome(tx, a, opts.decisionId, false);
      const s = d.scenario_id ? await one<any>(tx, 'SELECT * FROM scenarios WHERE id = $1', [d.scenario_id]) : null;
      evidence.add(`decision:${d.code}`); if (s) evidence.add(`scenario:${s.code}`);
      title = opts.title ?? `Decision outcome — ${d.code}: ${d.title}`;
      const m = d.measurement ?? {};
      sections.push({ type: 'heading', text: '1. Original issue' });
      if (m.type === 'merchant_contribution') {
        const base = s?.results?.context?.merchant;
        sections.push({ type: 'paragraph', text: `${m.merchant_name}: baseline monthly contribution ${fmtMoney(m.baseline_monthly_contribution)} over ${m.baseline_start} → ${m.baseline_end}${base ? ` (monthly GPV ${fmtMoney(base.gpv)}, MDR ${fmtMoney(base.mdr)}, wholesale ${fmtMoney(base.wholesale)})` : ''}.` });
        const al = (await marginAlerts(tx, monthStart(m.baseline_end))).find((x) => x.merchantId === m.merchant_id);
        if (al) sections.push({ type: 'callout', tone: 'neg', title: 'Margin alert at decision time', text: `Unit margin ${al.unitMarginBps} bps vs ${al.baselineUnitMarginBps} bps 6-month average; wholesale ${al.drivers.wholesaleBps} bps; driver: ${al.primaryDriver}.` });
      } else sections.push({ type: 'paragraph', text: d.rationale });
      sections.push({ type: 'heading', text: '2. Supporting evidence' });
      sections.push({ type: 'table', title: 'Evidence register', columns: ['Kind', 'Reference', 'Description'], rows: d.evidence.map((e: any) => [e.kind, e.reference, e.description]) });
      if (m.type === 'merchant_contribution') {
        const v = await verifyMerchantFees(tx, m.merchant_id, m.baseline_start, m.baseline_end);
        evidence.add(`fee_recomputation:${m.merchant_id}:${m.baseline_start}..${m.baseline_end}`);
        sections.push({ type: 'callout', tone: v.mismatchCount ? 'neg' : 'pos', title: 'Independent fee re-computation (Proof Center)', text: `${v.transactions} transactions re-priced from effective pricing agreements and fee schedules: ${v.mismatchCount} mismatches. Stored contribution ${fmtMoney(v.stored.contribution, 'MUR', { dp: 2 })}, recomputed ${fmtMoney(v.recomputed.contribution, 'MUR', { dp: 2 })}.` });
        sections.push({ type: 'table', title: 'Fee schedules applied', columns: ['Schedule', 'Acquirer', 'Region', 'bps', 'From', 'To', 'Txns'], rows: v.schedulesUsed.map((x: any) => [x.schedule_ref, x.acquirer, x.card_region, x.wholesale_bps, x.effective_from, x.effective_to, String(x.txns)]) });
      }
      if (s) {
        const alt = s.comparison_group ? await q<any>(tx, 'SELECT code, name, status, results FROM scenarios WHERE comparison_group = $1 ORDER BY created_at', [s.comparison_group]) : [s];
        sections.push({ type: 'table', title: 'Scenarios considered', columns: ['Scenario', 'Name', 'Status', 'Horizon EBITDA', 'Downside cash', 'Payback'], rows: alt.map((x) => [x.code, x.name, x.status, fmtMoney(x.results.proposed.totals.ebitda), fmtMoney(x.results.downside.totals.cashFlow), x.results.proposed.paybackMonth === null ? 'n/a' : `M${x.results.proposed.paybackMonth}`]) });
      }
      sections.push({ type: 'heading', text: '3. Approved decision' });
      sections.push({ type: 'table', columns: ['Field', 'Value'], rows: [['Decision ID', d.code], ['Description', d.description], ['Rationale', d.rationale], ['Owner', d.owner_name], ['Approver', d.approver_name], ['Approval date', d.approved_at ? new Date(d.approved_at).toISOString().slice(0, 10) : 'not approved'], ['Implementation deadline', d.implementation_deadline], ['Status', d.status], ['Expected monthly EBITDA impact', fmtMoney(d.expected_impact?.monthly_ebitda_delta)], ['Initiative', d.initiatives.map((i: any) => `${i.code} (${i.status})`).join(', ') || '—']] });
      sections.push({ type: 'heading', text: '4. Measured outcome' });
      if (outcome.status !== 'measured') sections.push({ type: 'callout', tone: 'info', title: 'Awaiting data', text: outcome.message });
      else if (outcome.type === 'merchant_contribution') {
        sections.push({ type: 'table', columns: ['Measure', 'Value'], rows: [['Window', `${outcome.window.from} → ${outcome.window.to} (${outcome.window.months} month(s))${outcome.partial_month ? ', latest month partial' : ''}`], ['Baseline monthly contribution', fmtMoney(outcome.baseline_monthly)], ['Expected monthly contribution', fmtMoney(outcome.expected_monthly)], ['Actual monthly contribution', fmtMoney(outcome.actual_monthly)], ['Variance vs expected', fmtMoney(outcome.variance_vs_expected)], ['Actual uplift vs baseline', fmtMoney(outcome.actual_uplift_vs_baseline)], ['Achievement of expected uplift', outcome.achievement_ratio ? fmtPct(outcome.achievement_ratio) : '—']] });
        sections.push({ type: 'table', title: 'Monthly actuals', columns: ['Month', 'Contribution', 'GPV', 'MDR'], rows: outcome.series.map((x: any) => [x.month.slice(0, 7), fmtMoney(x.contribution), fmtMoney(x.gpv), fmtMoney(x.mdr)]) });
      } else sections.push({ type: 'table', columns: ['Measure', 'Value'], rows: Object.entries(outcome).filter(([k]) => !['series', 'window'].includes(k)).map(([k, v]) => [k, String(v)]) });
      break;
    }
  }
  // Mandatory report metadata
  const refresh = await one<any>(tx, `SELECT (SELECT max(accounting_date)::text FROM transactions) AS txn, (SELECT max(entry_date)::text FROM gl_entries) AS gl, (SELECT max(txn_date)::text FROM bank_transactions) AS bank`);
  const t = await one<any>(tx, 'SELECT name, is_demo, base_currency, settings FROM tenants WHERE id = app_tenant()');
  const conf = dash.current.filter((r) => r.dimension === 'total' && used.has(r.code)).reduce<Record<string, number>>((acc, r) => { acc[r.confidence] = (acc[r.confidence] ?? 0) + 1; return acc; }, {});
  const content = {
    title, kind, tenant: t.name, is_demo: t.is_demo, currency: t.base_currency,
    period: { start, end }, data_refresh: { calculation_run: dash.run.id, calculated_at: dash.run.finished_at, latest_transaction: refresh.txn, latest_gl_entry: refresh.gl, latest_bank_line: refresh.bank },
    definitions: [...used].map((c) => ({ code: c, name: KPI_BY_CODE[c]?.name, definition: KPI_BY_CODE[c]?.definition, formula: KPI_BY_CODE[c]?.formula })),
    assumptions: [`Revenue recognition: ${t.settings?.revenue_recognition ?? 'agent_net'} — ${t.settings?.revenue_policy_note ?? ''}`, 'Gross payment value (GPV) is processed on behalf of merchants and is never presented as revenue.', 'Direct processing cost per transaction is a documented estimate (processing_cost_rates); contribution figures are ESTIMATED.', `Overhead allocation: ${t.settings?.overhead_allocation ?? 'by_revenue'}.`, 'Foreign-currency items converted at the FX rate stored on each record.', 'Scenario outputs are management estimates, not results.'],
    validation: { confidence_counts: conf, failing_controls: fails.map((c) => ({ code: c.code, name: c.name, detail: c.detail })), note: 'VERIFIED denotes internal management verification and is not an external audit opinion.' },
    evidence_refs: [...evidence],
    sections,
  };
  const sha = createHash('sha256').update(JSON.stringify(content)).digest('hex');
  const dataStatus = fails.length ? 'DISPUTED items present' : (conf.PENDING || conf.ESTIMATED) ? 'Contains PENDING/ESTIMATED figures' : 'All figures VERIFIED';
  const r = await one<{ id: string }>(tx, `INSERT INTO reports (tenant_id, kind, title, period_start, period_end, content, content_sha256, data_status, generated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [a.tenantId, kind, title, start, end, JSON.stringify(content), sha, dataStatus, a.userId]);
  await tx.query(`INSERT INTO evidence_records (tenant_id, subject_type, subject_id, kind, reference, description, sha256, created_by) VALUES ($1,'report',$2,'report',$3,$4,$5,$6)`, [a.tenantId, r!.id, `report:${kind}`, title, sha, a.userId]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'report.generated', entityType: 'reports', entityId: r!.id, payload: { kind, start, end, sha256: sha } });
  return r!.id;
}

export async function getReport(tx: Tx, id: string) {
  return one<any>(tx, `SELECT r.*, u.name AS generated_by_name FROM reports r LEFT JOIN users u ON u.id = r.generated_by WHERE r.id = $1`, [id]);
}
export async function listReports(tx: Tx) {
  return q<any>(tx, `SELECT r.id, r.kind, r.title, r.period_start, r.period_end, r.data_status, r.generated_at, r.content_sha256, u.name AS generated_by FROM reports r LEFT JOIN users u ON u.id = r.generated_by ORDER BY r.generated_at DESC LIMIT 100`);
}
