const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const mailsTo = (addr) => fs.readdirSync(S + '/mail').map(f => fs.readFileSync(S + '/mail/' + f, 'utf8')).filter(m => new RegExp('^To: .*' + addr.replace(/\./g, '\\.'), 'mi').test(m));
// Server arithmetic: line excl. VAT, VAT rounded half up per line.
const line = (q, ht, bp) => { const t = q * ht; return [t, Math.floor((2 * t * bp + 10000) / 20000)]; };
const rs = c => 'Rs ' + Math.floor(c / 100).toLocaleString('en-US') + '.' + String(c % 100).padStart(2, '0');

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
  for (const m of ['shoplokal', 'facturo', 'bizpilot']) {
    await Promise.all([page.waitForNavigation(), page.click(`button[data-module="${m}"][data-action="activate"]`)]);
  }
  const api = (url, p, pg = page, csrf = true) => pg.evaluate(async ([u, p, csrf]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const h = { 'Content-Type': 'application/json' }; if (csrf) h['X-CSRF-Token'] = t;
    const r = await fetch(u, { method: 'POST', headers: h, body: JSON.stringify(p) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, [url, p, csrf]);
  await page.goto(B + '/app.php?m=shoplokal');
  await api('/api/suite/organization', { name: 'Kaz Artisan', legal_name: 'Kaz Artisan Ltd', brn: 'C12345678', vat_number: 'VAT27000000', address: 'Port-Louis', email: '', phone: '+230 5 123 4567', document_language: 'fr' });
  step('ShopLokal, Facturo, BizPilot activated; company VAT-registered');

  // products
  await page.goto(B + '/app.php?m=shoplokal&p=products');
  assert(await page.inputValue('#pr-tax') === 'TC01', 'default VAT 15 % when registered');
  const add = async (name, price, stock, img) => {
    await page.fill('#pr-name', name); await page.fill('#pr-price', price); await page.fill('#pr-stock', stock);
    if (img) { await page.setInputFiles('#pr-image', img); await page.waitForSelector('#pr-preview:not([hidden])'); }
    await Promise.all([page.waitForNavigation(), page.click('#sl-product-form button[type=submit]')]);
  };
  await add('Tee-shirt Dodo', '750', '10', __dirname + '/support/photo.png');
  await add('Savon vanille', '125.50', '2', null);
  await add('Panier en vacoas', '1200', '', null);
  await add('Vase unique', '2500', '1', null);
  const img = sql("SELECT LEFT(image, 23), LENGTH(image) FROM shoplokal_products WHERE name = 'Tee-shirt Dodo'").split('\t');
  assert(img[0] === 'data:image/jpeg;base64,' && +img[1] < 400000, 'image shrunk to JPEG ' + img);
  const P = {};
  for (const r of sql('SELECT name, id, price_cents FROM shoplokal_products').split('\n')) { const [n, id, p] = r.split('\t'); P[n] = { id: +id, ht: +p }; }
  assert(P['Tee-shirt Dodo'].ht === 65217, 'HT from TTC ' + P['Tee-shirt Dodo'].ht);
  const rows = await page.$$eval('tbody tr', trs => trs.map(t => t.textContent.replace(/\s+/g, ' ').trim()));
  assert(rows.some(r => r.includes('Tee-shirt Dodo') && r.includes('Rs 750.00')), 'TTC shown ' + rows);
  assert(await page.locator('img.thumb').count() === 1, 'thumbnail');
  step('4 products; phone photo shrunk to JPEG (' + Math.round(img[1] / 1024) + ' KB); Rs 750 TTC stored as Rs 652.17 HT');

  // edit: bad price refused, then real edit
  await page.locator('tr', { hasText: 'Savon vanille' }).locator('[data-edit-product]').click();
  assert(await page.inputValue('#pr-price') === '125.50', 'edit prefilled');
  await page.fill('#pr-price', 'abc'); await page.click('#sl-product-form button[type=submit]');
  await page.waitForSelector('#sl-error:not([hidden])');
  await page.fill('#pr-price', '130');
  await Promise.all([page.waitForNavigation(), page.click('#sl-product-form button[type=submit]')]);
  assert(sql("SELECT COUNT(*) FROM shoplokal_products") === '4', 'edit, not insert');
  P['Savon vanille'].ht = +sql("SELECT price_cents FROM shoplokal_products WHERE name = 'Savon vanille'");
  let r = await api('/api/shoplokal/shop', { action: 'product', id: 0, name: 'X', price: '10', tax_code: 'TC01', stock: '', active: true, image: 'data:image/png;base64,AAAA' });
  assert(r.status === 422, 'fake image refused');
  step('edit OK; invalid price and fake image refused');

  // shop link while closed
  await page.goto(B + '/app.php?m=shoplokal&p=settings');
  const link = await page.inputValue('#sl-link');
  const token = new URL(link).searchParams.get('o');
  const shopper = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await shopper.newPage();
  m.on('pageerror', e => errors.push(e.message));
  await m.goto(B + '/shoplokal/s.php?o=' + token);
  assert((await m.textContent('main')).includes('fermée'), 'closed');
  r = await api('/api/shoplokal/public', { o: token, cart: [{ product_id: P['Panier en vacoas'].id, quantity: 1 }], name: 'A', phone: '57001122', delivery_method: 'pickup', payment_method: 'cod' }, m);
  assert(r.status === 409, 'closed shop refuses orders ' + r.status);
  step('closed shop: page says so, API refuses (409)');

  // settings: open, delivery Rs 100 HT, free from Rs 2,000, bank + Juice
  await page.check('input[name=shop_open]'); await page.fill('#s-intro', 'Artisanat mauricien, livré chez vous.');
  await page.check('input[name=pay_bank]'); await page.fill('#s-bank', 'MCB · Kaz Artisan Ltd · 000123456789');
  await page.check('input[name=pay_juice]'); await page.fill('#s-juice', '5 765 4321');
  await page.fill('#s-fee', '100'); await page.fill('#s-free', '2000'); await page.fill('#s-pickup', 'Rue Royale, Port-Louis');
  await page.fill('#s-notify', 'boutique@kaz.mu');
  await Promise.all([page.waitForNavigation(), page.click('#sl-settings button[type=submit]')]);
  assert(await page.isChecked('input[name=shop_open]'), 'saved open');
  step('shop opened: delivery Rs 100 HT (Rs 115 TTC), free from Rs 2,000; COD, bank transfer, Juice');

  // mobile shopper
  await m.goto(B + '/shoplokal/s.php?o=' + token);
  const tee = P['Tee-shirt Dodo'], savon = P['Savon vanille'];
  await m.click(`[data-add="${tee.id}"]`); await m.click(`[data-add="${tee.id}"]`); await m.click(`[data-add="${savon.id}"]`);
  const [t1, x1] = line(2, tee.ht, 1500), [t2, x2] = line(1, savon.ht, 1500);
  const items = t1 + x1 + t2 + x2, fee = 11500;
  assert(await m.textContent('#sum-items') === rs(items), 'items ' + await m.textContent('#sum-items') + ' vs ' + rs(items));
  assert(await m.textContent('#sum-total') === rs(items + fee), 'total with delivery');
  await m.check('input[value=pickup]');
  assert(await m.textContent('#sum-total') === rs(items) && await m.isHidden('#address-field'), 'pickup: no fee, no address');
  await m.check('input[value=delivery]');
  // stepper capped by stock: Savon has 2
  const plus = m.locator('.cart-line', { hasText: 'Savon' }).locator('button').nth(1);
  await plus.click();
  assert(await plus.isDisabled(), '+ disabled at stock');
  assert((await m.locator('.cart-line', { hasText: 'Savon' }).locator('.qty').textContent()) === '2', 'stepper capped at stock');
  await m.screenshot({ path: S + '/sl-1-boutique-mobile.png', fullPage: true });
  await m.fill('#c-name', 'Priya Ramdin'); await m.fill('#c-phone', '5 700 1122'); await m.fill('#c-email', 'priya@example.mu');
  await m.fill('#c-address', '12 avenue des Flamboyants, Quatre-Bornes'); await m.check('input[value=juice]');
  await Promise.all([m.waitForURL(/o\.php\?t=/), m.click('#checkout button[type=submit]')]);
  const [t3, x3] = line(2, savon.ht, 1500);
  const items1 = t1 + x1 + t3 + x3, [dt, dx] = line(1, 10000, 1500);
  const o1 = sql("SELECT id, number, total_cents, delivery_cents, phone FROM shoplokal_orders ORDER BY id DESC LIMIT 1").split('\t');
  assert(+o1[2] === items1 + dt + dx && +o1[3] === 10000, 'order total ' + o1 + ' expected ' + (items1 + dt + dx));
  assert(o1[4] === '57001122', 'phone normalized ' + o1[4]);
  assert(sql(`SELECT stock FROM shoplokal_products WHERE id = ${tee.id}`) === '8' && sql(`SELECT stock FROM shoplokal_products WHERE id = ${savon.id}`) === '0', 'stock decremented');
  const body = await m.textContent('main');
  assert(body.includes('Merci') && body.includes('5 765 4321') && body.includes('commande 1'), 'order page with Juice instructions');
  await m.screenshot({ path: S + '/sl-2-commande-client-mobile.png', fullPage: true });
  assert(mailsTo('priya@example.mu').length === 1 && mailsTo('boutique@kaz.mu').length === 1, 'mails customer + shop');
  step(`order #1 on mobile: ${rs(+o1[2])} = articles ${rs(items1)} + livraison Rs 115.00; stock 10→8 and 2→0; Juice instructions; 2 e-mails`);

  // sold out now shown
  await m.goto(B + '/shoplokal/s.php?o=' + token);
  assert(await m.locator('.product.is-out', { hasText: 'Savon' }).count() === 1, 'savon sold out');
  // free delivery above Rs 2,000 (items TTC)
  r = await api('/api/shoplokal/public', { o: token, cart: [{ product_id: P['Panier en vacoas'].id, quantity: 2 }], name: 'Jean Li', phone: '+230 5 711 2233', address: 'Curepipe', delivery_method: 'delivery', payment_method: 'bank' }, m);
  assert(r.status === 200, 'order 2 ' + JSON.stringify(r));
  assert(sql('SELECT delivery_cents FROM shoplokal_orders WHERE number = 2') === '0', 'free delivery over threshold');
  step('order #2: Rs 2,400 of items → delivery free; untracked stock accepted');

  // refusals
  r = await api('/api/shoplokal/public', { o: token, cart: [{ product_id: savon.id, quantity: 1 }], name: 'A', phone: '57001122', delivery_method: 'pickup', payment_method: 'cod' }, m);
  assert(r.status === 422 && r.body.error.includes('Savon'), 'sold out refused ' + JSON.stringify(r));
  r = await api('/api/shoplokal/public', { o: token, cart: [{ product_id: tee.id, quantity: 1 }], name: 'A', phone: '12', delivery_method: 'pickup', payment_method: 'cod' }, m);
  assert(r.status === 422, 'bad phone');
  r = await api('/api/shoplokal/public', { o: token, cart: [{ product_id: tee.id, quantity: 1 }], name: 'A', phone: '57001122', delivery_method: 'delivery', address: '', payment_method: 'cod' }, m);
  assert(r.status === 422, 'address needed');
  r = await api('/api/shoplokal/public', { o: token, cart: [{ product_id: tee.id, quantity: 1 }], name: 'A', phone: '57001122', delivery_method: 'pickup', payment_method: 'cod' }, m, false);
  assert(r.status === 419, 'csrf ' + r.status);
  const before = sql('SELECT COUNT(*) FROM shoplokal_orders');
  r = await api('/api/shoplokal/public', { o: token, cart: [{ product_id: tee.id, quantity: 1 }], name: 'Bot', phone: '57001122', delivery_method: 'pickup', payment_method: 'cod', website: 'http://spam' }, m);
  assert(r.status === 200 && sql('SELECT COUNT(*) FROM shoplokal_orders') === before, 'honeypot silently dropped');
  step('refused: sold-out product, bad phone, missing address, no CSRF (419); bot honeypot silently dropped');

  // last item race: two shoppers, one vase
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(ctxs.map(async c => { const p = await c.newPage(); await p.goto(B + '/shoplokal/s.php?o=' + token); return p; }));
  const vase = P['Vase unique'].id;
  const race = await Promise.all(pages.map((p, i) => api('/api/shoplokal/public', { o: token, cart: [{ product_id: vase, quantity: 1 }], name: 'Client ' + i, phone: '5700112' + i, delivery_method: 'pickup', payment_method: 'cod' }, p)));
  const st = race.map(x => x.status).sort();
  assert(st[0] === 200 && st[1] === 422, 'race ' + JSON.stringify(race));
  assert(sql(`SELECT stock FROM shoplokal_products WHERE id = ${vase}`) === '0', 'vase stock 0');
  const nums = sql('SELECT GROUP_CONCAT(number ORDER BY number) FROM shoplokal_orders');
  assert(nums === '1,2,3', 'gap-free numbering ' + nums);
  step('two shoppers race for the last vase: one order, one "no longer available"; numbering 1,2,3 without gaps');

  // IP limit (5/h): 3 already from 127.0.0.1
  for (let i = 0; i < 2; i++) {
    r = await api('/api/shoplokal/public', { o: token, cart: [{ product_id: P['Panier en vacoas'].id, quantity: 1 }], name: 'L' + i, phone: '5700113' + i, delivery_method: 'pickup', payment_method: 'cod' }, m);
    assert(r.status === 200, 'under limit');
  }
  r = await api('/api/shoplokal/public', { o: token, cart: [{ product_id: P['Panier en vacoas'].id, quantity: 1 }], name: 'L9', phone: '57001139', delivery_method: 'pickup', payment_method: 'cod' }, m);
  assert(r.status === 409, 'ip limit ' + r.status);
  step('6th order within the hour from the same connection refused (409)');
  sql('UPDATE shoplokal_orders SET created_ip = NULL');

  // back office
  await page.goto(B + '/app.php?m=shoplokal');
  assert((await page.textContent('.filter-tabs')).includes('À traiter 5'), 'todo count');
  assert((await page.textContent('main')).includes('Stock bas'), 'low stock banner');
  await page.screenshot({ path: S + '/sl-3-commandes.png', fullPage: true });
  await page.goto(B + '/app.php?m=shoplokal&p=order&id=' + o1[0]);
  await Promise.all([page.waitForNavigation(), page.click('[data-sl-status="confirmed"]')]);
  assert(mailsTo('priya@example.mu').length === 2, 'confirmed mail');
  await Promise.all([page.waitForNavigation(), page.click('[data-sl-paid="1"]')]);
  assert((await page.textContent('main')).includes('payée le'), 'paid');
  await Promise.all([page.waitForURL(/m=facturo&p=edit/), page.click('#sl-invoice')]);
  const inv = new URL(page.url()).searchParams.get('id');
  const d = sql(`SELECT subtotal_cents, tax_cents, total_cents, type, status FROM facturo_documents WHERE id = ${inv}`).split('\t');
  const o = sql(`SELECT subtotal_cents, tax_cents, total_cents FROM shoplokal_orders WHERE id = ${o1[0]}`).split('\t');
  assert(d[0] === o[0] && d[1] === o[1] && d[2] === o[2] && d[3] === 'invoice' && d[4] === 'draft', 'invoice = order ' + d + ' / ' + o);
  assert(sql(`SELECT c.email FROM facturo_documents d JOIN facturo_clients c ON c.id = d.client_id WHERE d.id = ${inv}`) === 'priya@example.mu', 'client created');
  r = await api('/api/shoplokal/shop', { action: 'invoice', id: +o1[0] });
  assert(r.status === 422, 'one invoice per order');
  step(`order #1 confirmed (e-mail), marked paid, Facturo draft invoice ${rs(+d[2])} = order to the cent; second invoice refused`);
  await page.goto(B + '/app.php?m=shoplokal&p=order&id=' + o1[0]);
  await page.screenshot({ path: S + '/sl-4-commande.png', fullPage: true });

  // cancel gives stock back
  const o3 = sql('SELECT id FROM shoplokal_orders WHERE number = 3');
  await page.goto(B + '/app.php?m=shoplokal&p=order&id=' + o3);
  await Promise.all([page.waitForNavigation(), page.click('[data-sl-status="cancelled"]')]);
  assert(sql(`SELECT stock FROM shoplokal_products WHERE id = ${vase}`) === '1', 'stock back');
  r = await api('/api/shoplokal/shop', { action: 'status', id: +o3, status: 'confirmed' });
  assert(r.status === 422, 'cancelled is final');
  step('order #3 cancelled → vase back in stock; a cancelled order cannot be revived');

  // BizPilot
  await page.goto(B + '/app.php?m=bizpilot');
  const bp = await page.textContent('main');
  assert(bp.includes('Boutique en ligne') && bp.includes('nouvelle(s) commande(s) en ligne'), 'bizpilot');
  step('BizPilot: « Boutique en ligne » tiles and « commandes à confirmer » in À faire');

  // member: no catalogue or settings changes
  sql("INSERT INTO users (email, password_hash, name) VALUES ('vendeur@kaz.mu', 'x', 'Vendeur')");
  sql("INSERT INTO organization_users (organization_id, user_id, role) SELECT 1, id, 'member' FROM users WHERE email = 'vendeur@kaz.mu'");
  sql("UPDATE organization_users SET role = 'member' WHERE user_id = (SELECT id FROM users WHERE email = 'admin@example.com')");
  r = await api('/api/shoplokal/shop', { action: 'product', id: 0, name: 'X', price: '10', tax_code: 'TC01', stock: '', active: true, image: '' });
  assert(r.status === 403, 'member cannot edit catalogue');
  r = await api('/api/shoplokal/shop', { action: 'paid', id: +sql('SELECT id FROM shoplokal_orders WHERE number = 2'), paid: true });
  assert(r.status === 200, 'member can mark paid');
  sql("UPDATE organization_users SET role = 'owner' WHERE user_id = (SELECT id FROM users WHERE email = 'admin@example.com')");
  step('member: handles orders, cannot touch catalogue/settings (403)');

  // English shop
  await api('/api/suite/organization', { name: 'Kaz Artisan', legal_name: 'Kaz Artisan Ltd', brn: 'C12345678', vat_number: 'VAT27000000', address: 'Port-Louis', email: '', phone: '+230 5 123 4567', document_language: 'en' });
  await m.goto(B + '/shoplokal/s.php?o=' + token);
  assert((await m.textContent('body')).includes('Your cart') && (await m.textContent('body')).includes('Place order'), 'english shop');
  await m.screenshot({ path: S + '/sl-5-shop-en-mobile.png', fullPage: true });
  step('shop page in English when the company documents are in English');

  // new link kills the old one
  await page.goto(B + '/app.php?m=shoplokal&p=settings');
  await Promise.all([page.waitForNavigation(), page.click('#sl-new-link')]);
  const res = await m.goto(B + '/shoplokal/s.php?o=' + token);
  assert(res.status() === 404, 'old link dead ' + res.status());
  await page.screenshot({ path: S + '/sl-6-reglages.png', fullPage: true });
  step('new shop link: the old one returns 404');

  // desktop shop shot
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desk.goto(await page.inputValue('#sl-link'));
  await desk.click(`[data-add="${tee.id}"]`);
  await desk.screenshot({ path: S + '/sl-7-boutique-ordi.png', fullPage: true });

  assert(errors.length === 0, 'JS errors: ' + errors.join(' | '));
  console.log('ALL GREEN');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
