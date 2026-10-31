import { spGet } from '@/lib/page';
import type { TxnFilter } from '@/lib/services/merchants';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whitelisted drill-down filters from the query string (shared by the page and the CSV export). */
export function parseTxnFilter(sp: Record<string, string | string[] | undefined>): TxnFilter {
  const v = (k: string) => { const x = spGet(sp, k); return x && x.trim() ? x.trim() : undefined; };
  const fs = v('fs'), pa = v('pa');
  return {
    region: ['domestic', 'international', 'na'].includes(v('region') ?? '') ? v('region') : undefined,
    acquirer: v('acquirer') && /^[A-Z0-9_-]{1,20}$/i.test(v('acquirer')!) ? v('acquirer') : undefined,
    status: ['success', 'failed', 'refunded', 'reversed'].includes(v('status') ?? '') ? v('status') : undefined,
    method: v('method') && /^[a-z0-9_-]{1,30}$/i.test(v('method')!) ? v('method') : undefined,
    feeScheduleId: fs && UUID.test(fs) ? fs : undefined,
    pricingAgreementId: pa && UUID.test(pa) ? pa : undefined,
  };
}
