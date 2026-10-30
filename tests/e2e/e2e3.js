const { chromium } = require('playwright');
const fs = require('fs');
const B = 'http://127.0.0.1:8099', S = process.argv[2], M = S + '/fakemra';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const step = s => console.log('✓', s);
  const err = async () => { await page.waitForSelector('#facturo-error:not([hidden])'); return (await page.textContent('#facturo-error')).trim(); };
  const lastSent = () => { const f = fs.readdirSync(M + '/received').sort().pop(); return JSON.parse(fs.readFileSync(M + '/received/' + f))[0]; };
  const mraBox = async () => (await page.textContent('.mra-box')).replace(/\s+/g, ' ').trim();

  await page.goto(B + '/login.php');
  await page.fill('#email', 'admin@example.com'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  await page.click('button[data-module="facturo"]'); await page.waitForSelector('a[href="/app.php?m=facturo"]');

  await page.goto(B + '/app.php?m=facturo&p=company');
  await page.fill('#o-legal', 'MIPS Demo Ltd'); await page.fill('#o-brn', 'C09999999');
  await page.fill('#o-vat', '27000000'); await page.fill('#o-address', 'Ebène\nCybercity'); await page.fill('#o-phone', '+230 207-6000');
  await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');

  await page.fill('#mra-user', 'mips-test'); await page.fill('#mra-pass', 'wrong'); await page.fill('#mra-ebs', 'EBS-123');
  await page.click('#mra-form button[type=submit]'); await page.waitForSelector('#mra-result:not([hidden])');
  await page.click('#mra-test'); step('wrong password: ' + await err());
  await page.fill('#mra-pass', 'S3cret!pass'); await page.check('input[name=enabled]');
  await page.click('#mra-form button[type=submit]'); await page.waitForSelector('text=Enregistré.');
  await page.click('#mra-test'); await page.waitForSelector('text=identifiants acceptés'); step('test connection OK');
  await page.reload(); step('password field after reload: placeholder="' + await page.getAttribute('#mra-pass', 'placeholder') + '" value="' + await page.inputValue('#mra-pass') + '"');

  await page.goto(B + '/app.php?m=facturo&p=clients');
  await page.fill('#c-name', 'Le Pétrin Ltée'); await page.fill('#c-brn', 'C12345678'); await page.fill('#c-email', 'compta@petrin.mu');
  await page.click('#client-form button[type=submit]'); await page.waitForSelector('text=Le Pétrin Ltée');

  const newInvoice = async (lines, currency) => {
    await page.goto(B + '/app.php?m=facturo&p=edit&type=invoice');
    await page.selectOption('#client_id', { label: 'Le Pétrin Ltée' });
    if (currency) await page.selectOption('#currency', currency);
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) await page.click('#add-line');
      const r = page.locator('#lines tr.line').nth(i);
      await r.locator('[name=description]').fill(lines[i][0]);
      await r.locator('[name=nature]').selectOption(lines[i][1]);
      await r.locator('[name=quantity]').fill(lines[i][2]);
      await r.locator('[name=unit_price]').fill(lines[i][3]);
      await r.locator('[name=tax_code]').selectOption(lines[i][4]);
    }
    await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
    return page.url();
  };
  const issue = async () => { await Promise.all([page.waitForSelector('.doc-meta'), page.click('button[data-doc-action="issue"]')]); };

  // 1. Invoice, fiscalised
  const inv1 = await newInvoice([['Consulting', 'SERVICES', '2', '1000', 'TC01'], ['Book', 'GOODS', '3', '150.50', 'TC03']]);
  step('preview total: ' + await page.textContent('#total-all'));
  await issue();
  step('invoice: ' + await mraBox());
  step('QR on document: ' + await page.locator('.doc-mra img').count() + ', VAT column: ' + (await page.locator('.doc tbody td:nth-child(4)').allTextContents()).join(','));
  let p = lastSent();
  step('payload: ' + JSON.stringify({c: p.invoiceCounter, t: p.transactionType, pt: p.personType, d: p.invoiceTypeDesc, id: p.invoiceIdentifier, h: p.previousNoteHash, vat: p.totalVatAmount, wo: p.totalAmtWoVatCur, paid: p.totalAmtPaid, dt: p.dateTimeInvoiceIssued, seller: p.seller, buyer: p.buyer, items: p.itemList.map(i => [i.itemNo, i.taxCode, i.nature, i.quantity, i.unitPrice, i.amtWoVatCur, i.vatAmt, i.totalPrice]), st: p.salesTransactions}));
  await page.screenshot({ path: S + '/6-fiscalised.png', fullPage: true });

  // 2. Credit note: reason required, then fiscalised as CRN
  await page.click('button[data-doc-action="credit"]'); await page.waitForSelector('#document-form');
  await page.locator('#lines tr.line').nth(1).locator('[data-remove-line]').click();
  await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
  await page.click('button[data-doc-action="issue"]'); step('credit note without reason: ' + await err());
  await page.fill('#notes', 'Consulting day cancelled');
  await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
  await issue();
  p = lastSent(); step('credit note: ' + await mraBox() + ' | ' + JSON.stringify({d: p.invoiceTypeDesc, ref: p.invoiceRefIdentifier, reason: p.reasonStated, h: p.previousNoteHash, c: p.invoiceCounter, paid: p.totalAmtPaid}));

  // 3. Second invoice: previous hash chains to invoice 1
  await newInvoice([['Support', 'SERVICES', '1', '500', 'TC01']]); await issue();
  p = lastSent(); step('invoice 2 previousNoteHash: ' + p.previousNoteHash + ' counter ' + p.invoiceCounter);

  // 4. MRA down → pending, e-mail blocked, retry later
  fs.writeFileSync(M + '/DOWN', '');
  const inv3 = await newInvoice([['Audit', 'SERVICES', '1', '800', 'TC01']]); await issue();
  step('MRA down: ' + await mraBox());
  await page.click('#email-form button[type=submit]'); step('email while pending: ' + await err());
  fs.unlinkSync(M + '/DOWN');
  await Promise.all([page.waitForSelector('.mra-box--fiscalised'), page.click('button[data-doc-action="mra"]')]);
  step('after retry: ' + await mraBox());

  // 5. Token rejected by MRA → re-authenticates once automatically
  fs.writeFileSync(M + '/EXPIRE', '');
  await newInvoice([['Training', 'SERVICES', '1', '100', 'TC02']]); await issue();
  step('expired token: ' + await mraBox());

  // 6. Wrong TAN → rejected with MRA message
  await page.goto(B + '/app.php?m=facturo&p=company'); await page.fill('#o-vat', '11111111');
  await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  await newInvoice([['Misc', 'SERVICES', '1', '10', 'TC01']]); await issue();
  step('wrong TAN: ' + await mraBox());

  // 7. Foreign currency blocked
  await page.goto(B + '/app.php?m=facturo&p=company'); await page.fill('#o-vat', '27000000');
  await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  await newInvoice([['Export', 'SERVICES', '1', '10', 'TC02']], 'EUR');
  await page.click('button[data-doc-action="issue"]'); step('EUR invoice: ' + await err());

  // 8. Print and e-mail of fiscalised invoice
  await page.goto(inv1); await page.click('#email-form button[type=submit]'); await page.waitForSelector('.send-log li');
  step('email fiscalised invoice: ' + (await page.textContent('.send-log li')).replace(/\s+/g, ' ').trim());
  const id1 = inv1.match(/id=(\d+)/)[1];
  await page.goto(B + '/facturo/print.php?id=' + id1);
  await page.screenshot({ path: S + '/7-print-qr.png', fullPage: true });
  step('print has QR: ' + await page.locator('.doc-mra img').count());

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
