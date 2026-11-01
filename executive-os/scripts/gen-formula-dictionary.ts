/** Generates docs/financial-formula-dictionary.md from the KPI registry (single source of truth). */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { KPIS, formulaHash, KPI_ENGINE_VERSION } from '../src/lib/engine/kpis';
import { TEMPLATES, ENGINE_VERSION } from '../src/lib/engine/scenarios';

const lines: string[] = [
  '# Financial Formula Dictionary', '',
  `Generated from \`src/lib/engine/kpis.ts\` (${KPI_ENGINE_VERSION}) by \`npm run docs:formulas\`. Do not edit by hand.`, '',
  '## Global calculation policies', '',
  '- **Arithmetic**: Decimal.js, 40 significant digits. Binary floating point is never used for money.',
  '- **Storage precision**: money `numeric(20,4)`, KPI values `numeric(28,8)`, FX rates `numeric(20,10)`, basis points `numeric(10,4)`.',
  '- **Rounding**: ROUND_HALF_UP; presentation to the currency minor unit (MUR 0 dp on dashboards, 2 dp in drill-downs).',
  '- **Basis points**: 1 bp = 0.01 percentage point = 0.0001. A 20 bps reduction of 1.95 % gives 1.75 %.',
  '- **Currency**: every foreign-currency record stores its own FX rate to the tenant base currency (`fx_rate_to_base`); `amount_base = round(amount × rate, 4)`. Control C04 verifies this.',
  '- **Zero denominators**: ratio KPIs return NULL ("not computable"), never ∞/NaN.',
  '- **Dates**: KPIs use the accounting date; transactions also store event (authorisation), processing and settlement dates.',
  '- **GPV is never revenue**. Revenue recognition policy is a tenant setting: `agent_net` (revenue = MDR − wholesale + SaaS) or `principal_gross` (revenue = MDR + SaaS; wholesale in cost of sales). Contribution margin is identical under both.',
  '- **Fee engine** (`src/lib/engine/fees.ts`): only successful transactions earn MDR / incur wholesale; every attempt incurs direct processing cost; most specific effective agreement wins (method > all; region > any; latest effective_from).',
  '- **Confidence classes**: VERIFIED (controls pass and periods locked, or management verification for identical inputs), PENDING, DISPUTED (a control affecting the KPI’s sources fails), ESTIMATED (depends on the processing-cost model). Not an external audit opinion.', '',
  '## KPI register', '',
];
for (const k of KPIS) {
  lines.push(`### ${k.code} — ${k.name}`, '', `| Attribute | Value |`, `|---|---|`,
    `| Category | ${k.category} |`, `| Definition | ${k.definition} |`, `| Formula | \`${k.formula}\` |`, `| Numerator | ${k.numerator ?? '—'} |`, `| Denominator | ${k.denominator ?? '—'} |`,
    `| Unit | ${k.unit} (desired direction: ${k.direction}) |`, `| Data source | ${k.dataSource} |`, `| Source classes | ${k.sources.join(', ')} |`, `| Grain | ${k.grain} |`, `| Period basis | ${k.periodBasis} |`,
    `| Currency | ${k.currencyRule} |`, `| Rounding | ${k.rounding} |`, `| Validation rules | ${k.validation.join('; ') || '—'} |`, `| Owner | ${k.owner} |`, `| Formula hash | \`${formulaHash(k).slice(0, 16)}…\` |`, '');
}
lines.push('## Controls (Formula Audit)', '', '| Code | Check | Category |', '|---|---|---|',
  ...[['C01', 'Missing pricing / fee schedule', 'Missing values'], ['C02', 'Probable duplicates (same merchant & amount within 60 s)', 'Duplicate records'], ['C03', 'Σ merchant contribution = total', 'Incorrect aggregation'], ['C04', 'FX: base amount = amount × stored rate', 'Currency errors'], ['C05', 'Denominators', 'Invalid denominators'], ['C06', 'Formula hash matches registered version', 'Inconsistent formulas'], ['C07', 'GL transaction revenue ↔ fee-engine revenue per month (tolerance setting)', 'Reconciliation discrepancies'], ['C08', 'Open bank reconciliation exceptions', 'Reconciliation discrepancies'], ['C09', 'Event ≤ settlement / accounting dates', 'Period misalignment'], ['C10', 'Journals balance', 'Incorrect aggregation'], ['C11', 'GL present for every completed month', 'Missing values']].map((r) => `| ${r.join(' | ')} |`), '');
lines.push(`## Scenario templates (${ENGINE_VERSION})`, '', 'Outputs per case (base = status quo, proposed, downside): incremental revenue, costs, contribution, EBITDA, PBT (EBITDA − incremental D&A), cash flow (EBITDA − capex − working capital − tax), payback month, break-even GPV change, sensitivities (revenue ±10 %, costs +10 %, 3-month delay), risk exposure (downside − proposed cash).', '', '| Template | Description | Assumptions |', '|---|---|---|',
  ...Object.entries(TEMPLATES).map(([k, v]) => `| \`${k}\` | ${v.description} | ${Object.keys((v.schema as any).shape).join(', ')} |`), '');
lines.push('## Other engine formulas', '',
  '- **Break-even GPV** = (fixed costs − SaaS) ÷ variable contribution per unit of GPV; **cash break-even** excludes D&A and adds cash-only fixed outflows. Required take rate = (fixed + processing − SaaS) ÷ GPV.',
  '- **Runway**: unrestricted cash ÷ average monthly operating burn; when average net flow ≥ 0 the business is cash-generative and no finite runway is shown.',
  '- **13-week forecast**: receipts at due/promise date + scenario delay × collection rate (disputed at the disputed rate); payables at scheduled/due date; recurring items; restricted funds excluded.',
  '- **Revenue bridge**: new + lost merchants + volume effect Σ(ΔGPV × prior take) + rate effect Σ(Δtake × current GPV) + SaaS/other; volume split into transaction-count and average-ticket effects; sums exactly.',
  '- **Concentration**: HHI on revenue shares (0–10 000), top-1 and top-5 share.',
  '- **Overhead allocation**: pool = GL opex + D&A in the period, allocated by net revenue / transactions / GPV (configurable); residual rounding assigned to the largest unit so allocations sum exactly.',
  '- **Margin alert (ALERT v2)**: unit contribution (bps of GPV) in the month vs average of the previous 6 months; alert at ≥ 10 % decline (tenant setting); impact = Δ unit margin × current GPV.', '');
writeFileSync(path.join(__dirname, '..', 'docs', 'financial-formula-dictionary.md'), lines.join('\n'));
console.log('written docs/financial-formula-dictionary.md');
