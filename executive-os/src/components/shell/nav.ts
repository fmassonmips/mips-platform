export const NAV = [
  { group: 'Overview', items: [{ href: '/executive', label: 'Executive Overview', icon: 'LayoutDashboard', perm: 'dashboard.view' }] },
  { group: 'Finance', items: [
    { href: '/financial-performance', label: 'Financial Performance', icon: 'LineChart', perm: 'finance.view' },
    { href: '/revenue', label: 'Revenue Intelligence', icon: 'TrendingUp', perm: 'finance.view' },
    { href: '/costs', label: 'Operating Costs', icon: 'Receipt', perm: 'finance.view' },
    { href: '/budget', label: 'Budget & Forecast', icon: 'Target', perm: 'finance.view' },
    { href: '/pnl', label: 'Profit & Loss', icon: 'FileSpreadsheet', perm: 'finance.view' },
  ] },
  { group: 'Treasury', items: [
    { href: '/cash-flow', label: 'Cash Flow', icon: 'Wallet', perm: 'finance.view' },
    { href: '/treasury-forecast', label: 'Treasury Forecast', icon: 'CalendarClock', perm: 'finance.view' },
    { href: '/receivables', label: 'Accounts Receivable', icon: 'HandCoins', perm: 'finance.view' },
    { href: '/suppliers', label: 'Supplier Payments', icon: 'Truck', perm: 'finance.view' },
    { href: '/liquidity', label: 'Liquidity & Runway', icon: 'LifeBuoy', perm: 'finance.view' },
  ] },
  { group: 'Payment economics', items: [
    { href: '/merchants', label: 'Merchant Intelligence', icon: 'Store', perm: 'merchant.view' },
    { href: '/products', label: 'Product Profitability', icon: 'Boxes', perm: 'merchant.view' },
    { href: '/break-even', label: 'Break-Even Analysis', icon: 'Scale', perm: 'merchant.view' },
  ] },
  { group: 'Assurance', items: [
    { href: '/formula-audit', label: 'Formula Audit', icon: 'Sigma', perm: 'proof.view' },
    { href: '/proof', label: 'Financial Proof Center', icon: 'ShieldCheck', perm: 'proof.view' },
  ] },
  { group: 'Execution', items: [
    { href: '/decisions', label: 'CEO Decision Center', icon: 'Gavel', perm: 'dashboard.view' },
    { href: '/strategy', label: 'Strategy Execution', icon: 'Flag', perm: 'strategy.view' },
    { href: '/reports', label: 'Reports & Board Pack', icon: 'FileText', perm: 'dashboard.view' },
  ] },
  { group: 'Platform', items: [
    { href: '/integrations', label: 'Data Integrations', icon: 'Plug', perm: 'data.import' },
    { href: '/admin', label: 'Administration', icon: 'Settings', perm: 'admin.settings' },
  ] },
] as const;
