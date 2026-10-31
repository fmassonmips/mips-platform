/**
 * Treasury service: cash positions, cash-flow analysis, bank reconciliation
 * workflow, 13-week forecast inputs, receivables/collections helpers, supplier
 * payment planning and liquidity stress tests.
 *
 * Rules enforced here (see docs/dev/module-conventions.md):
 *  - Restricted, safeguarded and merchant-settlement accounts are NEVER counted
 *    as operating cash. Operating cash = account_class 'operating' only.
 *  - Money stays decimal (Decimal.js / NUMERIC::text). No float arithmetic.
 *  - Reconciliation differences are never written off: resolving an exception
 *    records an explanation only; no GL entry or adjustment is created.
 *  - No payment or e-mail is ever initiated: "paid" / "sent" are recordings of
 *    events that happened outside the system.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import type { Tx } from '../db';
import { one, q, withTenant } from '../db';
import { requireAuth, tctx, type AuthContext } from '../auth/session';
import type { Permission } from '../auth/permissions';
import { audit } from '../audit';
import { dec, sum, ZERO, type Dec, type DecLike } from '../money';
import { addDays, daysBetween, monthEnd, monthStart, parseISO } from '../dates';
import { reconcile, type ReconItem } from '../engine/reconcile';
import { projectCash } from '../engine/runway';
import type { ScenarioParams } from '../engine/cashforecast';
import { DEFAULT_SCENARIOS } from '../engine/cashforecast';

// ---------------------------------------------------------------------------
// Server-action plumbing (readable errors, safe redirects, audit)
// ---------------------------------------------------------------------------

/** A validation error whose message is safe to show to the user. */
export class UserError extends Error {}

const ROUTE_RE = /^\/(cash-flow|treasury-forecast|receivables|suppliers|liquidity)(\/[A-Za-z0-9_\-./%]*)?(\?[^#]*)?$/;

/** Only allow redirects back into the treasury modules (no open redirect). */
export function safeReturnTo(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw : '';
  const base = ROUTE_RE.test(s) ? s : fallback;
  const [path, query = ''] = base.split('?');
  const p = new URLSearchParams(query); p.delete('ok'); p.delete('err');
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  reconciliations_check: 'Segregation of duties: the preparer of a reconciliation cannot approve it. A different user with finance.approve must approve (database rule).',
  supplier_invoices_check: 'Segregation of duties: the user who submitted this supplier invoice cannot approve it (database rule).',
  collection_events_check: 'Segregation of duties: the user who drafted this reminder cannot approve or reject it (database rule).',
  customer_invoices_check: 'Amount paid cannot exceed the invoice amount.',
  customer_invoices_check1: 'Due date cannot be before the issue date.',
  supplier_invoices_amount_check: 'Amount must be zero or positive.',
};

/** Map a thrown error (pg, zod, UserError) to a readable message. */
export function readableError(e: unknown): string {
  if (e instanceof UserError) return e.message;
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
  const pg = e as { code?: string; constraint?: string; message?: string; detail?: string };
  if (pg?.code === '23514') return CONSTRAINT_MESSAGES[pg.constraint ?? ''] ?? `Rejected by database rule ${pg.constraint ?? ''}.`;
  if (pg?.code === '23505') return `Duplicate: a record with the same key already exists (${pg.constraint ?? 'unique key'}).`;
  if (pg?.code === '23503') return 'Referenced record does not exist.';
  if (pg?.code === '22P02' || pg?.code === '22007' || pg?.code === '22008') return 'Invalid value format.';
  if (pg?.code === 'P0001') return pg.message ?? 'Rejected by database rule.';
  return 'The operation failed. No changes were saved.';
}

function withFlash(url: string, key: 'ok' | 'err', msg: string) {
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(msg.slice(0, 400))}`;
}

/**
 * Run a treasury mutation: permission check, tenant transaction, readable error
 * surfacing and redirect back with a flash message. `fn` returns the success text.
 */
export async function treasuryAction(perm: Permission, form: FormData, fallback: string, fn: (t: Tx, auth: AuthContext) => Promise<string>): Promise<never> {
  const auth = await requireAuth(perm);
  const back = safeReturnTo(form.get('returnTo'), fallback);
  let url: string;
  try {
    const msg = await withTenant(tctx(auth), (t) => fn(t, auth));
    url = withFlash(back, 'ok', msg);
  } catch (e) {
    url = withFlash(back, 'err', readableError(e));
  }
  revalidatePath(back.split('?')[0]);
  redirect(url);
}

export async function logAudit(t: Tx, auth: AuthContext, action: string, entityType: string, entityId: string | null, payload: unknown) {
  await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action, entityType, entityId, payload });
}

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

/** First Monday strictly after `d`. 2026-10-31 (Sat) → 2026-11-02. */
export function nextMondayAfter(d: string): string {
  const dow = (parseISO(d).getUTCDay() + 6) % 7; // Mon = 0
  return addDays(d, 7 - dow);
}

export type Cardinality = 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
export function cardinalityOf(nBank: number, nLedger: number): Cardinality {
  if (nBank === 1 && nLedger === 1) return 'one_to_one';
  if (nBank === 1) return 'one_to_many';
  if (nLedger === 1) return 'many_to_one';
  return 'many_to_many';
}

export function matchSignature(bankIds: string[], ledgerIds: string[]): string {
  return `B:${[...bankIds].sort().join(',')}|L:${[...ledgerIds].sort().join(',')}`;
}

export interface ManualMatchCheck { bankTotal: Dec; ledgerTotal: Dec; difference: Dec; cardinality: Cardinality }
/**
 * Validate a manual match. Totals must be equal unless the user explicitly
 * records the difference with a note. Nothing is ever written off.
 */
export function validateManualMatch(bankAmounts: DecLike[], ledgerAmounts: DecLike[], recordDifference: boolean, note: string): ManualMatchCheck {
  if (bankAmounts.length === 0 || ledgerAmounts.length === 0) throw new UserError('Select at least one bank item and one ledger item.');
  const bankTotal = sum(bankAmounts), ledgerTotal = sum(ledgerAmounts);
  const difference = bankTotal.minus(ledgerTotal);
  if (!difference.isZero()) {
    if (!recordDifference) throw new UserError(`Totals differ by ${difference.toFixed(2)} (bank ${bankTotal.toFixed(2)} vs ledger ${ledgerTotal.toFixed(2)}). Tick "record the difference" and explain it, or adjust the selection.`);
    if (note.trim().length < 5) throw new UserError('Explain the recorded difference (at least 5 characters). The difference is recorded, not written off.');
  }
  return { bankTotal, ledgerTotal, difference, cardinality: cardinalityOf(bankAmounts.length, ledgerAmounts.length) };
}

export interface ReconException { side: 'bank' | 'ledger'; amount: DecLike; status: 'open' | 'investigating' | 'resolved'; itemId: string }
export interface ReconBalanceInput {
  openingStatement: DecLike;
  bankAmounts: DecLike[];          // all statement lines in the period
  ledgerAmounts: DecLike[];        // all cash-ledger items in the period
  exceptions: ReconException[];    // exceptions on items that are NOT in an active match
  confirmedMatchDifferences: DecLike[]; // explicitly recorded differences on confirmed matches
}
export interface ReconBalances {
  statementBalance: Dec; ledgerBalance: Dec; difference: Dec;
  bankOnlyItems: Dec; ledgerOnlyItems: Dec; recordedMatchDifferences: Dec;
  explainedResolved: Dec; unresolvedExceptions: Dec; unexplained: Dec; unresolvedDifference: Dec;
}
/**
 * Statement vs ledger.
 *   statement = opening statement balance + statement lines in period
 *   ledger    = opening statement balance + cash-ledger items in period
 *   difference = statement − ledger
 *   = bank-only items − ledger-only items + recorded match differences + unexplained
 * Unresolved difference = net of exceptions not yet resolved + any unexplained
 * remainder (items not yet classified by matching). Resolving an exception
 * explains it; it does NOT post a write-off.
 */
export function reconBalances(i: ReconBalanceInput): ReconBalances {
  const open = dec(i.openingStatement);
  const statementBalance = open.plus(sum(i.bankAmounts));
  const ledgerBalance = open.plus(sum(i.ledgerAmounts));
  const difference = statementBalance.minus(ledgerBalance);
  const signed = (e: ReconException) => (e.side === 'bank' ? dec(e.amount) : dec(e.amount).neg());
  const bankOnlyItems = sum(i.exceptions.filter((e) => e.side === 'bank').map((e) => e.amount));
  const ledgerOnlyItems = sum(i.exceptions.filter((e) => e.side === 'ledger').map((e) => e.amount));
  const recordedMatchDifferences = sum(i.confirmedMatchDifferences);
  const explainedResolved = sum(i.exceptions.filter((e) => e.status === 'resolved').map(signed)).plus(recordedMatchDifferences);
  const unresolvedExceptions = sum(i.exceptions.filter((e) => e.status !== 'resolved').map(signed));
  const unexplained = difference.minus(bankOnlyItems.minus(ledgerOnlyItems).plus(recordedMatchDifferences));
  return { statementBalance, ledgerBalance, difference, bankOnlyItems, ledgerOnlyItems, recordedMatchDifferences, explainedResolved, unresolvedExceptions, unexplained, unresolvedDifference: unresolvedExceptions.plus(unexplained) };
}

export interface ExistingMatch { id: string; status: 'proposed' | 'confirmed' | 'rejected'; bankIds: string[]; ledgerIds: string[] }
/**
 * Plan an idempotent auto-match run over the items NOT in confirmed matches.
 * Existing proposals identical to a new proposal are kept (no duplicates);
 * stale proposals are dropped; proposals identical to a previously REJECTED
 * match are not re-proposed (their items become unmatched exceptions).
 */
export function planAutoMatch(bank: ReconItem[], ledger: ReconItem[], existing: ExistingMatch[]) {
  const r = reconcile(bank, ledger);
  const rejected = new Set(existing.filter((m) => m.status === 'rejected').map((m) => matchSignature(m.bankIds, m.ledgerIds)));
  const proposed = new Map(existing.filter((m) => m.status === 'proposed').map((m) => [matchSignature(m.bankIds, m.ledgerIds), m.id]));
  const keep = new Set<string>();
  const insert: typeof r.matches = [];
  const unmatched: { side: 'bank' | 'ledger'; itemId: string; amount: Dec }[] = [];
  const amt = new Map<string, Dec>([...bank.map((b) => [`bank:${b.id}`, dec(b.amount)] as const), ...ledger.map((l) => [`ledger:${l.id}`, dec(l.amount)] as const)]);
  for (const m of r.matches) {
    const sig = matchSignature(m.bankIds, m.ledgerIds);
    if (rejected.has(sig)) {
      for (const id of m.bankIds) unmatched.push({ side: 'bank', itemId: id, amount: amt.get(`bank:${id}`)! });
      for (const id of m.ledgerIds) unmatched.push({ side: 'ledger', itemId: id, amount: amt.get(`ledger:${id}`)! });
      continue;
    }
    const ex = proposed.get(sig);
    if (ex) keep.add(ex); else insert.push(m);
  }
  const drop = [...proposed.values()].filter((id) => !keep.has(id));
  const exceptions = [...r.exceptions.map((e) => ({ side: e.side, itemId: e.itemId, kind: e.kind, amount: e.amount })), ...unmatched.map((u) => ({ ...u, kind: 'unmatched' as const }))];
  return { insert, keep: [...keep], drop, exceptions, engineUnresolved: r.unresolvedDifference };
}

/** Collection policy applicable to an invoice: highest threshold ≤ days overdue. */
export function policyFor<P extends { days_overdue: number }>(policies: P[], daysOverdue: number): P | null {
  let best: P | null = null;
  for (const p of policies) if (p.days_overdue <= daysOverdue && (!best || p.days_overdue > best.days_overdue)) best = p;
  return best;
}

/** Render a {{placeholder}} template. Unknown placeholders are left visible. */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** Months (1-based) until the projection first falls below the floor, or null if never. */
export function monthsToBreach(series: DecLike[], floor: DecLike): number | null {
  const f = dec(floor);
  for (let i = 0; i < series.length; i++) if (dec(series[i]).lt(f)) return i + 1;
  return null;
}

export interface StressInputs {
  unrestrictedCash: DecLike; baseMonthlyFlow: DecLike; minimumLiquidity: DecLike; months: number;
  largestMerchantContribution12m: DecLike; merchantLossPct: DecLike;           // e.g. '1' = 100 % of contribution lost
  monthlyNetPaymentRevenue: DecLike; acquirerSharePct: DecLike; acquirerMonths: number;
  trailingGpv12m: DecLike; compressionBps: DecLike;
  creditSales12m: DecLike; delayDays: DecLike;
  cloudCost12m: DecLike; infraPct: DecLike;
  regulatoryOneOff: DecLike; regulatoryMonth: number;
}
export interface StressResult { key: string; label: string; monthlyShock: Dec; oneOff: Dec; oneOffMonth: number; projection: Dec[]; endCash: Dec; minCash: Dec; breachMonth: number | null; basis: string }
/** Apply the STANDARD_STRESS_TESTS shocks with projectCash (runway engine). */
export function runStressTests(i: StressInputs): StressResult[] {
  const n = i.months;
  const mk = (key: string, label: string, monthlyShock: Dec, oneOff: Dec, oneOffMonth: number, basis: string): StressResult => {
    const projection = projectCash(i.unrestrictedCash, i.baseMonthlyFlow, n, monthlyShock, oneOff, oneOffMonth);
    let minCash = projection[0] ?? dec(i.unrestrictedCash);
    for (const p of projection) if (p.lt(minCash)) minCash = p;
    return { key, label, monthlyShock, oneOff, oneOffMonth, projection, endCash: projection[projection.length - 1] ?? dec(i.unrestrictedCash), minCash, breachMonth: monthsToBreach(projection, i.minimumLiquidity), basis };
  };
  const months12 = dec(12);
  return [
    mk('base', 'Base case (trailing average net operating cash flow)', ZERO, ZERO, 1, 'Average monthly net operating cash flow from bank data'),
    mk('major_merchant_loss', 'Loss of largest merchant (contribution removed)', dec(i.largestMerchantContribution12m).times(i.merchantLossPct).div(months12).neg(), ZERO, 1, 'Trailing 12-month contribution of the largest merchant ÷ 12, removed every month'),
    mk('acquirer_disruption', `Acquirer disruption: ${dec(i.acquirerSharePct).times(100).toFixed(0)} % of volume unavailable for ${i.acquirerMonths} month(s)`, ZERO, dec(i.monthlyNetPaymentRevenue).times(i.acquirerSharePct).times(i.acquirerMonths), 1, 'Average monthly net payment revenue (MDR − wholesale) × share × months, lost in month 1'),
    mk('margin_compression', `Margin compression: −${dec(i.compressionBps).toFixed(0)} bps take rate`, dec(i.trailingGpv12m).div(months12).times(dec(i.compressionBps).div(10000)).neg(), ZERO, 1, 'Trailing 12-month GPV ÷ 12 × bps, every month'),
    mk('collection_delay', `Collections delayed by ${dec(i.delayDays).toFixed(0)} days`, ZERO, dec(i.creditSales12m).div(365).times(i.delayDays), 1, 'Trailing 12-month credit sales ÷ 365 × days (working-capital outflow in month 1)'),
    mk('infra_cost', `Infrastructure costs +${dec(i.infraPct).times(100).toFixed(0)} %`, dec(i.cloudCost12m).div(months12).times(i.infraPct).neg(), ZERO, 1, 'Trailing 12-month GL cloud cost (cost_category = cloud) ÷ 12 × increase, every month'),
    mk('regulatory', 'Unexpected regulatory expenditure (one-off)', ZERO, dec(i.regulatoryOneOff), i.regulatoryMonth, `User input, paid in month ${i.regulatoryMonth}`),
  ];
}

/** Group dated amounts into `weeks` consecutive weeks starting `start`; earlier dates go to an "overdue" bucket. */
export function weekBuckets<T extends { date: string; amount: DecLike }>(items: T[], start: string, weeks: number) {
  const buckets = Array.from({ length: weeks }, (_, k) => ({ weekStart: addDays(start, k * 7), total: ZERO, items: [] as T[] }));
  const overdue = { total: ZERO, items: [] as T[] };
  const later = { total: ZERO, items: [] as T[] };
  for (const it of items) {
    const idx = Math.floor(daysBetween(start, it.date) / 7);
    const target = idx < 0 ? overdue : idx >= weeks ? later : buckets[idx];
    target.total = target.total.plus(dec(it.amount)); target.items.push(it);
  }
  return { buckets, overdue, later };
}

export interface PaidInvoice { id: string; number: string; payment_ref: string | null; amount_base: string; paid_date: string | null }
export interface BankLine { id: string; reference: string | null; amount_base: string; txn_date: string }
/**
 * Supplier payment reconciliation: a paid invoice is matched when a bank
 * outflow carries its payment reference or invoice number. Amount equality is
 * checked separately (no tolerance, no write-off).
 */
export function matchSupplierPayments(paid: PaidInvoice[], bank: BankLine[]) {
  const norm = (s: string | null) => (s ?? '').trim().toUpperCase();
  const byRef = new Map<string, BankLine[]>();
  for (const b of bank) { const r = norm(b.reference); if (r) byRef.set(r, [...(byRef.get(r) ?? []), b]); }
  const used = new Set<string>();
  return paid.map((p) => {
    const cands = [...(byRef.get(norm(p.payment_ref)) ?? []), ...(byRef.get(norm(p.number)) ?? [])].filter((b) => !used.has(b.id));
    const hit = cands[0];
    if (!hit) return { ...p, status: 'unmatched' as const, bankId: null, bankAmount: null, bankDate: null, difference: null };
    used.add(hit.id);
    const diff = dec(hit.amount_base).neg().minus(dec(p.amount_base));
    return { ...p, status: diff.isZero() ? ('matched' as const) : ('amount_difference' as const), bankId: hit.id, bankAmount: hit.amount_base, bankDate: hit.txn_date, difference: diff.toString() };
  });
}

/** Parse scenario overrides from query params: `<key>_delay`, `<key>_rate`, `<key>_drate`, `<key>_out`. */
export function scenariosFromParams(get: (k: string) => string | undefined): ScenarioParams[] {
  const num = (v: string | undefined, d: string, lo: number, hi: number) => {
    if (v === undefined || v.trim() === '' || !/^-?\d+(\.\d+)?$/.test(v.trim())) return d;
    const x = dec(v.trim()); return x.lt(lo) || x.gt(hi) ? d : x.toString();
  };
  return DEFAULT_SCENARIOS.map((s) => ({
    key: s.key,
    receiptDelayDays: Number(num(get(`${s.key}_delay`), String(s.receiptDelayDays), 0, 365)),
    collectionRate: num(get(`${s.key}_rate`), dec(s.collectionRate).toString(), 0, 1),
    disputedCollectionRate: num(get(`${s.key}_drate`), dec(s.disputedCollectionRate).toString(), 0, 1),
    outflowFactor: num(get(`${s.key}_out`), dec(s.outflowFactor).toString(), 0, 3),
  }));
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

export interface AccountBalance { id: string; code: string; name: string; bank_name: string; currency: string; account_class: 'operating' | 'restricted' | 'safeguarded' | 'merchant_settlement'; masked_number: string | null; balance: string; rate: string | null; rate_date: string | null; balance_base: string | null }

/** Balances at `asOf` per bank account, converted to base with the latest rate ≤ asOf. */
export async function accountBalances(t: Tx, asOf: string, base: string): Promise<AccountBalance[]> {
  const rows = await q<any>(t, `SELECT ba.id, ba.code, ba.name, ba.bank_name, ba.currency, ba.account_class, ba.masked_number,
      (ba.opening_balance + coalesce((SELECT sum(amount) FROM bank_transactions bt WHERE bt.bank_account_id = ba.id AND bt.txn_date <= $1),0))::text AS balance,
      CASE WHEN ba.currency = $2 THEN '1' ELSE fx.rate::text END AS rate, fx.rate_date::text AS rate_date
    FROM bank_accounts ba
    LEFT JOIN LATERAL (SELECT rate, rate_date FROM exchange_rates r WHERE r.from_ccy = ba.currency AND r.to_ccy = $2 AND r.rate_date <= $1 ORDER BY rate_date DESC LIMIT 1) fx ON ba.currency <> $2
    WHERE ba.is_active AND ba.opening_date <= $1 ORDER BY ba.account_class = 'operating' DESC, ba.code`, [asOf, base]);
  return rows.map((r) => ({ ...r, balance_base: r.rate === null ? null : dec(r.balance).times(r.rate).toFixed(4) }));
}

export function cashSplit(bal: AccountBalance[]) {
  const by = (pred: (a: AccountBalance) => boolean) => sum(bal.filter(pred).map((a) => a.balance_base ?? '0'));
  return {
    operating: by((a) => a.account_class === 'operating'),
    restricted: by((a) => a.account_class === 'restricted'),
    safeguarded: by((a) => a.account_class === 'safeguarded'),
    merchantSettlement: by((a) => a.account_class === 'merchant_settlement'),
    nonOperating: by((a) => a.account_class !== 'operating'),
    missingFx: bal.filter((a) => a.balance_base === null).map((a) => a.code),
  };
}

/** Bank-transaction amount in base currency at the transaction date (SQL expression; needs alias bt and param for base). */
export const FX_JOIN = (baseParam: string) => `LEFT JOIN LATERAL (SELECT rate FROM exchange_rates r WHERE r.from_ccy = bt.currency AND r.to_ccy = ${baseParam} AND r.rate_date <= bt.txn_date ORDER BY rate_date DESC LIMIT 1) fx ON bt.currency <> ${baseParam}`;
export const AMT_BASE = (baseParam: string) => `(bt.amount * CASE WHEN bt.currency = ${baseParam} THEN 1 ELSE fx.rate END)`;

/** Monthly operating net cash flow (base currency), one value per month start in `months`. */
export async function monthlyOperatingNet(t: Tx, months: string[], base: string): Promise<{ month: string; inflow: string; outflow: string; net: string }[]> {
  if (!months.length) return [];
  const rows = await q<any>(t, `SELECT date_trunc('month', bt.txn_date)::date::text AS m,
      coalesce(sum(${AMT_BASE('$3')}) FILTER (WHERE bt.amount > 0),0)::text AS inflow,
      coalesce(sum(${AMT_BASE('$3')}) FILTER (WHERE bt.amount < 0),0)::text AS outflow,
      coalesce(sum(${AMT_BASE('$3')}),0)::text AS net
    FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id ${FX_JOIN('$3')}
    WHERE ba.account_class = 'operating' AND bt.txn_date BETWEEN $1 AND $2 GROUP BY 1`, [months[0], monthEnd(months[months.length - 1]), base]);
  const m = new Map(rows.map((r) => [r.m, r]));
  return months.map((mo) => ({ month: mo, inflow: m.get(mo)?.inflow ?? '0', outflow: m.get(mo)?.outflow ?? '0', net: m.get(mo)?.net ?? '0' }));
}

// ---------------------------------------------------------------------------
// Bank reconciliation
// ---------------------------------------------------------------------------

export interface ReconRow { id: string; bank_account_id: string; period: string; status: 'open' | 'in_review' | 'approved'; statement_balance: string | null; ledger_balance: string | null; unresolved_difference: string | null; prepared_by: string | null; approved_by: string | null; approved_at: string | null; prepared_by_name: string | null; approved_by_name: string | null }

export async function findAccount(t: Tx, code: string) {
  return one<{ id: string; code: string; name: string; bank_name: string; currency: string; account_class: string; masked_number: string | null; opening_balance: string; opening_date: string }>(t,
    `SELECT id, code, name, bank_name, currency, account_class, masked_number, opening_balance::text, opening_date::text FROM bank_accounts WHERE code = $1`, [code]);
}

export async function getRecon(t: Tx, accountId: string, period: string, lock = false): Promise<ReconRow | null> {
  return one<ReconRow>(t, `SELECT r.id, r.bank_account_id, r.period::text, r.status, r.statement_balance::text, r.ledger_balance::text, r.unresolved_difference::text,
      r.prepared_by, r.approved_by, r.approved_at::text, pu.name AS prepared_by_name, au.name AS approved_by_name
    FROM reconciliations r LEFT JOIN users pu ON pu.id = r.prepared_by LEFT JOIN users au ON au.id = r.approved_by
    WHERE r.bank_account_id = $1 AND r.period = $2 ${lock ? 'FOR UPDATE OF r' : ''}`, [accountId, period]);
}

export async function ensureRecon(t: Tx, auth: AuthContext, accountId: string, period: string): Promise<ReconRow> {
  const ex = await getRecon(t, accountId, period, true);
  if (ex) return ex;
  const r = await one<{ id: string }>(t, `INSERT INTO reconciliations (tenant_id, bank_account_id, period, status, prepared_by) VALUES ($1,$2,$3,'open',$4)
    ON CONFLICT (tenant_id, bank_account_id, period) DO NOTHING RETURNING id`, [auth.tenantId, accountId, period, auth.userId]);
  if (r) await logAudit(t, auth, 'treasury.reconciliation_created', 'reconciliation', r.id, { bank_account_id: accountId, period });
  return (await getRecon(t, accountId, period, true))!;
}

export async function reconById(t: Tx, id: string, lock = false) {
  const r = await one<{ bank_account_id: string; period: string }>(t, 'SELECT bank_account_id, period::text FROM reconciliations WHERE id = $1', [id]);
  if (!r) throw new UserError('Reconciliation not found.');
  return (await getRecon(t, r.bank_account_id, r.period, lock))!;
}

export function assertOpen(r: ReconRow) {
  if (r.status !== 'open') throw new UserError(`This reconciliation is ${r.status.replace('_', ' ')} and can no longer be changed${r.status === 'in_review' ? ' (the reviewer can return it to the preparer)' : ''}.`);
}

export interface ReconItemRow { id: string; date: string; amount: string; reference: string | null; description: string | null; extra: string | null; match_id: string | null; match_status: string | null }

export async function reconItems(t: Tx, accountId: string, period: string) {
  const s = monthStart(period), e = monthEnd(period);
  const bank = await q<ReconItemRow>(t, `SELECT bt.id, bt.txn_date::text AS date, bt.amount::text AS amount, bt.reference, bt.description, bt.bank_ref AS extra,
      am.match_id, am.status AS match_status
    FROM bank_transactions bt
    LEFT JOIN LATERAL (SELECT m.id AS match_id, m.status FROM recon_match_items mi JOIN recon_matches m ON m.id = mi.match_id
      WHERE mi.side = 'bank' AND mi.item_id = bt.id AND m.status IN ('proposed','confirmed') ORDER BY m.status = 'confirmed' DESC LIMIT 1) am ON true
    WHERE bt.bank_account_id = $1 AND bt.txn_date BETWEEN $2 AND $3 ORDER BY bt.txn_date, bt.bank_ref`, [accountId, s, e]);
  const ledger = await q<ReconItemRow>(t, `SELECT li.id, li.item_date::text AS date, li.amount::text AS amount, li.reference, li.description, li.source_type AS extra,
      am.match_id, am.status AS match_status
    FROM cash_ledger_items li
    LEFT JOIN LATERAL (SELECT m.id AS match_id, m.status FROM recon_match_items mi JOIN recon_matches m ON m.id = mi.match_id
      WHERE mi.side = 'ledger' AND mi.item_id = li.id AND m.status IN ('proposed','confirmed') ORDER BY m.status = 'confirmed' DESC LIMIT 1) am ON true
    WHERE li.bank_account_id = $1 AND li.item_date BETWEEN $2 AND $3 ORDER BY li.item_date, li.reference NULLS LAST, li.id`, [accountId, s, e]);
  const opening = await one<{ v: string }>(t, `SELECT (ba.opening_balance + coalesce((SELECT sum(amount) FROM bank_transactions WHERE bank_account_id = ba.id AND txn_date < $2),0))::text AS v
    FROM bank_accounts ba WHERE ba.id = $1`, [accountId, s]);
  return { bank, ledger, openingStatement: opening?.v ?? '0' };
}

export interface MatchRow { id: string; match_type: string; cardinality: Cardinality; rule: string | null; bank_total: string; ledger_total: string; difference: string; status: 'proposed' | 'confirmed' | 'rejected'; created_at: string; created_by_name: string | null; confirmed_by_name: string | null; items: { side: 'bank' | 'ledger'; item_id: string; amount: string }[] }
export async function reconMatches(t: Tx, reconId: string): Promise<MatchRow[]> {
  const ms = await q<any>(t, `SELECT m.id, m.match_type, m.cardinality, m.rule, m.bank_total::text, m.ledger_total::text, m.difference::text, m.status, m.created_at::text,
      cu.name AS created_by_name, fu.name AS confirmed_by_name
    FROM recon_matches m LEFT JOIN users cu ON cu.id = m.created_by LEFT JOIN users fu ON fu.id = m.confirmed_by
    WHERE m.reconciliation_id = $1 ORDER BY m.created_at, m.id`, [reconId]);
  const items = await q<any>(t, `SELECT mi.match_id, mi.side, mi.item_id, mi.amount::text FROM recon_match_items mi JOIN recon_matches m ON m.id = mi.match_id WHERE m.reconciliation_id = $1`, [reconId]);
  const by = new Map<string, any[]>();
  for (const it of items) by.set(it.match_id, [...(by.get(it.match_id) ?? []), it]);
  return ms.map((m) => ({ ...m, items: by.get(m.id) ?? [] }));
}

export interface ExceptionRow { id: string; side: 'bank' | 'ledger'; item_id: string; kind: string; amount: string; status: 'open' | 'investigating' | 'resolved'; resolution: string | null; resolved_by_name: string | null; resolved_at: string | null; created_at: string }
export async function reconExceptions(t: Tx, reconId: string): Promise<ExceptionRow[]> {
  return q<ExceptionRow>(t, `SELECT e.id, e.side, e.item_id, e.kind, e.amount::text, e.status, e.resolution, u.name AS resolved_by_name, e.resolved_at::text, e.created_at::text
    FROM recon_exceptions e LEFT JOIN users u ON u.id = e.resolved_by WHERE e.reconciliation_id = $1
    ORDER BY e.status = 'resolved', e.kind, e.side, e.amount`, [reconId]);
}

/** Recompute the balance summary of a reconciliation from its current state. */
export async function reconSummary(t: Tx, recon: ReconRow) {
  const items = await reconItems(t, recon.bank_account_id, recon.period);
  const matches = await reconMatches(t, recon.id);
  const exceptions = await reconExceptions(t, recon.id);
  const active = new Set([...items.bank, ...items.ledger].filter((i) => i.match_id).map((i) => i.id));
  const live = exceptions.filter((e) => !active.has(e.item_id));
  const bal = reconBalances({
    openingStatement: items.openingStatement,
    bankAmounts: items.bank.map((b) => b.amount), ledgerAmounts: items.ledger.map((l) => l.amount),
    exceptions: live.map((e) => ({ side: e.side, amount: e.amount, status: e.status, itemId: e.item_id })),
    confirmedMatchDifferences: matches.filter((m) => m.status === 'confirmed').map((m) => m.difference),
  });
  const withExc = new Set(live.map((e) => `${e.side}:${e.item_id}`));
  const unclassified = [...items.bank.map((b) => ({ side: 'bank', ...b })), ...items.ledger.map((l) => ({ side: 'ledger', ...l }))].filter((i) => !i.match_id && !withExc.has(`${i.side}:${i.id}`));
  return { items, matches, exceptions, liveExceptions: live, balances: bal, unclassified };
}

export async function storeReconTotals(t: Tx, recon: ReconRow) {
  const s = await reconSummary(t, recon);
  await t.query('UPDATE reconciliations SET statement_balance = $2, ledger_balance = $3, unresolved_difference = $4 WHERE id = $1',
    [recon.id, s.balances.statementBalance.toFixed(4), s.balances.ledgerBalance.toFixed(4), s.balances.unresolvedDifference.toFixed(4)]);
  return s;
}

/** Idempotent auto-match: engine `reconcile` over items not in confirmed matches. */
export async function runAutoMatch(t: Tx, auth: AuthContext, recon: ReconRow) {
  assertOpen(recon);
  const items = await reconItems(t, recon.bank_account_id, recon.period);
  const existing = (await reconMatches(t, recon.id)).map((m) => ({ id: m.id, status: m.status, bankIds: m.items.filter((i) => i.side === 'bank').map((i) => i.item_id), ledgerIds: m.items.filter((i) => i.side === 'ledger').map((i) => i.item_id) }));
  const free = (x: ReconItemRow) => x.match_status !== 'confirmed';
  const toItem = (x: ReconItemRow): ReconItem => ({ id: x.id, date: x.date, amount: x.amount, reference: x.reference, description: x.description });
  const plan = planAutoMatch(items.bank.filter(free).map(toItem), items.ledger.filter(free).map(toItem), existing);
  if (plan.drop.length) await t.query(`DELETE FROM recon_matches WHERE reconciliation_id = $1 AND status = 'proposed' AND id = ANY($2::uuid[])`, [recon.id, plan.drop]);
  // Untriaged exceptions are recomputed; investigating/resolved ones are preserved.
  await t.query(`DELETE FROM recon_exceptions WHERE reconciliation_id = $1 AND status = 'open'`, [recon.id]);
  for (const m of plan.insert) {
    const r = await one<{ id: string }>(t, `INSERT INTO recon_matches (tenant_id, reconciliation_id, match_type, cardinality, rule, bank_total, ledger_total, difference, status, created_by)
      VALUES ($1,$2,'auto',$3,$4,$5,$6,$7,'proposed',$8) RETURNING id`, [auth.tenantId, recon.id, m.cardinality, m.rule, m.bankTotal.toFixed(4), m.ledgerTotal.toFixed(4), m.difference.toFixed(4), auth.userId]);
    const amt = new Map([...items.bank, ...items.ledger].map((x) => [x.id, x.amount]));
    for (const id of m.bankIds) await t.query(`INSERT INTO recon_match_items (tenant_id, match_id, side, item_id, amount) VALUES ($1,$2,'bank',$3,$4)`, [auth.tenantId, r!.id, id, amt.get(id)]);
    for (const id of m.ledgerIds) await t.query(`INSERT INTO recon_match_items (tenant_id, match_id, side, item_id, amount) VALUES ($1,$2,'ledger',$3,$4)`, [auth.tenantId, r!.id, id, amt.get(id)]);
  }
  let excInserted = 0;
  for (const e of plan.exceptions) {
    const r = await t.query(`INSERT INTO recon_exceptions (tenant_id, reconciliation_id, side, item_id, kind, amount) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (reconciliation_id, side, item_id, kind) DO NOTHING`, [auth.tenantId, recon.id, e.side, e.itemId, e.kind, e.amount.toFixed(4)]);
    excInserted += r.rowCount ?? 0;
  }
  const s = await storeReconTotals(t, recon);
  const counts = { proposed_new: plan.insert.length, proposed_kept: plan.keep.length, proposed_dropped: plan.drop.length, exceptions: plan.exceptions.length, exceptions_inserted: excInserted, unresolved_difference: s.balances.unresolvedDifference.toFixed(2), engine: 'RECON v1' };
  await logAudit(t, auth, 'treasury.reconciliation_auto_match', 'reconciliation', recon.id, counts);
  return counts;
}

/** When a match is confirmed, close out exceptions on its items (never a write-off). */
export async function clearExceptionsForMatch(t: Tx, auth: AuthContext, reconId: string, matchId: string) {
  const items = await q<{ side: string; item_id: string }>(t, 'SELECT side, item_id FROM recon_match_items WHERE match_id = $1', [matchId]);
  for (const it of items) {
    await t.query(`UPDATE recon_exceptions SET status = 'resolved', resolution = coalesce(resolution || ' · ', '') || $4, resolved_by = $5, resolved_at = now()
      WHERE reconciliation_id = $1 AND side = $2 AND item_id = $3 AND status <> 'resolved'`, [reconId, it.side, it.item_id, `Cleared by confirmed match ${matchId.slice(0, 8)}`, auth.userId]);
  }
}

// ---------------------------------------------------------------------------
// Forecast inputs (operating only)
// ---------------------------------------------------------------------------

export async function forecastInputs(t: Tx, asOf: string, base: string) {
  const receivables = await q<{ id: string; number: string; merchant: string; due_date: string; promise_date: string | null; disputed: boolean; outstanding_base: string }>(t, `
    SELECT ci.id, ci.number, m.name AS merchant, ci.due_date::text, ci.promise_date::text, ci.disputed,
      ((ci.amount - CASE WHEN ci.paid_date IS NOT NULL AND ci.paid_date <= $1 THEN ci.amount_paid ELSE 0 END) * ci.fx_rate_to_base)::text AS outstanding_base
    FROM customer_invoices ci JOIN merchants m ON m.id = ci.merchant_id
    WHERE ci.status <> 'void' AND ci.issue_date <= $1 AND (ci.paid_date IS NULL OR ci.paid_date > $1 OR ci.amount_paid < ci.amount)
      AND (ci.amount - CASE WHEN ci.paid_date IS NOT NULL AND ci.paid_date <= $1 THEN ci.amount_paid ELSE 0 END) > 0
    ORDER BY ci.due_date`, [asOf]);
  const payables = await q<{ id: string; number: string; supplier: string; due_date: string; scheduled_date: string | null; status: string; priority: string; amount_base: string }>(t, `
    SELECT si.id, si.number, s.name AS supplier, si.due_date::text, si.scheduled_date::text, si.status, si.priority, (si.amount * si.fx_rate_to_base)::text AS amount_base
    FROM supplier_invoices si JOIN suppliers s ON s.id = si.supplier_id
    WHERE si.status NOT IN ('paid','rejected') AND si.invoice_date <= $1 ORDER BY coalesce(si.scheduled_date, si.due_date)`, [asOf]);
  const items = await q<{ id: string; category: string; description: string; amount_base: string; recurrence: 'once' | 'weekly' | 'monthly'; start_date: string; end_date: string | null; day_of_month: number | null; created_by_name: string | null; is_demo: boolean }>(t, `
    SELECT f.id, f.category, f.description, f.amount_base::text, f.recurrence, f.start_date::text, f.end_date::text, f.day_of_month, u.name AS created_by_name, f.is_demo
    FROM cash_forecast_items f LEFT JOIN users u ON u.id = f.created_by ORDER BY f.category, f.start_date`);
  const bal = await accountBalances(t, asOf, base);
  return { receivables, payables, items, balances: bal, split: cashSplit(bal) };
}

export function tenantMinimumLiquidity(auth: AuthContext): string {
  const v = auth.settings?.minimum_liquidity;
  return typeof v === 'string' || typeof v === 'number' ? dec(v).toString() : '0';
}

export { ZERO };
