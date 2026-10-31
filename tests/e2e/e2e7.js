const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const step = (s) => console.log('✓', s);

  await page.goto(B + '/login.php');
  await page.fill('#email', 'admin@example.com'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  await page.click('button[data-module="facturo"]'); await page.waitForSelector('a[href="/app.php?m=facturo"]');

  const company = async (lang) => {
    await page.goto(B + '/app.php?m=facturo&p=company');
    await page.fill('#o-legal', 'MIPS Demo Ltd'); await page.fill('#o-brn', 'C99999999');
    await page.fill('#o-vat', 'VAT27000000'); await page.fill('#o-address', 'Ebène Cybercity');
    await page.selectOption('#o-lang', lang);
    await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  };
  await company('fr');

  const addClient = async (name, lang) => {
    await page.goto(B + '/app.php?m=facturo&p=clients');
    await page.fill('#c-name', name); await page.fill('#c-email', 'x@example.mu');
    await page.selectOption('#c-lang', lang);
    await page.click('#client-form button[type=submit]'); await page.waitForSelector('text=' + name);
  };
  await addClient('Ocean View Hotel', 'en');
  await addClient('Le Pétrin Ltée', '');
  const rows = (await page.locator('tbody tr').allTextContents()).map(r => r.replace(/\s+/g, ' ').trim());
  step('client list: ' + rows.join(' | '));
  assert(rows.some(r => r.includes('Ocean View Hotel') && r.includes('English')), 'list shows English');
  assert(rows.some(r => r.includes('Le Pétrin') && r.includes('Français')), 'list shows company default');
  await page.screenshot({ path: S + '/cl-1-clients.png', fullPage: true });

  // edit keeps the language in the form
  await page.locator('tr', { hasText: 'Ocean View Hotel' }).locator('[data-edit-client]').click();
  assert(await page.inputValue('#c-lang') === 'en', 'edit form shows en');
  await page.click('#client-form button[type=reset]');
  assert(await page.inputValue('#c-lang') === '', 'reset to default');
  step('edit form loads the client language');

  const invoice = async (client, desc) => {
    await page.goto(B + '/app.php?m=facturo&p=edit&type=invoice');
    await page.selectOption('#client_id', { label: client });
    const r = page.locator('#lines tr.line').first();
    await r.locator('[name=description]').fill(desc); await r.locator('[name=unit_price]').fill('1000');
    await Promise.all([page.waitForURL(/p=edit&id=\d+/), page.click('#document-form button[type=submit]')]);
    await Promise.all([page.waitForSelector('text=FAC-'), page.click('button[data-doc-action="issue"]')]);
    return (await page.textContent('article.doc')).replace(/\s+/g, ' ');
  };
  let d = await invoice('Ocean View Hotel', 'Room');
  assert(d.includes('VAT Invoice') && d.includes('Bill to'), 'EN client gets EN in FR company');
  assert((await page.inputValue('#email-form [name=message]')).startsWith('Dear'), 'EN mail');
  d = await invoice('Le Pétrin Ltée', 'Pain');
  assert(d.includes('Facture TVA') && d.includes('Facturé à'), 'default client gets company FR');
  step('company FR: English client → English invoice, default client → French');

  await company('en');
  d = await invoice('Le Pétrin Ltée', 'Bread');
  assert(d.includes('VAT Invoice'), 'default client follows company EN');
  // explicit French on a client wins over an English company
  await page.goto(B + '/app.php?m=facturo&p=clients');
  await page.locator('tr', { hasText: 'Le Pétrin Ltée' }).locator('[data-edit-client]').click();
  await page.selectOption('#c-lang', 'fr');
  await page.click('#client-form button[type=submit]');
  await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].some(r => r.textContent.includes('Le Pétrin') && r.textContent.includes('Français') && !r.querySelector('.muted')));
  d = await invoice('Le Pétrin Ltée', 'Pain complet');
  assert(d.includes('Facture TVA'), 'explicit FR client in EN company');
  step('company EN: default client → English, client set to French → French');

  // issued documents never change
  await page.goto(B + '/app.php?m=facturo&p=edit&id=2');
  assert((await page.textContent('article.doc')).includes('Facture TVA'), 'issued #2 stays FR');
  await page.goto(B + '/app.php?m=facturo&p=edit&id=3');
  assert((await page.textContent('article.doc')).includes('VAT Invoice'), 'issued #3 stays EN');
  step('issued invoices keep their language');

  const st = await page.evaluate(async () => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch('/api/facturo/clients', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t },
      body: JSON.stringify({ action: 'save', id: 0, name: 'X', document_language: 'de' }) });
    return r.status;
  });
  assert(st === 422, 'invalid client lang 422 got ' + st);
  step('invalid client language refused (422)');

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
