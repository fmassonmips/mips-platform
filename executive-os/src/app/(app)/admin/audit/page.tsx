import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { tx, spGet, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { auditPage } from '@/lib/services/admin';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { VerifyChain } from '../_client';

export const dynamic = 'force-dynamic';
const PAGE = 50;
const isDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

export default async function AuditPage({ searchParams }: { searchParams: SP }) {
  const auth = await requireAuth('admin.audit');
  const sp = await searchParams;
  const f = {
    entity: spGet(sp, 'entity') || undefined, action: (spGet(sp, 'action') || '').slice(0, 100) || undefined,
    user: spGet(sp, 'user') === 'system' ? 'system' : /^[0-9a-f-]{36}$/i.test(spGet(sp, 'user') ?? '') ? spGet(sp, 'user') : undefined,
    from: isDate(spGet(sp, 'from')), to: isDate(spGet(sp, 'to')), page: Math.max(1, Number(spGet(sp, 'page')) || 1), pageSize: PAGE,
  };
  const d = await tx(auth, async (t) => ({
    res: await auditPage(t, f),
    entities: (await q<{ e: string }>(t, 'SELECT DISTINCT entity_type AS e FROM audit_events ORDER BY 1')).map((r) => r.e),
    actors: await q<{ id: string; name: string }>(t, 'SELECT DISTINCT u.id, u.name FROM audit_events a JOIN users u ON u.id = a.actor_user_id ORDER BY u.name'),
  }));
  const pages = Math.max(1, Math.ceil(d.res.total / PAGE));
  const qs = (page: number) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...f, page: String(page) })) if (v && k !== 'pageSize') p.set(k, String(v)); return `/admin/audit?${p.toString()}`; };
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Audit log" subtitle={<>Append-only, hash-chained events for {auth.tenantName}: each event stores SHA-256(previous hash | tenant | actor | action | entity | payload | timestamp). Updates are impossible and deletes are refused by database triggers (demo reset excepted). Verification recomputes every hash and back-link.</>} />
      <Card className="mb-4"><CardHeader title="Chain integrity" /><CardBody><VerifyChain /></CardBody></Card>
      <Card>
        <CardHeader title={`Events (${d.res.total})`} subtitle={`Page ${f.page} of ${pages}`} />
        <form method="get" className="no-print grid gap-2 border-b border-border px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className="block"><span className="label">Entity</span><select name="entity" className="input py-1 text-xs" defaultValue={f.entity ?? ''}><option value="">All</option>{d.entities.map((e) => <option key={e} value={e}>{e}</option>)}</select></label>
          <label className="block"><span className="label">Action contains</span><input name="action" className="input py-1 text-xs" defaultValue={f.action ?? ''} placeholder="e.g. period_" /></label>
          <label className="block"><span className="label">User</span><select name="user" className="input py-1 text-xs" defaultValue={f.user ?? ''}><option value="">All</option><option value="system">System / generator</option>{d.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="block"><span className="label">From</span><input type="date" name="from" className="input py-1 text-xs" defaultValue={f.from ?? ''} /></label>
          <label className="block"><span className="label">To</span><input type="date" name="to" className="input py-1 text-xs" defaultValue={f.to ?? ''} /></label>
          <div className="flex items-end gap-2"><button className="btn-primary py-1 text-xs">Filter</button><Link className="btn py-1 text-xs" href="/admin/audit">Reset</Link></div>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className="th">#</th><th className="th">When (UTC)</th><th className="th">Actor</th><th className="th">Action</th><th className="th">Entity</th><th className="th">Payload</th><th className="th">Hash</th></tr></thead>
            <tbody>
              {d.res.rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-surface-2">
                  <td className="td num text-xs">{r.id}</td>
                  <td className="td whitespace-nowrap text-xs">{r.created_at.slice(0, 19).replace('T', ' ')}</td>
                  <td className="td text-xs">{r.actor ?? 'system'}</td>
                  <td className="td font-mono text-xs">{r.action}</td>
                  <td className="td text-xs">{r.entity_type}<div className="max-w-[16rem] truncate font-mono text-2xs text-muted" title={r.entity_id ?? ''}>{r.entity_id ?? ''}</div></td>
                  <td className="td text-xs"><details><summary className="cursor-pointer text-info">{JSON.stringify(r.payload).slice(0, 70)}{JSON.stringify(r.payload).length > 70 ? '…' : ''}</summary><pre className="mt-1 max-w-xl overflow-x-auto whitespace-pre-wrap rounded bg-surface-2 p-2 text-2xs">{JSON.stringify(r.payload, null, 2)}</pre></details></td>
                  <td className="td font-mono text-2xs" title={`hash ${r.hash}\nprev ${r.prev_hash ?? 'GENESIS'}`}>{r.hash.slice(0, 12)}…<div className="text-muted">← {r.prev_hash ? r.prev_hash.slice(0, 12) + '…' : 'GENESIS'}</div></td>
                </tr>
              ))}
              {d.res.rows.length === 0 && <tr><td colSpan={7} className="td text-center text-muted">No events match the filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="no-print flex items-center justify-end gap-2 px-4 py-2 text-xs text-muted">
          {f.page > 1 ? <Link className="btn py-1 text-xs" href={qs(f.page - 1)}>← Newer</Link> : <span className="btn py-1 text-xs opacity-50">← Newer</span>}
          <span>Page {f.page} / {pages}</span>
          {f.page < pages ? <Link className="btn py-1 text-xs" href={qs(f.page + 1)}>Older →</Link> : <span className="btn py-1 text-xs opacity-50">Older →</span>}
        </div>
      </Card>
    </div>
  );
}
