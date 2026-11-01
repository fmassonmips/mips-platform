'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AdminTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="no-print mb-4 flex flex-wrap gap-1 border-b border-border" aria-label="Administration sections">
      {tabs.map((t) => {
        const active = t.href === '/admin' ? path === '/admin' : path.startsWith(t.href);
        return <Link key={t.href} href={t.href} className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium ${active ? 'border-gold text-fg' : 'border-transparent text-muted hover:text-fg'}`}>{t.label}</Link>;
      })}
    </nav>
  );
}
