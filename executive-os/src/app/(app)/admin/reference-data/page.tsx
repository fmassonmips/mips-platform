import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { tx, spGet, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { REFERENCE_TABLES, referenceUsage, inactiveCodes, type RefField } from '@/lib/services/admin';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Flash, Disclosure } from '../../strategy/_ui';
import { SubmitButton } from '../../strategy/_client';
import { addReference, updateReference, setReferenceActive } from '../actions';

export const dynamic = 'force-dynamic';

function Input({ f, value }: { f: RefField; value?: unknown }) {
  if (f.kind === 'bool') return <label className="flex items-center gap-2 pt-5 text-xs"><input type="checkbox" name={f.key} defaultChecked={value === undefined ? true : Boolean(value)} /> {f.label}</label>;
  return (
    <label className="block"><span className="label">{f.label}</span>
      {f.kind === 'enum' ? <select name={f.key} className="input" defaultValue={String(value ?? f.options![0])}>{f.options!.map((o) => <option key={o} value={o}>{o}</option>)}</select>
        : <input name={f.key} className="input" required={f.required} maxLength={f.kind === 'country' ? 2 : 200} defaultValue={value === null || value === undefined ? '' : String(value)} />}
    </label>
  );
}

export default async function ReferenceDataPage({ searchParams }: { searchParams: SP }) {
  const auth = await requireAuth('admin.settings');
  const sp = await searchParams;
  const key = REFERENCE_TABLES[spGet(sp, 't') ?? ''] ? spGet(sp, 't')! : 'acquirers';
  const cfg = REFERENCE_TABLES[key];
  const rt = `/admin/reference-data?t=${key}`;
  const rows = await tx(auth, async (t) => {
    const list = await q<Record<string, any>>(t, `SELECT * FROM ${cfg.table} ORDER BY code`);
    const inactive = new Set(inactiveCodes(auth.settings, cfg.table));
    const out: Record<string, any>[] = [];
    for (const r of list) out.push({ ...r, active: cfg.hasActive ? r.is_active : !inactive.has(r.code), usage: await referenceUsage(t, cfg, r.id, r.code) });
    return out;
  });
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Reference data" subtitle={<>Master data used by transactions, pricing, GL and strategy. Codes are <b>immutable once referenced</b> (usage is detected from foreign keys and code references); names can always be edited. Records are deactivated rather than deleted.{!cfg.hasActive && <> For {cfg.label.toLowerCase()} the inactive flag is held in tenant settings (the table has no is_active column).</>}</>} />
      <Flash sp={sp} />
      <nav className="no-print mb-3 flex flex-wrap gap-1">
        {Object.entries(REFERENCE_TABLES).map(([k, c]) => <Link key={k} href={`/admin/reference-data?t=${k}`} className={k === key ? 'btn-primary py-1 text-xs' : 'btn py-1 text-xs'}>{c.label}</Link>)}
      </nav>
      <Card className="mb-4">
        <CardHeader title={`Add ${cfg.label.toLowerCase().replace(/s$/, '')}`} />
        <CardBody>
          <form action={addReference} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="table" value={key} /><input type="hidden" name="returnTo" value={rt} />
            <label className="block"><span className="label">Code</span><input name="code" className="input font-mono" required pattern="[A-Za-z0-9_.\-]{1,40}" /></label>
            {cfg.fields.map((f) => <Input key={f.key} f={f} />)}
            <div className="flex items-end"><SubmitButton>Add</SubmitButton></div>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={`${cfg.label} (${rows.length})`} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Code</th>{cfg.fields.map((f) => <th key={f.key} className="th">{f.label}</th>)}<th className="th">Referenced by</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`align-top ${r.active ? '' : 'opacity-60'}`}>
                  <td className="td font-mono text-xs">{r.code}{r.usage.length > 0 && <div><Badge tone="navy" title="Code is immutable">locked code</Badge></div>}</td>
                  {cfg.fields.map((f) => <td key={f.key} className="td text-sm">{f.kind === 'bool' ? (r[f.key] ? 'yes' : 'no') : r[f.key] ?? '—'}</td>)}
                  <td className="td text-2xs text-muted">{r.usage.length ? r.usage.join(', ') : 'not referenced'}</td>
                  <td className="td"><StatusBadge status={r.active ? 'active' : 'cancelled'} /></td>
                  <td className="td">
                    <div className="flex flex-wrap items-start gap-2">
                      <Disclosure summary="Edit">
                        <form action={updateReference} className="grid gap-2 sm:grid-cols-2">
                          <input type="hidden" name="table" value={key} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="returnTo" value={rt} />
                          <label className="block"><span className="label">Code{r.usage.length ? ' (immutable)' : ''}</span><input name="code" className="input font-mono" defaultValue={r.code} readOnly={r.usage.length > 0} pattern="[A-Za-z0-9_.\-]{1,40}" /></label>
                          {cfg.fields.map((f) => <Input key={f.key} f={f} value={r[f.key]} />)}
                          <div><SubmitButton>Save</SubmitButton></div>
                        </form>
                      </Disclosure>
                      <form action={setReferenceActive}>
                        <input type="hidden" name="table" value={key} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="active" value={r.active ? 'false' : 'true'} /><input type="hidden" name="returnTo" value={rt} />
                        <SubmitButton className={r.active ? 'btn-danger py-0.5 text-2xs' : 'btn py-0.5 text-2xs'} pendingLabel="…">{r.active ? 'Deactivate' : 'Reactivate'}</SubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
