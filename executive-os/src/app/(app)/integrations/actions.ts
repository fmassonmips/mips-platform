'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAuth, tctx } from '@/lib/auth/session';
import { withTenant } from '@/lib/db';
import { uploadFile, setMapping, validateBatch, approveBatch, rejectBatch, commitBatch } from '@/lib/services/imports';
import { KINDS, type ImportKind } from '@/lib/import/kinds';

export interface IState { error?: string; ok?: string }

export async function uploadAction(_: IState, form: FormData): Promise<IState> {
  const auth = await requireAuth('data.import');
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a CSV or XLSX file.' };
  const kindRaw = String(form.get('kind') ?? 'auto');
  const kind = kindRaw === 'auto' ? undefined : (kindRaw as ImportKind);
  if (kind && !KINDS[kind]) return { error: 'Unknown import type' };
  let id: string;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const r = await withTenant(tctx(auth), async (t) => {
      const up = await uploadFile(t, { tenantId: auth.tenantId, userId: auth.userId }, { name: file.name, bytes, mime: file.type }, kind);
      if (!up.duplicateFile) await validateBatch(t, { tenantId: auth.tenantId, userId: auth.userId }, up.batchId);
      return up;
    });
    id = r.batchId;
    if (r.duplicateFile) { redirect(`/integrations/batches/${id}?dup=1`); }
  } catch (e) { if ((e as any)?.digest?.startsWith?.('NEXT_REDIRECT')) throw e; return { error: (e as Error).message }; }
  redirect(`/integrations/batches/${id}`);
}

export async function batchAction(_: IState, form: FormData): Promise<IState> {
  const op = String(form.get('op')); const id = String(form.get('id'));
  try {
    if (op === 'map') {
      const auth = await requireAuth('data.import');
      const kind = String(form.get('kind')) as ImportKind;
      const mapping: Record<string, string> = {};
      for (const f of KINDS[kind].fields) mapping[f.key] = String(form.get(`map_${f.key}`) ?? '');
      await withTenant(tctx(auth), async (t) => { await setMapping(t, { tenantId: auth.tenantId, userId: auth.userId }, id, kind, mapping); await validateBatch(t, { tenantId: auth.tenantId, userId: auth.userId }, id); });
    } else if (op === 'validate') {
      const auth = await requireAuth('data.import');
      await withTenant(tctx(auth), (t) => validateBatch(t, { tenantId: auth.tenantId, userId: auth.userId }, id));
    } else if (op === 'approve') {
      const auth = await requireAuth('data.approve_import');
      await withTenant(tctx(auth), (t) => approveBatch(t, { tenantId: auth.tenantId, userId: auth.userId }, id));
    } else if (op === 'reject') {
      const auth = await requireAuth('data.approve_import');
      await withTenant(tctx(auth), (t) => rejectBatch(t, { tenantId: auth.tenantId, userId: auth.userId }, id, String(form.get('reason') ?? 'Rejected')));
    } else if (op === 'commit') {
      const auth = await requireAuth('data.approve_import');
      const r = await withTenant(tctx(auth), (t) => commitBatch(t, { tenantId: auth.tenantId, userId: auth.userId }, id));
      revalidatePath(`/integrations/batches/${id}`);
      return { ok: `Committed ${r.committed_rows} rows; ${r.duplicates_skipped} duplicates skipped; ${r.errors_not_imported} errors not imported. KPIs recalculated for ${r.recalculated.join(', ') || 'n/a'}.` };
    } else return { error: 'Unknown operation' };
  } catch (e) { return { error: (e as Error).message }; }
  revalidatePath(`/integrations/batches/${id}`);
  return { ok: 'Done' };
}
