/**
 * Data import framework (IMPORT v1):
 * upload → schema detection → column mapping → validation → duplicate detection →
 * preview → approval (segregation of duties) → transactional commit →
 * error reporting → control-total reconciliation → KPI recalculation.
 *
 * Idempotent: a file (by SHA-256) can be imported once per kind; rows whose
 * natural key already exists are reported as duplicates and NEVER overwrite
 * historical records. Original bytes and every parsed row are preserved immutably.
 */
import { createHash } from 'node:crypto';
import type { Tx } from '../db';
import { q, one } from '../db';
import { insertMany } from '../db-bulk';
import { audit } from '../audit';
import { dec, sum, ZERO, type Dec } from '../money';
import { addDays, monthEnd, monthStart } from '../dates';
import { parseFile } from '../import/parse';
import { KINDS, autoMap, detectKind, mapRow, type ImportKind } from '../import/kinds';
import { computeTxnEconomics, type PricingRule, type FeeRule, type ProcessingRule } from '../engine/fees';
import { tenantInfo } from './facts';
import { runCalculation } from './kpi';

export interface Actor { tenantId: string; userId: string }
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export async function uploadFile(tx: Tx, a: Actor, file: { name: string; bytes: Buffer; mime?: string }, requestedKind?: ImportKind) {
  if (file.bytes.length === 0) throw new Error('The uploaded file is empty');
  if (file.bytes.length > 20 * 1024 * 1024) throw new Error('File exceeds the 20 MB limit');
  const safeName = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 180);
  const parsed = await parseFile(file.bytes, safeName);
  if (parsed.rows.length > 200000) throw new Error('File exceeds 200 000 rows; split it into smaller files');
  const detected = detectKind(parsed.columns);
  const kind = requestedKind ?? detected[0].kind;
  const hash = sha(file.bytes);
  const existing = await one<{ id: string; status: string }>(tx, 'SELECT id, status FROM import_batches WHERE kind = $1 AND file_sha256 = $2', [kind, hash]);
  if (existing) return { batchId: existing.id, duplicateFile: true };
  const mapping = autoMap(kind, parsed.columns);
  const b = await one<{ id: string }>(tx, `INSERT INTO import_batches (tenant_id, kind, source_system, filename, file_sha256, file_size, mime_type, status, detected_columns, column_mapping, row_count, uploaded_by)
    VALUES ($1,$2,'file_upload',$3,$4,$5,$6,'uploaded',$7,$8,$9,$10) RETURNING id`,
    [a.tenantId, kind, safeName, hash, file.bytes.length, file.mime ?? null, JSON.stringify({ columns: parsed.columns, sheet: parsed.sheet ?? null, detection: detected.slice(0, 3) }), JSON.stringify(mapping), parsed.rows.length, a.userId]);
  await tx.query('INSERT INTO source_files (tenant_id, batch_id, sha256, filename, content) VALUES ($1,$2,$3,$4,$5)', [a.tenantId, b!.id, hash, safeName, file.bytes]);
  await insertMany(tx, 'import_source_rows', ['tenant_id', 'batch_id', 'row_number', 'raw', 'row_hash'],
    parsed.rows.map((r, i) => { const raw = Object.fromEntries(parsed.columns.map((c, j) => [c, r[j] ?? ''])); return [a.tenantId, b!.id, i + 2, JSON.stringify(raw), sha(JSON.stringify(r))]; }));
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'import.uploaded', entityType: 'import_batches', entityId: b!.id, payload: { kind, filename: safeName, sha256: hash, rows: parsed.rows.length, detected: detected[0] } });
  return { batchId: b!.id, duplicateFile: false };
}

export async function setMapping(tx: Tx, a: Actor, batchId: string, kind: ImportKind, mapping: Record<string, string>) {
  const b = await getBatch(tx, batchId);
  if (!['uploaded', 'validated'].includes(b.status)) throw new Error(`Mapping cannot change once the batch is ${b.status}`);
  const cols: string[] = b.detected_columns.columns;
  for (const [k, c] of Object.entries(mapping)) if (c && !cols.includes(c)) throw new Error(`Unknown column ${c} for field ${k}`);
  const clean = Object.fromEntries(Object.entries(mapping).filter(([, c]) => c));
  await tx.query(`UPDATE import_batches SET kind = $2, column_mapping = $3, status = 'uploaded', validation = '{}'::jsonb WHERE id = $1`, [batchId, kind, JSON.stringify(clean)]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'import.mapping_set', entityType: 'import_batches', entityId: batchId, payload: { kind, mapping: clean } });
}

export async function getBatch(tx: Tx, id: string) {
  const b = await one<any>(tx, `SELECT b.*, u.name AS uploaded_by_name, ap.name AS approved_by_name FROM import_batches b LEFT JOIN users u ON u.id = b.uploaded_by LEFT JOIN users ap ON ap.id = b.approved_by WHERE b.id = $1`, [id]);
  if (!b) throw new Error('Import batch not found');
  return b;
}

interface RowOutcome { id: string; rowNumber: number; status: 'valid' | 'error' | 'duplicate'; errors: string[]; values: Record<string, string | null>; derived?: Record<string, any>; amount?: Dec }

/** Validate every row (no writes to target tables). */
async function evaluate(tx: Tx, batch: any): Promise<{ rows: RowOutcome[]; warnings: string[]; closures: any[] }> {
  const kind = batch.kind as ImportKind; const def = KINDS[kind];
  const cols: string[] = batch.detected_columns.columns; const mapping = batch.column_mapping;
  const src = await q<any>(tx, 'SELECT id, row_number, raw FROM import_source_rows WHERE batch_id = $1 ORDER BY row_number', [batch.id]);
  const t = await tenantInfo(tx);
  const rows: RowOutcome[] = src.map((s) => { const m = mapRow(kind, mapping, cols, cols.map((c) => s.raw[c] ?? '')); return { id: s.id, rowNumber: s.row_number, status: m.errors.length ? 'error' : 'valid', errors: m.errors, values: m.values }; });
  const warnings: string[] = []; const closures: any[] = [];
  const missingRequired = def.fields.filter((fd) => fd.required && !mapping[fd.key]).map((fd) => fd.label);
  if (missingRequired.length) warnings.push(`Unmapped required fields: ${missingRequired.join(', ')}`);
  const locked = new Set((await q<any>(tx, "SELECT period::text FROM financial_periods WHERE status = 'locked'")).map((r) => r.period));
  const ref = async (table: string) => new Map((await q<any>(tx, `SELECT code, id FROM ${table}`)).map((r) => [String(r.code).toLowerCase(), r.id]));
  const err = (r: RowOutcome, e: string) => { r.errors.push(e); r.status = 'error'; };
  const seen = new Set<string>();
  const nk = (r: RowOutcome) => def.naturalKey.map((k) => r.values[k] ?? '').join('|').toLowerCase();

  if (kind === 'transactions') {
    const [merchants, products, methods, acquirers] = await Promise.all([ref('merchants'), ref('products'), ref('payment_methods'), ref('acquirers')]);
    const pricing = await q<PricingRule>(tx, 'SELECT id, merchant_id, payment_method_id, card_region, mdr_bps::text, fixed_fee::text, effective_from, effective_to FROM pricing_agreements');
    const fees = await q<FeeRule>(tx, 'SELECT id, acquirer_id, payment_method_id, card_region, wholesale_bps::text, fixed_fee::text, effective_from, effective_to FROM fee_schedules');
    const proc = await q<ProcessingRule>(tx, 'SELECT product_id, cost_per_txn::text, cost_bps::text, effective_from, effective_to FROM processing_cost_rates');
    const fx = await q<any>(tx, 'SELECT rate_date::text, from_ccy, rate::text FROM exchange_rates WHERE to_ccy = $1 ORDER BY rate_date', [t.base_currency]);
    const refs = rows.map((r) => r.values.external_ref).filter(Boolean) as string[];
    const existing = new Set((await q<any>(tx, 'SELECT external_ref FROM transactions WHERE external_ref = ANY($1)', [refs])).map((r) => r.external_ref));
    for (const r of rows) {
      if (r.status === 'error') continue;
      const v = r.values;
      if (existing.has(v.external_ref!) || seen.has(nk(r))) { r.status = 'duplicate'; r.errors.push(existing.has(v.external_ref!) ? 'Transaction reference already exists — not overwritten' : 'Duplicate reference within file'); continue; }
      seen.add(nk(r));
      const merchantId = merchants.get(v.merchant_code!.toLowerCase()); const productId = products.get(v.product_code!.toLowerCase()); const pmId = methods.get(v.payment_method!.toLowerCase()); const acqId = v.acquirer_code ? acquirers.get(v.acquirer_code.toLowerCase()) : null;
      if (!merchantId) err(r, `Unknown merchant code ${v.merchant_code}`);
      if (!productId) err(r, `Unknown product code ${v.product_code}`);
      if (!pmId) err(r, `Unknown payment method ${v.payment_method}`);
      if (v.acquirer_code && !acqId) err(r, `Unknown acquirer ${v.acquirer_code}`);
      if (dec(v.amount!).lt(0)) err(r, 'Amount must be ≥ 0 (use status refunded/reversed for reversals)');
      const acctDate = v.accounting_date ?? v.event_at!.slice(0, 10);
      if (locked.has(monthStart(acctDate))) err(r, `Accounting period ${acctDate.slice(0, 7)} is locked`);
      if (v.settlement_date && v.settlement_date < v.event_at!.slice(0, 10)) err(r, 'Settlement date precedes the event date');
      let rate = v.fx_rate ? dec(v.fx_rate) : null; let rateSource = 'file';
      if (v.txn_currency !== t.base_currency && !rate) { const hit = [...fx].reverse().find((x) => x.from_ccy === v.txn_currency && x.rate_date <= acctDate); if (hit) { rate = dec(hit.rate); rateSource = `exchange_rates ${hit.rate_date}`; } else err(r, `No FX rate for ${v.txn_currency} on ${acctDate}`); }
      if (v.txn_currency === t.base_currency) { rate = dec(1); rateSource = 'base currency'; }
      if ((r.status as string) === 'error') continue;
      const amountBase = dec(v.amount!).times(rate!).toDecimalPlaces(4);
      const region = v.card_region === 'international' ? 'international' : 'domestic';
      const e = computeTxnEconomics({ merchant_id: merchantId!, acquirer_id: acqId ?? null, payment_method_id: pmId!, product_id: productId!, card_region: region, status: v.status!, amount_base: amountBase, accounting_date: acctDate }, pricing, fees, proc);
      if (e.issues.includes('NO_PRICING_AGREEMENT')) err(r, `No effective pricing agreement for merchant ${v.merchant_code} on ${acctDate}`);
      if (e.issues.includes('NO_FEE_SCHEDULE')) err(r, `No effective fee schedule for acquirer ${v.acquirer_code} on ${acctDate}`);
      r.amount = dec(v.amount!);
      r.derived = { merchantId, productId, pmId, acqId, region, acctDate, rate: rate!.toFixed(10), rateSource, amountBase: amountBase.toFixed(4), mdr: e.mdr.toDecimalPlaces(4).toFixed(4), wholesale: e.wholesale.toDecimalPlaces(4).toFixed(4), processing: e.processing.toDecimalPlaces(4).toFixed(4), pricingId: e.pricingId, feeId: e.feeScheduleId };
    }
  } else if (kind === 'gl_entries') {
    const [accounts, depts, products] = await Promise.all([ref('chart_of_accounts'), ref('departments'), ref('products')]);
    let auto = 0; const lineCounter = new Map<string, number>();
    for (const r of rows) { if (!r.values.line_no && r.values.journal_ref) { const n = (lineCounter.get(r.values.journal_ref) ?? 0) + 1; lineCounter.set(r.values.journal_ref, n); r.values.line_no = String(n); auto++; } }
    if (auto) warnings.push(`${auto} rows had no line number; sequential numbers were assigned per journal`);
    const keys = rows.map((r) => `${r.values.journal_ref}|${r.values.line_no}`);
    const existing = new Set((await q<any>(tx, `SELECT journal_ref || '|' || line_no AS k FROM gl_entries WHERE journal_ref || '|' || line_no = ANY($1)`, [keys])).map((x) => x.k));
    const balance = new Map<string, Dec>();
    for (const r of rows) {
      if (r.status === 'error') continue;
      const v = r.values;
      if (existing.has(`${v.journal_ref}|${v.line_no}`) || seen.has(nk(r))) { r.status = 'duplicate'; r.errors.push('Journal line already exists — not overwritten'); continue; }
      seen.add(nk(r));
      const d = dec(v.debit ?? 0), c = dec(v.credit ?? 0);
      if (d.lt(0) || c.lt(0)) err(r, 'Debit/credit must be ≥ 0');
      if (d.gt(0) && c.gt(0)) err(r, 'A line cannot carry both debit and credit');
      if (d.isZero() && c.isZero()) err(r, 'Line has neither debit nor credit');
      const accId = accounts.get(v.account_code!.toLowerCase()); if (!accId) err(r, `Unknown account ${v.account_code}`);
      const deptId = v.department_code ? depts.get(v.department_code.toLowerCase()) : null; if (v.department_code && !deptId) err(r, `Unknown department ${v.department_code}`);
      const prodId = v.product_code ? products.get(v.product_code.toLowerCase()) : null; if (v.product_code && !prodId) err(r, `Unknown product ${v.product_code}`);
      if (locked.has(monthStart(v.entry_date!))) err(r, `Period ${v.entry_date!.slice(0, 7)} is locked`);
      const ccy = v.currency ?? t.base_currency; const rate = ccy === t.base_currency ? dec(1) : v.fx_rate ? dec(v.fx_rate) : null;
      if (!rate) err(r, `FX rate required for ${ccy}`);
      if ((r.status as string) === 'error') continue;
      r.amount = d; r.derived = { accId, deptId, prodId, ccy, rate: rate!.toFixed(10), debitBase: d.times(rate!).toDecimalPlaces(4).toFixed(4), creditBase: c.times(rate!).toDecimalPlaces(4).toFixed(4) };
      balance.set(v.journal_ref!, (balance.get(v.journal_ref!) ?? ZERO).plus(dec(r.derived.debitBase)).minus(dec(r.derived.creditBase)));
    }
    const unbalanced = [...balance.entries()].filter(([, v]) => !v.isZero()).map(([k]) => k);
    for (const r of rows) if (r.status === 'valid' && unbalanced.includes(r.values.journal_ref!)) err(r, `Journal ${r.values.journal_ref} does not balance (Δ ${balance.get(r.values.journal_ref!)!.toFixed(2)})`);
  } else if (kind === 'bank_transactions') {
    const accounts = new Map((await q<any>(tx, 'SELECT code, id, currency FROM bank_accounts')).map((r) => [r.code.toLowerCase(), r]));
    for (const r of rows) {
      const v = r.values;
      if (!v.amount && !v.debit && !v.credit) err(r, 'Provide a signed amount or debit/credit');
      if (!v.bank_ref) v.bank_ref = `H-${sha(JSON.stringify([v.bank_account_code, v.txn_date, v.amount, v.debit, v.credit, v.description, v.reference])).slice(0, 20)}`;
    }
    const existing = new Set((await q<any>(tx, `SELECT lower(ba.code) || '|' || lower(bt.bank_ref) AS k FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id`)).map((x) => x.k));
    for (const r of rows) {
      if (r.status === 'error') continue;
      const v = r.values; const acc = accounts.get(v.bank_account_code!.toLowerCase());
      if (existing.has(nk(r)) || seen.has(nk(r))) { r.status = 'duplicate'; r.errors.push('Statement line already imported — not overwritten'); continue; }
      seen.add(nk(r));
      if (!acc) { err(r, `Unknown bank account ${v.bank_account_code}`); continue; }
      const amt = v.amount ? dec(v.amount) : dec(v.credit ?? 0).minus(dec(v.debit ?? 0));
      if (v.currency && v.currency !== acc.currency) err(r, `Currency ${v.currency} differs from account currency ${acc.currency}`);
      r.amount = amt; r.derived = { accountId: acc.id, currency: acc.currency, amount: amt.toFixed(4) };
    }
  } else if (kind === 'merchants') {
    const [existing, verticals, groups] = await Promise.all([ref('merchants'), ref('verticals'), ref('merchant_groups')]);
    for (const r of rows) {
      if (r.status === 'error') continue;
      const v = r.values;
      if (existing.has(v.code!.toLowerCase()) || seen.has(nk(r))) { r.status = 'duplicate'; r.errors.push('Merchant code already exists — master data is not overwritten by imports'); continue; }
      seen.add(nk(r));
      const vid = v.vertical_code ? verticals.get(v.vertical_code.toLowerCase()) : null; if (v.vertical_code && !vid) err(r, `Unknown vertical ${v.vertical_code}`);
      const gid = v.group_code ? groups.get(v.group_code.toLowerCase()) : null; if (v.group_code && !gid) err(r, `Unknown merchant group ${v.group_code}`);
      const imp = v.commercial_importance ? Number(v.commercial_importance) : 3; if (imp < 1 || imp > 5) err(r, 'Commercial importance must be 1–5');
      r.derived = { vid, gid, imp };
    }
  } else if (kind === 'fee_schedules') {
    const [acquirers, methods] = await Promise.all([ref('acquirers'), ref('payment_methods')]);
    const current = await q<any>(tx, 'SELECT id, acquirer_id, payment_method_id, card_region, effective_from, effective_to, schedule_ref FROM fee_schedules');
    for (const r of rows) {
      if (r.status === 'error') continue;
      const v = r.values; const acq = acquirers.get(v.acquirer_code!.toLowerCase()); const pm = v.payment_method ? methods.get(v.payment_method.toLowerCase()) : null;
      if (!acq) { err(r, `Unknown acquirer ${v.acquirer_code}`); continue; }
      if (v.payment_method && !pm) { err(r, `Unknown payment method ${v.payment_method}`); continue; }
      if (dec(v.wholesale_bps!).lt(0)) err(r, 'Wholesale bps must be ≥ 0');
      if (v.effective_to && v.effective_to < v.effective_from!) err(r, 'effective_to precedes effective_from');
      const region = v.card_region ?? 'any';
      const same = current.filter((c) => c.acquirer_id === acq && c.payment_method_id === (pm ?? null) && c.card_region === region);
      if (same.some((c) => c.effective_from === v.effective_from) || seen.has(nk(r))) { r.status = 'duplicate'; r.errors.push('A schedule with the same key and start date exists'); continue; }
      seen.add(nk(r));
      const overlapClosed = same.find((c) => c.effective_to && c.effective_from <= (v.effective_to ?? '9999-12-31') && c.effective_to >= v.effective_from!);
      if (overlapClosed) err(r, `Overlaps closed schedule ${overlapClosed.schedule_ref ?? overlapClosed.id} (${overlapClosed.effective_from} → ${overlapClosed.effective_to})`);
      const open = same.find((c) => !c.effective_to && c.effective_from < v.effective_from!);
      if (open && (r.status as string) !== 'error') closures.push({ row: r.rowNumber, schedule_id: open.id, schedule_ref: open.schedule_ref, new_effective_to: addDays(v.effective_from!, -1) });
      if (same.find((c) => !c.effective_to && c.effective_from > v.effective_from!)) err(r, 'A later open-ended schedule exists; back-dated insertion not allowed');
      r.derived = { acq, pm: pm ?? null, region };
    }
    if (closures.length) warnings.push(`${closures.length} open-ended schedule(s) will be closed the day before the new schedule starts (explicit, audited)`);
  } else if (kind === 'customer_invoices') {
    const merchants = await ref('merchants');
    const existing = new Set((await q<any>(tx, 'SELECT lower(number) AS n FROM customer_invoices')).map((x) => x.n));
    for (const r of rows) {
      if (r.status === 'error') continue;
      const v = r.values;
      if (existing.has(v.number!.toLowerCase()) || seen.has(nk(r))) { r.status = 'duplicate'; r.errors.push('Invoice number already exists — not overwritten'); continue; }
      seen.add(nk(r));
      const mid = merchants.get(v.merchant_code!.toLowerCase()); if (!mid) err(r, `Unknown merchant ${v.merchant_code}`);
      if (v.due_date! < v.issue_date!) err(r, 'Due date precedes issue date');
      const paid = dec(v.amount_paid ?? 0); if (paid.gt(dec(v.amount!))) err(r, 'Amount paid exceeds amount');
      const ccy = v.currency ?? t.base_currency; if (ccy !== t.base_currency && !v.fx_rate) err(r, `FX rate required for ${ccy}`);
      r.amount = dec(v.amount!); r.derived = { mid, ccy, rate: ccy === t.base_currency ? '1' : v.fx_rate, paid: paid.toFixed(4), status: paid.isZero() ? 'open' : paid.eq(dec(v.amount!)) ? 'paid' : 'partially_paid' };
    }
  } else if (kind === 'budget_lines') {
    const versions = new Map((await q<any>(tx, 'SELECT lower(name) AS n, id, status FROM budget_versions')).map((x) => [x.n, x]));
    const [accounts, depts, products] = await Promise.all([ref('chart_of_accounts'), ref('departments'), ref('products')]);
    for (const r of rows) {
      if (r.status === 'error') continue;
      const v = r.values; const ver = versions.get(v.version_name!.toLowerCase());
      if (!ver) { err(r, `Unknown budget version ${v.version_name}`); continue; }
      if (ver.status !== 'draft') { err(r, `Budget version ${v.version_name} is ${ver.status} (locked)`); continue; }
      const acc = accounts.get(v.account_code!.toLowerCase()); if (!acc) err(r, `Unknown account ${v.account_code}`);
      const dept = v.department_code ? depts.get(v.department_code.toLowerCase()) : null; if (v.department_code && !dept) err(r, `Unknown department ${v.department_code}`);
      const prod = v.product_code ? products.get(v.product_code.toLowerCase()) : null; if (v.product_code && !prod) err(r, `Unknown product ${v.product_code}`);
      if (seen.has(nk(r))) { r.status = 'duplicate'; r.errors.push('Duplicate budget line in file'); continue; }
      seen.add(nk(r));
      r.amount = dec(v.amount!); r.derived = { version: ver.id, acc, dept, prod };
    }
  }
  return { rows, warnings, closures };
}

export async function validateBatch(tx: Tx, a: Actor, batchId: string) {
  const b = await getBatch(tx, batchId);
  if (!['uploaded', 'validated'].includes(b.status)) throw new Error(`Batch is ${b.status}`);
  const { rows, warnings, closures } = await evaluate(tx, b);
  for (const status of ['valid', 'error', 'duplicate'] as const) {
    const set = rows.filter((r) => r.status === status);
    for (let i = 0; i < set.length; i += 2000) {
      const chunk = set.slice(i, i + 2000);
      await tx.query(`UPDATE import_source_rows s SET status = $2, errors = x.errors FROM (SELECT unnest($1::uuid[]) AS id, unnest($3::jsonb[]) AS errors) x WHERE s.id = x.id`, [chunk.map((r) => r.id), status, chunk.map((r) => JSON.stringify(r.errors))]);
    }
  }
  const tot = (s?: string) => sum(rows.filter((r) => (!s || r.status === s) && r.amount).map((r) => r.amount!)).toFixed(4);
  const summary = { rows: rows.length, valid: rows.filter((r) => r.status === 'valid').length, errors: rows.filter((r) => r.status === 'error').length, duplicates: rows.filter((r) => r.status === 'duplicate').length,
    control_totals: KINDS[b.kind as ImportKind].amountField ? { field: KINDS[b.kind as ImportKind].amountField, valid: tot('valid'), duplicate: tot('duplicate'), error_rows_parsed: tot('error') } : null,
    warnings, closures, validated_at: new Date().toISOString() };
  await tx.query(`UPDATE import_batches SET status = 'validated', validation = $2, valid_count = $3, error_count = $4, duplicate_count = $5 WHERE id = $1`, [batchId, JSON.stringify(summary), summary.valid, summary.errors, summary.duplicates]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'import.validated', entityType: 'import_batches', entityId: batchId, payload: summary });
  return summary;
}

export async function approveBatch(tx: Tx, a: Actor, batchId: string) {
  const b = await getBatch(tx, batchId);
  if (b.status !== 'validated') throw new Error('Only validated batches can be approved');
  if (b.uploaded_by === a.userId) throw new Error('Segregation of duties: the uploader cannot approve their own import');
  if (b.valid_count === 0) throw new Error('Nothing to commit: no valid rows');
  await tx.query(`UPDATE import_batches SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`, [batchId, a.userId]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'import.approved', entityType: 'import_batches', entityId: batchId, payload: { valid: b.valid_count, errors: b.error_count, duplicates: b.duplicate_count } });
}

export async function rejectBatch(tx: Tx, a: Actor, batchId: string, reason: string) {
  const b = await getBatch(tx, batchId);
  if (['committed', 'rejected'].includes(b.status)) throw new Error(`Batch is already ${b.status}`);
  await tx.query(`UPDATE import_batches SET status = 'rejected', validation = validation || jsonb_build_object('rejection_reason', $2::text) WHERE id = $1`, [batchId, reason]);
  await audit(tx, { tenantId: a.tenantId, userId: a.userId, action: 'import.rejected', entityType: 'import_batches', entityId: batchId, payload: { reason } });
}

/** Commit in ONE transaction (the caller's). Re-validates first so the commit is consistent with current reference data. */
export async function commitBatch(tx: Tx, a: Actor, batchId: string, opts: { recalc?: boolean } = {}) {
  const b = await getBatch(tx, batchId);
  if (b.status !== 'approved') throw new Error('Batch must be approved before commit');
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`import:${batchId}`]);
  const { rows, closures } = await evaluate(tx, b);
  const valid = rows.filter((r) => r.status === 'valid');
  const kind = b.kind as ImportKind; const T = a.tenantId;
  const months = new Set<string>();
  let inserted: any[] = [];
  if (kind === 'transactions') {
    inserted = await insertMany(tx, 'transactions', ['tenant_id', 'external_ref', 'merchant_id', 'product_id', 'acquirer_id', 'payment_method_id', 'card_scheme', 'card_region', 'country', 'status', 'txn_currency', 'settlement_currency', 'amount', 'fx_rate_to_base', 'amount_base', 'mdr_fee_base', 'wholesale_fee_base', 'processing_cost_base', 'pricing_agreement_id', 'fee_schedule_id', 'event_at', 'processed_at', 'settlement_date', 'accounting_date', 'import_batch_id', 'source_row_id'],
      valid.map((r) => { const v = r.values, d = r.derived!; months.add(monthStart(d.acctDate)); return [T, v.external_ref, d.merchantId, d.productId, d.acqId, d.pmId, v.card_scheme, d.region, v.country ?? 'MU', v.status, v.txn_currency, v.settlement_currency ?? v.txn_currency, dec(v.amount!).toFixed(4), d.rate, d.amountBase, d.mdr, d.wholesale, d.processing, d.pricingId, d.feeId, v.event_at, v.processed_at ?? v.event_at, v.settlement_date, d.acctDate, batchId, r.id]; }), 'id, source_row_id');
  } else if (kind === 'gl_entries') {
    inserted = await insertMany(tx, 'gl_entries', ['tenant_id', 'journal_ref', 'line_no', 'entry_date', 'period', 'account_id', 'department_id', 'product_id', 'description', 'currency', 'debit', 'credit', 'fx_rate_to_base', 'debit_base', 'credit_base', 'source_system', 'import_batch_id', 'source_row_id', 'created_by'],
      valid.map((r) => { const v = r.values, d = r.derived!; months.add(monthStart(v.entry_date!)); return [T, v.journal_ref, Number(v.line_no), v.entry_date, monthStart(v.entry_date!), d.accId, d.deptId, d.prodId, v.description, d.ccy, dec(v.debit ?? 0).toFixed(4), dec(v.credit ?? 0).toFixed(4), d.rate, d.debitBase, d.creditBase, `import:${b.filename}`, batchId, r.id, a.userId]; }), 'id, source_row_id');
  } else if (kind === 'bank_transactions') {
    inserted = await insertMany(tx, 'bank_transactions', ['tenant_id', 'bank_account_id', 'txn_date', 'value_date', 'amount', 'currency', 'description', 'reference', 'counterparty', 'category', 'bank_ref', 'import_batch_id', 'source_row_id'],
      valid.map((r) => { const v = r.values, d = r.derived!; months.add(monthStart(v.txn_date!)); return [T, d.accountId, v.txn_date, v.value_date ?? v.txn_date, d.amount, d.currency, v.description, v.reference, v.counterparty, v.category ?? 'other', v.bank_ref, batchId, r.id]; }), 'id, source_row_id');
  } else if (kind === 'merchants') {
    inserted = await insertMany(tx, 'merchants', ['tenant_id', 'code', 'name', 'vertical_id', 'group_id', 'segment', 'country', 'activated_at', 'commercial_importance', 'price_locked_until', 'contract_notes', 'status'],
      valid.map((r) => { const v = r.values, d = r.derived!; return [T, v.code, v.name, d.vid, d.gid, v.segment ?? 'sme', (v.country ?? 'MU').slice(0, 2).toUpperCase(), v.activated_at, d.imp, v.price_locked_until, v.contract_notes, v.activated_at ? 'active' : 'onboarding']; }), 'id');
    inserted = inserted.map((x, i) => ({ id: x.id, source_row_id: valid[i].id }));
  } else if (kind === 'fee_schedules') {
    for (const c of closures) await tx.query('UPDATE fee_schedules SET effective_to = $2 WHERE id = $1 AND effective_to IS NULL', [c.schedule_id, c.new_effective_to]);
    inserted = await insertMany(tx, 'fee_schedules', ['tenant_id', 'acquirer_id', 'payment_method_id', 'card_region', 'wholesale_bps', 'fixed_fee', 'effective_from', 'effective_to', 'schedule_ref'],
      valid.map((r) => { const v = r.values, d = r.derived!; return [T, d.acq, d.pm, d.region, v.wholesale_bps, v.fixed_fee ?? '0', v.effective_from, v.effective_to, v.schedule_ref ?? `import:${b.filename}#${r.rowNumber}`]; }), 'id');
    inserted = inserted.map((x, i) => ({ id: x.id, source_row_id: valid[i].id }));
  } else if (kind === 'customer_invoices') {
    inserted = await insertMany(tx, 'customer_invoices', ['tenant_id', 'number', 'merchant_id', 'issue_date', 'due_date', 'currency', 'amount', 'amount_paid', 'fx_rate_to_base', 'description', 'status', 'paid_date'],
      valid.map((r) => { const v = r.values, d = r.derived!; months.add(monthStart(v.issue_date!)); return [T, v.number, d.mid, v.issue_date, v.due_date, d.ccy, dec(v.amount!).toFixed(4), d.paid, d.rate, v.description, d.status, v.paid_date]; }), 'id');
    inserted = inserted.map((x, i) => ({ id: x.id, source_row_id: valid[i].id }));
  } else if (kind === 'budget_lines') {
    inserted = await insertMany(tx, 'budget_lines', ['tenant_id', 'version_id', 'account_id', 'department_id', 'product_id', 'period', 'amount_base'],
      valid.map((r) => { const v = r.values, d = r.derived!; return [T, d.version, d.acc, d.dept, d.prod, v.period, dec(v.amount!).toFixed(4)]; }), 'id');
    inserted = inserted.map((x, i) => ({ id: x.id, source_row_id: valid[i].id }));
  }
  for (let i = 0; i < inserted.length; i += 2000) {
    const chunk = inserted.slice(i, i + 2000);
    await tx.query(`UPDATE import_source_rows s SET status = 'committed', target_id = x.tid FROM (SELECT unnest($1::uuid[]) AS sid, unnest($2::uuid[]) AS tid) x WHERE s.id = x.sid`, [chunk.map((x) => x.source_row_id), chunk.map((x) => x.id)]);
  }
  for (const m of months) await tx.query(`INSERT INTO financial_periods (tenant_id, period, status) VALUES ($1,$2,'open') ON CONFLICT DO NOTHING`, [T, m]);
  // Control-total reconciliation: committed records must equal validated rows
  const committedTotal = KINDS[kind].amountField ? sum(valid.map((r) => r.amount ?? ZERO)).toFixed(4) : null;
  const recon = { validated_valid_rows: valid.length, committed_rows: inserted.length, rows_reconcile: valid.length === inserted.length, committed_amount_total: committedTotal, duplicates_skipped: rows.filter((r) => r.status === 'duplicate').length, errors_not_imported: rows.filter((r) => r.status === 'error').length, schedule_closures: closures };
  if (!recon.rows_reconcile) throw new Error('Commit reconciliation failed: inserted rows differ from validated rows — transaction rolled back');
  await tx.query(`UPDATE import_batches SET status = 'committed', committed_at = now(), committed_count = $2, validation = validation || jsonb_build_object('commit_reconciliation', $3::jsonb) WHERE id = $1`, [batchId, inserted.length, JSON.stringify(recon)]);
  await tx.query(`INSERT INTO evidence_records (tenant_id, subject_type, subject_id, kind, reference, description, sha256, created_by) VALUES ($1,'import_batch',$2,'source_file',$3,$4,$5,$6)`, [T, batchId, b.filename, `Committed ${inserted.length} ${kind} rows`, b.file_sha256, a.userId]);
  await audit(tx, { tenantId: T, userId: a.userId, action: 'import.committed', entityType: 'import_batches', entityId: batchId, payload: recon });
  const recalculated: string[] = [];
  if (opts.recalc !== false && ['transactions', 'gl_entries', 'bank_transactions', 'customer_invoices'].includes(kind)) {
    for (const m of [...months].sort()) { await runCalculation(tx, { tenantId: T, userId: a.userId, start: m, end: monthEnd(m), reason: `import ${batchId.slice(0, 8)} committed` }); recalculated.push(m); }
  }
  return { ...recon, recalculated };
}

export async function listBatches(tx: Tx) {
  return q<any>(tx, `SELECT b.id, b.kind, b.filename, b.status, b.row_count, b.valid_count, b.error_count, b.duplicate_count, b.committed_count, b.created_at, b.committed_at, u.name AS uploaded_by, ap.name AS approved_by, b.file_sha256
    FROM import_batches b LEFT JOIN users u ON u.id = b.uploaded_by LEFT JOIN users ap ON ap.id = b.approved_by ORDER BY b.created_at DESC LIMIT 200`);
}

export async function batchRows(tx: Tx, batchId: string, status?: string, limit = 200, offset = 0) {
  return q<any>(tx, `SELECT id, row_number, raw, row_hash, status, errors, target_id FROM import_source_rows WHERE batch_id = $1 ${status ? 'AND status = $4' : ''} ORDER BY row_number LIMIT $2 OFFSET $3`, status ? [batchId, limit, offset, status] : [batchId, limit, offset]);
}

/** Preview mapped values (first n rows) without writing. */
export async function previewBatch(tx: Tx, batchId: string, n = 20) {
  const b = await getBatch(tx, batchId);
  const src = await q<any>(tx, 'SELECT row_number, raw FROM import_source_rows WHERE batch_id = $1 ORDER BY row_number LIMIT $2', [batchId, n]);
  const cols: string[] = b.detected_columns.columns;
  return src.map((s) => ({ row: s.row_number, ...mapRow(b.kind, b.column_mapping, cols, cols.map((c) => s.raw[c] ?? '')) }));
}
