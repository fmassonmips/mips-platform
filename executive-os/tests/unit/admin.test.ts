import { describe, it, expect } from 'vitest';
import { checkRolePermissionChange, periodTransition, generateOneTimePassword, flashUrl, demoUsersFromMemberships, readableError, inactiveCodes } from '@/lib/services/admin';
import { validatePasswordPolicy } from '@/lib/auth/password';

const ADMIN = new Set(['admin.users', 'admin.settings', 'admin.audit', 'dashboard.view', 'finance.view', 'strategy.view']);
const SETTINGS_ONLY = new Set(['admin.settings', 'dashboard.view', 'strategy.view']);

describe('role permission guard', () => {
  const base = { roleCode: 'qa', isSystem: false, before: ['dashboard.view'], actorPerms: ADMIN, confirmAdmin: false };
  it('requires explicit confirmation to grant admin.* to a non-admin role', () => {
    expect(checkRolePermissionChange({ ...base, after: ['dashboard.view', 'admin.audit'] })).toMatch(/confirmation/);
    expect(checkRolePermissionChange({ ...base, after: ['dashboard.view', 'admin.audit'], confirmAdmin: true })).toBeNull();
  });
  it('system roles are editable only with admin.users', () => {
    expect(checkRolePermissionChange({ ...base, isSystem: true, roleCode: 'viewer', after: [], actorPerms: SETTINGS_ONLY })).toMatch(/admin\.users/);
    expect(checkRolePermissionChange({ ...base, isSystem: true, roleCode: 'viewer', after: ['dashboard.view', 'finance.view'] })).toBeNull();
  });
  it('cannot grant permissions the actor does not hold, nor admin.* without admin.users', () => {
    expect(checkRolePermissionChange({ ...base, after: ['dashboard.view', 'finance.approve'] })).toMatch(/do not hold/);
    expect(checkRolePermissionChange({ ...base, actorPerms: SETTINGS_ONLY, after: ['dashboard.view', 'admin.settings'], confirmAdmin: true })).toMatch(/requires admin\.users/);
  });
  it('admin role keeps admin.users; unknown permissions rejected', () => {
    expect(checkRolePermissionChange({ ...base, roleCode: 'admin', isSystem: true, before: ['admin.users'], after: [] })).toMatch(/must keep admin\.users/);
    expect(checkRolePermissionChange({ ...base, after: ['root.everything'] })).toMatch(/Unknown/);
  });
});

describe('period transitions', () => {
  it('follows open → soft_closed → locked and back with explicit ops', () => {
    expect(periodTransition('open', 'soft_close')).toBe('soft_closed');
    expect(periodTransition('soft_closed', 'lock')).toBe('locked');
    expect(periodTransition('open', 'lock')).toBe('locked');
    expect(periodTransition('locked', 'unlock')).toBe('soft_closed');
    expect(periodTransition('soft_closed', 'reopen')).toBe('open');
    expect(periodTransition('locked', 'lock')).toBeNull();
    expect(periodTransition('open', 'unlock')).toBeNull();
    expect(periodTransition('locked', 'reopen')).toBeNull();
  });
});

describe('one-time password', () => {
  it('always satisfies the password policy and is random', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) { const p = generateOneTimePassword(); expect(validatePasswordPolicy(p)).toBeNull(); expect(p).toHaveLength(18); seen.add(p); }
    expect(seen.size).toBe(200);
  });
});

describe('helpers', () => {
  it('flashUrl keeps same-module paths only and replaces previous messages', () => {
    expect(flashUrl('/strategy?fy=2027&ok=old', '/strategy', { ok: 'Saved' })).toBe('/strategy?fy=2027&ok=Saved');
    expect(flashUrl('https://evil.example/x', '/strategy', { err: 'x' })).toBe('/strategy?err=x');
    expect(flashUrl('//evil.example', '/admin', { ok: 'y' })).toBe('/admin?ok=y');
  });
  it('maps demo users from memberships with fallbacks', () => {
    const u = demoUsersFromMemberships([{ user_id: 'c', role_code: 'ceo' }, { user_id: 'f', role_code: 'cfo' }, { user_id: 'm', role_code: 'finance_manager' }, { user_id: 'a', role_code: 'admin' }], 'x');
    expect(u).toMatchObject({ ceo: 'c', cfo: 'f', finance: 'm', admin: 'a', viewer: 'a' });
    expect(demoUsersFromMemberships([{ user_id: 'f', role_code: 'cfo' }], 'self')).toMatchObject({ ceo: 'self', cfo: 'f', finance: 'f', admin: 'self' });
  });
  it('readable DB errors', () => {
    expect(readableError({ code: '23505', constraint: 'acquirers_tenant_id_code_key' })).toMatch(/Duplicate/);
    expect(readableError({ message: 'PERIOD_LOCKED: period 2026-07-01 is locked' })).toMatch(/^PERIOD_LOCKED/);
    expect(readableError({ issues: [{ path: ['title'], message: 'Required' }] })).toBe('title: Required');
  });
  it('inactive reference codes from settings', () => {
    expect(inactiveCodes({ reference_inactive: { verticals: ['retail'] } }, 'verticals')).toEqual(['retail']);
    expect(inactiveCodes({}, 'verticals')).toEqual([]);
  });
});
