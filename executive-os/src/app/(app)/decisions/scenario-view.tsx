import { fmtMoney } from '@/lib/format';
import type { ScenarioOutput } from '@/lib/engine/scenarios';

const ROWS: [string, (c: ScenarioOutput['proposed']) => string | null, 'money' | 'text'][] = [
  ['Incremental revenue (horizon)', (c) => c.totals.revenue, 'money'],
  ['Incremental costs (horizon)', (c) => c.totals.costs, 'money'],
  ['Contribution margin (horizon)', (c) => c.totals.contribution, 'money'],
  ['EBITDA impact (horizon)', (c) => c.totals.ebitda, 'money'],
  ['Profit-before-tax impact (horizon)', (c) => c.totals.pbt, 'money'],
  ['Cash-flow impact (horizon)', (c) => c.totals.cashFlow, 'money'],
  ['Capex', (c) => c.totals.capex, 'money'],
  ['EBITDA impact (annualised)', (c) => c.annualised.ebitda, 'money'],
  ['Steady-state monthly EBITDA', (c) => c.steadyStateMonthly.ebitda, 'money'],
  ['Payback', (c) => (c.paybackMonth === null ? 'not within horizon' : c.paybackMonth === 0 ? 'immediate' : `month ${c.paybackMonth}`), 'text'],
  ['Break-even GPV change (monthly)', (c) => c.breakEvenGpvChange, 'money'],
];

export function CaseTable({ outputs, labels }: { outputs: ScenarioOutput[]; labels: string[] }) {
  const cols = outputs.flatMap((o, i) => (outputs.length === 1 ? [['Base case', o.base], ['Proposed', o.proposed], ['Downside', o.downside]] : [[`${labels[i]} · proposed`, o.proposed], [`${labels[i]} · downside`, o.downside]]) as [string, ScenarioOutput['proposed']][]);
  return (
    <div className="overflow-x-auto"><table className="w-full">
      <thead><tr><th className="th">Metric ({outputs[0].currency})</th>{cols.map(([l]) => <th key={l} className="th text-right">{l}</th>)}</tr></thead>
      <tbody>{ROWS.map(([label, f, kind]) => (
        <tr key={label}><td className="td text-muted">{label}</td>{cols.map(([l, c]) => { const v = f(c); return <td key={l} className={`td num text-right ${kind === 'money' && v && Number(v) < 0 ? 'text-neg' : ''}`}>{kind === 'money' ? fmtMoney(v) : v}</td>; })}</tr>
      ))}</tbody>
    </table></div>
  );
}
