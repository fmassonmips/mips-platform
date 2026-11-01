/** OpenAPI 3.1 description of /api/v1 (served at /api/v1/openapi.json; documented in docs/api.md). */
const range = { name: 'range', in: 'query', schema: { type: 'string' }, description: 'Period: m:YYYY-MM | q:YYYY-Qn | y:YYYY | fy:YYYY | c:YYYY-MM-DD..YYYY-MM-DD | ytd | fytd' };
const id = (n = 'id') => ({ name: n, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
const ok = { '200': { description: 'OK — `{ data, meta }`' }, '400': { description: 'Validation error' }, '401': { description: 'Unauthenticated' }, '403': { description: 'Missing permission or CSRF origin mismatch' }, '404': { description: 'Not found' }, '409': { description: 'Conflict: immutable record, locked period, segregation of duties' }, '429': { description: 'Rate limited' } };
const op = (summary: string, permission: string, extra: any = {}) => ({ summary, description: `Permission: \`${permission}\``, responses: ok, ...extra });
export const OPENAPI = {
  openapi: '3.1.0',
  info: { title: 'MIPS Executive OS API', version: 'v1', description: 'Tenant-scoped REST API. Authenticate with the session cookie (browser; mutations require a same-origin Origin header) or `Authorization: Bearer <api key>`. All monetary values are decimal strings in the tenant base currency.' },
  servers: [{ url: '/api/v1' }],
  components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' }, cookie: { type: 'apiKey', in: 'cookie', name: 'mips_eos_session' } } },
  security: [{ bearer: [] }, { cookie: [] }],
  paths: {
    '/health': { get: { summary: 'Liveness/readiness (no auth)', security: [], responses: { '200': { description: 'ok' }, '503': { description: 'database unreachable' } } } },
    '/kpis': { get: op('KPI results for a period (persisted calculation run)', 'dashboard.view', { parameters: [range] }) },
    '/kpis/{code}': { get: op('KPI proof: definition, formula version, sources, controls, verifications', 'proof.view', { parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }, range] }) },
    '/proof/kpi/{code}/package': { get: op('Evidence package (JSON or ?format=xlsx) with SHA-256 manifest', 'proof.export', { parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }, range] }) },
    '/merchants/profitability': { get: op('Merchant / dimension economics', 'merchant.view', { parameters: [range, { name: 'groupBy', in: 'query', schema: { type: 'string', enum: ['merchant', 'group', 'vertical', 'segment', 'acquirer', 'method', 'scheme', 'region', 'txn_currency', 'settlement_currency', 'product', 'month'] } }, { name: 'allocation', in: 'query', schema: { type: 'string', enum: ['by_revenue', 'by_transactions', 'by_gpv', 'none'] } }] }) },
    '/merchants/{id}/transactions': { get: op('Transaction drill-down with applied pricing & fee schedule', 'merchant.view', { parameters: [id(), range, { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 1000 } }, { name: 'offset', in: 'query', schema: { type: 'integer' } }] }) },
    '/merchants/{id}/pricing-agreements': { get: op('List agreements', 'merchant.view', { parameters: [id()] }), post: op('Create effective-dated agreement (closes previous open one)', 'merchant.pricing', { parameters: [id()], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['mdr_bps', 'effective_from', 'contract_ref'], properties: { payment_method: { type: 'string' }, card_region: { enum: ['domestic', 'international', 'any'] }, mdr_bps: { type: 'string' }, fixed_fee: { type: 'string' }, monthly_saas_fee: { type: 'string' }, effective_from: { type: 'string', format: 'date' }, contract_ref: { type: 'string' } } } } } } }) },
    '/scenarios': { get: op('Templates and scenarios', 'dashboard.view'), post: op('Run & save a scenario', 'scenario.manage') },
    '/scenarios/{id}': { get: op('Scenario with base/proposed/downside results', 'dashboard.view', { parameters: [id()] }) },
    '/decisions': { get: op('Decision register', 'dashboard.view'), post: op('Propose a decision', 'decision.propose') },
    '/decisions/{id}/detail': { get: op('Decision with evidence, execution and history', 'dashboard.view', { parameters: [id()] }) },
    '/decisions/{id}/{op}': { post: op('Workflow: approve | reject (decision.approve) · in_progress | implemented | closed | cancelled (decision.propose) · measure', 'see description', { parameters: [id(), { name: 'op', in: 'path', required: true, schema: { type: 'string' } }] }) },
    '/imports': { get: op('Import batches', 'data.import'), post: op('Upload (multipart: file, kind?) → detection, mapping, validation', 'data.import') },
    '/imports/{id}/status': { get: op('Batch status & validation summary', 'data.import', { parameters: [id()] }) },
    '/imports/{id}/{op}': { post: op('validate (data.import) · approve | reject | commit (data.approve_import; approver ≠ uploader)', 'see description', { parameters: [id(), { name: 'op', in: 'path', required: true, schema: { type: 'string' } }] }) },
    '/imports/{id}/file': { get: op('Original uploaded file (immutable)', 'data.import', { parameters: [id()] }) },
    '/imports/{id}/errors': { get: op('Error & duplicate report (CSV)', 'data.import', { parameters: [id()] }) },
    '/imports/templates/{kind}': { get: op('CSV template', 'data.import', { parameters: [{ name: 'kind', in: 'path', required: true, schema: { type: 'string' } }] }) },
    '/reports': { get: op('Generated reports', 'dashboard.view'), post: op('Generate & freeze a report for ?range', 'report.generate', { parameters: [range] }) },
    '/reports/{id}/export': { get: op('Export: ?format=pdf | xlsx | json', 'dashboard.view', { parameters: [id()] }) },
    '/analyst': { post: op('Ask the grounded AI analyst (?range)', 'ai.use', { parameters: [range] }) },
  },
};
