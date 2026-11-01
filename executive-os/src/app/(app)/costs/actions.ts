'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth, tctx } from '@/lib/auth/session';
import { withTenant, one } from '@/lib/db';
import { addVarianceComment, dbErrorMessage } from '@/lib/services/finance';
import { fiscalYearOf } from '@/lib/dates';

const Schema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}-01$/),
  category: z.string().regex(/^[a-z_]{2,40}$/),
  comment: z.string().trim().min(5, 'Comment must be at least 5 characters').max(2000),
  back: z.string().max(500).optional(),
});

/** Record variance commentary for a cost category against the approved budget of that month's fiscal year. */
export async function addCostCommentaryAction(form: FormData) {
  const auth = await requireAuth('finance.manage');
  const parsed = Schema.safeParse({ period: form.get('period'), category: form.get('category'), comment: form.get('comment'), back: form.get('back') ?? undefined });
  const back = typeof form.get('back') === 'string' && String(form.get('back')).startsWith('/costs') ? String(form.get('back')) : '/costs';
  const sep = back.includes('?') ? '&' : '?';
  if (!parsed.success) redirect(`${back}${sep}error=${encodeURIComponent(parsed.error.issues[0]?.message ?? 'Invalid input')}#commentary`);
  const i = parsed.data;
  let msg: string;
  try {
    await withTenant(tctx(auth), async (t) => {
      const v = await one<{ id: string }>(t, `SELECT id FROM budget_versions WHERE status = 'approved' AND kind = 'budget' AND fiscal_year = $1`, [fiscalYearOf(i.period, auth.fyStartMonth)]);
      if (!v) throw new Error(`No approved budget for FY${fiscalYearOf(i.period, auth.fyStartMonth)} — nothing to comment against.`);
      await addVarianceComment(t, { tenantId: auth.tenantId, userId: auth.userId, isDemo: auth.isDemo }, { versionId: v.id, period: i.period, lineKey: `cat:${i.category}`, comment: i.comment });
    });
    msg = `ok=${encodeURIComponent('Commentary recorded')}`;
  } catch (e) {
    msg = `error=${encodeURIComponent(e instanceof Error && !(e as any).code ? e.message : dbErrorMessage(e))}`;
  }
  revalidatePath('/costs'); revalidatePath('/budget');
  redirect(`${back}${sep}${msg}#commentary`);
}
