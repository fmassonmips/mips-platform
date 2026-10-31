import { requireAuth } from '@/lib/auth/session';
import { tx, type SP } from '@/lib/page';
import { one, q } from '@/lib/db';
import { SETTING_FIELDS, tenantHasFinancialData } from '@/lib/services/admin';
import { DEFAULT_FEATURES } from '@/lib/services/provision';
import { PageHeader, Callout } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Flash } from '../../strategy/_ui';
import { SubmitButton } from '../../strategy/_client';
import { saveAccountingPolicy, saveThresholds, saveFiscal, saveFeatures } from '../actions';

export const dynamic = 'force-dynamic';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FEATURE_LABEL: Record<string, string> = { merchant_intelligence: 'Merchant intelligence', decision_center: 'CEO Decision Center', proof_center: 'Financial Proof Center', strategy: 'Strategy execution & War Room', ai_analyst: 'AI financial analyst', treasury: 'Treasury & liquidity', board_reporting: 'Board reporting', integrations: 'Data integrations' };

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const auth = await requireAuth('admin.settings');
  const sp = await searchParams;
  const d = await tx(auth, async (t) => ({
    tenant: (await one<{ code: string; name: string; legal_name: string | null; country: string; base_currency: string; fiscal_year_start_month: number; is_demo: boolean; plan: string; settings: Record<string, any>; features: Record<string, boolean>; updated_at: string }>(t, 'SELECT code, name, legal_name, country, base_currency, fiscal_year_start_month, is_demo, plan, settings, features, updated_at::text FROM tenants WHERE id = app_tenant()'))!,
    hasData: await tenantHasFinancialData(t),
    currencies: await q<{ code: string; name: string }>(t, 'SELECT code, name FROM currencies ORDER BY code'),
    lastPolicy: await one<{ created_at: string; actor: string | null; action: string }>(t, `SELECT a.created_at::text, u.name AS actor, a.action FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.action IN ('admin.revenue_recognition_changed','admin.accounting_policy_updated') ORDER BY a.id DESC LIMIT 1`),
  }));
  const s = d.tenant.settings;
  const rt = '/admin/settings';
  const featureKeys = [...new Set([...Object.keys(DEFAULT_FEATURES), ...Object.keys(d.tenant.features ?? {})])];
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Tenant settings" subtitle={<>{d.tenant.name} (<code>{d.tenant.code}</code>) · {d.tenant.legal_name} · {d.tenant.country} · plan {d.tenant.plan}{d.tenant.is_demo ? ' · DEMO tenant' : ''} · last changed {d.tenant.updated_at.slice(0, 16).replace('T', ' ')}. Accounting and calculation policies used by the engines; every change is audited with before/after values.</>} />
      <Flash sp={sp} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Accounting policy" subtitle="Revenue recognition determines whether MDR is reported net (agent) or gross (principal)." />
          <CardBody>
            <form action={saveAccountingPolicy} className="space-y-3">
              <input type="hidden" name="returnTo" value={rt} />
              <label className="block"><span className="label">Revenue recognition</span>
                <select name="revenue_recognition" className="input" defaultValue={s.revenue_recognition ?? 'agent_net'}>
                  <option value="agent_net">agent_net — revenue = MDR − wholesale acquiring cost</option>
                  <option value="principal_gross">principal_gross — revenue = gross MDR; wholesale cost in cost of sales</option>
                </select></label>
              <label className="block"><span className="label">Policy note (mandatory — basis, approval, effective date)</span><textarea name="revenue_policy_note" className="input" rows={3} required minLength={20} maxLength={2000} defaultValue={s.revenue_policy_note ?? ''} /></label>
              <label className="block"><span className="label">Overhead allocation basis</span>
                <select name="overhead_allocation" className="input" defaultValue={s.overhead_allocation ?? 'by_revenue'}>{SETTING_FIELDS.overhead_allocation.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}</select></label>
              <SubmitButton>Save accounting policy</SubmitButton>
              {d.lastPolicy && <p className="text-2xs text-muted">Last policy change: {d.lastPolicy.created_at.slice(0, 16).replace('T', ' ')} by {d.lastPolicy.actor ?? 'system'} ({d.lastPolicy.action}).</p>}
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Calculation thresholds" subtitle="Decimal values; percentages are entered as whole percent (5 = 5 %)." />
          <CardBody>
            <form action={saveThresholds} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="returnTo" value={rt} />
              {(['minimum_liquidity', 'materiality_pct', 'margin_alert_threshold_pct', 'revenue_recon_tolerance'] as const).map((k) => (
                <label key={k} className="block"><span className="label">{SETTING_FIELDS[k].label}</span><input name={k} className="input num" inputMode="decimal" required defaultValue={s[k] ?? ''} /></label>
              ))}
              <div className="sm:col-span-2"><SubmitButton>Save thresholds</SubmitButton></div>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Fiscal year & currency" />
          <CardBody>
            <form action={saveFiscal} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="returnTo" value={rt} />
              <label className="block"><span className="label">Fiscal year start month</span><select name="fiscal_year_start_month" className="input" defaultValue={d.tenant.fiscal_year_start_month}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
              <label className="block"><span className="label">Base currency {d.hasData && '(read-only: financial data exists)'}</span>
                {d.hasData ? <input className="input" value={d.tenant.base_currency} readOnly aria-readonly /> : <select name="base_currency" className="input" defaultValue={d.tenant.base_currency}>{d.currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select>}</label>
              <div className="sm:col-span-2"><Callout tone="warn" title="Changing the fiscal year start re-labels fiscal years in every dashboard and report filter." /></div>
              <div><SubmitButton>Save fiscal settings</SubmitButton></div>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Feature flags" subtitle="Module activation for this tenant (tenants.features)." />
          <CardBody>
            <form action={saveFeatures} className="space-y-3">
              <input type="hidden" name="returnTo" value={rt} />
              <div className="grid gap-1 sm:grid-cols-2">{featureKeys.map((k) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name="feature" value={k} defaultChecked={Boolean(d.tenant.features?.[k])} /> {FEATURE_LABEL[k] ?? k} <code className="text-2xs text-muted">{k}</code></label>)}</div>
              <SubmitButton>Save feature flags</SubmitButton>
            </form>
            <p className="mt-3 text-2xs text-muted">MFA-required roles (policy): {(s.mfa_required_roles ?? []).join(', ') || 'none'}.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
