import { z } from 'zod';
import { handler } from '../../../_h';
import { q, one } from '@/lib/db';
import { audit } from '@/lib/audit';
import { addDays } from '@/lib/dates';
export const dynamic = 'force-dynamic';
export const GET = handler('merchant.view', async ({ t, params }) => q(t, `SELECT id, payment_method_id, card_region, mdr_bps::text, fixed_fee::text, monthly_saas_fee::text, effective_from, effective_to, contract_ref FROM pricing_agreements WHERE merchant_id = $1 ORDER BY effective_from DESC`, [params.id]));
const body = z.object({ payment_method: z.string().optional(), card_region: z.enum(['domestic', 'international', 'any']).default('any'), mdr_bps: z.string().regex(/^\d+(\.\d+)?$/), fixed_fee: z.string().regex(/^\d+(\.\d+)?$/).default('0'), monthly_saas_fee: z.string().regex(/^\d+(\.\d+)?$/).default('0'), effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), contract_ref: z.string().min(3) });
/** New effective-dated agreement; the previous open agreement for the same method/region is closed the day before. Historical transactions keep their original pricing. */
export const POST = handler('merchant.pricing', async ({ a, t, req, params }) => {
  const b = body.parse(await req.json());
  const pm = b.payment_method ? (await one<any>(t, 'SELECT id FROM payment_methods WHERE code = $1', [b.payment_method]))?.id : null;
  if (b.payment_method && !pm) throw Object.assign(new Error('Unknown payment method'), { status: 400 });
  const prev = await q<any>(t, `SELECT id, effective_from FROM pricing_agreements WHERE merchant_id = $1 AND payment_method_id IS NOT DISTINCT FROM $2 AND card_region = $3 AND effective_to IS NULL`, [params.id, pm, b.card_region]);
  if (prev.some((p) => p.effective_from >= b.effective_from)) throw Object.assign(new Error('An open agreement starts on or after this date'), { status: 409 });
  for (const p of prev) await t.query('UPDATE pricing_agreements SET effective_to = $2 WHERE id = $1', [p.id, addDays(b.effective_from, -1)]);
  const r = await one<any>(t, `INSERT INTO pricing_agreements (tenant_id, merchant_id, payment_method_id, card_region, mdr_bps, fixed_fee, monthly_saas_fee, effective_from, contract_ref, approved_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [a.tenantId, params.id, pm, b.card_region, b.mdr_bps, b.fixed_fee, b.monthly_saas_fee, b.effective_from, b.contract_ref, a.userId]);
  await audit(t, { tenantId: a.tenantId, userId: a.userId, action: 'pricing.agreement_created', entityType: 'pricing_agreements', entityId: r.id, payload: { merchant: params.id, ...b, closed: prev.map((p) => p.id) } });
  return { id: r.id, closed_previous: prev.map((p) => p.id) };
});
