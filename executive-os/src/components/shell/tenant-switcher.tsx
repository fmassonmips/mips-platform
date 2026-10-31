'use client';
import { switchTenantAction } from '@/app/login/actions';
export function TenantSwitcher({ current, tenants }: { current: string; tenants: { id: string; name: string; demo: boolean }[] }) {
  if (tenants.length <= 1) return <span className="truncate text-sm font-medium">{tenants[0]?.name}</span>;
  return (
    <form action={switchTenantAction}>
      <select name="tenantId" defaultValue={current} aria-label="Switch tenant" onChange={(e) => e.currentTarget.form?.requestSubmit()} className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white [&>option]:text-black">
        {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </form>
  );
}
