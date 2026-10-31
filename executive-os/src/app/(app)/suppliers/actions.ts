'use server';
/**
 * Supplier payment planner actions. The system NEVER initiates a payment:
 * "Mark as paid" records a payment already executed in the bank (reference
 * required) and is restricted to finance.approve. Submitter ≠ approver is
 * enforced by the supplier_invoices CHECK constraint.
 */
import { z } from 'zod';
import { one, type Tx } from '@/lib/db';
import { todayISO } from '@/lib/period';
import { treasuryAction, logAudit, UserError } from '@/lib/services/treasury';

const FALLBACK = '/suppliers';
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date required (YYYY-MM-DD)');
const ccy = z.string().regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO code');

const supplierSchema = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/, 'code: letters, digits, - and _ only'),
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().min(2).max(40),
  payment_terms_days: z.coerce.number().int().min(0).max(365),
  currency: ccy,
  bank_account_masked: z.string().trim().max(40).regex(/^(\*{0,8}\d{0,6})?$/, 'masked account: e.g. ****1234 (never store full numbers)').optional().or(z.literal('')),
  is_critical: z.boolean(),
  is_active: z.boolean(),
});
const sup = (form: FormData) => supplierSchema.parse({ code: form.get('code'), name: form.get('name'), category: form.get('category'), payment_terms_days: form.get('payment_terms_days'), currency: String(form.get('currency') ?? '').toUpperCase(), bank_account_masked: form.get('bank_account_masked') ?? '', is_critical: form.get('is_critical') === '1', is_active: form.get('is_active') !== '0' });

export async function createSupplierAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const p = sup(form);
    const r = await one<{ id: string }>(t, `INSERT INTO suppliers (tenant_id, code, name, category, payment_terms_days, currency, bank_account_masked, is_critical, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [auth.tenantId, p.code, p.name, p.category, p.payment_terms_days, p.currency, p.bank_account_masked || null, p.is_critical, p.is_active]);
    await logAudit(t, auth, 'suppliers.supplier_created', 'supplier', r!.id, p);
    return `Supplier ${p.code} created.`;
  });
}

export async function updateSupplierAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const id = uuid.parse(form.get('id'));
    const before = await one(t, 'SELECT code, name, category, payment_terms_days, currency, bank_account_masked, is_critical, is_active FROM suppliers WHERE id = $1 FOR UPDATE', [id]);
    if (!before) throw new UserError('Supplier not found.');
    const p = sup(form);
    await t.query(`UPDATE suppliers SET code=$2, name=$3, category=$4, payment_terms_days=$5, currency=$6, bank_account_masked=$7, is_critical=$8, is_active=$9 WHERE id=$1`, [id, p.code, p.name, p.category, p.payment_terms_days, p.currency, p.bank_account_masked || null, p.is_critical, p.is_active]);
    await logAudit(t, auth, 'suppliers.supplier_updated', 'supplier', id, { before, after: p });
    return `Supplier ${p.code} updated.`;
  });
}

export async function createSupplierInvoiceAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const p = z.object({ supplier_id: uuid, number: z.string().trim().min(1).max(60), invoice_date: date, due_date: date.optional().or(z.literal('')), amount: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, 'amount must be a positive decimal'), currency: ccy, fx_rate_to_base: z.string().trim().regex(/^\d+(\.\d{1,10})?$/).optional().or(z.literal('')), description: z.string().trim().max(300), priority: z.enum(['critical', 'high', 'normal', 'low']) })
      .parse({ supplier_id: form.get('supplier_id'), number: form.get('number'), invoice_date: form.get('invoice_date'), due_date: form.get('due_date') ?? '', amount: form.get('amount'), currency: String(form.get('currency') ?? '').toUpperCase(), fx_rate_to_base: form.get('fx_rate_to_base') ?? '', description: form.get('description') ?? '', priority: form.get('priority') ?? 'normal' });
    const s = await one<{ payment_terms_days: number; currency: string }>(t, 'SELECT payment_terms_days, currency FROM suppliers WHERE id = $1', [p.supplier_id]);
    if (!s) throw new UserError('Supplier not found.');
    if (p.currency !== auth.baseCurrency && !p.fx_rate_to_base) throw new UserError(`An FX rate to ${auth.baseCurrency} is required for ${p.currency} invoices.`);
    const due = p.due_date || (await one<{ d: string }>(t, `SELECT ($1::date + $2::int)::text AS d`, [p.invoice_date, s.payment_terms_days]))!.d;
    if (due < p.invoice_date) throw new UserError('Due date cannot be before the invoice date.');
    const r = await one<{ id: string }>(t, `INSERT INTO supplier_invoices (tenant_id, supplier_id, number, invoice_date, due_date, currency, amount, fx_rate_to_base, description, status, priority, submitted_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'received',$10,$11) RETURNING id`, [auth.tenantId, p.supplier_id, p.number, p.invoice_date, due, p.currency, p.amount, p.currency === auth.baseCurrency ? '1' : p.fx_rate_to_base, p.description || null, p.priority, auth.userId]);
    await logAudit(t, auth, 'suppliers.invoice_registered', 'supplier_invoice', r!.id, { ...p, due_date: due });
    return `Invoice ${p.number} registered (status received). It needs approval by a different user with finance.approve.`;
  });
}

async function inv(t: Tx, id: string) {
  const i = await one<{ id: string; number: string; status: string; approved_by: string | null; submitted_by: string | null; scheduled_date: string | null; amount: string; invoice_date: string }>(t,
    'SELECT id, number, status, approved_by, submitted_by, scheduled_date::text, amount::text, invoice_date::text FROM supplier_invoices WHERE id = $1 FOR UPDATE', [id]);
  if (!i) throw new UserError('Supplier invoice not found.');
  return i;
}

export async function approveSupplierInvoiceAction(form: FormData) {
  return treasuryAction('finance.approve', form, FALLBACK, async (t, auth) => {
    const i = await inv(t, uuid.parse(form.get('invoiceId')));
    if (i.status !== 'received') throw new UserError(`Only received invoices can be approved (this one is ${i.status}).`);
    await t.query(`UPDATE supplier_invoices SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`, [i.id, auth.userId]);
    await logAudit(t, auth, 'suppliers.invoice_approved', 'supplier_invoice', i.id, { number: i.number, submitted_by: i.submitted_by });
    return `Invoice ${i.number} approved for payment planning.`;
  });
}

export async function rejectSupplierInvoiceAction(form: FormData) {
  return treasuryAction('finance.approve', form, FALLBACK, async (t, auth) => {
    const i = await inv(t, uuid.parse(form.get('invoiceId')));
    const reason = z.string().trim().min(5, 'a rejection reason (min 5 characters) is required').max(500).parse(form.get('reason') ?? '');
    if (['paid', 'rejected'].includes(i.status)) throw new UserError(`Invoice is already ${i.status}.`);
    await t.query(`UPDATE supplier_invoices SET status = 'rejected', scheduled_date = NULL WHERE id = $1`, [i.id]);
    await logAudit(t, auth, 'suppliers.invoice_rejected', 'supplier_invoice', i.id, { number: i.number, reason, previous_status: i.status });
    return `Invoice ${i.number} rejected.`;
  });
}

export async function scheduleSupplierInvoiceAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const i = await inv(t, uuid.parse(form.get('invoiceId')));
    const d = date.parse(form.get('scheduled_date'));
    if (!['approved', 'scheduled'].includes(i.status) || !i.approved_by) throw new UserError('Only approved invoices can be scheduled for payment.');
    if (d < todayISO()) throw new UserError('The planned payment date cannot be in the past.');
    await t.query(`UPDATE supplier_invoices SET status = 'scheduled', scheduled_date = $2, scheduled_by = $3 WHERE id = $1`, [i.id, d, auth.userId]);
    await logAudit(t, auth, 'suppliers.invoice_scheduled', 'supplier_invoice', i.id, { number: i.number, scheduled_date: d, previous: i.scheduled_date, payment_initiated: false });
    return `Invoice ${i.number} planned for payment on ${d}. This is a plan only — no payment instruction is sent to any bank.`;
  });
}

export async function holdSupplierInvoiceAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const i = await inv(t, uuid.parse(form.get('invoiceId')));
    const reason = z.string().trim().min(5, 'a reason (min 5 characters) is required').max(500).parse(form.get('reason') ?? '');
    if (!['received', 'approved', 'scheduled'].includes(i.status)) throw new UserError(`An invoice that is ${i.status} cannot be put on hold.`);
    await t.query(`UPDATE supplier_invoices SET status = 'on_hold' WHERE id = $1`, [i.id]);
    await logAudit(t, auth, 'suppliers.invoice_on_hold', 'supplier_invoice', i.id, { number: i.number, reason, previous_status: i.status });
    return `Invoice ${i.number} put on hold.`;
  });
}

export async function releaseSupplierInvoiceAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const i = await inv(t, uuid.parse(form.get('invoiceId')));
    if (i.status !== 'on_hold') throw new UserError('Invoice is not on hold.');
    const next = !i.approved_by ? 'received' : i.scheduled_date ? 'scheduled' : 'approved';
    await t.query(`UPDATE supplier_invoices SET status = $2 WHERE id = $1`, [i.id, next]);
    await logAudit(t, auth, 'suppliers.invoice_hold_released', 'supplier_invoice', i.id, { number: i.number, status: next });
    return `Hold released; invoice ${i.number} is ${next}.`;
  });
}

export async function setPriorityAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const i = await inv(t, uuid.parse(form.get('invoiceId')));
    const p = z.enum(['critical', 'high', 'normal', 'low']).parse(form.get('priority'));
    await t.query(`UPDATE supplier_invoices SET priority = $2 WHERE id = $1`, [i.id, p]);
    await logAudit(t, auth, 'suppliers.invoice_priority_changed', 'supplier_invoice', i.id, { number: i.number, priority: p });
    return `Priority of ${i.number} set to ${p}.`;
  });
}

export async function markSupplierPaidAction(form: FormData) {
  return treasuryAction('finance.approve', form, FALLBACK, async (t, auth) => {
    const i = await inv(t, uuid.parse(form.get('invoiceId')));
    const p = z.object({ payment_ref: z.string().trim().min(3, 'the bank payment reference is required').max(80), paid_date: date }).parse({ payment_ref: form.get('payment_ref'), paid_date: form.get('paid_date') });
    if (!['approved', 'scheduled'].includes(i.status) || !i.approved_by) throw new UserError('Only approved or scheduled invoices can be recorded as paid.');
    if (p.paid_date > todayISO()) throw new UserError('The payment date cannot be in the future — record payments only after they have been executed.');
    if (p.paid_date < i.invoice_date) throw new UserError('The payment date cannot be before the invoice date.');
    await t.query(`UPDATE supplier_invoices SET status = 'paid', paid_date = $2, payment_ref = $3 WHERE id = $1`, [i.id, p.paid_date, p.payment_ref]);
    await logAudit(t, auth, 'suppliers.invoice_marked_paid', 'supplier_invoice', i.id, { number: i.number, ...p, payment_initiated_by_system: false });
    return `Payment of ${i.number} recorded (ref ${p.payment_ref}). The system did not initiate any payment; check it appears under payment reconciliation once the bank line is imported.`;
  });
}
