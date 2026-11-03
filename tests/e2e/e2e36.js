// Facturo catalogue: usual products and services, managed by owner/admin, picked in one click in a draft.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const err = async (p = page) => { await p.waitForSelector('#facturo-error:not([hidden])'); const t = (await p.textContent('#facturo-error')).trim(); await p.evaluate(() => { document.getElementById('facturo-error').hidden = true; }); return t; };

  await page.goto(B + '/login.php');
  await page.fill('#email', 'admin@example.com'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  await page.click('button[data-module="facturo"]'); await page.waitForSelector('a[href="/app.php?m=facturo"]');
  const api = (p, url, body) => p.evaluate(async ([u, b]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, [url, body]);
  await page.goto(B + '/app.php?m=facturo');
  await api(page, '/api/suite/organization', { name: 'Ocean Tech', legal_name: 'Ocean Tech Ltd', brn: 'C12345678', vat_number: 'VAT27000000', address: 'Ebène', email: '', phone: '', document_language: 'fr' });
  await api(page, '/api/facturo/clients', { action: 'save', id: 0, name: 'Hôtel Le Lagon', email: 'compta@lagon.mu' });

  // 1. Manage the catalogue
  await page.goto(B + '/app.php?m=facturo&p=items');
  const add = async (name, price, tax, nature) => {
    await page.fill('#i-name', name); await page.fill('#i-price', price);
    await page.selectOption('#i-tax', tax); await page.selectOption('#i-nature', nature);
    await page.click('#item-form button[type=submit]');
  };
  assert(await page.inputValue('#i-tax') === 'TC01', 'default VAT 15 % for a VAT-registered company');
  await add('Journée de conseil', '12000', 'TC01', 'SERVICES'); await page.waitForSelector('text=Journée de conseil');
  await add('Câble HDMI', '450.50', 'TC01', 'GOODS'); await page.waitForSelector('text=Câble HDMI');
  await add('Formation (exonérée)', '3000', 'TC03', 'SERVICES'); await page.waitForSelector('text=Formation (exonérée)');
  await add('Journée de conseil', '1', 'TC01', 'SERVICES');
  assert((await err()).includes('déjà ce libellé'), 'duplicate name refused');
  await page.click('#item-form button[type=reset]');
  await add('Prix faux', '12,000', 'TC01', 'SERVICES');
  assert((await err()).includes('Prix unitaire HT invalide'), 'bad price refused');
  await page.click('#item-form button[type=reset]');
  await page.click('tr:has-text("Câble HDMI") [data-edit-item]');
  await page.fill('#i-price', '500');
  await Promise.all([page.waitForNavigation(), page.click('#item-form button[type=submit]')]);
  const table = (await page.textContent('#items-table')).replace(/\s+/g, ' ');
  assert(table.includes('Câble HDMI Bien TVA 15 % Rs 500.00') && table.includes('Formation (exonérée) Service Exonéré / sans TVA Rs 3,000.00'), 'list ' + table);
  step('owner adds three items (VAT 15 % by default), edits one; a duplicate name and a price « 12,000 » are refused');

  // 2. Pick items in a draft
  await page.goto(B + '/app.php?m=facturo&p=edit&type=invoice');
  await page.selectOption('#client_id', { label: 'Hôtel Le Lagon' });
  const pick = async (name) => { const v = await page.$eval('#add-item', (s, n) => [...s.options].find(o => o.textContent.startsWith(n)).value, name); await page.selectOption('#add-item', v); };
  await pick('Journée de conseil');
  assert(await page.locator('#lines tr.line').count() === 1, 'fills the empty first line');
  await page.locator('#lines tr.line').first().locator('[name=quantity]').fill('2');
  await pick('Câble HDMI');
  await pick('Formation (exonérée)');
  assert(await page.locator('#lines tr.line').count() === 3 && await page.inputValue('#add-item') === '', 'one new line per item, picker reset');
  const tot = (await page.textContent('#total-all')).trim();
  assert(tot === 'Rs 31,175.00', 'live total: 2×12000×1.15 + 500×1.15 + 3000 = 31,175 → ' + tot);
  await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
  const id = page.url().match(/id=(\d+)/)[1];
  await Promise.all([page.waitForSelector('.doc-meta'), page.click('button[data-doc-action="issue"]')]);
  const doc = sql(`SELECT CONCAT(subtotal_cents, '/', tax_cents, '/', total_cents) FROM facturo_documents WHERE id = ${id}`);
  assert(doc === '2750000/367500/3117500', 'server totals ' + doc);
  const lines = sql(`SELECT GROUP_CONCAT(CONCAT(description, '|', quantity, '|', unit_price_cents, '|', tax_code, '|', nature) ORDER BY position SEPARATOR ';') FROM facturo_document_lines WHERE document_id = ${id}`);
  assert(lines === 'Journée de conseil|2.000|1200000|TC01|SERVICES;Câble HDMI|1.000|50000|TC01|GOODS;Formation (exonérée)|1.000|300000|TC03|SERVICES', 'lines ' + lines);
  sql("UPDATE facturo_items SET unit_price_cents = 999900 WHERE name = 'Journée de conseil'");
  assert(sql(`SELECT total_cents FROM facturo_documents WHERE id = ${id}`) === '3117500', 'issued invoice untouched by a later price change');
  step('in a new invoice, picking items fills the first empty line then adds one line each (description, price HT, VAT, nature); live total Rs 31,175.00 = server total; a later price change leaves the issued invoice as it was');

  // 3. Credit notes have no picker; a member uses the catalogue but cannot change it
  await page.goto(B + '/app.php?m=facturo&p=edit&id=' + id);
  await page.click('button[data-doc-action="credit"]'); await page.waitForSelector('#document-form');
  assert(await page.locator('#add-item').count() === 0, 'no picker on a credit note');
  sql("INSERT INTO users (email, password_hash, name, is_active) VALUES ('kevin@oceantech.mu', '" + execFileSync('php', ['-r', 'echo password_hash("Kevin2026!", PASSWORD_DEFAULT);']).toString() + "', 'Kevin', 1)");
  sql("INSERT INTO organization_users (organization_id, user_id, role) SELECT 1, id, 'member' FROM users WHERE email = 'kevin@oceantech.mu'");
  const k = await (await browser.newContext()).newPage();
  k.on('pageerror', e => errors.push(e.message));
  await k.goto(B + '/login.php'); await k.fill('#email', 'kevin@oceantech.mu'); await k.fill('#password', 'Kevin2026!');
  await Promise.all([k.waitForURL('**/dashboard.php'), k.click('#submit-btn')]);
  await k.goto(B + '/app.php?m=facturo&p=items');
  assert(await k.locator('#item-form').count() === 0 && await k.locator('[data-edit-item]').count() === 0 && (await k.textContent('#items-table')).includes('Câble HDMI'), 'member: list only');
  const r = await api(k, '/api/facturo/items', { action: 'save', id: 0, name: 'Pirate', unit_price: '1', tax_code: 'TC01', nature: 'GOODS' });
  assert(r.status === 403 && sql("SELECT COUNT(*) FROM facturo_items WHERE name = 'Pirate'") === '0', 'member cannot add ' + r.status);
  await k.goto(B + '/app.php?m=facturo&p=edit&type=quote');
  assert(await k.locator('#add-item option').count() === 4, 'member can pick items in a quote');
  step('no catalogue picker on a credit note; a member sees the list, picks items in a quote, but cannot change the catalogue (403)');

  // 4. Delete; isolation
  sql("INSERT INTO organizations (name) VALUES ('Autre société')");
  sql("INSERT INTO facturo_items (organization_id, name, unit_price_cents, tax_code, nature) SELECT MAX(id), 'Article ailleurs', 100, 'TC01', 'GOODS' FROM organizations");
  const foreign = sql("SELECT id FROM facturo_items WHERE name = 'Article ailleurs'");
  assert((await api(page, '/api/facturo/items', { action: 'delete', id: Number(foreign) })).status === 404 && sql(`SELECT COUNT(*) FROM facturo_items WHERE id = ${foreign}`) === '1', 'another company\'s item untouched');
  assert((await api(page, '/api/facturo/items', { action: 'save', id: Number(foreign), name: 'Volé', unit_price: '1', tax_code: 'TC01', nature: 'GOODS' })).status === 404, 'nor editable');
  await page.goto(B + '/app.php?m=facturo&p=items');
  assert(!(await page.textContent('#items-table')).includes('Article ailleurs'), 'not listed');
  await Promise.all([page.waitForNavigation(), page.click('tr:has-text("Câble HDMI") [data-delete-item]')]);
  assert(!(await page.textContent('#items-table')).includes('Câble HDMI') && sql(`SELECT COUNT(*) FROM facturo_document_lines WHERE document_id = ${id}`) === '3', 'deleted; invoice lines kept');
  step('deleting an item keeps the invoices that used it; another company\'s item is neither listed, edited nor deleted');

  assert(errors.length === 0, 'console errors: ' + errors.join(' | '));
  console.log('console errors: none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
