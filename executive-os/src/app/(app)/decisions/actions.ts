'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth, tctx } from '@/lib/auth/session';
import { withTenant } from '@/lib/db';
import { createScenario, rerunScenario, createDecision, approveDecision, rejectDecision, transitionDecision, measureOutcome } from '@/lib/services/decisions';
import { TEMPLATES, type TemplateKey } from '@/lib/engine/scenarios';

export interface FormState { error?: string }
const msg = (e: unknown) => { const m = (e as any)?.message ?? String(e); if (/chk|check constraint/i.test(m)) return 'Segregation of duties: the approver must be different from the proposer.'; if (e instanceof z.ZodError) return e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '); return m; };

export async function createScenarioAction(_: FormState, form: FormData): Promise<FormState> {
  const auth = await requireAuth('scenario.manage');
  const template = String(form.get('template')) as TemplateKey;
  if (!TEMPLATES[template]) return { error: 'Unknown template' };
  const assumptions: Record<string, unknown> = {};
  for (const key of Object.keys((TEMPLATES[template].schema as any).shape)) {
    const v = form.get(key);
    if (v !== null && v !== '') assumptions[key] = key === 'writeOffReceivables' ? v === 'on' : String(v);
  }
  const name = String(form.get('name') ?? '').trim();
  if (name.length < 3) return { error: 'Give the scenario a name (≥ 3 characters).' };
  let id: string;
  try {
    const r = await withTenant(tctx(auth), (t) => createScenario(t, { tenantId: auth.tenantId, userId: auth.userId }, { name, template, description: String(form.get('description') ?? '') || undefined, assumptions, comparisonGroup: String(form.get('comparisonGroup') ?? '') || undefined, baseStart: String(form.get('baseStart') ?? '') || undefined, baseEnd: String(form.get('baseEnd') ?? '') || undefined }));
    id = r.id;
  } catch (e) { return { error: msg(e) }; }
  revalidatePath('/decisions');
  redirect(`/decisions/scenarios/${id}`);
}

export async function rerunScenarioAction(form: FormData) {
  const auth = await requireAuth('scenario.manage');
  const id = String(form.get('id'));
  await withTenant(tctx(auth), (t) => rerunScenario(t, { tenantId: auth.tenantId, userId: auth.userId }, id));
  revalidatePath(`/decisions/scenarios/${id}`);
}

export async function shortlistAction(form: FormData) {
  const auth = await requireAuth('scenario.manage');
  const id = String(form.get('id')); const status = String(form.get('status'));
  if (!['shortlisted', 'draft', 'archived'].includes(status)) throw new Error('bad status');
  await withTenant(tctx(auth), async (t) => { await t.query('UPDATE scenarios SET status = $2, updated_at = now() WHERE id = $1', [id, status]); });
  revalidatePath('/decisions');
}

const decisionSchema = z.object({
  title: z.string().min(5).max(200), description: z.string().min(10).max(4000), rationale: z.string().min(10).max(4000),
  scenarioId: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  ownerUserId: z.string().uuid(), approverUserId: z.string().uuid(), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evidence: z.string().max(4000).optional(),
});
export async function createDecisionAction(_: FormState, form: FormData): Promise<FormState> {
  const auth = await requireAuth('decision.propose');
  let id: string;
  try {
    const d = decisionSchema.parse(Object.fromEntries(form.entries()));
    const evidence = (d.evidence ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [kind, ...rest] = l.split('|'); return { kind: ['source_file', 'import_batch', 'reconciliation', 'pricing_agreement', 'fee_schedule', 'calculation', 'note', 'external_document', 'report'].includes(kind.trim()) ? kind.trim() : 'note', ref: (rest[0] ?? kind).trim(), note: rest[1]?.trim() }; });
    if (d.scenarioId) evidence.unshift({ kind: 'calculation', ref: `scenario:${d.scenarioId}`, note: 'Scenario engine output (base / proposed / downside)' });
    const r = await withTenant(tctx(auth), (t) => createDecision(t, { tenantId: auth.tenantId, userId: auth.userId }, { title: d.title, description: d.description, rationale: d.rationale, scenarioId: d.scenarioId ?? null, ownerUserId: d.ownerUserId, approverUserId: d.approverUserId, deadline: d.deadline, evidence }));
    id = r.id;
  } catch (e) { return { error: msg(e) }; }
  revalidatePath('/decisions');
  redirect(`/decisions/${id}`);
}

export async function decisionWorkflowAction(_: FormState, form: FormData): Promise<FormState> {
  const op = String(form.get('op')); const id = String(form.get('id')); const note = String(form.get('note') ?? '');
  try {
    if (op === 'approve' || op === 'reject') {
      const auth = await requireAuth('decision.approve');
      await withTenant(tctx(auth), (t) => op === 'approve' ? approveDecision(t, { tenantId: auth.tenantId, userId: auth.userId }, id, note).then(() => undefined) : rejectDecision(t, { tenantId: auth.tenantId, userId: auth.userId }, id, note || 'Rejected'));
    } else if (op === 'measure') {
      const auth = await requireAuth('dashboard.view');
      await withTenant(tctx(auth), (t) => measureOutcome(t, { tenantId: auth.tenantId, userId: auth.userId }, id).then(() => undefined));
    } else {
      const auth = await requireAuth('decision.propose');
      await withTenant(tctx(auth), (t) => transitionDecision(t, { tenantId: auth.tenantId, userId: auth.userId }, id, op, note));
    }
  } catch (e) { return { error: msg(e) }; }
  revalidatePath(`/decisions/${id}`);
  return {};
}
