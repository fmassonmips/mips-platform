'use server';
/**
 * Budget engine mutations. Each action: permission check, zod validation,
 * tenant-bound transaction, audit event (inside the service functions), then
 * revalidate + redirect with a readable outcome. Database rule violations
 * (segregation of duties CHECK, approval lock trigger, unique names) are
 * surfaced via dbErrorMessage — never bypassed.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth, tctx, type AuthContext } from '@/lib/auth/session';
import { withTenant, one } from '@/lib/db';
import { audit } from '@/lib/audit';
import {
  createBudgetVersion, saveBudgetLines, submitBudgetVersion, approveBudgetVersion, returnBudgetToDraft, deleteDraftVersion, addVarianceComment, dbErrorMessage, type LineChange,
} from '@/lib/services/finance';

const uuid = z.string().uuid();
const actor = (a: AuthContext) => ({ tenantId: a.tenantId, userId: a.userId, isDemo: a.isDemo });
const msg = (e: unknown) => (e instanceof Error && !(e as any).code ? e.message : dbErrorMessage(e));
const to = (path: string, kind: 'ok' | 'error', text: string, hash = '') => `${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}${hash}`;
function done(paths: string[]) { revalidatePath('/budget'); for (const p of paths) revalidatePath(p); revalidatePath('/financial-performance'); revalidatePath('/pnl'); revalidatePath('/costs'); }

const CreateSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(120),
  kind: z.enum(['budget', 'forecast']),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  copyFrom: z.union([uuid, z.literal('')]).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export async function createVersionAction(form: FormData) {
  const auth = await requireAuth('finance.manage');
  const p = CreateSchema.safeParse({ name: form.get('name'), kind: form.get('kind'), fiscalYear: form.get('fiscalYear'), copyFrom: form.get('copyFrom') ?? '', notes: form.get('notes') ?? '' });
  if (!p.success) redirect(to('/budget', 'error', p.error.issues[0]?.message ?? 'Invalid input', '#create'));
  let target: string;
  try {
    const id = await withTenant(tctx(auth), (t) => createBudgetVersion(t, actor(auth), { name: p.data.name, kind: p.data.kind, fiscalYear: p.data.fiscalYear, copyFrom: p.data.copyFrom || null, notes: p.data.notes || null }));
    target = to(`/budget/${id}`, 'ok', p.data.copyFrom ? 'Draft created from the selected version' : 'Empty draft created — add lines in the editor');
  } catch (e) { target = to('/budget', 'error', msg(e), '#create'); }
  done([]);
  redirect(target);
}

export async function createRevisionAction(form: FormData) {
  const auth = await requireAuth('finance.manage');
  const id = uuid.safeParse(form.get('id'));
  const name = z.string().trim().min(3).max(120).safeParse(form.get('name'));
  if (!id.success) redirect(to('/budget', 'error', 'Invalid version'));
  if (!name.success) redirect(to(`/budget/${id.data}`, 'error', 'Revision name must be 3–120 characters'));
  let target: string;
  try {
    const nid = await withTenant(tctx(auth), (t) => createBudgetVersion(t, actor(auth), { name: name.data, kind: 'budget', fiscalYear: 0, copyFrom: id.data, asRevision: true, notes: (form.get('notes') as string | null)?.slice(0, 2000) || null }));
    target = to(`/budget/${nid}`, 'ok', 'Revision created as a draft (lines copied from the locked version)');
  } catch (e) { target = to(`/budget/${id.data}`, 'error', msg(e)); }
  done([`/budget/${id.data}`]);
  redirect(target);
}

const AMOUNT = /^-?\d{1,16}(\.\d{1,4})?$/;
export async function saveLinesAction(form: FormData) {
  const auth = await requireAuth('finance.manage');
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) redirect(to('/budget', 'error', 'Invalid version'));
  const back = `/budget/${id.data}?view=edit`;
  const changes: LineChange[] = [];
  const bad: string[] = [];
  for (const [k, raw] of form.entries()) {
    if (!k.startsWith('amt:')) continue;
    const [, accountId, period] = k.split(':');
    const orig = form.get(`orig:${accountId}:${period}`);
    const v = String(raw).replace(/[\s,]/g, '');
    if (!uuid.safeParse(accountId).success || !/^\d{4}-\d{2}-01$/.test(period ?? '')) { bad.push(k); continue; }
    if (v === (orig === null ? '' : String(orig))) continue; // unchanged
    if (v === '') { changes.push({ accountId, period, amount: null }); continue; }
    if (!AMOUNT.test(v)) { bad.push(`${period.slice(0, 7)}: “${String(raw).slice(0, 20)}”`); continue; }
    changes.push({ accountId, period, amount: v });
  }
  if (bad.length) redirect(to(back, 'error', `Invalid amount(s): ${bad.slice(0, 5).join(', ')} — use digits with up to 4 decimals`));
  if (!changes.length) redirect(to(back, 'ok', 'No changes to save'));
  let target: string;
  try {
    const r = await withTenant(tctx(auth), (t) => saveBudgetLines(t, actor(auth), id.data, changes));
    target = to(back, 'ok', `Saved: ${r.updated} updated, ${r.inserted} added, ${r.deleted} removed`);
  } catch (e) { target = to(back, 'error', msg(e)); }
  done([`/budget/${id.data}`]);
  redirect(target);
}

async function transition(form: FormData, perm: 'finance.manage' | 'finance.approve', fn: (t: any, a: ReturnType<typeof actor>, id: string) => Promise<unknown>, okText: string) {
  const auth = await requireAuth(perm);
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) redirect(to('/budget', 'error', 'Invalid version'));
  let target: string;
  try { await withTenant(tctx(auth), (t) => fn(t, actor(auth), id.data)); target = to(`/budget/${id.data}`, 'ok', okText); }
  catch (e) { target = to(`/budget/${id.data}`, 'error', msg(e)); }
  done([`/budget/${id.data}`]);
  return target;
}
export async function submitVersionAction(form: FormData) { redirect(await transition(form, 'finance.manage', submitBudgetVersion, 'Submitted for approval')); }
export async function approveVersionAction(form: FormData) {
  const auth = await requireAuth('finance.approve');
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) redirect(to('/budget', 'error', 'Invalid version'));
  let target: string;
  try {
    const r = await withTenant(tctx(auth), (t) => approveBudgetVersion(t, actor(auth), id.data));
    target = to(`/budget/${id.data}`, 'ok', `Approved — version locked${r.superseded.length ? `; ${r.superseded.length} previously approved version(s) of the same fiscal year and kind superseded` : ''}`);
  } catch (e) {
    const text = msg(e);
    // The rejected attempt is rolled back with its transaction; record it separately for the audit trail.
    await withTenant(tctx(auth), (t) => audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'budget.approval_rejected', entityType: 'budget_versions', entityId: id.data, payload: { reason: text, code: (e as any)?.code ?? null } })).catch(() => {});
    target = to(`/budget/${id.data}`, 'error', text);
  }
  done([`/budget/${id.data}`]);
  redirect(target);
}
export async function returnVersionAction(form: FormData) {
  const reason = z.string().trim().min(3, 'Give a reason (≥ 3 characters)').max(1000).safeParse(form.get('reason'));
  if (!reason.success) { const id = String(form.get('id') ?? ''); redirect(to(uuid.safeParse(id).success ? `/budget/${id}` : '/budget', 'error', reason.error.issues[0]?.message ?? 'Reason required')); }
  redirect(await transition(form, 'finance.approve', (t, a, id) => returnBudgetToDraft(t, a, id, reason.data), 'Returned to draft'));
}
export async function deleteDraftAction(form: FormData) {
  const auth = await requireAuth('finance.manage');
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) redirect(to('/budget', 'error', 'Invalid version'));
  let target: string;
  try { await withTenant(tctx(auth), (t) => deleteDraftVersion(t, actor(auth), id.data)); target = to('/budget', 'ok', 'Draft deleted (audited)'); }
  catch (e) { target = to(`/budget/${id.data}`, 'error', msg(e)); }
  done([]);
  redirect(target);
}

const CommentSchema = z.object({ id: uuid, period: z.string().regex(/^\d{4}-\d{2}-01$/), lineKey: z.string().trim().min(1).max(60), comment: z.string().trim().min(5, 'Comment must be at least 5 characters').max(2000) });
export async function addCommentAction(form: FormData) {
  const auth = await requireAuth('finance.manage');
  const p = CommentSchema.safeParse({ id: form.get('id'), period: form.get('period'), lineKey: form.get('lineKey'), comment: form.get('comment') });
  const id = String(form.get('id') ?? '');
  const back = uuid.safeParse(id).success ? `/budget/${id}?view=variances` : '/budget';
  if (!p.success) redirect(to(back, 'error', p.error.issues[0]?.message ?? 'Invalid input', '#comment'));
  let target: string;
  try {
    await withTenant(tctx(auth), async (t) => {
      const v = await one<{ id: string }>(t, 'SELECT id FROM budget_versions WHERE id = $1', [p.data.id]);
      if (!v) throw new Error('Version not found');
      await addVarianceComment(t, actor(auth), { versionId: p.data.id, period: p.data.period, lineKey: p.data.lineKey, comment: p.data.comment });
    });
    target = to(back, 'ok', 'Commentary recorded', '#comment');
  } catch (e) { target = to(back, 'error', msg(e), '#comment'); }
  done([`/budget/${id}`]);
  redirect(target);
}
