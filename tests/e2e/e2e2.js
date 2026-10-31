const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/409|422/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  const step = s => console.log('✓', s);
  const err = async () => (await page.textContent('#facturo-error')).trim();

  await page.goto(B + '/login.php');
  await page.fill('#email', 'admin@example.com'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  await page.click('button[data-module="facturo"]'); await page.waitForSelector('a[href="/app.php?m=facturo"]');

  await page.goto(B + '/app.php?m=facturo&p=company');
  await page.fill('#o-legal', 'MIPS Demo Ltd'); await page.fill('#o-brn', 'C99999999');
  await page.fill('#o-vat', 'VAT27000000'); await page.fill('#o-email', 'billing@mips.mu');
  await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  await page.goto(B + '/app.php?m=facturo&p=clients');
  await page.fill('#c-name', 'Le Pétrin Ltée'); await page.fill('#c-email', 'compta@petrin.mu');
  await page.click('#client-form button[type=submit]'); await page.waitForSelector('text=Le Pétrin Ltée');

  // Invoice 1000 + 500, 15% VAT → 1725.00
  await page.goto(B + '/app.php?m=facturo&p=edit&type=invoice');
  await page.selectOption('#client_id', { label: 'Le Pétrin Ltée' });
  let r = page.locator('#lines tr.line').first();
  await r.locator('[name=description]').fill('Consulting'); await r.locator('[name=unit_price]').fill('1000');
  await page.click('#add-line'); r = page.locator('#lines tr.line').nth(1);
  await r.locator('[name=description]').fill('Training'); await r.locator('[name=unit_price]').fill('500');
  await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
  await Promise.all([page.waitForSelector('text=FAC-'), page.click('button[data-doc-action="issue"]')]);
  const invUrl = page.url();
  step('invoice ' + await page.textContent('.doc-meta strong') + ' ' + await page.textContent('.totals dd strong'));

  // Partial credit: drop "Training" line → 1150.00
  await page.click('button[data-doc-action="credit"]'); await page.waitForSelector('#document-form');
  step('tab active on credit note draft: ' + await page.textContent('.subnav .is-current'));
  step('client locked: ' + await page.isDisabled('#client_id') + ', due date field: ' + await page.locator('#due_date').count());
  await page.locator('#lines tr.line').nth(1).locator('[data-remove-line]').click();
  await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
  await Promise.all([page.waitForSelector('text=AVO-'), page.click('button[data-doc-action="issue"]')]);
  step('credit note ' + await page.textContent('.doc-meta strong') + ' / ' + (await page.textContent('.doc-meta')).replace(/\s+/g,' ').trim());

  await page.goto(invUrl);
  step('invoice after partial credit: status=' + await page.textContent('.status') + ' / ' + (await page.textContent('.related')).replace(/\s+/g,' ').trim());

  // Second credit note: draft copies the invoice lines (1,725) > remaining 575 → refused until reduced
  await page.click('button[data-doc-action="credit"]'); await page.waitForSelector('#document-form');
  step('second draft copies lines: ' + await page.locator('#lines tr.line').count());
  await page.click('#document-form button[type=submit]'); await page.waitForSelector('#facturo-error:not([hidden])');
  step('over-credit refused: ' + await err());
  await page.locator('#lines tr.line').nth(0).locator('[data-remove-line]').click();
  await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
  await Promise.all([page.waitForSelector('text=AVO-'), page.click('button[data-doc-action="issue"]')]);
  await page.goto(invUrl);
  step('invoice after full credit: status=' + await page.textContent('.status') + ', credit button present: ' + await page.locator('button[data-doc-action="credit"]').count());
  await page.screenshot({ path: S + '/5-credited-invoice.png', fullPage: true });

  // E-mail the invoice
  await page.fill('#m-message', 'Bonjour,\n\nVoici votre facture.\n\nCordialement');
  await page.click('#email-form button[type=submit]'); await page.waitForSelector('.send-log li');
  step('email log: ' + (await page.textContent('.send-log')).replace(/\s+/g,' ').trim());
  // failing recipient
  await page.click('details.send summary'); await page.fill('#m-to', 'reject@petrin.mu');
  await page.click('#email-form button[type=submit]'); await page.waitForSelector('#facturo-error:not([hidden])');
  step('smtp rejection surfaced: ' + await err());

  await page.goto(B + '/app.php?m=facturo&p=credit_notes');
  step('credit notes list: ' + (await page.locator('tbody tr').allTextContents()).map(t => t.replace(/\s+/g,' ').trim()).join(' | '));

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
