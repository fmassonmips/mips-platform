import Link from 'next/link';
import { pageContext, tx, type SP } from '@/lib/page';
import { listBatches } from '@/lib/services/imports';
import { KINDS } from '@/lib/import/kinds';
import { CONNECTORS, connectorStatus } from '@/lib/import/connectors';
import { PageHeader, Section } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { UploadForm } from './forms';

export const dynamic = 'force-dynamic';

export default async function Integrations({ searchParams }: { searchParams: SP }) {
  const { auth } = await pageContext(searchParams, 'data.import');
  const batches = await tx(auth, (t) => listBatches(t));
  const kinds = Object.values(KINDS).map((k) => ({ key: k.key, label: k.label }));
  return (
    <div>
      <PageHeader eyebrow="Data Integrations" title="Imports & connectors" subtitle="Upload → schema detection → column mapping → validation → duplicate detection → preview → approval (by a different user) → transactional commit → error report → control-total reconciliation → KPI recalculation. Original files and every source row are preserved immutably; historical records are never overwritten." />
      <Card><CardHeader title="New import" /><CardBody><UploadForm kinds={kinds} /></CardBody></Card>
      <Section title="Import templates">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{Object.values(KINDS).map((k) => (
          <Card key={k.key} className="p-3"><div className="text-sm font-semibold">{k.label}</div><p className="mt-1 text-xs text-muted">{k.description}</p>
            <p className="mt-1 text-2xs text-muted">Required: {k.fields.filter((f) => f.required).map((f) => f.key).join(', ')}</p>
            <a className="link mt-2 inline-block text-xs" href={`/api/v1/imports/templates/${k.key}`}>Download CSV template</a></Card>))}</div>
      </Section>
      <Section title="Import batches">
        <Card><DataTable filename="import-batches" rows={batches} columns={[{ key: 'filename', label: 'File', href: '/integrations/batches/{id}' }, { key: 'kind', label: 'Type' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'row_count', label: 'Rows', kind: 'number' }, { key: 'valid_count', label: 'Valid', kind: 'number' }, { key: 'error_count', label: 'Errors', kind: 'number' }, { key: 'duplicate_count', label: 'Duplicates', kind: 'number' }, { key: 'committed_count', label: 'Committed', kind: 'number' }, { key: 'uploaded_by', label: 'Uploaded by' }, { key: 'approved_by', label: 'Approved by' }, { key: 'created_at', label: 'Uploaded', kind: 'date' }]} /></Card>
      </Section>
      <Section title="Connectors">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{CONNECTORS.map((c) => { const st = connectorStatus(c); return (
          <Card key={c.key} className="p-4"><div className="flex items-center justify-between"><div className="font-semibold">{c.name}</div><Badge tone={st.configured ? 'pos' : 'neutral'}>{st.configured ? 'configured' : 'not configured'}</Badge></div>
            <p className="mt-1 text-xs text-muted">{c.description}</p>
            <p className="mt-2 text-2xs text-muted">Mode: {c.mode}. {st.configured ? 'Credentials present in environment.' : c.requires.length ? `Requires environment variables: ${c.requires.join(', ')}.` : ''} {c.note}</p>
            {c.importKinds.length > 0 && <p className="mt-1 text-2xs">File formats supported today via upload: {c.importKinds.map((k) => KINDS[k].label).join(', ')}.</p>}
          </Card>); })}</div>
      </Section>
    </div>
  );
}
