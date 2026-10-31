import { Callout } from '@/components/ui/page-header';
import { spGet } from '@/lib/page';

/** Result banner for treasury server actions (?ok= / ?err= set by treasuryAction). */
export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = spGet(sp, 'ok'); const err = spGet(sp, 'err');
  if (!ok && !err) return null;
  return <div className="no-print mb-4">{err ? <Callout tone="neg" title="Action not completed">{err}</Callout> : <Callout tone="pos" title="Done">{ok}</Callout>}</div>;
}

/** Hidden field that tells the action where to return. */
export function ReturnTo({ value }: { value: string }) { return <input type="hidden" name="returnTo" value={value} />; }

/** Build the current URL (path + query without flash params) for returnTo. */
export function currentUrl(path: string, sp: Record<string, string | string[] | undefined>, override: Record<string, string | null> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) { if (k === 'ok' || k === 'err' || v === undefined) continue; p.set(k, Array.isArray(v) ? v[0] : v); }
  for (const [k, v] of Object.entries(override)) { if (v === null) p.delete(k); else p.set(k, v); }
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

/** Provenance line shown under treasury figures. */
export function Provenance({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-2xs text-muted">Source: {children}</p>;
}
