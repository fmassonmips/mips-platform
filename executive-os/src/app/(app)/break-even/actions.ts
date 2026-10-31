'use server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAuth, tctx } from '@/lib/auth/session';
import { withTenant, one } from '@/lib/db';
import { audit } from '@/lib/audit';
import { parsePeriod } from '@/lib/period';
import { monthStart } from '@/lib/dates';
import { computeBreakEven, parseBeParams, serialiseResult, PARAM_KEYS, type ParamKey } from './compute';
import { ENGINE } from './engine-version';

export interface SnapshotState { ok: boolean; message: string | null }

const schema = z.object({ range: z.string().max(40), label: z.string().trim().min(3, 'Give the snapshot a name (≥ 3 characters)').max(120) });

/**
 * Records the current break-even computation (inputs + outputs, SHA-256) as an
 * immutable evidence record and audit event. Recomputed server-side from the
 * database for the requested period and parameters.
 */
export async function saveBreakEvenSnapshot(_prev: SnapshotState, fd: FormData): Promise<SnapshotState> {
  const auth = await requireAuth('scenario.manage');
  const parsed = schema.safeParse({ range: String(fd.get('range') ?? ''), label: String(fd.get('label') ?? '') });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const period = parsePeriod(parsed.data.range, auth.fyStartMonth);
  const raw = (k: ParamKey) => { const v = fd.get(k); return v === null || v === '' ? undefined : String(v); };
  const { p, errors } = parseBeParams(raw);
  if (errors.length) return { ok: false, message: errors.join(' · ') };
  const ref = await withTenant(tctx(auth), async (t) => {
    const c = await computeBreakEven(t, monthStart(period.end), p);
    const payload = {
      engine: ENGINE, period: period.key, baseMonths: c.base.months.map((m) => m.month), label: parsed.data.label,
      inputs: { ...c.input }, simulation: { ...c.sim }, includeOtherRevenue: p.includeOtherRevenue,
      base: serialiseResult(c.baseRes), simulated: serialiseResult(c.simRes),
      params: Object.fromEntries(PARAM_KEYS.map((k) => [k, raw(k) ?? null])),
    };
    const json = JSON.stringify(payload);
    const sha = createHash('sha256').update(json).digest('hex');
    const reference = `BE-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
    const summary = `${parsed.data.label} — ${period.label}: accounting break-even GPV ${c.simRes.breakEvenGpv?.toFixed(0) ?? 'n/a'} vs ${c.simRes.gpv.toFixed(0)} (base ${c.baseRes.breakEvenGpv?.toFixed(0) ?? 'n/a'}); cash break-even GPV ${c.simRes.cashBreakEvenGpv?.toFixed(0) ?? 'n/a'}; operating profit ${c.simRes.operatingProfit.toFixed(0)}/month.`;
    const ev = await one<{ id: string }>(t, `INSERT INTO evidence_records (tenant_id, subject_type, subject_id, kind, reference, description, sha256, created_by)
      VALUES ($1,'break_even',$2,'calculation',$3,$4,$5,$6) RETURNING id`, [auth.tenantId, period.key, reference, summary, sha, auth.userId]);
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'break_even.snapshot', entityType: 'evidence_record', entityId: ev!.id, payload: { ...payload, sha256: sha, reference } });
    return reference;
  });
  revalidatePath('/break-even');
  return { ok: true, message: `Snapshot ${ref} recorded as evidence (inputs, outputs and SHA-256 in the audit trail).` };
}
