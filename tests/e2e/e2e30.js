// MRA robustness and document rules found by the risk review: unanswered send, account errors,
// token renewal, stopped retries, issue dates in order, credit-note VAT, double « paid ».
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2], M = S + '/fakemra';
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);
const sent = () => fs.readdirSync(M + '/received').length;
const auths = () => (fs.existsSync(M + '/auth.log') ? fs.readFileSync(M + '/auth.log', 'utf8').trim().split('\n').filter(Boolean) : []);
const retry = () => spawnSync('php', [S + '/t/tools/mra_retry.php'], { encoding: 'utf8' });
const status = (id) => sql(`SELECT CONCAT(mra_status, ' ', mra_attempts) FROM facturo_documents WHERE id = ${id}`);
const mu = (days) => new Date(Date.now() + 4 * 3600e3 + days * 86400e3).toISOString().slice(0, 10);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const err = async () => { await page.waitForSelector('#facturo-error:not([hidden])'); return (await page.textContent('#facturo-error')).trim(); };
  const mraBox = async () => (await page.textContent('.mra-box')).replace(/\s+/g, ' ').trim();
  const idOf = () => page.url().match(/id=(\d+)/)[1];

  await page.goto(B + '/login.php');
  await page.fill('#email', 'admin@example.com'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  await page.click('button[data-module="facturo"]'); await page.waitForSelector('a[href="/app.php?m=facturo"]');
  await page.goto(B + '/app.php?m=facturo&p=company');
  await page.fill('#o-legal', 'MIPS Demo Ltd'); await page.fill('#o-brn', 'C09999999');
  await page.fill('#o-vat', 'VAT27000000'); await page.fill('#o-tan', '27000000'); await page.fill('#o-address', 'Ebène'); await page.fill('#o-phone', '+230 207-6000');
  await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  await page.fill('#mra-user', 'mips-test'); await page.fill('#mra-pass', 'S3cret!pass'); await page.fill('#mra-ebs', 'EBS-123');
  await page.check('input[name=enabled]');
  await page.click('#mra-form button[type=submit]'); await page.waitForSelector('text=Enregistré.');
  await page.goto(B + '/app.php?m=facturo&p=clients');
  await page.fill('#c-name', 'Le Pétrin Ltée'); await page.fill('#c-brn', 'C12345678'); await page.fill('#c-email', 'compta@petrin.mu');
  await page.click('#client-form button[type=submit]'); await page.waitForSelector('text=Le Pétrin Ltée');

  const draft = async (price, code = 'TC01') => {
    await page.goto(B + '/app.php?m=facturo&p=edit&type=invoice');
    await page.selectOption('#client_id', { label: 'Le Pétrin Ltée' });
    const r = page.locator('#lines tr.line').first();
    await r.locator('[name=description]').fill('Service'); await r.locator('[name=nature]').selectOption('SERVICES');
    await r.locator('[name=quantity]').fill('1'); await r.locator('[name=unit_price]').fill(price); await r.locator('[name=tax_code]').selectOption(code);
    await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
    return idOf();
  };
  const issue = async () => { await Promise.all([page.waitForSelector('.doc-meta'), page.click('button[data-doc-action="issue"]')]); };

  const a = await draft('100'); await issue();
  assert(status(a) === 'fiscalised 1', 'baseline ' + status(a) + ' ' + sql(`SELECT mra_error FROM facturo_documents WHERE id = ${a}`));

  // 1. Sent, accepted by MRA, answer lost: "unknown", never resent automatically
  fs.writeFileSync(M + '/TIMEOUT', '');
  let before = sent();
  const b = await draft('200'); await issue();
  let box = await mraBox();
  assert(status(b).startsWith('unknown') && sent() === before + 1 && box.includes('sans réponse de la MRA') && box.includes('portail MRA'), 'unknown ' + status(b) + ' ' + box);
  let r = retry();
  assert(sent() === before + 1 && status(b).startsWith('unknown'), 'cron does not resend ' + r.stdout);
  await page.click('#email-form button[type=submit]');
  assert((await err()).includes('pas encore fiscalisé'), 'e-mail blocked');
  r = spawnSync('php', [S + '/t/tools/ops.php', 'status'], { encoding: 'utf8' });
  assert(r.stdout.includes('Factures non fiscalisées') && r.stdout.includes('1 (entreprise #'), 'health lists it ' + r.stdout);
  await Promise.all([page.waitForSelector('.mra-box--fiscalised'), page.click('button[data-doc-action="mra"]')]);
  assert(sent() === before + 2, 'manual resend once checked');
  step('timeout after MRA accepted the invoice: « envoyé sans réponse… vérifiez sur le portail MRA », the cron never resends it, e-mail blocked, listed by the supervision; the owner resends it by hand');

  // 2. Credentials refused by MRA: every document stays pending, untouched, one authentication per run
  fs.writeFileSync(M + '/BADPASS', '');
  sql('DELETE FROM mra_tokens');
  const c = await draft('300'); await issue();
  const d = await draft('400'); await issue();
  let n = auths().length;
  r = retry();
  assert(auths().length === n + 1, 'one authentication for the whole run: ' + (auths().length - n) + ' ' + r.stdout + r.stderr + ' ' + status(c) + ' / ' + status(d));
  assert(status(c) === 'pending 0' && status(d) === 'pending 0', 'still pending, attempts untouched ' + status(c) + ' / ' + status(d));
  assert(sql(`SELECT mra_error FROM facturo_documents WHERE id = ${c}`).includes('authentification'), 'error shown');
  fs.unlinkSync(M + '/BADPASS');
  retry();
  assert(status(c) === 'fiscalised 1' && status(d) === 'fiscalised 1', 'sent once fixed ' + status(c) + ' / ' + status(d));
  assert(Number(sql(`SELECT mra_counter FROM facturo_documents WHERE id = ${c}`)) < Number(sql(`SELECT mra_counter FROM facturo_documents WHERE id = ${d}`)), 'counter order');
  step('MRA refuses the credentials: invoices stay pending with their attempts untouched (not « rejeté »), one authentication per run, all sent in order once fixed');

  // 3. Token in its last 10 minutes: renewed with refreshToken = true
  sql('UPDATE mra_tokens SET expires_at = NOW() + INTERVAL 5 MINUTE');
  n = auths().length;
  await draft('500'); await issue();
  assert(auths().length === n + 1 && auths().pop() === 'true', 'refreshToken true ' + auths().slice(-2));
  n = auths().length;
  await draft('600'); await issue();
  assert(auths().length === n, 'fresh token reused');
  step('token expiring within 10 minutes: renewed with refreshToken = « true » (MRA guidelines § 5.1.4), then reused');

  // 4. Automatic retries stopped after 50 failures: said on the document and to the supervision
  fs.writeFileSync(M + '/DOWN', '');
  const e = await draft('700'); await issue();
  fs.unlinkSync(M + '/DOWN');
  sql(`UPDATE facturo_documents SET mra_attempts = 50 WHERE id = ${e}`);
  retry();
  assert(status(e) === 'pending 50', 'not retried ' + status(e));
  await page.reload();
  assert((await mraBox()).includes('essais automatiques arrêtés'), 'said ' + await mraBox());
  await Promise.all([page.waitForSelector('.mra-box--fiscalised'), page.click('button[data-doc-action="mra"]')]);
  step('after 50 failed attempts the document says « essais automatiques arrêtés » instead of « nouvel essai automatique »; the owner can resend it');

  // 5. Issue dates: none in the future, none before the last invoice issued
  const f = await draft('10');
  sql(`UPDATE facturo_documents SET issue_date = '${mu(3)}' WHERE id = ${f}`);
  await page.reload(); await page.click('button[data-doc-action="issue"]');
  assert((await err()).includes('dans le futur'), 'future refused');
  sql(`UPDATE facturo_documents SET issue_date = '${mu(-10)}' WHERE id = ${f}`);
  await page.reload(); await page.click('button[data-doc-action="issue"]');
  assert((await err()).includes('les numéros doivent suivre l\'ordre des dates'), 'backdated refused');
  sql(`UPDATE facturo_documents SET issue_date = '${mu(0)}' WHERE id = ${f}`);
  await page.reload(); await issue();
  step('an invoice dated in the future or before the last one issued is refused (numbers follow dates); dated today it is issued');

  // 6. A credit note keeps the invoice's VAT treatment
  await page.goto(B + '/app.php?m=facturo&p=edit&id=' + a);
  await page.click('button[data-doc-action="credit"]'); await page.waitForSelector('#document-form');
  await page.locator('#lines tr.line').first().locator('[name=tax_code]').selectOption('TC03');
  await page.fill('#notes', 'Geste commercial');
  await page.click('#document-form button[type=submit]');
  assert((await err()).includes('la facture n\'a pas de ligne avec ce traitement TVA'), 'credit VAT code refused');
  step('a credit note line with a VAT treatment the invoice does not have (exempt on a 15 % invoice) is refused');

  // 7. « Payée » twice at once: the second request is refused, so the follow-up runs once
  await page.goto(B + '/app.php?m=facturo&p=edit&id=' + d);
  const codes = await page.evaluate(async (id) => {
    const csrf = document.querySelector('meta[name="csrf-token"]').content;
    const call = () => fetch('/api/facturo/documents', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ action: 'status', id: Number(id), status: 'paid' }) }).then(res => res.status);
    return Promise.all([call(), call()]);
  }, d);
  assert(codes.filter(x => x === 200).length === 1, 'only one succeeds ' + codes);
  step('two simultaneous « Payée » on one invoice: one succeeds, the other is refused (no double cashback)');

  // 8. TAN separate from the VAT number; a seller not registered for VAT fiscalises too, without VAT
  await page.goto(B + '/app.php?m=facturo&p=company');
  await page.fill('#o-tan', '2700000'); await page.click('#company-form button[type=submit]');
  assert((await err()).includes('TAN invalide'), 'TAN checked');
  await page.fill('#o-tan', '27000000'); await page.fill('#o-vat', '');
  await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  await draft('50', 'TC01'); await page.click('button[data-doc-action="issue"]');
  assert((await err()).includes('sans n° TVA'), 'no VAT charged without a VAT number');
  const g = await draft('50', 'TC03'); await issue();
  const last = JSON.parse(fs.readFileSync(M + '/received/' + fs.readdirSync(M + '/received').sort().pop()))[0];
  assert(status(g) === 'fiscalised 1' && last.personType === 'NVTR' && last.seller.tan === '27000000' && last.totalVatAmount === '0.00', 'NVTR ' + JSON.stringify([status(g), last.personType, last.seller.tan, last.totalVatAmount]));
  step('TAN typed with spaces is stored as 8 digits, a wrong one refused; without a VAT number the company still fiscalises (personType NVTR, seller TAN sent), VAT lines refused');

  // 9. The client's TAN is its own field too (sent as buyer TAN), its VAT number gives the buyer type
  await page.goto(B + '/app.php?m=facturo&p=clients');
  await page.fill('#c-name', 'Hôtel Azur'); await page.fill('#c-brn', 'C07012345'); await page.fill('#c-vat', 'VAT27012345'); await page.fill('#c-tan', '27 01234');
  await page.click('#client-form button[type=submit]');
  assert((await err()).includes('TAN du client invalide'), 'client TAN checked');
  await page.fill('#c-tan', '27 012 345'); await page.click('#client-form button[type=submit]'); await page.waitForSelector('text=Hôtel Azur');
  await page.goto(B + '/app.php?m=facturo&p=edit&type=invoice');
  await page.selectOption('#client_id', { label: 'Hôtel Azur' });
  const row = page.locator('#lines tr.line').first();
  await row.locator('[name=description]').fill('Service'); await row.locator('[name=quantity]').fill('1'); await row.locator('[name=unit_price]').fill('80'); await row.locator('[name=tax_code]').selectOption('TC03');
  await Promise.all([page.waitForURL(/id=\d+/), page.click('#document-form button[type=submit]')]);
  await issue();
  const lastB = JSON.parse(fs.readFileSync(M + '/received/' + fs.readdirSync(M + '/received').sort().pop()))[0];
  assert(lastB.buyer.tan === '27012345' && lastB.buyer.buyerType === 'VATR' && lastB.buyer.brn === 'C07012345', 'buyer ' + JSON.stringify(lastB.buyer));
  step('client TAN « 27 012 345 » stored and sent as buyer TAN 27012345 (not « VAT27012345 »), buyer type VATR from its VAT number; a 7-digit TAN refused');

  assert(errors.length === 0, 'JS errors ' + errors);
  await browser.close();
  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
