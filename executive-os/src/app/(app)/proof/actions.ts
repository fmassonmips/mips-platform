'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth, tctx } from '@/lib/auth/session';
import { withTenant } from '@/lib/db';
import { recordVerification } from '@/lib/services/proof';

export interface VState { error?: string; ok?: string }
export async function verifyKpiAction(_: VState, form: FormData): Promise<VState> {
  const auth = await requireAuth('kpi.verify');
  const p = z.object({ code: z.string(), start: z.string(), end: z.string(), status: z.enum(['VERIFIED', 'DISPUTED', 'ESTIMATED', 'PENDING']), basis: z.string().min(10, 'Describe the evidence basis (≥ 10 characters)'), refs: z.string().optional() }).safeParse(Object.fromEntries(form.entries()));
  if (!p.success) return { error: p.error.issues.map((i) => i.message).join('; ') };
  try {
    await withTenant(tctx(auth), (t) => recordVerification(t, { tenantId: auth.tenantId, userId: auth.userId }, p.data.code, p.data.start, p.data.end, p.data.status, p.data.basis, (p.data.refs ?? '').split('\n').map((s) => s.trim()).filter(Boolean)));
  } catch (e) { return { error: (e as Error).message }; }
  revalidatePath(`/proof/kpi/${p.data.code}`);
  return { ok: `Recorded ${p.data.status}` };
}
