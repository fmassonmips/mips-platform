import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/api';
import { KINDS, type ImportKind } from '@/lib/import/kinds';
export const dynamic = 'force-dynamic';
const EXAMPLES: Partial<Record<ImportKind, Record<string, string>>> = {
  transactions: { external_ref: 'GW-20261101-000001', merchant_code: 'M001', product_code: 'ECOM', acquirer_code: 'SBM', payment_method: 'visa', card_scheme: 'visa', card_region: 'international', country: 'FR', status: 'success', txn_currency: 'MUR', settlement_currency: 'MUR', amount: '25400.00', fx_rate: '', event_at: '2026-11-01T10:15:00+04:00', processed_at: '', settlement_date: '2026-11-02', accounting_date: '2026-11-01' },
  gl_entries: { journal_ref: 'JRN-ADJ-202611', line_no: '1', entry_date: '2026-11-30', account_code: '4000', department_code: '', product_code: 'ECOM', description: 'Revenue accrual', currency: 'MUR', debit: '', credit: '18450.00', fx_rate: '' },
  bank_transactions: { bank_account_code: 'MCB-OPS', txn_date: '2026-11-03', value_date: '2026-11-03', amount: '-1200.00', debit: '', credit: '', currency: 'MUR', description: 'Bank charges', reference: 'CHG-2026-11', counterparty: 'MCB', category: 'bank_charges', bank_ref: 'MCB-STMT-0001' },
};
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const a = await apiAuth(req, 'data.import'); if (a instanceof Response) return a;
  const kind = (await params).kind as ImportKind; const def = KINDS[kind];
  if (!def) return NextResponse.json({ error: 'unknown kind' }, { status: 404 });
  const header = def.fields.map((f) => f.key).join(',');
  const ex = EXAMPLES[kind]; const line = ex ? def.fields.map((f) => ex[f.key] ?? '').join(',') : '';
  return new NextResponse(`${header}\n${line}\n`, { headers: { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="template-${kind}.csv"` } });
}
