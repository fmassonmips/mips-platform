import { notFound } from 'next/navigation';
import { pageContext, tx, type SP } from '@/lib/page';
import { q, one } from '@/lib/db';
import { merchantInfo, merchantAgreements, merchantFeeSchedules } from '@/lib/services/merchants';
import { contractConstraint } from '@/lib/services/segmentation';
import { PageHeader, Callout, Section } from '@/components/ui/page-header';
import { PeriodFilter } from '@/components/ui/period-filter';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { MerchantTabs, MerchantBadges } from '../tabs';
import { AgreementForm } from './agreement-form';
import { UUID } from '../transactions/filters';
import { addDays, addMonths, monthStart } from '@/lib/dates';
import { todayISO } from '@/lib/period';

export const dynamic = 'force-dynamic';

export default async function MerchantContracts({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { auth, period, months, fyears } = await pageContext(searchParams, 'merchant.view');
  const d = await tx(auth, async (t) => {
    const m = await merchantInfo(t, id);
    if (!m) return null;
    const [agreements, fees, usage, last, methods, history] = await Promise.all([
      merchantAgreements(t, id),
      merchantFeeSchedules(t, id, period.start, period.end),
      q<any>(t, `SELECT pricing_agreement_id::text AS id, count(*)::text AS n, min(accounting_date)::text AS first, max(accounting_date)::text AS last, sum(mdr_fee_base)::text AS mdr FROM transactions WHERE merchant_id = $1 AND pricing_agreement_id IS NOT NULL GROUP BY 1`, [id]),
      one<{ d: string | null }>(t, 'SELECT max(accounting_date)::text AS d FROM transactions WHERE merchant_id = $1', [id]),
      q<any>(t, 'SELECT id, name FROM payment_methods WHERE is_active ORDER BY category, name'),
      q<any>(t, `SELECT e.created_at, e.action, e.entity_id, u.name AS actor, e.payload FROM audit_events e LEFT JOIN users u ON u.id = e.actor_user_id
        WHERE e.entity_type = 'pricing_agreement' AND e.payload->>'merchantId' = $1 ORDER BY e.id DESC LIMIT 50`, [id]),
    ]);
    return { m, agreements, fees, usage, last: last?.d ?? null, methods, history };
  });
  if (!d) notFound();
  const { m, agreements, fees, usage, last, methods, history } = d;
  const use = new Map(usage.map((u: any) => [u.id, u]));
  const rows = agreements.map((a: any) => ({ ...a, txns: use.get(a.id)?.n ?? '0', first: use.get(a.id)?.first ?? null, lastUsed: use.get(a.id)?.last ?? null, mdrBilled: use.get(a.id)?.mdr ?? '0', txRange: use.get(a.id) ? `c:${use.get(a.id).first}..${use.get(a.id).last}` : period.key, state: a.effective_to && a.effective_to < todayISO() ? 'closed' : a.effective_from > todayISO() ? 'scheduled' : 'active' }));
  const constraint = contractConstraint({ priceLockedUntil: m.price_locked_until, contractNotes: m.contract_notes }, todayISO());
  const minFrom = last ? addDays(last, 1) : todayISO();
  const defaultFrom = monthStart(minFrom) === minFrom ? minFrom : addMonths(minFrom, 1);
  const canEdit = auth.permissions.has('merchant.pricing');
  const hist = history.map((h: any) => ({ at: h.created_at instanceof Date ? h.created_at.toISOString().replace('T', ' ').slice(0, 19) : String(h.created_at), action: h.action, actor: h.actor ?? '—', ref: h.payload?.contractRef ?? '', detail: h.action === 'pricing_agreement.close' ? `effective_to ${h.payload?.effectiveToBefore ?? 'open'} → ${h.payload?.effectiveToAfter}` : `${h.payload?.mdrBps ?? ''} bps from ${h.payload?.effectiveFrom ?? ''}${h.payload?.constraintAcknowledged ? ' (constraint acknowledged)' : ''}${h.payload?.note ? ` — ${h.payload.note}` : ''}` }));

  return (
    <div>
      <PageHeader eyebrow={`Merchant ${m.code}`} title={`${m.name} — pricing agreements & fee schedules`} subtitle="Merchant MDR agreements (revenue) and the acquirer fee schedules (wholesale cost) actually applied to this merchant’s transactions."
        actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} />
      <MerchantTabs id={id} active="contracts" range={period.key} />
      <div className="mb-3"><MerchantBadges m={m} /></div>
      <Callout tone="info" title="Historical transactions keep their original pricing">Each transaction stores the <code>pricing_agreement_id</code> and <code>fee_schedule_id</code> that priced it, and its fee amounts are immutable. A new agreement only applies to transactions with an accounting date on or after its effective date; the previous agreement for the same method and region is closed the day before (a contract dimension, not financial evidence). Last priced transaction: <b>{last ?? 'none'}</b>.</Callout>
      {constraint && <div className="mt-3"><Callout tone="warn" title="Contractual constraint">{constraint}</Callout></div>}

      <Section title="Pricing agreements (all versions)">
        <Card><DataTable rows={rows} filename={`${m.code}-pricing-agreements`} dense columns={[
          { key: 'contract_ref', label: 'Contract', href: `/merchants/${id}/transactions?range={txRange}&pa={id}` }, { key: 'state', label: 'State', kind: 'badge' }, { key: 'method', label: 'Method' }, { key: 'card_region', label: 'Region' },
          { key: 'mdr_bps', label: 'MDR bps', kind: 'bps', dp: 2 }, { key: 'fixed_fee', label: 'Fixed fee', kind: 'money', dp: 2 }, { key: 'monthly_saas_fee', label: 'SaaS / month', kind: 'money' }, { key: 'effective_from', label: 'Effective from', kind: 'date' }, { key: 'effective_to', label: 'Effective to', kind: 'date' },
          { key: 'approved_by', label: 'Approved by' }, { key: 'txns', label: 'Txns priced', kind: 'number' }, { key: 'first', label: 'First txn', kind: 'date' }, { key: 'lastUsed', label: 'Last txn', kind: 'date' }, { key: 'mdrBilled', label: 'MDR billed', kind: 'money' },
        ]} /></Card>
      </Section>

      <Section title={`Add an effective-dated agreement${canEdit ? '' : ' (requires merchant.pricing)'}`}>
        <Card><CardBody>
          {canEdit ? <AgreementForm merchantId={id} methods={methods} defaultFrom={defaultFrom} minFrom={minFrom} constrained={!!constraint} constraint={constraint} />
            : <p className="text-sm text-muted">Your role ({auth.roleName}) can view but not change pricing. Ask a user with the <code>merchant.pricing</code> permission (e.g. CFO).</p>}
        </CardBody></Card>
      </Section>

      <Section title={`Acquirer fee schedules applied — ${period.label}`}>
        <Card><DataTable rows={fees} filename={`${m.code}-fee-schedules-${period.key}`} dense columns={[
          { key: 'schedule_ref', label: 'Schedule', href: `/merchants/${id}/transactions?range=${encodeURIComponent(period.key)}&fs={id}` }, { key: 'acquirer', label: 'Acquirer' }, { key: 'method', label: 'Method' }, { key: 'card_region', label: 'Region' },
          { key: 'wholesale_bps', label: 'Wholesale bps', kind: 'bps', dp: 2 }, { key: 'effective_from', label: 'From', kind: 'date' }, { key: 'effective_to', label: 'To', kind: 'date' }, { key: 'txns', label: 'Txns', kind: 'number' }, { key: 'wholesale', label: 'Wholesale cost', kind: 'money' },
        ]} /></Card>
      </Section>

      <Section title="Change history (audit trail)">
        <Card>{hist.length ? <DataTable rows={hist} filename={`${m.code}-pricing-audit`} dense columns={[{ key: 'at', label: 'When (UTC)' }, { key: 'action', label: 'Action' }, { key: 'actor', label: 'User' }, { key: 'ref', label: 'Contract' }, { key: 'detail', label: 'Detail' }]} /> : <CardHeader title="No pricing changes recorded through the platform yet" subtitle="Seeded agreements were loaded by the DEMO generator." />}</Card>
      </Section>
    </div>
  );
}
