/** CSV export of a merchant's filtered transaction drill-down (all pages). Permission: merchant.view. */
import { getAuth, tctx } from '@/lib/auth/session';
import { withTenant } from '@/lib/db';
import { parsePeriod } from '@/lib/period';
import { merchantInfo, merchantTransactions } from '@/lib/services/merchants';
import { audit } from '@/lib/audit';
import { parseTxnFilter, UUID } from '../filters';

export const dynamic = 'force-dynamic';
const MAX_ROWS = 100000;

const COLS: [string, string][] = [
  ['external_ref', 'reference'], ['event_at', 'event_at'], ['accounting_date', 'accounting_date'], ['settlement_date', 'settlement_date'], ['status', 'status'], ['method', 'method'], ['card_scheme', 'card_scheme'],
  ['card_region', 'card_region'], ['acquirer', 'acquirer'], ['product', 'product'], ['txn_currency', 'txn_currency'], ['settlement_currency', 'settlement_currency'], ['amount', 'amount_txn_ccy'], ['fx_rate_to_base', 'fx_rate_to_base'],
  ['amount_base', 'amount_base'], ['mdr_fee_base', 'mdr_fee_base'], ['wholesale_fee_base', 'wholesale_fee_base'], ['processing_cost_base', 'processing_cost_base'], ['contribution', 'contribution_excl_saas'],
  ['pricing_ref', 'pricing_agreement_ref'], ['mdr_bps', 'pricing_mdr_bps'], ['pricing_agreement_id', 'pricing_agreement_id'], ['fee_ref', 'fee_schedule_ref'], ['wholesale_bps', 'fee_schedule_wholesale_bps'], ['fee_schedule_id', 'fee_schedule_id'],
  ['source_file', 'source_file'], ['import_batch_id', 'import_batch_id'], ['source_row_id', 'source_row_id'], ['id', 'transaction_id'],
];
const esc = (v: unknown) => { if (v === null || v === undefined) return ''; const s = v instanceof Date ? v.toISOString() : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return new Response('Unauthorized', { status: 401 });
  if (!auth.permissions.has('merchant.view')) return new Response('Forbidden: merchant.view required', { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const period = parsePeriod(sp.range, auth.fyStartMonth);
  const f = parseTxnFilter(sp);
  const out = await withTenant(tctx(auth), async (t) => {
    const m = await merchantInfo(t, id);
    if (!m) return null;
    const rows = await merchantTransactions(t, id, period.start, period.end, { ...f, limit: MAX_ROWS, offset: 0 });
    await audit(t, { tenantId: auth.tenantId, userId: auth.userId, action: 'merchant.transactions.export', entityType: 'merchant', entityId: id, payload: { period: period.key, filters: f, rows: rows.length } });
    return { m, rows };
  });
  if (!out) return new Response('Not found', { status: 404 });
  const lines = [COLS.map(([, h]) => h).join(',')];
  for (const r of out.rows) lines.push(COLS.map(([k]) => esc((r as any)[k])).join(','));
  const name = `${out.m.code}-transactions-${period.key.replace(/[^a-zA-Z0-9-]/g, '_')}.csv`;
  return new Response(lines.join('\n') + '\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
}
