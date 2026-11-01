/**
 * Connector registry. API connectors are secure adapters whose credentials come
 * only from environment/secrets management. None is active without credentials;
 * file-based import paths for the same systems work today.
 */
import type { ImportKind } from './kinds';

export interface Connector { key: string; name: string; description: string; mode: 'file' | 'api'; requires: string[]; importKinds: ImportKind[]; note: string }

export const CONNECTORS: Connector[] = [
  { key: 'file', name: 'File upload (CSV / Excel)', description: 'Universal import path with mapping, validation and approval.', mode: 'file', requires: [], importKinds: ['transactions', 'gl_entries', 'bank_transactions', 'merchants', 'fee_schedules', 'customer_invoices', 'budget_lines'], note: 'Always available.' },
  { key: 'odoo', name: 'Odoo', description: 'General ledger (Journal Items), customer invoices and partners via XML-RPC/JSON-RPC.', mode: 'api', requires: ['ODOO_URL', 'ODOO_DB', 'ODOO_USER', 'ODOO_API_KEY'], importKinds: ['gl_entries', 'customer_invoices'], note: 'API sync not implemented in this release — use Odoo CSV/XLSX exports (column aliases map automatically).' },
  { key: 'quickbooks', name: 'QuickBooks Online', description: 'Journal report, invoices and P&L via the QuickBooks Online Accounting API (OAuth 2.0).', mode: 'api', requires: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_REALM_ID', 'QBO_REFRESH_TOKEN'], importKinds: ['gl_entries', 'customer_invoices'], note: 'API sync not implemented in this release — use QuickBooks report exports.' },
  { key: 'mips_gateway', name: 'MIPS gateway', description: 'Transaction & settlement reports from the MIPS orchestration platform.', mode: 'file', requires: [], importKinds: ['transactions'], note: 'Scheduled SFTP/API feed planned; daily CSV export supported now.' },
  { key: 'bank_api', name: 'Banking APIs (MCB / SBM)', description: 'Statement retrieval via bank APIs / host-to-host.', mode: 'api', requires: ['BANK_API_BASE_URL', 'BANK_API_CLIENT_CERT'], importKinds: ['bank_transactions'], note: 'Future integration; internet-banking statement exports supported now.' },
];

export function connectorStatus(c: Connector) {
  return { configured: c.requires.length === 0 || c.requires.every((k) => Boolean(process.env[k])) };
}
