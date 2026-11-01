'use server';
/** CRUD for manual / recurring 13-week forecast items (finance.manage). Audited. */
import { z } from 'zod';
import { one } from '@/lib/db';
import { FORECAST_CATEGORIES } from '@/lib/engine/cashforecast';
import { treasuryAction, logAudit, UserError } from '@/lib/services/treasury';

const FALLBACK = '/treasury-forecast';
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const itemSchema = z.object({
  category: z.enum(FORECAST_CATEGORIES),
  description: z.string().trim().min(3).max(200),
  amount: z.string().trim().regex(/^-?\d+(\.\d{1,4})?$/, 'amount must be a decimal number (negative = outflow)'),
  recurrence: z.enum(['once', 'weekly', 'monthly']),
  start_date: z.string().regex(dateRe, 'start date required'),
  end_date: z.string().regex(dateRe).optional().or(z.literal('')),
  day_of_month: z.string().regex(/^([1-9]|[12]\d|3[01])$/, 'day of month 1–31').optional().or(z.literal('')),
});
const INFLOW = new Set(['customer_receipts', 'other_in']);

function parse(form: FormData) {
  const p = itemSchema.parse(Object.fromEntries(['category', 'description', 'amount', 'recurrence', 'start_date', 'end_date', 'day_of_month'].map((k) => [k, String(form.get(k) ?? '')])));
  if (p.end_date && p.end_date < p.start_date) throw new UserError('End date cannot be before the start date.');
  const neg = p.amount.startsWith('-');
  if (INFLOW.has(p.category) && neg) throw new UserError('Inflow categories need a positive amount.');
  if (!INFLOW.has(p.category) && !neg && p.amount !== '0') throw new UserError('Outflow categories need a negative amount (e.g. -150000).');
  return { ...p, end_date: p.end_date || null, day_of_month: p.recurrence === 'monthly' && p.day_of_month ? Number(p.day_of_month) : null };
}

export async function createForecastItemAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const p = parse(form);
    const r = await one<{ id: string }>(t, `INSERT INTO cash_forecast_items (tenant_id, category, description, amount_base, recurrence, start_date, end_date, day_of_month, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [auth.tenantId, p.category, p.description, p.amount, p.recurrence, p.start_date, p.end_date, p.day_of_month, auth.userId]);
    await logAudit(t, auth, 'treasury.forecast_item_created', 'cash_forecast_item', r!.id, p);
    return `Forecast item "${p.description}" added.`;
  });
}

export async function updateForecastItemAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const id = z.string().uuid().parse(form.get('id'));
    const before = await one<any>(t, 'SELECT category, description, amount_base::text, recurrence, start_date::text, end_date::text, day_of_month FROM cash_forecast_items WHERE id = $1 FOR UPDATE', [id]);
    if (!before) throw new UserError('Forecast item not found.');
    const p = parse(form);
    await t.query(`UPDATE cash_forecast_items SET category=$2, description=$3, amount_base=$4, recurrence=$5, start_date=$6, end_date=$7, day_of_month=$8 WHERE id=$1`, [id, p.category, p.description, p.amount, p.recurrence, p.start_date, p.end_date, p.day_of_month]);
    await logAudit(t, auth, 'treasury.forecast_item_updated', 'cash_forecast_item', id, { before, after: p });
    return `Forecast item "${p.description}" updated.`;
  });
}

export async function deleteForecastItemAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const id = z.string().uuid().parse(form.get('id'));
    const before = await one<any>(t, 'DELETE FROM cash_forecast_items WHERE id = $1 RETURNING category, description, amount_base::text, recurrence, start_date::text, end_date::text, day_of_month', [id]);
    if (!before) throw new UserError('Forecast item not found.');
    await logAudit(t, auth, 'treasury.forecast_item_deleted', 'cash_forecast_item', id, { before });
    return `Forecast item "${before.description}" deleted (recorded in the audit trail).`;
  });
}
