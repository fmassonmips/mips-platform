import { requireAuth } from '@/lib/auth/session';
import { tx } from '@/lib/page';
import { one } from '@/lib/db';
import { PageHeader, Callout } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { DemoResetForm } from '../_client';

export const dynamic = 'force-dynamic';
/** The reset server action runs ~45 s (purge + regenerate + monthly KPI runs). */
export const maxDuration = 300;

export default async function DemoResetPage() {
  const auth = await requireAuth('admin.demo_reset');
  const t = await tx(auth, (x) => one<{ code: string; name: string; is_demo: boolean; merchants: number; txns: number; events: number }>(x,
    `SELECT code, name, is_demo, (SELECT count(*)::int FROM merchants) AS merchants, (SELECT count(*)::int FROM transactions) AS txns, (SELECT count(*)::int FROM audit_events) AS events FROM tenants WHERE id = app_tenant()`));
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Demo reset" subtitle="Purges every business record of this demo tenant (transactions, GL, KPI runs, strategy, decisions, audit log …) and regenerates the deterministic synthetic dataset. Users, memberships, roles and settings are kept." />
      {!t?.is_demo ? (
        <Callout tone="neg" title="Not available for this tenant">{t?.name} is not a demo tenant. Demo reset can never run against real tenants — the database function purge_demo_tenant_data also refuses.</Callout>
      ) : (
        <Card>
          <CardHeader title={`${t.name} — ${t.code}`} subtitle={`Currently ${t.merchants} merchants, ${t.txns.toLocaleString('en-US')} transactions, ${t.events} audit events.`} />
          <CardBody className="space-y-3">
            <Callout tone="warn" title="Destructive and shared">Everyone using this demo tenant will see the data regenerated; work recorded since the last seed (decisions, actions, updates, audit trail) is removed. Takes about 45 seconds.</Callout>
            <DemoResetForm code={t.code} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
