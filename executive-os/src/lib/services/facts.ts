/**
 * Loads the aggregated facts for a period from the single source of truth.
 * All sums are done in Postgres NUMERIC and returned as decimal strings.
 */
import type { Tx } from '../db';
import { one, q } from '../db';
import { daysBetween } from '../dates';
import type { PeriodFacts, TxnFacts } from '../engine/kpis';
import type { RevenuePolicy } from '../engine/economics';

export interface TenantInfo { id: string; base_currency: string; settings: any; fiscal_year_start_month: number; is_demo: boolean; name: string }

export async function tenantInfo(tx: Tx): Promise<TenantInfo> {
  const t = await one<TenantInfo>(tx, 'SELECT id, base_currency, settings, fiscal_year_start_month, is_demo, name FROM tenants WHERE id = app_tenant()');
  if (!t) throw new Error('Tenant context not set');
  return t;
}
export function policyOf(t: TenantInfo): RevenuePolicy { return t.settings?.revenue_recognition === 'principal_gross' ? 'principal_gross' : 'agent_net'; }

/** SaaS fees recognised per month from active pricing agreements (monthly_saas_fee). */
export const SAAS_CTE = `
  saas AS (
    SELECT pa.merchant_id, m.month, pa.monthly_saas_fee AS fee
    FROM pricing_agreements pa
    JOIN merchants mm ON mm.id = pa.merchant_id
    CROSS JOIN LATERAL (SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month')::date AS month) m
    WHERE pa.monthly_saas_fee > 0 AND m.month <= greatest(date_trunc('month', current_date), (SELECT date_trunc('month', max(accounting_date)) FROM transactions))::date  -- SaaS recognised only for elapsed months
      AND pa.payment_method_id IS NULL AND pa.card_region = 'any'
      AND pa.effective_from <= (m.month + interval '1 month - 1 day')::date AND (pa.effective_to IS NULL OR pa.effective_to >= m.month)
      AND (mm.activated_at IS NULL OR mm.activated_at <= (m.month + interval '1 month - 1 day')::date)
      AND (mm.churned_at IS NULL OR mm.churned_at >= m.month)
  )`;

const txnAgg = `count(*)::text AS attempts, count(*) FILTER (WHERE status='success')::text AS successes,
  coalesce(sum(amount_base) FILTER (WHERE status='success'),0)::text AS gpv,
  coalesce(sum(mdr_fee_base),0)::text AS mdr, coalesce(sum(wholesale_fee_base),0)::text AS wholesale,
  coalesce(sum(processing_cost_base),0)::text AS processing`;

export async function loadPeriodFacts(tx: Tx, start: string, end: string): Promise<PeriodFacts> {
  const t = await tenantInfo(tx);
  const [txn] = await q<TxnFacts>(tx, `SELECT ${txnAgg}, '0' AS saas FROM transactions WHERE accounting_date BETWEEN $1 AND $2`, [start, end]);
  const saas = await one<{ s: string }>(tx, `WITH ${SAAS_CTE} SELECT coalesce(sum(fee),0)::text AS s FROM saas`, [start, end]);
  txn.saas = saas?.s ?? '0';
  const acq = await q<any>(tx, `SELECT coalesce(a.code,'NONE') AS k, ${txnAgg.replace(/\b(status|amount_base|mdr_fee_base|wholesale_fee_base|processing_cost_base)\b/g, 't.$1')}, '0' AS saas
    FROM transactions t LEFT JOIN acquirers a ON a.id = t.acquirer_id WHERE t.accounting_date BETWEEN $1 AND $2 GROUP BY 1`, [start, end]);
  const met = await q<any>(tx, `SELECT pm.code AS k, ${txnAgg.replace(/\b(status|amount_base|mdr_fee_base|wholesale_fee_base|processing_cost_base)\b/g, 't.$1')}, '0' AS saas
    FROM transactions t JOIN payment_methods pm ON pm.id = t.payment_method_id WHERE t.accounting_date BETWEEN $1 AND $2 GROUP BY 1`, [start, end]);

  const gl = await one<any>(tx, `SELECT
      coalesce(sum(CASE WHEN a.pl_line='revenue' THEN e.credit_base - e.debit_base END),0)::text AS revenue,
      coalesce(sum(CASE WHEN a.pl_line='cost_of_sales' THEN e.debit_base - e.credit_base END),0)::text AS cost_of_sales,
      coalesce(sum(CASE WHEN a.pl_line='opex' THEN e.debit_base - e.credit_base END),0)::text AS opex,
      coalesce(sum(CASE WHEN a.pl_line='d_and_a' THEN e.debit_base - e.credit_base END),0)::text AS d_and_a,
      coalesce(sum(CASE WHEN a.pl_line='finance_income' THEN e.credit_base - e.debit_base END),0)::text AS finance_income,
      coalesce(sum(CASE WHEN a.pl_line='finance_costs' THEN e.debit_base - e.credit_base END),0)::text AS finance_costs,
      coalesce(sum(CASE WHEN a.pl_line='tax' THEN e.debit_base - e.credit_base END),0)::text AS tax
    FROM gl_entries e JOIN chart_of_accounts a ON a.id = e.account_id
    WHERE e.entry_date BETWEEN $1 AND $2`, [start, end]);

  const cash = await one<any>(tx, `WITH bal AS (
      SELECT ba.account_class, ba.currency,
        ba.opening_balance + coalesce((SELECT sum(amount) FROM bank_transactions bt WHERE bt.bank_account_id = ba.id AND bt.txn_date <= $1),0) AS bal
      FROM bank_accounts ba WHERE ba.opening_date <= $1)
    SELECT coalesce(sum(bal * coalesce(fx.rate,1)) FILTER (WHERE account_class = 'operating'),0)::text AS operating_end,
           coalesce(sum(bal * coalesce(fx.rate,1)) FILTER (WHERE account_class <> 'operating'),0)::text AS restricted_end
    FROM bal LEFT JOIN LATERAL (SELECT rate FROM exchange_rates r WHERE r.from_ccy = bal.currency AND r.to_ccy = $2 AND r.rate_date <= $1 ORDER BY rate_date DESC LIMIT 1) fx ON bal.currency <> $2`, [end, t.base_currency]);
  const flows = await one<any>(tx, `SELECT
      coalesce(sum(bt.amount * coalesce(fx.rate,1)),0)::text AS net,
      coalesce(sum(bt.amount * coalesce(fx.rate,1)) FILTER (WHERE bt.category = 'capex'),0)::text AS capex,
      coalesce(sum(bt.amount * coalesce(fx.rate,1)) FILTER (WHERE bt.category IN ('loan','equity')),0)::text AS financing
    FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id
    LEFT JOIN LATERAL (SELECT rate FROM exchange_rates r WHERE r.from_ccy = bt.currency AND r.to_ccy = $3 AND r.rate_date <= bt.txn_date ORDER BY rate_date DESC LIMIT 1) fx ON bt.currency <> $3
    WHERE ba.account_class = 'operating' AND bt.txn_date BETWEEN $1 AND $2`, [start, end, t.base_currency]);

  const ar = await one<any>(tx, `SELECT
      coalesce(sum((amount - CASE WHEN paid_date IS NOT NULL AND paid_date <= $2 THEN amount_paid ELSE 0 END) * fx_rate_to_base)
        FILTER (WHERE issue_date <= $2 AND status <> 'void' AND (paid_date IS NULL OR paid_date > $2 OR amount_paid < amount)),0)::text AS closing,
      coalesce(sum(amount * fx_rate_to_base) FILTER (WHERE issue_date BETWEEN $1 AND $2 AND status <> 'void'),0)::text AS credit_sales
    FROM customer_invoices`, [start, end]);

  const budget = await one<any>(tx, `WITH v AS (
      SELECT id FROM budget_versions WHERE status = 'approved' AND kind = 'budget'
      ORDER BY approved_at DESC)
    SELECT
      sum(CASE WHEN a.pl_line='revenue' THEN bl.amount_base END)::text AS revenue,
      (sum(CASE WHEN a.pl_line='revenue' THEN bl.amount_base ELSE 0 END) - sum(CASE WHEN a.pl_line IN ('cost_of_sales','opex') THEN bl.amount_base ELSE 0 END))::text AS ebitda,
      count(DISTINCT bl.period) AS months
    FROM budget_lines bl JOIN chart_of_accounts a ON a.id = bl.account_id
    WHERE bl.version_id IN (SELECT id FROM v) AND bl.period BETWEEN date_trunc('month',$1::date) AND $2`, [start, end]);
  const expectedMonths = Math.round(daysBetween(start, end) / 30.4) || 1;
  const budgetComplete = budget && Number(budget.months) >= expectedMonths;

  const ops = await one<any>(tx, `SELECT
      (SELECT count(DISTINCT merchant_id) FROM transactions WHERE status='success' AND accounting_date BETWEEN $1 AND $2)::text AS active,
      (SELECT count(*) FROM merchants WHERE activated_at < $1 AND (churned_at IS NULL OR churned_at >= $1))::text AS active_at_start,
      (SELECT count(*) FROM merchants WHERE activated_at BETWEEN $1 AND $2)::text AS newly,
      (SELECT count(*) FROM merchants WHERE churned_at BETWEEN $1 AND $2)::text AS churned,
      (SELECT avg(closed_at - opened_at)::numeric(10,2)::text FROM onboarding_cases WHERE status='activated' AND closed_at BETWEEN $1 AND $2) AS onboarding_days,
      (SELECT count(*) FROM onboarding_cases WHERE opened_at <= $2 AND (closed_at IS NULL OR closed_at > $2))::text AS pending,
      (SELECT count(*) FROM support_incidents WHERE opened_at::date BETWEEN $1 AND $2)::text AS incidents,
      (SELECT avg(uptime_pct)::numeric(10,4)::text FROM platform_uptime WHERE day BETWEEN $1 AND $2) AS uptime`, [start, end]);

  return {
    periodStart: start, periodEnd: end, days: daysBetween(start, end) + 1, policy: policyOf(t), currency: t.base_currency,
    txn,
    byAcquirer: Object.fromEntries(acq.map((r) => [r.k, r])),
    byMethod: Object.fromEntries(met.map((r) => [r.k, r])),
    gl: gl!,
    cash: { operatingBalanceEnd: String(cash!.operating_end), restrictedBalanceEnd: String(cash!.restricted_end), operatingNetFlow: flows!.net, capexOutflow: flows!.capex, financingNetFlow: flows!.financing },
    ar: { closing: ar!.closing, creditSales: ar!.credit_sales },
    budget: { revenue: budgetComplete ? budget!.revenue : null, ebitda: budgetComplete ? budget!.ebitda : null },
    ops: { activeMerchants: ops!.active, activeAtStart: ops!.active_at_start, newlyActivated: ops!.newly, churned: ops!.churned, onboardingAvgDays: ops!.onboarding_days, pendingOnboarding: ops!.pending, incidents: ops!.incidents, uptimeAvg: ops!.uptime },
  };
}

/** Cheap fingerprint of all inputs in a period: changes whenever source data changes. */
export async function inputFingerprint(tx: Tx, start: string, end: string): Promise<string> {
  const r = await one<{ f: string }>(tx, `SELECT md5(concat_ws('|',
      (SELECT count(*) || ':' || coalesce(sum(amount_base),0) || ':' || coalesce(sum(mdr_fee_base),0) || ':' || coalesce(sum(wholesale_fee_base),0) FROM transactions WHERE accounting_date BETWEEN $1 AND $2),
      (SELECT count(*) || ':' || coalesce(sum(debit_base - credit_base * 2),0) FROM gl_entries WHERE entry_date BETWEEN $1 AND $2),
      (SELECT count(*) || ':' || coalesce(sum(amount),0) FROM bank_transactions WHERE txn_date <= $2),
      (SELECT count(*) || ':' || coalesce(sum(amount_paid),0) || ':' || coalesce(max(paid_date)::text,'') FROM customer_invoices WHERE issue_date <= $2),
      (SELECT count(*) || ':' || coalesce(max(approved_at)::text,'') FROM budget_versions WHERE status='approved'),
      (SELECT count(*) || ':' || coalesce(sum(monthly_saas_fee),0) FROM pricing_agreements),
      (SELECT count(*) FROM merchants), (SELECT count(*) FROM onboarding_cases), (SELECT count(*) FROM support_incidents),
      (SELECT count(*) FROM platform_uptime WHERE day BETWEEN $1 AND $2),
      (SELECT coalesce(max(created_at)::text,'') FROM kpi_verifications),
      (SELECT string_agg(period::text || status, ',' ORDER BY period) FROM financial_periods WHERE period BETWEEN date_trunc('month',$1::date) AND $2)
    )) AS f`, [start, end]);
  return r!.f;
}
