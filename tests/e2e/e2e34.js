// Facturo client statement: what each client owes, what is late, printable in the client's language.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);
const flat = (s) => s.replace(/\s+/g, ' ');

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
  await api('/api/facturo/clients', { action: 'save', id: 0, name: 'Hôtel Le Lagon', email: 'compta@lagon.mu', brn: 'C87654321' });
  await api('/api/facturo/clients', { action: 'save', id: 0, name: 'Autre client', email: 'autre@client.mu' });
  const lagon = sql("SELECT id FROM facturo_clients WHERE name = 'Hôtel Le Lagon'");

  const draft = async (client, price, code, currency = 'MUR') => {
    await page.goto(B + '/app.php?m=facturo&p=edit&type=invoice');
    await page.selectOption('#client_id', { label: client });
    await page.selectOption('#currency', currency);
    const r = page.locator('#lines tr.line').first();
    await r.locator('[name=description]').fill('Service'); await r.locator('[name=nature]').selectOption('SERVICES');
    await r.locator('[name=quantity]').fill('1'); await r.locator('[name=unit_price]').fill(price); await r.locator('[name=tax_code]').selectOption(code);
    await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
    return page.url().match(/id=(\d+)/)[1];
  };
  const issue = async () => { await Promise.all([page.waitForSelector('.doc-meta'), page.click('button[data-doc-action="issue"]')]); };
  const credit = async (id, price) => {
    await page.goto(B + '/app.php?m=facturo&p=edit&id=' + id);
    await page.click('button[data-doc-action="credit"]'); await page.waitForSelector('#document-form');
    if (price) await page.locator('#lines tr.line').first().locator('[name=unit_price]').fill(price);
    await page.fill('#notes', 'Geste commercial');
    await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
    await issue();
  };

  const a = await draft('Hôtel Le Lagon', '1000', 'TC01'); await issue();
  await page.click('button[data-doc-action="status"][data-status="paid"]'); await page.waitForSelector('.status--paid');
  const b = await draft('Hôtel Le Lagon', '2000', 'TC01'); await issue();
  const c = await draft('Hôtel Le Lagon', '500', 'TC01'); await issue();
  const d = await draft('Hôtel Le Lagon', '1000', 'TC03'); await issue();
  const e = await draft('Hôtel Le Lagon', '300', 'TC03'); await issue();
  await draft('Hôtel Le Lagon', '200', 'TC03', 'EUR'); await issue();
  await draft('Hôtel Le Lagon', '9999', 'TC03');                       // stays a draft
  await draft('Autre client', '7777', 'TC03'); await issue();          // another client
  await credit(d, '400');                                               // partial
  await credit(e);                                                      // full
  sql(`UPDATE facturo_documents SET due_date = CURDATE() - INTERVAL 10 DAY WHERE id = ${c}`);
  step('for one client: a paid invoice, an open one, a late one (due 10 days ago), one partly and one fully credited, one in EUR, a draft; plus another client\'s invoice');

  await page.goto(B + '/app.php?m=facturo&p=clients');
  const href = await page.getAttribute(`a[href="/facturo/statement.php?client=${lagon}"]`, 'href');
  assert(href, 'Relevé link on the client row');
  await page.goto(B + href);
  const rows = flat(await page.textContent('#st-rows'));
  const totals = flat(await page.textContent('#st-totals'));
  assert(rows.includes('Payée') && rows.includes('En retard de 10 j') && rows.includes('Annulée par avoir') && rows.includes('À régler'), 'states: ' + rows);
  assert(rows.includes('Rs 1,000.00 -Rs 400.00 Rs 600.00 À régler') && /Avoir sur FAC-\d{4}-0004/.test(rows), 'partial credit (exempt line): Rs 1,000 - Rs 400 = Rs 600 still due: ' + rows);
  const tot = totals.replace(/ /g, '');
  assert(tot.includes('Totalrestantdû(MUR)Rs3,475.00') && tot.includes('dontenretardRs575.00') && tot.includes('Totalrestantdû(EUR)EUR200.00'), 'totals: ' + totals);
  assert(!rows.includes('9,999') && !rows.includes('7,777'), 'no draft, no other client');
  step('statement: paid / open / « En retard de 10 j » / « Annulée par avoir »; credit notes listed under their invoice; outstanding MUR Rs 3,475.00 of which Rs 575.00 late, EUR kept apart; draft and other client left out');

  sql(`UPDATE facturo_clients SET document_language = 'en' WHERE id = ${lagon}`);
  await page.reload();
  assert((await page.textContent('h1')) === 'Statement of account' && flat(await page.textContent('#st-rows')).includes('10 days overdue'), 'in English');
  sql("INSERT INTO organizations (name) VALUES ('Autre société')");
  sql("INSERT INTO facturo_clients (organization_id, name) SELECT MAX(id), 'Client ailleurs' FROM organizations");
  const foreign = sql("SELECT id FROM facturo_clients WHERE name = 'Client ailleurs'");
  await page.goto(B + '/facturo/statement.php?client=' + foreign);
  assert(page.url().includes('p=clients') && !(await page.content()).includes('Client ailleurs'), 'another company\'s client: back to the list');
  step('in the client\'s language (English); another company\'s client id sends back to the client list');

  assert(errors.length === 0, 'console errors: ' + errors.join(' | '));
  console.log('console errors: none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
