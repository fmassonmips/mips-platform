import type { Permission } from '@/lib/auth/permissions';

/** Admin sections and the permission(s) that grant access to each (checked again in every page and action). */
export const ADMIN_SECTIONS: { href: string; label: string; perms: Permission[] }[] = [
  { href: '/admin', label: 'Overview', perms: ['admin.users', 'admin.settings', 'admin.audit', 'admin.demo_reset', 'finance.lock_period'] },
  { href: '/admin/users', label: 'Users', perms: ['admin.users'] },
  { href: '/admin/roles', label: 'Roles & permissions', perms: ['admin.users', 'admin.settings'] },
  { href: '/admin/settings', label: 'Tenant settings', perms: ['admin.settings'] },
  { href: '/admin/reference-data', label: 'Reference data', perms: ['admin.settings'] },
  { href: '/admin/kpis', label: 'KPI definitions', perms: ['admin.settings'] },
  { href: '/admin/periods', label: 'Financial periods', perms: ['finance.lock_period', 'admin.settings'] },
  { href: '/admin/audit', label: 'Audit log', perms: ['admin.audit'] },
  { href: '/admin/demo', label: 'Demo reset', perms: ['admin.demo_reset'] },
];

