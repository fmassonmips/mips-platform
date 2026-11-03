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

  await page.goto(B + '/app.php?m=facturo&p=company');
  assert(await page.inputValue('#o-lang') === 'fr', 'default fr');
  await page.fill('#o-legal', 'MIPS Demo Ltd'); await page.fill('#o-brn', 'C99999999');
  await page.fill('#o-vat', 'VAT27000000'); await page.fill('#o-address', 'Ebène Cybercity');
  await page.selectOption('#o-lang', 'en');
  await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  await page.reload(); assert(await page.inputValue('#o-lang') === 'en', 'saved en');
  step('company language set to English');

  await page.goto(B + '/app.php?m=facturo&p=clients');
  await page.fill('#c-name', 'Ocean View Hotel'); await page.fill('#c-email', 'accounts@oceanview.mu');
  await page.click('#client-form button[type=submit]'); await page.waitForSelector('text=Ocean View Hotel');

  const makeInvoice = async (desc) => {
    await page.goto(B + '/app.php?m=facturo&p=edit&type=invoice');
    await page.selectOption('#client_id', { label: 'Ocean View Hotel' });
    const r = page.locator('#lines tr.line').first();
    await r.locator('[name=description]').fill(desc); await r.locator('[name=unit_price]').fill('1000');
    await r.locator('[name=tax_code]').selectOption('TC01');
    await Promise.all([page.waitForURL(/p=edit&id=\d+/), page.click('#document-form button[type=submit]')]);
    await Promise.all([page.waitForSelector('text=FAC-'), page.click('button[data-doc-action="issue"]')]);
    return page.url().match(/id=(\d+)/)[1];
  };
  const enId = await makeInvoice('Wedding banquet');
  const doc = (await page.textContent('article.doc')).replace(/\s+/g, ' ');
  for (const w of ['VAT Invoice', 'Bill to', 'Due date', 'Unit price', 'Total incl. VAT', 'VAT No.', 'Rs 1,150.00'])
    assert(doc.includes(w), 'en doc has ' + w);
  assert(!doc.includes('Facturé à'), 'no french on en doc');
  const msg = await page.inputValue('#email-form [name=message]');
  const subj = await page.inputValue('#email-form [name=subject]');
  assert(msg.startsWith('Dear Sir or Madam,') && msg.includes('Please find invoice FAC-') && msg.includes('payable by'), 'en mail ' + msg);
  assert(subj.startsWith('Invoice FAC-'), 'en subject ' + subj);
  assert(await page.textContent('.status') === 'Émise', 'app UI stays french');
  step('EN invoice: ' + doc.slice(0, 120) + '…');
  step('EN e-mail: ' + subj + ' / ' + msg.split('\n')[2]);
  await page.screenshot({ path: S + '/en-1-invoice.png', fullPage: true });

  await page.goto(B + '/facturo/print.php?id=' + enId);
  assert(await page.getAttribute('html', 'lang') === 'en', 'print lang');
  assert((await page.textContent('#print-btn')).includes('Print / Save as PDF'), 'print btn');
  await page.screenshot({ path: S + '/en-2-print.png', fullPage: true });
  step('EN print page');

  // send by e-mail, then check the public link page and the e-mail body
  await page.goto(B + '/app.php?m=facturo&p=edit&id=' + enId);
  await page.click('#email-form button[type=submit]'); await page.waitForSelector('.send-log li');
  step('EN invoice e-mailed');

  // switch back to French: the issued EN invoice keeps its language
  await page.goto(B + '/app.php?m=facturo&p=company');
  await page.selectOption('#o-lang', 'fr');
  await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  await page.goto(B + '/app.php?m=facturo&p=edit&id=' + enId);
  assert((await page.textContent('article.doc')).includes('VAT Invoice'), 'issued doc keeps en');
  const frId = await makeInvoice('Banquet de mariage');
  const fr = (await page.textContent('article.doc')).replace(/\s+/g, ' ');
  assert(fr.includes('Facture TVA') && fr.includes('Facturé à'), 'new doc fr');
  assert((await page.inputValue('#email-form [name=message]')).startsWith('Bonjour,'), 'fr mail');
  step('after switching to FR: EN invoice unchanged, new invoice in French');

  // credit note in EN org
  await page.goto(B + '/app.php?m=facturo&p=company');
  await page.selectOption('#o-lang', 'en');
  await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  await page.goto(B + '/app.php?m=facturo&p=edit&id=' + enId);
  await page.click('button[data-doc-action="credit"]'); await page.waitForSelector('#document-form');
  await page.fill('#notes', 'Cancelled booking');
  await Promise.all([page.waitForURL(/p=edit&id=\d+/), page.click('#document-form button[type=submit]')]);
  await Promise.all([page.waitForSelector('text=AVO-'), page.click('button[data-doc-action="issue"]')]);
  const cn = (await page.textContent('article.doc')).replace(/\s+/g, ' ');
  assert(cn.includes('Credit Note') && cn.includes('Relates to invoice') && cn.includes('Reason:'), 'en credit note ' + cn);
  step('EN credit note: ' + cn.slice(0, 100) + '…');

  // invalid value refused by API
  const st = await page.evaluate(async () => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch('/api/suite/organization', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t },
      body: JSON.stringify({ name: 'X', document_language: 'de' }) });
    return r.status;
  });
  assert(st === 422, 'invalid lang 422 got ' + st);
  step('invalid language refused (422)');

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
