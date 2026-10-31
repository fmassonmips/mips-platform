import { handler, actor } from '../_h';
import { listBatches, uploadFile, validateBatch } from '@/lib/services/imports';
import { KINDS } from '@/lib/import/kinds';
export const dynamic = 'force-dynamic';
export const GET = handler('data.import', async ({ t }) => listBatches(t));
/** multipart/form-data: file, kind (optional) */
export const POST = handler('data.import', async ({ a, t, req }) => {
  const f = await req.formData(); const file = f.get('file'); const kind = f.get('kind') ? String(f.get('kind')) : undefined;
  if (!(file instanceof File)) throw Object.assign(new Error('file is required'), { status: 400 });
  if (kind && !(kind in KINDS)) throw Object.assign(new Error('unknown kind'), { status: 400 });
  const up = await uploadFile(t, actor(a), { name: file.name, bytes: Buffer.from(await file.arrayBuffer()), mime: file.type }, kind as any);
  return { batch_id: up.batchId, duplicate_file: up.duplicateFile, validation: up.duplicateFile ? null : await validateBatch(t, actor(a), up.batchId) };
});
