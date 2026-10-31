import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { getBatch, batchRows, previewBatch } from '@/lib/services/imports';
import { KINDS, type ImportKind } from '@/lib/import/kinds';
import { PageHeader, Section, Callout } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { fmtDate, fmtNumber } from '@/lib/format';
import { BatchOp, MappingForm } from '../../forms';

export const dynamic = 'force-dynamic';
const STEPS = ['uploaded', 'validated', 'approved', 'committed'];

export default async function BatchDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { auth, sp } = await pageContext(searchParams, 'data.import');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const filter = spGet(sp, 'rows');
  const data = await tx(auth, async (t) => {
    try { const b = await getBatch(t, id); return { b, rows: await batchRows(t, id, filter && ['valid', 'error', 'duplicate', 'committed'].includes(filter) ? filter : undefined, 500), preview: await previewBatch(t, id, 15) }; } catch { return null; }
  });
  if (!data) notFound();
  const { b, rows, preview } = data;
  const def = KINDS[b.kind as ImportKind]; const v = b.validation ?? {};
  const cols: string[] = b.detected_columns?.columns ?? [];
  const canApprove = auth.permissions.has('data.approve_import');
  const stepIdx = STEPS.indexOf(b.status);
  return (
    <div>
      <PageHeader eyebrow={`Import batch · ${def.label}`} title={b.filename} subtitle={<>SHA-256 <code className="text-2xs">{b.file_sha256}</code> · {fmtNumber(b.file_size)} bytes · uploaded by {b.uploaded_by_name} {fmtDate(b.created_at)}{b.approved_by_name ? ` · approved by ${b.approved_by_name}` : ''}</>}
        actions={<><a className="btn" href={`/api/v1/imports/${id}/file`}>Download original</a><a className="btn" href={`/api/v1/imports/${id}/errors`}>Error report (CSV)</a><Link className="btn" href="/integrations">Back</Link></>} />
      {spGet(sp, 'dup') && <Callout tone="warn" title="This exact file was already uploaded">Idempotent import: the existing batch is shown and no rows were created again.</Callout>}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">{STEPS.map((s, i) => <span key={s} className={`rounded-full px-3 py-1 ${b.status === 'rejected' ? 'bg-surface-2 text-muted' : i <= stepIdx ? 'bg-navy-2 text-white' : 'bg-surface-2 text-muted'}`}>{i + 1}. {s}</span>)}<StatusBadge status={b.status} /></div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader title="Schema detection & column mapping" subtitle={`Detected columns: ${cols.join(', ')}${b.detected_columns?.sheet ? ` (sheet ${b.detected_columns.sheet})` : ''}. Best match: ${b.detected_columns?.detection?.map((d: any) => `${d.kind} (${d.score})`).join(', ')}`} />
          <CardBody><MappingForm id={id} kind={b.kind} kinds={Object.values(KINDS).map((k) => ({ key: k.key, label: k.label }))} fields={def.fields} columns={cols} mapping={b.column_mapping} disabled={!['uploaded', 'validated'].includes(b.status)} /></CardBody></Card>
        <Card><CardHeader title="Validation & reconciliation" /><CardBody className="space-y-2 text-sm">
          {v.rows !== undefined ? <>
            <div className="grid grid-cols-2 gap-2">{[['Rows', v.rows], ['Valid', v.valid], ['Errors', v.errors], ['Duplicates', v.duplicates]].map(([l, n]) => <div key={l as string} className="rounded border border-border p-2"><div className="text-2xs text-muted">{l}</div><div className="num text-lg font-semibold">{fmtNumber(n as number)}</div></div>)}</div>
            {v.control_totals && <div className="text-xs">Control totals ({v.control_totals.field}): valid {v.control_totals.valid} · duplicates {v.control_totals.duplicate} · error rows {v.control_totals.error_rows_parsed}</div>}
            {v.warnings?.map((w: string) => <div key={w} className="text-xs text-warn">⚠ {w}</div>)}
            {v.closures?.length > 0 && <div className="text-xs">Explicit schedule closures on commit: {v.closures.map((c: any) => `${c.schedule_ref} → ends ${c.new_effective_to}`).join('; ')}</div>}
            {v.commit_reconciliation && <Callout tone={v.commit_reconciliation.rows_reconcile ? 'pos' : 'neg'} title="Commit reconciliation">{v.commit_reconciliation.committed_rows} committed = {v.commit_reconciliation.validated_valid_rows} validated · {v.commit_reconciliation.duplicates_skipped} duplicates skipped · {v.commit_reconciliation.errors_not_imported} errors not imported{v.commit_reconciliation.committed_amount_total ? ` · amount total ${v.commit_reconciliation.committed_amount_total}` : ''}</Callout>}
            {v.rejection_reason && <Callout tone="neg" title="Rejected">{v.rejection_reason}</Callout>}
          </> : <p className="text-muted">Not validated yet.</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            {['uploaded', 'validated'].includes(b.status) && <BatchOp id={id} op="validate" label="Re-validate" />}
            {b.status === 'validated' && canApprove && <BatchOp id={id} op="approve" label="Approve import" tone="btn-gold" />}
            {b.status === 'approved' && canApprove && <BatchOp id={id} op="commit" label="Commit (transactional)" tone="btn-primary" confirmText="Commit the valid rows in one transaction? Duplicates and error rows will not be imported." />}
            {!['committed', 'rejected'].includes(b.status) && canApprove && <BatchOp id={id} op="reject" label="Reject" tone="btn-danger" extra={<input name="reason" className="input w-40 py-1 text-xs" placeholder="Reason" />} />}
          </div>
          {b.status === 'validated' && !canApprove && <p className="text-xs text-muted">Approval requires data.approve_import and must be done by a different user than the uploader.</p>}
        </CardBody></Card>
      </div>
      <Section title="Preview (mapped values, first 15 rows)">
        <Card><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="th">Row</th>{def.fields.map((f) => <th key={f.key} className="th">{f.key}</th>)}<th className="th">Errors</th></tr></thead>
          <tbody>{preview.map((p) => <tr key={p.row}><td className="td">{p.row}</td>{def.fields.map((f) => <td key={f.key} className="td">{p.values[f.key] ?? <span className="text-muted">—</span>}</td>)}<td className="td text-neg">{p.errors.join('; ')}</td></tr>)}</tbody></table></div></Card>
      </Section>
      <Section title="Source rows (preserved original data)" actions={<div className="flex gap-2 text-xs">{['all', 'valid', 'error', 'duplicate', 'committed'].map((f) => <Link key={f} className={`link ${filter === f || (!filter && f === 'all') ? 'font-semibold' : ''}`} href={`/integrations/batches/${id}${f === 'all' ? '' : `?rows=${f}`}`}>{f}</Link>)}</div>}>
        <Card><DataTable filename={`batch-${id.slice(0, 8)}-rows`} rows={rows.map((r) => ({ row: r.row_number, status: r.status, errors: (r.errors ?? []).join('; '), target: r.target_id ?? '', hash: r.row_hash.slice(0, 12), raw: JSON.stringify(r.raw) }))} columns={[{ key: 'row', label: 'Row', kind: 'number' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'errors', label: 'Messages' }, { key: 'target', label: 'Created record' }, { key: 'hash', label: 'Row hash' }, { key: 'raw', label: 'Original row' }]} /></Card>
      </Section>
    </div>
  );
}
