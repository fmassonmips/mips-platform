import type { Section } from '@/lib/services/reports';
import { Badge } from '@/components/ui/badge';
const TONE: Record<string, any> = { FACT: 'pos', INTERPRETATION: 'info', ASSUMPTION: 'warn', FORECAST: 'navy', RECOMMENDATION: 'gold' };
export function SectionView({ s }: { s: Section }) {
  if (s.type === 'heading') return <h2 className="mt-6 border-b-2 border-gold pb-1 text-lg font-semibold text-fg">{s.text}</h2>;
  if (s.type === 'paragraph') return <p className="mt-2 text-sm">{s.text}</p>;
  if (s.type === 'callout') return <div className={`mt-3 rounded border px-3 py-2 text-sm ${s.tone === 'neg' ? 'border-neg/40 bg-neg/5' : s.tone === 'pos' ? 'border-pos/40 bg-pos/5' : 'border-info/40 bg-info/5'}`}><b>{s.title}</b><div>{s.text}</div></div>;
  if (s.type === 'statements') return <div className="mt-3">{s.title && <h3 className="text-sm font-semibold">{s.title}</h3>}<ul className="mt-1 space-y-1">{s.items.map((it, i) => <li key={i} className="flex gap-2 text-sm"><Badge tone={TONE[it.classification]}>{it.classification}</Badge><span>{it.text}{it.refs.length > 0 && <span className="ml-1 text-2xs text-muted">[{it.refs.join(', ')}]</span>}</span></li>)}</ul></div>;
  return <div className="mt-3 overflow-x-auto">{s.title && <h3 className="mb-1 text-sm font-semibold">{s.title}</h3>}<table className="w-full"><thead><tr>{s.columns.map((c, i) => <th key={i} className={`th ${s.align?.[i] === 'r' ? 'text-right' : ''}`}>{c}</th>)}</tr></thead><tbody>{s.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`td whitespace-normal ${s.align?.[j] === 'r' ? 'num text-right' : ''}`}>{c ?? '—'}</td>)}</tr>)}</tbody></table></div>;
}
