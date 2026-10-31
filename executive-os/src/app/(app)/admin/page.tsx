import Link from 'next/link';
import { tx } from '@/lib/page';
import { one } from '@/lib/db';
import { requireAny } from '@/lib/services/admin';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ADMIN_SECTIONS } from './_sections';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const auth = await requireAny(ADMIN_SECTIONS[0].perms);
  const s = await tx(auth, (t) => one<any>(t, `SELECT
      (SELECT count(*)::int FROM memberships WHERE is_active) AS members, (SELECT count(*)::int FROM memberships WHERE NOT is_active) AS inactive,
      (SELECT count(*)::int FROM roles) AS roles, (SELECT count(*)::int FROM roles WHERE NOT is_system) AS custom_roles,
      (SELECT count(*)::int FROM financial_periods WHERE status = 'locked') AS locked, (SELECT count(*)::int FROM financial_periods WHERE status = 'soft_closed') AS soft, (SELECT count(*)::int FROM financial_periods WHERE status = 'open') AS open,
      (SELECT count(*)::int FROM audit_events) AS events, (SELECT max(created_at)::text FROM audit_events) AS last_event,
      (SELECT count(*)::int FROM kpi_definitions) AS kpis, (SELECT count(*)::int FROM formula_versions) AS versions,
      (SELECT count(*)::int FROM acquirers) + (SELECT count(*)::int FROM payment_methods) + (SELECT count(*)::int FROM products) + (SELECT count(*)::int FROM verticals) + (SELECT count(*)::int FROM merchant_groups) + (SELECT count(*)::int FROM departments) AS refs`));
  const has = (href: string) => ADMIN_SECTIONS.find((x) => x.href === href)!.perms.some((p) => auth.permissions.has(p));
  const cards: { href: string; title: string; body: React.ReactNode }[] = [
    { href: '/admin/users', title: 'Users & role assignment', body: <>{s.members} active members{s.inactive ? `, ${s.inactive} deactivated` : ''}. Invite users with a one-time password; change roles; deactivate.</> },
    { href: '/admin/roles', title: 'Roles & permissions', body: <>{s.roles} roles ({s.custom_roles} custom). Permission matrix; clone a system role to create a custom role.</> },
    { href: '/admin/settings', title: 'Tenant settings', body: <>Revenue recognition: <b>{auth.settings.revenue_recognition ?? '—'}</b>; base currency {auth.baseCurrency}; FY starts month {auth.fyStartMonth}; feature flags.</> },
    { href: '/admin/reference-data', title: 'Reference data', body: <>{s.refs} records across acquirers, payment methods, products, verticals, merchant groups and departments.</> },
    { href: '/admin/kpis', title: 'KPI definitions', body: <>{s.kpis} KPIs, {s.versions} formula versions (hash-identified). Re-sync the registry from the engine.</> },
    { href: '/admin/periods', title: 'Financial periods', body: <>{s.locked} locked · {s.soft} soft-closed · {s.open} open.</> },
    { href: '/admin/audit', title: 'Audit log', body: <>{s.events} hash-chained events; last {s.last_event?.slice(0, 16).replace('T', ' ') ?? '—'}. Filter and verify the chain.</> },
    ...(auth.isDemo ? [{ href: '/admin/demo', title: 'Demo reset', body: <>Purge and regenerate the synthetic dataset of this demo tenant. <Badge tone="gold">demo only</Badge></> }] : []),
  ];
  return (
    <div>
      <PageHeader eyebrow="Administration" title={`Administration — ${auth.tenantName}`} subtitle={<>Tenant code <code>{auth.tenantCode}</code> · your role {auth.roleName}. Every change made here is written to the immutable, hash-chained audit log.</>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.filter((c) => has(c.href)).map((c) => (
          <Card key={c.href}><CardHeader title={<Link className="link" href={c.href}>{c.title}</Link>} /><CardBody className="text-sm text-muted">{c.body}</CardBody></Card>
        ))}
      </div>
    </div>
  );
}
