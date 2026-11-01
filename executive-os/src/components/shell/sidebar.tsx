'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, LineChart, TrendingUp, Receipt, Target, FileSpreadsheet, Wallet, CalendarClock, HandCoins, Truck, LifeBuoy, Store, Boxes, Scale, Sigma, ShieldCheck, Gavel, Flag, FileText, Plug, Settings, Circle } from 'lucide-react';
const Icons: Record<string, any> = { LayoutDashboard, LineChart, TrendingUp, Receipt, Target, FileSpreadsheet, Wallet, CalendarClock, HandCoins, Truck, LifeBuoy, Store, Boxes, Scale, Sigma, ShieldCheck, Gavel, Flag, FileText, Plug, Settings };
import { NAV } from './nav';
import { cn } from '@/lib/utils';

export function Sidebar({ perms }: { perms: string[] }) {
  const path = usePathname();
  const can = new Set(perms);
  return (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      {NAV.map((g) => {
        const items = g.items.filter((i) => ([] as string[]).concat(i.perm as any).some((p) => can.has(p)));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <div className="mb-1 px-2 text-2xs font-semibold uppercase tracking-widest text-white/40">{g.group}</div>
            {items.map((i) => {
              const Icon = Icons[i.icon] ?? Circle;
              const active = path === i.href || path.startsWith(i.href + '/');
              return (
                <Link key={i.href} href={i.href} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-white/75 hover:bg-white/10 hover:text-white', active && 'bg-white/10 font-medium text-white shadow-[inset_2px_0_0_rgb(var(--gold))]')}>
                  <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-gold' : 'text-white/50')} />{i.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
