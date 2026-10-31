import { requireAuth } from '@/lib/auth/session';
import { AdminTabs } from './_tabs';
import { ADMIN_SECTIONS } from './_sections';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();
  const tabs = ADMIN_SECTIONS.filter((s) => s.perms.some((p) => auth.permissions.has(p)) && (s.href !== '/admin/demo' || auth.isDemo)).map(({ href, label }) => ({ href, label }));
  return (
    <div>
      {tabs.length > 1 && <AdminTabs tabs={tabs} />}
      {children}
    </div>
  );
}
