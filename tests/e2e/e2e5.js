const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const step = s => console.log('✓', s);
  const err = async () => { await page.waitForSelector('#cb-error:not([hidden])'); const t = (await page.textContent('#cb-error')).trim(); await page.evaluate(() => document.getElementById('cb-error').hidden = true); return t; };
  const text = async sel => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();

  await page.goto(B + '/login.php');
  await page.fill('#email', 'admin@example.com'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  await page.click('button[data-module="clientbloom"]'); await page.waitForSelector('a[href="/app.php?m=clientbloom"]');
  step('ClientBloom activated');

  // Program: 5% cashback, min Rs 50, welcome Rs 25
  await page.goto(B + '/app.php?m=clientbloom&p=overview');
  await page.fill('#pr-rate', '60'); await page.click('#program-form button[type=submit]'); step('rate 60% refused: ' + await err());
  await page.fill('#pr-rate', '5'); await page.fill('#pr-min', '50'); await page.fill('#pr-bonus', '25');
  await page.click('#program-form button[type=submit]'); await page.waitForSelector('#program-saved:not([hidden])'); step('program saved');

  // Counter: unknown phone → create customer with prefilled phone
  await page.goto(B + '/app.php?m=clientbloom');
  await page.fill('#lookup-phone', '+230 5712 3456'); await page.click('#lookup-form button[type=submit]');
  await page.waitForSelector('#not-found:not([hidden])');
  await Promise.all([page.waitForURL(/p=customer/), page.click('#create-link')]);
  step('prefilled phone: ' + await page.inputValue('#cu-phone'));
  await page.fill('#cu-name', 'Priya Ramdin'); await page.fill('#cu-email', 'priya@example.mu');
  await page.fill('#cu-bday', '1990-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-15');
  await page.fill('#cu-tags', 'vip, bakery'); await page.check('input[name=marketing_consent]');
  await Promise.all([page.waitForURL(/id=\d+/), page.click('#customer-form button[type=submit]')]);
  const profile = page.url();
  step('created; balance with welcome bonus: ' + await text('.card-head .balance strong'));

  // duplicate phone
  await page.goto(B + '/app.php?m=clientbloom&p=customer');
  await page.fill('#cu-name', 'Someone'); await page.fill('#cu-phone', '57123456');
  await page.click('#customer-form button[type=submit]'); step('duplicate phone: ' + await err());

  // Counter sale 1: Rs 1,000, no redemption → +50
  await page.goto(B + '/app.php?m=clientbloom');
  const sale = async (amount, redeem, ref) => {
    await page.fill('#lookup-phone', '57123456'); await page.click('#lookup-form button[type=submit]');
    await page.waitForSelector('#checkout:not([hidden])');
    await page.fill('#co-amount', amount); await page.fill('#co-redeem', redeem); await page.fill('#co-ref', ref);
    await page.click('#checkout-form button[type=submit]');
  };
  await sale('1000', '', 'R-001'); await page.waitForSelector('#co-result:not([hidden])');
  step(await text('#co-result'));
  // redeem below minimum
  await sale('200', '30', 'R-002'); step('redeem below minimum: ' + await err());
  // redeem more than balance
  await page.fill('#co-redeem', '500'); await page.click('#checkout-form button[type=submit]'); step('redeem above balance: ' + await err());
  // valid: Rs 400 using Rs 75 → earns 5% of 325 = 16.25
  await page.fill('#co-amount', '400'); await page.fill('#co-redeem', '75'); await page.click('#checkout-form button[type=submit]');
  await page.waitForSelector('#co-result:not([hidden])'); step(await text('#co-result'));
  await page.fill('#lookup-phone', '57123456'); await page.click('#lookup-form button[type=submit]');
  await page.waitForSelector('#checkout:not([hidden])'); await page.fill('#co-amount', '850'); await page.fill('#co-ref', 'R-003');
  await page.screenshot({ path: S + '/cb-1-counter.png', fullPage: true });
  await page.fill('#co-amount', ''); await page.fill('#co-ref', '');

  // Profile: history, note, card, reversal, adjustment
  await page.goto(profile);
  step('history: ' + (await page.locator('table tbody tr').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim()).join(' | '));
  await page.fill('#note-body', 'Prefers sourdough. Called about birthday cake.'); await page.click('#note-form button[type=submit]');
  await page.waitForSelector('.timeline li'); step('note added');
  await page.click('#card-btn'); await page.waitForSelector('#card-share:not([hidden])');
  const cardUrl = await page.inputValue('#card-url'); const wa = await page.getAttribute('#card-wa', 'href');
  step('WhatsApp link: ' + wa.slice(0, 40) + '…');
  // reverse the first purchase (+50) → balance 16.25-50 < 0 → refused
  const purchaseRow = page.locator('tr', { hasText: 'R-001' }).locator('[data-reverse]');
  await purchaseRow.click(); step('reverse spent cashback: ' + await err());
  // adjust
  await page.click('details.send summary'); await page.fill('#adj-amount', '100'); await page.fill('#adj-reason', 'Goodwill: late order');
  await page.click('#adjust-form button[type=submit]'); await page.waitForLoadState('load'); await page.waitForSelector('text=Goodwill');
  step('after +100 adjustment: ' + await text('.card-head .balance strong'));
  await page.locator('tr', { hasText: 'R-001' }).locator('[data-reverse]').click(); await page.waitForSelector('text=Annulation de');
  step('purchase reversed; balance ' + await text('.card-head .balance strong') + ' / ' + (await text('.meta')).slice(0, 60));

  await page.screenshot({ path: S + '/cb-3-customer.png', fullPage: true });

  // Public card
  const card = await ctx.newPage(); await card.goto(cardUrl);
  step('public card: ' + (await card.textContent('.balance--big')).replace(/\s+/g, ' ').trim() + ' / logout link present: ' + await card.locator('#logout-btn').count());
  await card.screenshot({ path: S + '/cb-5-card.png', fullPage: true }); await card.close();

  // Segments
  for (const s of ['balance', 'birthdays', 'consent', 'inactive', 'top']) {
    await page.goto(B + '/app.php?m=clientbloom&p=customers&s=' + s);
    step('segment ' + s + ': ' + (await page.locator('tbody tr').count()));
  }
  await page.goto(B + '/app.php?m=clientbloom&p=customers');
  await page.screenshot({ path: S + '/cb-2-customers.png', fullPage: true });
  await page.goto(B + '/app.php?m=clientbloom&p=customers&q=5712'); step('search by partial phone: ' + await page.locator('tbody tr').count());

  // Export
  await page.goto(B + '/app.php?m=clientbloom&p=customers');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Exporter (CSV)')]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8'); step('CSV: ' + csv.trim().split('\n').map(l => l.replace(/^﻿/, '')).join(' || '));

  // Overview
  await page.goto(B + '/app.php?m=clientbloom&p=overview');
  step('KPIs: ' + (await page.locator('.kpi').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim()).join(' | '));
  await page.screenshot({ path: S + '/cb-4-program.png', fullPage: true });

  // Mobile counter
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(B + '/app.php?m=clientbloom');
  step('mobile overflow: ' + await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
