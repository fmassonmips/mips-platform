/** Small second DEMO tenant used to demonstrate and test tenant isolation. */
import type { Tx } from '../db';
import { insertMany } from '../db-bulk';
import { syncKpiRegistry } from '../services/kpi';

export async function seedSecondaryTenant(tx: Tx, T: string, userId: string) {
  const acq = await insertMany(tx, 'acquirers', ['tenant_id', 'code', 'name'], [[T, 'ACQX', 'Acme Acquirer (DEMO)']], 'id');
  const pm = await insertMany(tx, 'payment_methods', ['tenant_id', 'code', 'name', 'category', 'scheme'], [[T, 'visa', 'Visa', 'card', 'visa']], 'id');
  const pr = await insertMany(tx, 'products', ['tenant_id', 'code', 'name', 'channel'], [[T, 'ECOM', 'E-commerce', 'ecommerce']], 'id');
  const m = await insertMany(tx, 'merchants', ['tenant_id', 'code', 'name', 'activated_at'], [[T, 'A001', 'Acme Secret Merchant (DEMO)', '2026-01-01']], 'id');
  const pa = await insertMany(tx, 'pricing_agreements', ['tenant_id', 'merchant_id', 'mdr_bps', 'effective_from'], [[T, m[0].id, 300, '2026-01-01']], 'id');
  const fs = await insertMany(tx, 'fee_schedules', ['tenant_id', 'acquirer_id', 'wholesale_bps', 'effective_from'], [[T, acq[0].id, 150, '2026-01-01']], 'id');
  const rows: unknown[][] = [];
  for (let i = 0; i < 200; i++) {
    const d = `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`;
    rows.push([T, `ACME-${i}`, m[0].id, pr[0].id, acq[0].id, pm[0].id, 'visa', 'domestic', 'success', 'MUR', 'MUR', '1000.00', '1', '1000.0000', '30.0000', '15.0000', '1.0000', pa[0].id, fs[0].id, `${d}T10:00:00+04:00`, d, true]);
  }
  await insertMany(tx, 'transactions', ['tenant_id', 'external_ref', 'merchant_id', 'product_id', 'acquirer_id', 'payment_method_id', 'card_scheme', 'card_region', 'status', 'txn_currency', 'settlement_currency', 'amount', 'fx_rate_to_base', 'amount_base', 'mdr_fee_base', 'wholesale_fee_base', 'processing_cost_base', 'pricing_agreement_id', 'fee_schedule_id', 'event_at', 'accounting_date', 'is_demo'], rows);
  await syncKpiRegistry(tx, T, userId);
}
