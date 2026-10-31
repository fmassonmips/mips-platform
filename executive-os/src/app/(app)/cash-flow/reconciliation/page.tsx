import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { q } from '@/lib/db';
import { PageHeader, Section } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { todayISO } from '@/lib/period';
import { monthLabel } from '@/lib/format';
import { Flash, Provenance } from '../_components/flash';

export const dynamic = 'force-dynamic';

export default async function ReconciliationIndex({ searchParams }: { searchParams: SP }) {
  const { auth, sp } = await pageContext(searchParams, 'finance.view');
  const acc = spGet(sp, 'account'); const mo = spGet(sp, 'month');
  if (acc && mo && /^\d{4}-\d{2}$/.test(mo)) redirect(`/cash-flow/reconciliation/${encodeURIComponent(acc)}/${mo}`);
  const data = await tx(auth, async (t) => {
    const accounts = await q<{ code: string; name: string; account_class: string; currency: string; lines: string; ledger: string }>(t, `SELECT ba.code, ba.name, ba.account_class, ba.currency,
      (SELECT count(*) FROM bank_transactions bt WHERE bt.bank_account_id = ba.id)::text AS lines, (SELECT count(*) FROM cash_ledger_items li WHERE li.bank_account_id = ba.id)::text AS ledger
      FROM bank_accounts ba ORDER BY ba.account_class = 'operating' DESC, ba.code`);
    const recons = await q<any>(t, `SELECT ba.code AS account, to_char(r.period,'YYYY-MM') AS month, r.status, r.statement_balance::text, r.ledger_balance::text, r.unresolved_difference::text,
        pu.name AS prepared_by, au.name AS approved_by, r.approved_at::text,
        (SELECT count(*) FROM recon_exceptions e WHERE e.reconciliation_id = r.id AND e.status <> 'resolved')::text AS open_exceptions,
        (SELECT count(*) FROM recon_matches m WHERE m.reconciliation_id = r.id AND m.status = 'proposed')::text AS proposed
      FROM reconciliations r JOIN bank_accounts ba ON ba.id = r.bank_account_id LEFT JOIN users pu ON pu.id = r.prepared_by LEFT JOIN users au ON au.id = r.approved_by
      ORDER BY r.period DESC, ba.code`);
    const months = await q<{ m: string }>(t, `SELECT DISTINCT to_char(txn_date,'YYYY-MM') AS m FROM bank_transactions ORDER BY 1 DESC LIMIT 24`);
    return { accounts, recons, months };
  });
  const defMonth = todayISO().slice(0, 7);
  return (
    <div>
      <PageHeader eyebrow="Treasury · Cash flow" title="Bank reconciliation" subtitle={<>One reconciliation per bank account × month: statement lines (bank_transactions) vs expected cash items (cash_ledger_items). Auto-match proposals require confirmation; differences are never written off automatically. Preparation needs <b>treasury.reconcile</b>; approval needs <b>finance.approve</b> by a different user. <Link className="link" href="/cash-flow">← Cash flow</Link></>} />
      <Flash sp={sp} />
      <Card>
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div><label className="label" htmlFor="account">Bank account</label><select id="account" name="account" className="input w-auto" defaultValue="MCB-OPS">{data.accounts.map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}{a.ledger === '0' ? ' (no ledger items)' : ''}</option>)}</select></div>
            <div><label className="label" htmlFor="month">Month</label><select id="month" name="month" className="input w-auto" defaultValue={data.months.some((m) => m.m === defMonth) ? defMonth : data.months[0]?.m}>{data.months.map((m) => <option key={m.m} value={m.m}>{m.m}</option>)}</select></div>
            <button className="btn-primary">Open workspace</button>
          </form>
          <p className="mt-2 text-2xs text-muted">Ledger-side items currently exist for: {data.accounts.filter((a) => a.ledger !== '0').map((a) => `${a.code} (${a.ledger})`).join(', ') || 'none'}. Accounts without ledger items can still be reconciled, but every statement line will appear as an unmatched exception.</p>
        </CardBody>
      </Card>
      <Section title="Reconciliations">
        <Card>
          {data.recons.length === 0 ? <CardBody><span className="text-sm text-muted">No reconciliation has been started yet.</span></CardBody> :
            <DataTable filename="reconciliations" rows={data.recons.map((r) => ({ ...r, label: `${r.account} ${r.month}` }))}
              columns={[{ key: 'label', label: 'Reconciliation', href: '/cash-flow/reconciliation/{account}/{month}' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'statement_balance', label: 'Statement', kind: 'money', dp: 2 }, { key: 'ledger_balance', label: 'Ledger', kind: 'money', dp: 2 }, { key: 'unresolved_difference', label: 'Unresolved Δ', kind: 'money', dp: 2 }, { key: 'proposed', label: 'Proposed', kind: 'number' }, { key: 'open_exceptions', label: 'Unresolved exceptions', kind: 'number' }, { key: 'prepared_by', label: 'Prepared by' }, { key: 'approved_by', label: 'Approved by' }, { key: 'approved_at', label: 'Approved at', kind: 'date' }]} />}
        </Card>
        <Provenance>reconciliations, recon_matches, recon_exceptions. {data.accounts.map((a) => <span key={a.code} className="mr-2"><Badge tone={a.account_class === 'operating' ? 'pos' : 'navy'}>{a.code}</Badge></span>)}</Provenance>
      </Section>
      <p className="mt-2 text-2xs text-muted">Months listed: {data.months.slice(0, 3).map((m) => monthLabel(`${m.m}-01`)).join(', ')}…</p>
    </div>
  );
}
