/**
 * FINAL PRODUCT ACCEPTANCE TEST (spec §36), driven through the real UI and API.
 * BASE_URL must point to a server whose database was freshly seeded (npm run db:seed).
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const PW = process.env.DEMO_PASSWORD ?? 'Demo-Passw0rd-2026';
const steps = [];
const step = async (name, fn) => { const t = Date.now(); try { const r = await fn(); steps.push(['PASS', name, Date.now() - t]); console.log(`PASS  ${name}`); return r; } catch (e) { steps.push(['FAIL', name, Date.now() - t]); console.log(`FAIL  ${name}\n      ${e.message.split('\n')[0]}`); throw e; } };

async function login(browser, email) {
  const ctx = await browser.newContext({ baseURL: BASE }); const p = await ctx.newPage();
  await p.goto('/login'); await p.fill('#email', email); await p.fill('#password', PW);
  await Promise.all([p.waitForURL(/executive/, { timeout: 180000 }), p.click('button[type=submit]')]);
  return p;
}
const main = async (p) => (await p.textContent('main')) ?? '';
async function createScenario(p, merchantId, name, params) {
  const qs = new URLSearchParams({ template: 'merchant_repricing', merchantId, group: 'LAGOON-2026-11', ...params }).toString();
  await p.goto(`/decisions/new?${qs}`); await p.fill('#name', name);
  await Promise.all([p.waitForURL(/decisions\/scenarios\//, { timeout: 180000 }), p.click('button[type=submit]')]);
  return p.url().split('/').pop();
}

(async () => {
  const browser = await chromium.launch();
  try {
    const ceo = await login(browser, 'ceo@mips.demo');
    const lagoonId = await step('1. CEO opens Executive OS; dashboard flags Lagoon Resorts contribution-margin decline', async () => {
      await ceo.goto('/executive?range=m:2026-09');
      const link = ceo.locator('text=Contribution margin decline — Lagoon Resorts Group (DEMO)').locator('xpath=..').locator('a:has-text("Investigate")');
      const href = await link.getAttribute('href'); assert.ok(href, 'investigate link'); return href.split('/merchants/')[1].split('?')[0];
    });
    await step('2. Merchant Profitability Intelligence shows transactions, fees and revenue for Lagoon', async () => {
      await ceo.goto(`/merchants/${lagoonId}?range=m:2026-10`);
      const t = await main(ceo); assert.match(t, /Lagoon Resorts Group/); assert.match(t, /SBM-FS-2026-09/); assert.match(t, /Gross acquiring fees/);
      await ceo.goto(`/merchants/${lagoonId}/transactions?range=m:2026-10`); assert.match(await main(ceo), /DEMO-2026/);
      await ceo.goto(`/merchants/${lagoonId}?range=m:2026-10`);
    });
    await step('3. CEO discovers wholesale processing costs increased (fee schedule 160 → 195 bps)', async () => {
      const t = await main(ceo); assert.match(t, /SBM-FS-2026-09-INTL[^]*195\.00/); assert.match(t, /Wholesale rate/);
    });
    const ids = await step('4. CEO creates three pricing scenarios in the Decision Center', async () => [
      await createScenario(ceo, lagoonId, 'A — Pass through +25 bps', { mdrChangeBps: '25', churnProbability: '0.15' }),
      await createScenario(ceo, lagoonId, 'B — Migrate 60% of volume to MCB', { migrateShare: '0.6', migrateWholesaleDeltaBps: '-14', oneOffCost: '40000' }),
      await createScenario(ceo, lagoonId, 'C — Partial +10 bps', { mdrChangeBps: '10', churnProbability: '0.05' }),
    ]);
    await step('5. The application calculates revenue, profitability and cash-flow impact and compares them', async () => {
      await ceo.goto(`/decisions/compare?ids=${ids.join(',')}`);
      const t = await main(ceo); for (const k of ['Incremental revenue', 'EBITDA impact', 'Cash-flow impact', 'Payback', 'Highest horizon EBITDA']) assert.ok(t.includes(k), k);
    });
    await step('6. Proof Center verifies calculations against original transactions and pricing agreements', async () => {
      await ceo.goto(`/proof/merchant/${lagoonId}?range=c:2026-08-01..2026-10-31`);
      assert.match(await main(ceo), /0 mismatches/);
      await ceo.goto('/proof/kpi/PAY.CONTRIBUTION?range=m:2026-10'); assert.match(await main(ceo), /Re-computed from source: identical/);
    });
    const decisionUrl = await step('7. CEO selects scenario A, records the decision and assigns the CFO as action owner', async () => {
      await ceo.goto(`/decisions/scenarios/${ids[0]}`);
      const cfoOpt = await ceo.locator('#ownerUserId option', { hasText: 'Demo CFO' }).getAttribute('value'); await ceo.selectOption('#ownerUserId', cfoOpt);
      const adminOpt = await ceo.locator('#approverUserId option', { hasText: 'Demo Administrator' }).getAttribute('value'); await ceo.selectOption('#approverUserId', adminOpt);
      await ceo.fill('#deadline', '2026-11-15');
      await Promise.all([ceo.waitForURL(/\/decisions\/[0-9a-f-]{36}$/, { timeout: 180000 }), ceo.click('button:has-text("Record decision for approval")')]);
      return ceo.url();
    });
    const admin = await login(browser, 'admin@mips.demo');
    const sel = admin.locator('select[name=tenantId]');
    if ((await sel.count()) > 0 && (await sel.inputValue()) !== (await sel.locator('option', { hasText: 'MIPSIT Digital Ltd (DEMO)' }).getAttribute('value'))) {
      await sel.selectOption({ label: 'MIPSIT Digital Ltd (DEMO)' });
      await admin.waitForFunction(() => document.querySelector('select[name=tenantId]')?.selectedOptions[0]?.textContent?.includes('MIPSIT'), null, { timeout: 60000 });
    }
    await step('8. Decision approved by a second approver (segregation of duties) and appears in Strategy Execution', async () => {
      await admin.goto(decisionUrl); await admin.fill('input[name=note]', 'Approved by Board delegate'); await admin.click('button:has-text("Approve decision")');
      await admin.waitForSelector('text=approved', { timeout: 60000 }); await admin.reload();
      const t = await main(admin); assert.match(t, /INI-D/); assert.match(t, /ACT-D/);
      await admin.goto('/strategy'); assert.match(await main(admin), /Implement DEC-/);
    });
    const cfo = await login(browser, 'cfo@mips.demo');
    await step('9. Implementation: CFO records the new effective-dated pricing agreement (+25 bps international, from 1 Nov 2026)', async () => {
      const r = await cfo.request.post(`/api/v1/merchants/${lagoonId}/pricing-agreements`, { headers: { origin: BASE }, data: { card_region: 'international', mdr_bps: '320', effective_from: '2026-11-01', contract_ref: 'PA-M001-02-INTL (DEC repricing)' } });
      assert.equal(r.status(), 200, await r.text());
      const id = decisionUrl.split('/').pop();
      const s = await cfo.request.post(`/api/v1/decisions/${id}/in_progress`, { headers: { origin: BASE }, data: { note: 'Agreement PA-M001-02-INTL issued' } }); assert.equal(s.status(), 200, await s.text());
    });
    await step('10. Next reporting period: November transactions imported (finance uploads, CFO approves & commits)', async () => {
      const fin = await login(browser, 'finance@mips.demo');
      const rows = ['external_ref,merchant_code,product_code,acquirer_code,payment_method,card_region,status,txn_currency,amount,event_at'];
      for (let i = 0; i < 400; i++) { const d = String(1 + (i % 14)).padStart(2, '0'); rows.push(`E2E-NOV-${i},M001,${i % 3 ? 'ECOM' : 'POS'},${i % 7 ? 'SBM' : 'MCB'},${i % 2 ? 'visa' : 'mastercard'},${i % 4 ? 'international' : 'domestic'},${i % 29 ? 'success' : 'failed'},MUR,${(18000 + (i * 137) % 15000).toFixed(2)},2026-11-${d}T${String(8 + (i % 12)).padStart(2, '0')}:15:00+04:00`); }
      await fin.goto('/integrations'); await fin.setInputFiles('#file', { name: 'lagoon-2026-11-gateway.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });
      await Promise.all([fin.waitForURL(/batches\//, { timeout: 180000 }), fin.click('button:has-text("Upload & detect schema")')]);
      const url = fin.url(); assert.match(await main(fin), /Valid\s*400/);
      await cfo.goto(url); await cfo.click('button:has-text("Approve import")'); await cfo.waitForSelector('button:has-text("Commit (transactional)")', { timeout: 60000 });
      cfo.once('dialog', (d) => d.accept()); await cfo.click('button:has-text("Commit (transactional)")');
      await cfo.waitForTimeout(5000); await cfo.goto(url); await cfo.waitForSelector('text=400 committed = 400 validated', { timeout: 180000 });
    });
    await step('11. System compares actual performance against the approved scenario', async () => {
      await cfo.goto(decisionUrl); await cfo.click('button:has-text("Measure actual outcome now")'); await cfo.waitForTimeout(3000); await cfo.reload();
      const t = await main(cfo); assert.match(t, /Actual monthly contribution/); assert.match(t, /Variance vs expected/);
    });
    await step('12. CEO generates a Board report: issue, evidence, approved decision and measured outcome', async () => {
      await ceo.goto('/reports?range=m:2026-11'); await ceo.selectOption('#kind', 'decision_outcome');
      const decId = decisionUrl.split('/').pop(); await ceo.selectOption('#decisionId', decId);
      await Promise.all([ceo.waitForURL(/\/reports\/[0-9a-f-]{36}$/, { timeout: 180000 }), ceo.click('button:has-text("Generate & freeze report")')]);
      const t = await main(ceo); for (const h of ['1. Original issue', '2. Supporting evidence', '3. Approved decision', '4. Measured outcome', 'Independent fee re-computation']) assert.ok(t.includes(h), h);
      const pdf = await ceo.request.get(`/api/v1/reports/${ceo.url().split('/').pop()}/export?format=pdf`); assert.equal(pdf.status(), 200);
      assert.equal((await pdf.body()).subarray(0, 4).toString(), '%PDF');
    });
  } finally {
    await browser.close();
    const fails = steps.filter((s) => s[0] === 'FAIL').length;
    console.log(`\n${steps.length - fails}/${steps.length} acceptance steps passed`);
    process.exitCode = fails || steps.length < 12 ? 1 : 0;
  }
})().catch(() => { process.exitCode = 1; });
