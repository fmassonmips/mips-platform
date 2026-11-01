/** Fixed permission catalogue. Roles (tenant-configurable) are granted subsets. */
export const PERMISSIONS = {
  'dashboard.view': ['core', 'View executive and financial dashboards'],
  'finance.view': ['finance', 'View P&L, costs, budgets, AR, AP and treasury'],
  'finance.manage': ['finance', 'Create/edit budgets, forecast items, collection notes, supplier invoices'],
  'finance.approve': ['finance', 'Approve budgets, supplier invoices, reconciliations, external communications'],
  'finance.lock_period': ['finance', 'Lock and unlock financial periods'],
  'treasury.reconcile': ['treasury', 'Run and edit bank reconciliations'],
  'merchant.view': ['merchant', 'View merchant and product profitability'],
  'merchant.pricing': ['merchant', 'Manage pricing agreements and fee schedules'],
  'data.import': ['data', 'Upload and validate data imports'],
  'data.approve_import': ['data', 'Approve and commit data imports'],
  'kpi.calculate': ['proof', 'Trigger KPI calculation runs'],
  'kpi.verify': ['proof', 'Record KPI verification status (VERIFIED/DISPUTED)'],
  'proof.view': ['proof', 'View the Financial Proof Center and formula audit'],
  'proof.export': ['proof', 'Export evidence packages'],
  'scenario.manage': ['decision', 'Create and run scenarios'],
  'decision.propose': ['decision', 'Propose executive decisions'],
  'decision.approve': ['decision', 'Approve or reject executive decisions'],
  'strategy.view': ['strategy', 'View strategy execution and War Room'],
  'strategy.manage': ['strategy', 'Manage objectives, initiatives and actions'],
  'report.generate': ['reporting', 'Generate board packs and reports'],
  'ai.use': ['ai', 'Use the AI financial analyst'],
  'admin.users': ['admin', 'Manage users and role assignments'],
  'admin.settings': ['admin', 'Manage tenant settings, reference data and KPI definitions'],
  'admin.audit': ['admin', 'View audit log and verify audit chain'],
  'admin.demo_reset': ['admin', 'Reset demo data (demo tenants only)'],
} as const satisfies Record<string, readonly [string, string]>;

export type Permission = keyof typeof PERMISSIONS;
const ALL = Object.keys(PERMISSIONS) as Permission[];

/** Default system roles provisioned for each new tenant. */
export const DEFAULT_ROLES: Record<string, { name: string; description: string; permissions: Permission[] }> = {
  admin: { name: 'Tenant Administrator', description: 'Full configuration access; segregation-of-duty constraints still enforced by the database', permissions: ALL },
  ceo: {
    name: 'Chief Executive Officer', description: 'Executive oversight, decision approval',
    permissions: ['dashboard.view', 'finance.view', 'merchant.view', 'proof.view', 'proof.export', 'scenario.manage', 'decision.propose', 'decision.approve', 'strategy.view', 'strategy.manage', 'report.generate', 'ai.use', 'kpi.calculate'],
  },
  cfo: {
    name: 'Chief Financial Officer', description: 'Finance owner, approvals, verification',
    permissions: ['dashboard.view', 'finance.view', 'finance.manage', 'finance.approve', 'finance.lock_period', 'treasury.reconcile', 'merchant.view', 'merchant.pricing', 'data.import', 'data.approve_import', 'kpi.calculate', 'kpi.verify', 'proof.view', 'proof.export', 'scenario.manage', 'decision.propose', 'strategy.view', 'report.generate', 'ai.use', 'admin.audit'],
  },
  finance_manager: {
    name: 'Finance Manager', description: 'Prepares data, reconciliations and budgets; cannot approve own work',
    permissions: ['dashboard.view', 'finance.view', 'finance.manage', 'treasury.reconcile', 'merchant.view', 'data.import', 'kpi.calculate', 'proof.view', 'proof.export', 'scenario.manage', 'decision.propose', 'strategy.view', 'report.generate', 'ai.use'],
  },
  analyst: {
    name: 'Analyst', description: 'Read access plus scenarios',
    permissions: ['dashboard.view', 'finance.view', 'merchant.view', 'proof.view', 'scenario.manage', 'strategy.view', 'ai.use'],
  },
  auditor: {
    name: 'Auditor (read-only)', description: 'Read-only access to evidence and audit trail',
    permissions: ['dashboard.view', 'finance.view', 'merchant.view', 'proof.view', 'proof.export', 'strategy.view', 'admin.audit'],
  },
  board_chair: {
    name: 'Board Chair', description: 'Approves executive decisions (independent of the CEO); read access to evidence and reports',
    permissions: ['dashboard.view', 'finance.view', 'merchant.view', 'proof.view', 'proof.export', 'decision.approve', 'strategy.view', 'report.generate'],
  },
  viewer: { name: 'Viewer', description: 'Dashboards only', permissions: ['dashboard.view', 'strategy.view'] },
};
