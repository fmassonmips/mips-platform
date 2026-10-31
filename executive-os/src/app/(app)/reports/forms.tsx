'use client';
import { useActionState } from 'react';
import { generateReportAction, askAction, type RState } from './actions';
import { Badge } from '@/components/ui/badge';

export function GenerateForm({ kinds, range, decisions, defaultKind }: { kinds: [string, string][]; range: string; decisions: { id: string; code: string; title: string }[]; defaultKind?: string }) {
  const [s, action, pending] = useActionState<RState, FormData>(generateReportAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="range" value={range} />
      <div><label className="label" htmlFor="kind">Report</label><select id="kind" name="kind" className="input" defaultValue={defaultKind}>{kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div><label className="label" htmlFor="decisionId">Decision (decision outcome report)</label><select id="decisionId" name="decisionId" className="input"><option value="">—</option>{decisions.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.title.slice(0, 50)}</option>)}</select></div>
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Generating…' : 'Generate & freeze report'}</button>
      {s.error && <p role="alert" className="w-full text-sm text-neg">{s.error}</p>}
    </form>
  );
}

const TONE: Record<string, any> = { FACT: 'pos', INTERPRETATION: 'info', ASSUMPTION: 'warn', FORECAST: 'navy', RECOMMENDATION: 'gold' };
export function AskForm({ range }: { range: string }) {
  const [s, action, pending] = useActionState<RState, FormData>(askAction, {});
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="range" value={range} />
        <input name="question" className="input flex-1" placeholder="e.g. Why did contribution margin decline this month? Which merchants need repricing?" required minLength={5} />
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Analysing…' : 'Ask the analyst'}</button>
      </form>
      {s.error && <p role="alert" className="text-sm text-neg">{s.error}</p>}
      {s.answer && (
        <div className="space-y-2">
          <p className="text-2xs text-muted">Provider {s.answer.provider} · {s.answer.statements.length} grounded statements · {s.answer.rejected.length} rejected by the grounding validator · {s.answer.facts.length} facts available</p>
          <ul className="space-y-1.5">{s.answer.statements.map((x, i) => <li key={i} className="flex gap-2 text-sm"><Badge tone={TONE[x.classification]}>{x.classification}</Badge><span>{x.text}{x.fact_ids.length > 0 && <span className="ml-1 text-2xs text-muted">[{x.fact_ids.join(', ')}]</span>}</span></li>)}</ul>
          {s.answer.rejected.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-warn">Rejected statements</summary><ul>{s.answer.rejected.map((r, i) => <li key={i}>{r.statement.text} — <i>{r.reason}</i></li>)}</ul></details>}
          <p className="text-2xs text-muted">{s.answer.uncertainty.join(' ')} The analyst is read-only and cannot change records or approve anything.</p>
          <details className="text-xs"><summary className="cursor-pointer">Fact sheet</summary><table className="w-full"><tbody>{s.answer.facts.map((f) => <tr key={f.id}><td className="td font-mono">{f.id}</td><td className="td">{f.label}</td><td className="td num text-right">{f.display}</td><td className="td">{f.confidence ?? ''}</td><td className="td text-2xs text-muted">{f.evidence}</td></tr>)}</tbody></table></details>
        </div>
      )}
    </div>
  );
}
