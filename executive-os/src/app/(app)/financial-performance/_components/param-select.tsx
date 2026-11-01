'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** A <select> bound to one URL search parameter (empty value removes it). */
export function ParamSelect({ name, value, options, label, clear = [] }: { name: string; value: string; options: { value: string; label: string }[]; label: string; clear?: string[] }) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  return (
    <label className="no-print flex items-center gap-1.5 text-xs text-muted">
      <span>{label}</span>
      <select aria-label={label} className="input w-auto py-1 text-xs" value={value} onChange={(e) => {
        const p = new URLSearchParams(sp.toString());
        if (e.target.value) p.set(name, e.target.value); else p.delete(name);
        for (const c of clear) p.delete(c);
        router.push(`${path}?${p.toString()}`);
      }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
