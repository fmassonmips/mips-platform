'use server';
/**
 * Collections workflow. NO e-mail or other external communication is sent by
 * the system: reminders are drafted (pending_approval), approved by a DIFFERENT
 * user with finance.approve (DB CHECK on collection_events), and only then can
 * be recorded as sent manually ("Mark as sent (manual)").
 */
import { z } from 'zod';
import { one, type Tx } from '@/lib/db';
import { treasuryAction, logAudit, UserError } from '@/lib/services/treasury';

const FALLBACK = '/receivables';
const uuid = z.string().uuid();
const POLICY_STATUS: Record<string, string> = { reminder: 'reminded', second_reminder: 'reminded', escalation: 'escalated', legal_review: 'legal' };

async function invoice(t: Tx, id: string, requireOpen = true) {
  const inv = await one<{ id: string; number: string; status: string; disputed: boolean; amount: string; amount_paid: string }>(t, 'SELECT id, number, status, disputed, amount::text, amount_paid::text FROM customer_invoices WHERE id = $1 FOR UPDATE', [id]);
  if (!inv) throw new UserError('Invoice not found.');
  if (requireOpen && !['open', 'partially_paid'].includes(inv.status)) throw new UserError(`Invoice ${inv.number} is ${inv.status}; collection actions apply to open invoices only.`);
  return inv;
}

export async function draftReminderAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const p = z.object({ invoiceId: uuid, policyId: uuid, message: z.string().trim().min(10, 'the reminder text is too short').max(4000) }).parse({ invoiceId: form.get('invoiceId'), policyId: form.get('policyId'), message: form.get('message') });
    const inv = await invoice(t, p.invoiceId);
    const pol = await one<{ action: string; days_overdue: number }>(t, 'SELECT action, days_overdue FROM collection_policies WHERE id = $1', [p.policyId]);
    if (!pol) throw new UserError('Collection policy not found.');
    const pending = await one(t, `SELECT id FROM collection_events WHERE invoice_id = $1 AND kind = 'reminder_drafted' AND status = 'pending_approval'`, [inv.id]);
    if (pending) throw new UserError('A reminder draft is already awaiting approval for this invoice.');
    const ev = await one<{ id: string }>(t, `INSERT INTO collection_events (tenant_id, invoice_id, kind, note, message_draft, status, created_by) VALUES ($1,$2,'reminder_drafted',$3,$4,'pending_approval',$5) RETURNING id`,
      [auth.tenantId, inv.id, `[policy:${pol.action}] ${pol.action.replace('_', ' ')} (≥ ${pol.days_overdue} days overdue)`, p.message, auth.userId]);
    await t.query(`UPDATE customer_invoices SET collection_status = 'reminder_due' WHERE id = $1 AND collection_status IN ('none','reminded')`, [inv.id]);
    await logAudit(t, auth, 'receivables.reminder_drafted', 'customer_invoice', inv.id, { event_id: ev!.id, policy: pol.action, external_send: false });
    return 'Reminder drafted. It must be approved by a different user with finance.approve before it can be recorded as sent. Nothing has been sent.';
  });
}

async function draft(t: Tx, id: string) {
  const ev = await one<{ id: string; invoice_id: string; kind: string; status: string; note: string | null; message_draft: string | null; created_by: string | null }>(t, 'SELECT id, invoice_id, kind, status, note, message_draft, created_by FROM collection_events WHERE id = $1 FOR UPDATE', [id]);
  if (!ev || ev.kind !== 'reminder_drafted') throw new UserError('Reminder draft not found.');
  return ev;
}

export async function approveReminderAction(form: FormData) {
  return treasuryAction('finance.approve', form, FALLBACK, async (t, auth) => {
    const ev = await draft(t, uuid.parse(form.get('eventId')));
    if (ev.status !== 'pending_approval') throw new UserError(`This draft is already ${ev.status}.`);
    await t.query(`UPDATE collection_events SET status = 'approved', approved_by = $2 WHERE id = $1`, [ev.id, auth.userId]);
    await t.query(`INSERT INTO collection_events (tenant_id, invoice_id, kind, note, status, created_by) VALUES ($1,$2,'reminder_approved',$3,'recorded',$4)`, [auth.tenantId, ev.invoice_id, `Approved draft ${ev.id}`, auth.userId]);
    await logAudit(t, auth, 'receivables.reminder_approved', 'customer_invoice', ev.invoice_id, { event_id: ev.id, drafted_by: ev.created_by });
    return 'Reminder approved. Send it yourself through your usual channel, then use "Mark as sent (manual)". The system does not send it.';
  });
}

export async function rejectReminderAction(form: FormData) {
  return treasuryAction('finance.approve', form, FALLBACK, async (t, auth) => {
    const ev = await draft(t, uuid.parse(form.get('eventId')));
    const note = z.string().trim().min(3, 'give a reason for rejecting').max(500).parse(form.get('note') ?? '');
    if (ev.status !== 'pending_approval') throw new UserError(`This draft is already ${ev.status}.`);
    await t.query(`UPDATE collection_events SET status = 'rejected', approved_by = $2, note = coalesce(note,'') || $3 WHERE id = $1`, [ev.id, auth.userId, ` · rejected: ${note}`]);
    await logAudit(t, auth, 'receivables.reminder_rejected', 'customer_invoice', ev.invoice_id, { event_id: ev.id, note });
    return 'Reminder draft rejected.';
  });
}

export async function markReminderSentAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const ev = await draft(t, uuid.parse(form.get('eventId')));
    const p = z.object({ channel: z.enum(['email', 'letter', 'phone', 'in_person', 'other']), note: z.string().trim().max(500) }).parse({ channel: form.get('channel'), note: form.get('note') ?? '' });
    if (ev.status !== 'approved') throw new UserError('Only an approved reminder can be recorded as sent.');
    const sent = await one(t, `SELECT id FROM collection_events WHERE invoice_id = $1 AND kind = 'reminder_sent' AND note LIKE $2`, [ev.invoice_id, `%draft ${ev.id}%`]);
    if (sent) throw new UserError('This reminder has already been recorded as sent.');
    await invoice(t, ev.invoice_id);
    await t.query(`INSERT INTO collection_events (tenant_id, invoice_id, kind, note, message_draft, status, created_by) VALUES ($1,$2,'reminder_sent',$3,$4,'recorded',$5)`,
      [auth.tenantId, ev.invoice_id, `Sent manually via ${p.channel} (recorded; not sent by the system) — draft ${ev.id}${p.note ? ` · ${p.note}` : ''}`, ev.message_draft, auth.userId]);
    const action = /\[policy:(\w+)\]/.exec(ev.note ?? '')?.[1] ?? 'reminder';
    await t.query(`UPDATE customer_invoices SET collection_status = $2 WHERE id = $1 AND collection_status <> 'promised'`, [ev.invoice_id, POLICY_STATUS[action] ?? 'reminded']);
    await logAudit(t, auth, 'receivables.reminder_marked_sent', 'customer_invoice', ev.invoice_id, { event_id: ev.id, channel: p.channel, external_send_by_system: false });
    return 'Recorded as sent (manual). No message was sent by the system.';
  });
}

export async function recordPromiseAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const p = z.object({ invoiceId: uuid, promise_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'promise date required'), note: z.string().trim().max(500) }).parse({ invoiceId: form.get('invoiceId'), promise_date: form.get('promise_date'), note: form.get('note') ?? '' });
    const inv = await invoice(t, p.invoiceId);
    await t.query(`UPDATE customer_invoices SET promise_date = $2, collection_status = 'promised' WHERE id = $1`, [inv.id, p.promise_date]);
    await t.query(`INSERT INTO collection_events (tenant_id, invoice_id, kind, note, status, created_by) VALUES ($1,$2,'promise',$3,'recorded',$4)`, [auth.tenantId, inv.id, `Payment promised for ${p.promise_date}${p.note ? ` · ${p.note}` : ''}`, auth.userId]);
    await logAudit(t, auth, 'receivables.promise_recorded', 'customer_invoice', inv.id, p);
    return `Payment promise recorded for ${p.promise_date}; the 13-week forecast now uses this date.`;
  });
}

export async function setDisputeAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const p = z.object({ invoiceId: uuid, disputed: z.enum(['1', '0']), reason: z.string().trim().min(5, 'a reason of at least 5 characters is required').max(500) }).parse({ invoiceId: form.get('invoiceId'), disputed: form.get('disputed'), reason: form.get('reason') ?? '' });
    const inv = await invoice(t, p.invoiceId);
    const on = p.disputed === '1';
    if (inv.disputed === on) throw new UserError(on ? 'Invoice is already disputed.' : 'Invoice is not disputed.');
    await t.query(`UPDATE customer_invoices SET disputed = $2, dispute_reason = $3 WHERE id = $1`, [inv.id, on, on ? p.reason : null]);
    await t.query(`INSERT INTO collection_events (tenant_id, invoice_id, kind, note, status, created_by) VALUES ($1,$2,'dispute',$3,'recorded',$4)`, [auth.tenantId, inv.id, `${on ? 'Marked disputed' : 'Dispute cleared'}: ${p.reason}`, auth.userId]);
    await logAudit(t, auth, on ? 'receivables.dispute_marked' : 'receivables.dispute_cleared', 'customer_invoice', inv.id, { reason: p.reason });
    return on ? 'Invoice marked as disputed.' : 'Dispute cleared.';
  });
}

export async function addNoteAction(form: FormData) {
  return treasuryAction('finance.manage', form, FALLBACK, async (t, auth) => {
    const p = z.object({ invoiceId: uuid, note: z.string().trim().min(3, 'note is too short').max(1000) }).parse({ invoiceId: form.get('invoiceId'), note: form.get('note') });
    const inv = await invoice(t, p.invoiceId, false);
    await t.query(`INSERT INTO collection_events (tenant_id, invoice_id, kind, note, status, created_by) VALUES ($1,$2,'note',$3,'recorded',$4)`, [auth.tenantId, inv.id, p.note, auth.userId]);
    await logAudit(t, auth, 'receivables.note_added', 'customer_invoice', inv.id, { note: p.note });
    return 'Note added.';
  });
}
