import { pageContext, type SP } from '@/lib/page';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { PeriodFilter } from '@/components/ui/period-filter';
import { AskForm } from '../forms';
export const dynamic = 'force-dynamic';
export default async function Analyst({ searchParams }: { searchParams: SP }) {
  const { period, months, fyears } = await pageContext(searchParams, 'ai.use');
  return (<div><PageHeader eyebrow="AI Financial Analyst" title={`Ask about ${period.label}`} subtitle={`Provider: ${process.env.ANTHROPIC_API_KEY ? `Claude (${process.env.AI_MODEL || 'claude-opus-5-5'}) with deterministic fallback` : 'deterministic grounded analyst (no ANTHROPIC_API_KEY configured)'}. Statements are classified as FACT / INTERPRETATION / ASSUMPTION / FORECAST / RECOMMENDATION.`} actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} /><Card><CardBody><AskForm range={period.key} /></CardBody></Card></div>);
}
