import Link from 'next/link';
import { pageContext, tx, spGet, type SP } from '@/lib/page';
import { listReports, REPORT_KINDS } from '@/lib/services/reports';
import { q } from '@/lib/db';
import { PageHeader, Section } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { PeriodFilter } from '@/components/ui/period-filter';
import { DataTable } from '@/components/ui/data-table';
import { GenerateForm, AskForm } from './forms';

export const dynamic = 'force-dynamic';

export default async function Reports({ searchParams }: { searchParams: SP }) {
  const { auth, period, sp, months, fyears } = await pageContext(searchParams, 'dashboard.view');
  const { reports, decisions } = await tx(auth, async (t) => ({ reports: await listReports(t), decisions: await q<any>(t, `SELECT id, code, title FROM executive_decisions WHERE status IN ('approved','in_progress','implemented','closed') ORDER BY created_at DESC`) }));
  return (
    <div>
      <PageHeader eyebrow="Reports & Board Pack" title="Board Reporting Center" subtitle="Reports are generated from the calculation engine and frozen (immutable, SHA-256). PDF, Excel and presentation exports render the same frozen content and include period, data refresh, definitions, assumptions, validation status and evidence references." actions={<PeriodFilter current={period.key} months={months} fyears={fyears} allowCompare={false} />} />
      {auth.permissions.has('report.generate') && <Card><CardHeader title={`Generate a report — ${period.label}`} /><CardBody><GenerateForm kinds={Object.entries(REPORT_KINDS)} range={period.key} decisions={decisions} defaultKind={spGet(sp, 'kind')} /></CardBody></Card>}
      {auth.permissions.has('ai.use') && <Card className="mt-4"><CardHeader title="AI financial analyst" subtitle="Answers only from the calculation engine's fact sheet; every statement is classified and every number is validated against cited facts." actions={<Link className="link text-xs" href={`/reports/analyst?range=${encodeURIComponent(period.key)}`}>Full page</Link>} /><CardBody><AskForm range={period.key} /></CardBody></Card>}
      <Section title="Generated reports">
        <Card><DataTable filename="reports" rows={reports} columns={[{ key: 'title', label: 'Report', href: '/reports/{id}' }, { key: 'kind', label: 'Type' }, { key: 'period_start', label: 'From', kind: 'date' }, { key: 'period_end', label: 'To', kind: 'date' }, { key: 'data_status', label: 'Data status' }, { key: 'generated_by', label: 'By' }, { key: 'generated_at', label: 'Generated', kind: 'date' }]} /></Card>
      </Section>
    </div>
  );
}
