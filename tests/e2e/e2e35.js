// BizPilot cash forecast: unpaid MUR invoices by due date (overdue, next 4 weeks, later, none) and the clients most overdue.
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

  await page.goto(B + '/login.php');
  await page.fill('#email', 'admin@example.com'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  await page.click('button[data-module="facturo"]'); await page.waitForSelector('a[href="/app.php?m=facturo"]');
  await page.click('button[data-module="bizpilot"]'); await page.waitForSelector('a[href="/app.php?m=bizpilot"]');
  const api = (url, p) => page.evaluate(async ([u, p]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(p) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, [url, p]);
  await page.goto(B + '/app.php?m=facturo');
  await api('/api/suite/organization', { name: 'Ocean Tech', legal_name: 'Ocean Tech Ltd', brn: 'C12345678', vat_number: 'VAT27000000', address: 'Ebène', email: '', phone: '', document_language: 'fr' });
  await api('/api/facturo/clients', { action: 'save', id: 0, name: 'Hôtel Le Lagon', email: 'compta@lagon.mu' });
  await api('/api/facturo/clients', { action: 'save', id: 0, name: 'Le Pétrin', email: 'compta@petrin.mu' });

  const draft = async (client, price, currency = 'MUR') => {
    await page.goto(B + '/app.php?m=facturo&p=edit&type=invoice');
    await page.selectOption('#client_id', { label: client });
    await page.selectOption('#currency', currency);
    const r = page.locator('#lines tr.line').first();
    await r.locator('[name=description]').fill('Service'); await r.locator('[name=nature]').selectOption('SERVICES');
    await r.locator('[name=quantity]').fill('1'); await r.locator('[name=unit_price]').fill(price); await r.locator('[name=tax_code]').selectOption('TC03');
    await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
    const id = page.url().match(/id=(\d+)/)[1];
    await Promise.all([page.waitForSelector('.doc-meta'), page.click('button[data-doc-action="issue"]')]);
    return id;
  };
  const due = (id, days) => sql(`UPDATE facturo_documents SET due_date = ${days === null ? 'NULL' : 'CURDATE() + INTERVAL ' + days + ' DAY'} WHERE id = ${id}`);

  due(await draft('Hôtel Le Lagon', '500'), -10);
  due(await draft('Le Pétrin', '300'), -40);
  const w1 = await draft('Hôtel Le Lagon', '1000'); due(w1, 2);
  due(await draft('Le Pétrin', '700'), 10);
  due(await draft('Hôtel Le Lagon', '900'), 40);
  due(await draft('Le Pétrin', '400'), null);
  const paid = await draft('Hôtel Le Lagon', '5000'); due(paid, -5);
  await page.click('button[data-doc-action="status"][data-status="paid"]'); await page.waitForSelector('.status--paid');
  due(await draft('Le Pétrin', '200', 'EUR'), -3);
  await page.goto(B + '/app.php?m=facturo&p=edit&id=' + w1);
  await page.click('button[data-doc-action="credit"]'); await page.waitForSelector('#document-form');
  await page.locator('#lines tr.line').first().locator('[name=unit_price]').fill('200');
  await page.fill('#notes', 'Remise');
  await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
  await Promise.all([page.waitForSelector('.doc-meta'), page.click('button[data-doc-action="issue"]')]);
  sql("INSERT INTO organizations (name) VALUES ('Autre société')");
  sql("INSERT INTO facturo_clients (organization_id, name) SELECT MAX(id), 'Client ailleurs' FROM organizations");
  sql("INSERT INTO facturo_documents (organization_id, type, number, status, client_id, issue_date, due_date, currency, subtotal_cents, tax_cents, total_cents) SELECT organization_id, 'invoice', 'FAC-AUTRE', 'issued', id, CURDATE(), CURDATE() - INTERVAL 2 DAY, 'MUR', 9900000, 0, 9900000 FROM facturo_clients WHERE name = 'Client ailleurs'");
  step('unpaid invoices due 10 and 40 days ago, in 2 days (credited Rs 200), 10 days, 40 days, none; plus a paid one, one in EUR and another company\'s, which must stay out');

  await page.goto(B + '/app.php?m=bizpilot');
  const block = await page.textContent('#bp-cash');
  const titles = await page.$$eval('#bp-cash svg title', ts => ts.map(t => t.textContent));
  const t = (label) => titles.find(x => x.startsWith(label)) || '';
  assert(block.includes('total Rs 3,600.00'), 'total ' + block);
  assert(t('En retard').includes('Rs 800.00, 2 facture(s)'), 'late ' + t('En retard'));
  assert(t('7 jours').includes('Rs 800.00, 1 facture(s)'), 'this week, net of the credit note ' + t('7 jours'));
  assert(t('Sem. 2').includes('Rs 700.00') && t('Sem. 3').includes('Rs 0.00') && t('Sem. 4').includes('Rs 0.00'), 'weeks ' + titles.join(' | '));
  assert(t('Plus tard').includes('Rs 900.00') && t('Sans éch.').includes('Rs 400.00'), 'later / no due ' + titles.join(' | '));
  const late = (await page.textContent('#bp-cash table')).replace(/\s+/g, ' ');
  assert(/Hôtel Le Lagon .*Rs 500\.00.*Le Pétrin .*Rs 300\.00/.test(late) && !late.includes('Client ailleurs') && !late.includes('5,000'), 'late clients, largest first ' + late);
  const lagon = sql("SELECT id FROM facturo_clients WHERE name = 'Hôtel Le Lagon'");
  assert(await page.locator(`#bp-cash a[href="/facturo/statement.php?client=${lagon}"]`).count() === 1, 'link to the statement');
  step('BizPilot « Encaissements attendus »: Rs 3,600 in all; overdue Rs 800 (2 invoices), 7 days Rs 800 (net of the credit note), week 2 Rs 700, later Rs 900, no due date Rs 400; paid, EUR and other company left out; late clients largest first, each opening its statement');

  assert(errors.length === 0, 'console errors: ' + errors.join(' | '));
  console.log('console errors: none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
