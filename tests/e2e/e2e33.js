// Facturo accounting export: monthly sales journal and VAT summary for the accountant (owner/admin only).
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);
const ymd = (d) => new Date(d.getTime() + 4 * 3600e3).toISOString().slice(0, 10);   // Mauritius date
const today = ymd(new Date());
const thisMonth = today.slice(0, 7);
const lastMonthDay = (() => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(1); d.setUTCDate(0); return d.toISOString().slice(0, 7) + '-15'; })();
const lastMonth = lastMonthDay.slice(0, 7);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  await page.goto(B + '/login.php');
  await page.fill('#email', 'admin@example.com'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  await page.click('button[data-module="facturo"]'); await page.waitForSelector('a[href="/app.php?m=facturo"]');
  const api = (url, p) => page.evaluate(async ([u, p]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(p) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, [url, p]);
  await page.goto(B + '/app.php?m=facturo');
  await api('/api/suite/organization', { name: 'Ocean Tech', legal_name: 'Ocean Tech Ltd', brn: 'C12345678', vat_number: 'VAT27000000', address: 'Ebène', email: '', phone: '', document_language: 'fr' });
  await api('/api/facturo/clients', { action: 'save', id: 0, name: '=HYPERLINK("http://x")', email: 'piege@client.mu', brn: 'C87654321' });

  const draft = async (price, code, date, currency = 'MUR') => {
    await page.goto(B + '/app.php?m=facturo&p=edit&type=invoice');
    await page.selectOption('#client_id', { index: 1 });
    await page.fill('#issue_date', date);
    await page.selectOption('#currency', currency);
    const r = page.locator('#lines tr.line').first();
    await r.locator('[name=description]').fill('Service'); await r.locator('[name=nature]').selectOption('SERVICES');
    await r.locator('[name=quantity]').fill('1'); await r.locator('[name=unit_price]').fill(price); await r.locator('[name=tax_code]').selectOption(code);
    await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
    return page.url().match(/id=(\d+)/)[1];
  };
  const issue = async () => { await Promise.all([page.waitForSelector('.doc-meta'), page.click('button[data-doc-action="issue"]')]); };

  // Last month first (an invoice may not be dated before the last one issued)
  await draft('400', 'TC01', lastMonthDay); await issue();
  const a = await draft('1000', 'TC01', today); await issue();
  await draft('500', 'TC02', today); await issue();
  await draft('300', 'TC03', today); await issue();
  await draft('2000', 'TC01', today); await issue();
  await draft('200', 'TC01', today, 'EUR'); await issue();
  await draft('999', 'TC01', today);   // stays a draft
  await page.goto(B + '/app.php?m=facturo&p=edit&id=' + a);
  await page.click('button[data-doc-action="credit"]'); await page.waitForSelector('#document-form');
  await page.fill('#notes', 'Annulation');
  await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
  await issue();
  sql("INSERT INTO facturo_documents (organization_id, type, number, status, client_id, issue_date, currency, subtotal_cents, tax_cents, total_cents) SELECT 1, 'quote', 'DEV-X', 'sent', id, CURDATE(), 'MUR', 777700, 0, 777700 FROM facturo_clients LIMIT 1");
  sql("INSERT INTO organizations (name) VALUES ('Autre société')");
  const other = sql("SELECT MAX(id) FROM organizations");
  sql(`INSERT INTO facturo_clients (organization_id, name) VALUES (${other}, 'Client ailleurs')`);
  sql(`INSERT INTO facturo_documents (organization_id, type, number, status, client_id, issue_date, currency, subtotal_cents, tax_cents, total_cents) SELECT ${other}, 'invoice', 'FAC-AUTRE', 'issued', MAX(id), CURDATE(), 'MUR', 5000000, 750000, 5750000 FROM facturo_clients WHERE organization_id = ${other}`);
  step('issued: one invoice last month, four this month (15 %, zero-rated, exempt, 15 %), one in EUR, a full credit note on the first 15 % one; plus a draft, a quote and another company\'s invoice that must stay out');

  // 1. The tab and its summary
  await page.goto(B + '/app.php?m=facturo&p=accounting&month=' + thisMonth);
  const vat = (await page.textContent('#acc-vat')).replace(/\s+/g, ' ');
  assert(vat.includes('TVA 15 %') && vat.includes('Rs 2,000.00') && vat.includes('Rs 300.00'), '15 % net of the credit note: ' + vat);
  assert(vat.includes('Taux zéro') && vat.includes('Rs 500.00') && vat.includes('Exonéré') && vat.replace(/ /g, '').includes('TotalenroupiesRs2,800.00Rs300.00'), 'other codes and total: ' + vat);
  assert(!vat.includes('7,777') && !vat.includes('50,000') && !vat.includes('999'), 'no quote, no draft, no other company');
  assert((await page.textContent('.card')).includes('1 document(s) en EUR'), 'EUR counted apart');
  await page.goto(B + '/app.php?m=facturo&p=accounting');
  assert(await page.inputValue('#acc-month') === lastMonth && (await page.textContent('#acc-vat')).includes('Rs 400.00'), 'defaults to last month');
  step('Comptabilité tab: VAT by MRA code net of credit notes (15 %: Rs 2,000 / VAT Rs 300; zero-rated Rs 500; exempt Rs 300; total Rs 2,800 / Rs 300); the EUR invoice counted apart; drafts, quotes and other companies left out; opens on last month');

  // 2. The files
  const get = async (f, month = thisMonth) => page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, type: r.headers.get('content-type'), disp: r.headers.get('content-disposition'), body: await r.text() }; },
    `/facturo/accounting.php?month=${month}&f=${f}`);
  const j = await get('journal');
  assert(j.status === 200 && j.type.startsWith('text/csv') && j.disp.includes(`journal-ventes-${thisMonth}.csv`), 'journal headers ' + JSON.stringify([j.status, j.type, j.disp]));
  const lines = j.body.replace(/^﻿/, '').trim().split(/\r?\n/);
  assert(lines[0].startsWith('date,type,numero,facture_d_origine,client'), 'journal header ' + lines[0]);
  assert(lines.length === 1 + 6, 'six documents this month: ' + lines.length + '\n' + j.body);
  const avoir = lines.find(l => l.includes(',Avoir,'));
  assert(avoir && avoir.includes(',-1000.00,-150.00,-1150.00,') && /,FAC-\d{4}-0002,/.test(avoir), 'credit note negative, with its invoice: ' + avoir);
  assert(lines.some(l => l.includes(',EUR,200.00,30.00,230.00,')), 'EUR row in the journal');
  assert(lines.slice(1).every(l => l.includes(`"'=HYPERLINK(""http://x"")"`)) && !j.body.includes(',=HYPERLINK'), 'formula neutralised');
  assert(!j.body.includes('FAC-AUTRE') && !j.body.includes('DEV-X'), 'nothing from elsewhere');
  const v = await get('vat');
  assert(v.status === 200 && v.body.includes('TC01,"TVA 15 %",15,2000.00,300.00') && v.body.includes(',Total,,2800.00,300.00') && v.body.includes('Non inclus : 1 document(s) en EUR'), 'vat csv ' + v.body);
  const p = await get('print');
  assert(p.status === 200 && p.body.includes('Ventes et TVA') && p.body.includes('Ocean Tech Ltd') && p.body.includes('-Rs 1,000.00'), 'printable');
  assert((await get('journal', lastMonth)).body.trim().split(/\r?\n/).length === 2, 'last month: one invoice');
  assert((await get('journal', '2026-13')).status === 400 && (await get('nope')).status === 400, 'bad month or format refused');
  step('journal CSV (BOM, one row per document, credit note negative with its invoice number, EUR row, formula-looking client name neutralised); VAT CSV with the EUR note; printable page; another month; a bad month or format refused');

  // 3. Read-only mode keeps the export; a member has none
  sql("UPDATE organization_modules SET status = 'trial', trial_ends_at = NOW() - INTERVAL 1 DAY WHERE organization_id = 1 AND module_slug = 'facturo'");
  assert((await get('journal')).status === 200, 'read-only: export still allowed');
  sql("INSERT INTO users (email, password_hash, name, is_active) VALUES ('kevin@oceantech.mu', '" + execFileSync('php', ['-r', 'echo password_hash("Kevin2026!", PASSWORD_DEFAULT);']).toString() + "', 'Kevin', 1)");
  sql("INSERT INTO organization_users (organization_id, user_id, role) SELECT 1, id, 'member' FROM users WHERE email = 'kevin@oceantech.mu'");
  const k = await (await browser.newContext()).newPage();
  await k.goto(B + '/login.php'); await k.fill('#email', 'kevin@oceantech.mu'); await k.fill('#password', 'Kevin2026!');
  await Promise.all([k.waitForURL('**/dashboard.php'), k.click('#submit-btn')]);
  await k.goto(B + '/app.php?m=facturo');
  assert(await k.locator('a[href*="p=accounting"]').count() === 0, 'no tab for a member');
  const kr = await k.evaluate(async () => (await fetch('/facturo/accounting.php?month=' + new Date().toISOString().slice(0, 7) + '&f=journal')).status);
  assert(kr === 403, 'member refused ' + kr);
  step('after the trial (read-only) the export still works; a member sees no Comptabilité tab and gets 403');

  assert(errors.length === 0, 'console errors: ' + errors.join(' | '));
  console.log('console errors: none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
