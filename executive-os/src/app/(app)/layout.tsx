import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { Sidebar } from '@/components/shell/sidebar';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { TenantSwitcher } from '@/components/shell/tenant-switcher';
import { withoutTenant, q } from '@/lib/db';
import { logoutAction } from '@/app/login/actions';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();
  const tenants = await withoutTenant((tx) => q<{ tenant_id: string; tenant_name: string; is_demo: boolean }>(tx, 'SELECT * FROM auth_user_memberships($1)', [auth.userId]));
  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 bg-navy lg:block">
        <Link href="/executive" className="flex items-center gap-2 border-b border-white/10 px-4 py-3.5">
          <div className="grid h-7 w-7 place-items-center rounded bg-gold text-xs font-black text-navy">M</div>
          <div><div className="text-sm font-semibold leading-tight text-white">MIPS Executive OS</div><div className="text-2xs text-white/50">Financial intelligence</div></div>
        </Link>
        <Sidebar perms={[...auth.permissions]} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 bg-navy-2 px-4 py-2 text-white shadow">
          <div className="flex min-w-0 items-center gap-3">
            <details className="lg:hidden"><summary className="cursor-pointer list-none rounded px-2 py-1 text-sm hover:bg-white/10">☰ Menu</summary><div className="absolute left-0 top-11 z-30 h-[80vh] w-64 overflow-y-auto bg-navy shadow-xl"><Sidebar perms={[...auth.permissions]} /></div></details>
            <TenantSwitcher current={auth.tenantId} tenants={tenants.map((t) => ({ id: t.tenant_id, name: t.tenant_name, demo: t.is_demo }))} />
            {auth.isDemo && <span className="rounded bg-gold px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-navy" title="Synthetic demonstration data — not actual MIPS results">Demo data</span>}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="hidden text-white/70 sm:inline">{auth.name} · {auth.roleName}</span>
            <ThemeToggle />
            <Link href="/account" className="rounded-md px-2 py-1 text-white/80 hover:bg-white/10">Account</Link>
            <form action={logoutAction}><button className="rounded-md px-2 py-1 text-white/80 hover:bg-white/10">Sign out</button></form>
          </div>
        </header>
        {auth.isDemo && <div className="no-print border-b border-gold/40 bg-gold-soft px-4 py-1 text-center text-2xs font-medium text-fg">DEMO tenant — all figures are synthetic and must not be presented as actual MIPSIT Digital Ltd results.</div>}
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
