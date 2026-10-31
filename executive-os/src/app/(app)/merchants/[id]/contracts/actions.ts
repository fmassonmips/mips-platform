'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAuth, tctx } from '@/lib/auth/session';
import { withTenant } from '@/lib/db';
import { audit } from '@/lib/audit';
import { createPricingAgreement, AgreementError } from '@/lib/services/merchants';
import { todayISO } from '@/lib/period';

export interface AgreementState { ok: boolean; message: string | null; errors?: Record<string, string> }

const decimal = (label: string, max: string) => z.string().trim().regex(/^\d+(\.\d{1,4})?$/, `${label}: enter a non-negative number (max 4 decimals)`).refine((v) => Number.parseFloat(v) <= Number.parseFloat(max), `${label} must be ≤ ${max}`);
const schema = z.object({
  merchantId: z.string().uuid(),
  paymentMethodId: z.union([z.literal(''), z.string().uuid()]).transform((v) => (v === '' ? null : v)),
  cardRegion: z.enum(['domestic', 'international', 'any']),
  mdrBps: decimal('MDR (bps)', '2000'),
  fixedFee: decimal('Fixed fee', '100000').default('0'),
  monthlySaasFee: decimal('Monthly SaaS fee', '10000000').default('0'),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective from: use YYYY-MM-DD').refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date'),
  contractRef: z.string().trim().min(3, 'Contract reference: at least 3 characters').max(80),
  constraintAck: z.string().optional().transform((v) => v === 'on'),
  note: z.string().trim().max(500).optional(),
});

/** Create an effective-dated pricing agreement (permission merchant.pricing). Audited. */
export async function createAgreementAction(_prev: AgreementState, fd: FormData): Promise<AgreementState> {
  const auth = await requireAuth('merchant.pricing');
  const raw = Object.fromEntries(['merchantId', 'paymentMethodId', 'cardRegion', 'mdrBps', 'fixedFee', 'monthlySaasFee', 'effectiveFrom', 'contractRef', 'constraintAck', 'note'].map((k) => [k, fd.get(k) === null ? undefined : String(fd.get(k))]));
  for (const k of ['fixedFee', 'monthlySaasFee']) if (raw[k] === '') raw[k] = undefined;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] = i.message;
    return { ok: false, message: 'Please correct the highlighted fields.', errors };
  }
  const v = parsed.data;
  try {
    const res = await withTenant(tctx(auth), async (t) => {
      const r = await createPricingAgreement(t, { tenantId: auth.tenantId, userId: auth.userId, today: todayISO() }, { ...v, note: v.note ?? null });
      for (const c of r.closed) {
        await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'pricing_agreement.close', entityType: 'pricing_agreement', entityId: c.id, payload: { merchantId: v.merchantId, contractRef: c.contract_ref, effectiveToBefore: c.old_effective_to, effectiveToAfter: c.new_effective_to, supersededBy: r.id } });
      }
      await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'pricing_agreement.create', entityType: 'pricing_agreement', entityId: r.id, payload: { merchantId: v.merchantId, paymentMethodId: v.paymentMethodId, cardRegion: v.cardRegion, mdrBps: v.mdrBps, fixedFee: v.fixedFee, monthlySaasFee: v.monthlySaasFee, effectiveFrom: v.effectiveFrom, contractRef: v.contractRef, constraintAcknowledged: v.constraintAck, note: v.note ?? null, closed: r.closed.map((c) => c.id) } });
      return r;
    });
    revalidatePath(`/merchants/${v.merchantId}`);
    revalidatePath(`/merchants/${v.merchantId}/contracts`);
    return { ok: true, message: `Agreement ${v.contractRef} created, effective ${v.effectiveFrom}.${res.closed.length ? ` Closed ${res.closed.length} previous agreement(s) at ${res.closed[0].new_effective_to}.` : ''} Historical transactions keep their original pricing.` };
  } catch (e: any) {
    if (e instanceof AgreementError) return { ok: false, message: e.message };
    if (e?.code === '23514' || e?.code === '23503') return { ok: false, message: `Rejected by database constraint: ${e.message}` };
    throw e;
  }
}
