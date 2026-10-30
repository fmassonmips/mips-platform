const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const step = (s) => console.log('✓', s);

  await page.goto(B + '/login.php');
  await page.fill('#email', 'admin@example.com'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  step('login');

  await page.click('button[data-module="facturo"]'); await page.waitForLoadState('load');
  await page.waitForSelector('a[href="/app.php?m=facturo"]');
  await page.screenshot({ path: S + '/1-dashboard.png', fullPage: true });
  step('facturo activated from launcher');

  // try issuing without company profile later; first set up a client
  await page.goto(B + '/app.php?m=facturo&p=clients');
  await page.fill('#c-name', 'Le Pétrin Ltée'); await page.fill('#c-email', 'compta@petrin.mu');
  await page.fill('#c-brn', 'C12345678'); await page.fill('#c-address', 'Royal Road\nCurepipe');
  await page.click('#client-form button[type=submit]'); await page.waitForSelector('text=Le Pétrin Ltée');
  step('client created');

  // invoice draft
  await page.goto(B + '/app.php?m=facturo&p=edit&type=invoice');
  await page.selectOption('#client_id', { label: 'Le Pétrin Ltée' });
  const row = page.locator('#lines tr.line').first();
  await row.locator('[name=description]').fill('Website design');
  await row.locator('[name=quantity]').fill('1.5');
  await row.locator('[name=unit_price]').fill('3.33');
  await row.locator('[name=tax_code]').selectOption('TC01');
  await page.click('#add-line');
  const row2 = page.locator('#lines tr.line').nth(1);
  await row2.locator('[name=description]').fill('Hosting (12 months)');
  await row2.locator('[name=quantity]').fill('12');
  await row2.locator('[name=unit_price]').fill('450');
  await row2.locator('[name=tax_code]').selectOption('TC01');
  const preview = await page.textContent('#total-all');
  await Promise.all([page.waitForURL(/p=edit&id=\d+/), page.click('#document-form button[type=submit]')]);
  step('invoice draft saved, preview total ' + preview);

  // issuing without company details must fail
  await page.click('button[data-doc-action="issue"]');
  await page.waitForSelector('#facturo-error:not([hidden])');
  step('issue blocked without company details: ' + await page.textContent('#facturo-error'));
  const draftUrl = page.url();

  await page.goto(B + '/app.php?m=facturo&p=company');
  await page.fill('#o-legal', 'MIPS Demo Ltd'); await page.fill('#o-brn', 'C99999999');
  await page.fill('#o-vat', 'VAT27000000'); await page.fill('#o-address', 'Ebène Cybercity');
  await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  step('company profile saved');

  await page.goto(draftUrl);
  await Promise.all([page.waitForSelector('text=FAC-'), page.click('button[data-doc-action="issue"]')]);
  const number = await page.textContent('.doc-meta strong');
  const total = await page.textContent('.totals dd strong');
  step('invoice issued: ' + number + ' total ' + total);
  await page.screenshot({ path: S + '/2-invoice.png', fullPage: true });
  await page.click('button[data-status="paid"]'); await page.waitForSelector('.status--paid');
  step('invoice marked paid');

  // quote → invoice
  await page.goto(B + '/app.php?m=facturo&p=edit&type=quote');
  await page.selectOption('#client_id', { label: 'Le Pétrin Ltée' });
  const q = page.locator('#lines tr.line').first();
  await q.locator('[name=description]').fill('Logo pack');
  await q.locator('[name=unit_price]').fill('9999.99');
  await Promise.all([page.waitForURL(/p=edit&id=\d+/), page.click('#document-form button[type=submit]')]);
  await Promise.all([page.waitForSelector('text=DEV-'), page.click('button[data-doc-action="issue"]')]);
  step('quote sent: ' + await page.textContent('.doc-meta strong'));
  await page.click('button[data-doc-action="convert"]'); await page.waitForSelector('#document-form');
  await Promise.all([page.waitForSelector('text=FAC-'), page.click('button[data-doc-action="issue"]')]);
  step('invoice from quote issued: ' + await page.textContent('.doc-meta strong'));

  await page.goto(B + '/app.php?m=facturo&p=invoices');
  await page.screenshot({ path: S + '/3-invoices.png', fullPage: true });
  const rows = await page.locator('tbody tr').allTextContents();
  step('invoice list: ' + rows.map(r => r.replace(/\s+/g, ' ').trim()).join(' | '));

  const invId = (await page.locator('tbody a').last().getAttribute('href')).match(/id=(\d+)/)[1];
  await page.goto(B + '/facturo/print.php?id=' + invId);
  await page.screenshot({ path: S + '/4-print.png', fullPage: true });
  step('print page: ' + await page.title());

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(B + '/app.php?m=facturo&p=edit&type=invoice');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  step('mobile editor horizontal page overflow: ' + overflow);

  // The 409 is expected: issuing before the company details are filled in is refused (above).
  const unexpected = errors.filter(m => !m.includes('status of 409'));
  console.log('console errors:', unexpected.length ? unexpected : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
