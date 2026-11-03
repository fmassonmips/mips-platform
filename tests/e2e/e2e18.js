// Trial over → read-only: pages, printing, exports and the iCal feed keep working; every write and public intake stops.
const { chromium } = require('playwright');
const { execFileSync, spawnSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);

(async () => {
  let r = spawnSync('php', [S + '/t/tools/demo_seed.php', '--yes', '--password=Demo2026!'], { encoding: 'utf8' });
  assert(r.status === 0, 'seed ' + r.stderr);
  const org = sql("SELECT id FROM organizations WHERE name = 'Le Lagon Bleu'");
  // every app: trial started 31 days ago, ended yesterday
  sql(`UPDATE organization_modules SET status = 'trial', trial_ends_at = NOW() - INTERVAL 1 DAY WHERE organization_id = ${org}`);
  const before = sql(`SELECT (SELECT COUNT(*) FROM facturo_documents WHERE organization_id = ${org}), (SELECT COUNT(*) FROM bookora_bookings WHERE organization_id = ${org})`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(B + '/login.php'); await page.fill('#email', 'demo@lagonbleu.example'); await page.fill('#password', 'Demo2026!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  assert(await page.locator('.app-badge--ro').count() === 10, 'ten read-only badges');
  assert(await page.locator('a:text("Consulter")').count() === 10, 'consult links');
  assert(await page.locator('button[data-action="activate"]').count() === 0, 'no new trial');
  await page.screenshot({ path: S + '/ro-1-lanceur.png', fullPage: true });
  step('launcher: the 10 apps read « Essai terminé le … · lecture seule » with « Consulter »; no way to restart a trial');

  const api = (url, p) => page.evaluate(async ([u, p]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const res = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(p) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, [url, p]);

  // Facturo
  await page.goto(B + '/app.php?m=facturo&p=invoices');
  assert((await page.textContent('.ro-banner')).includes('lecture seule'), 'banner');
  assert(await page.locator('main table tbody tr').count() > 10, 'invoices listed');
  const invId = sql(`SELECT id FROM facturo_documents WHERE organization_id = ${org} AND type = 'invoice' ORDER BY id DESC LIMIT 1`);
  await page.goto(B + '/app.php?m=facturo&p=edit&id=' + invId);
  assert((await page.textContent('main')).includes('FAC-'), 'invoice opened');
  const visibleButtons = await page.$$eval('.app-main button', bs => bs.filter(b => b.offsetParent !== null).length);
  assert(visibleButtons === 0, 'action buttons hidden ' + visibleButtons);
  await page.screenshot({ path: S + '/ro-2-facture.png', fullPage: true });
  let res = await page.goto(B + '/facturo/print.php?id=' + invId);
  assert(res.status() === 200 && (await page.textContent('body')).includes('FAC-'), 'print');
  await page.goto(B + '/app.php?m=facturo&p=invoices');
  r = await api('/api/facturo/clients', { action: 'save', id: 0, name: 'Nouveau', email: 'n@example.com' });
  assert(r.status === 403 && r.body.read_only === true && r.body.error.includes('lecture seule'), 'facturo write ' + JSON.stringify(r));
  r = await api('/api/facturo/documents', { action: 'status', id: +invId, status: 'paid' });
  assert(r.status === 403, 'status change refused');
  step('Facturo: invoices listed and opened with the read-only banner, action buttons hidden; printing / PDF works; any write (new client, mark paid) refused with « lecture seule » (403)');

  // ClientBloom export + caisse
  await page.goto(B + '/app.php?m=clientbloom&p=customers');
  const csv = await page.request.get(B + '/clientbloom/export.php?s=all');
  assert(csv.status() === 200 && (await csv.text()).split('\n').length > 30, 'clientbloom export');
  r = await api('/api/clientbloom/loyalty', { action: 'checkout', customer_id: 1, amount: '100', redeem: '0' });
  assert(r.status === 403, 'checkout refused');
  step('ClientBloom: customers viewable and CSV export works (data stays portable); checkout refused');

  // Formelio
  await page.goto(B + '/app.php?m=formelio');
  const results = await page.getAttribute('a[href*="p=results"]', 'href');
  await page.goto(B + (results.startsWith('/') ? results : '/' + results));
  assert((await page.textContent('main')).includes('46 réponses'), 'responses visible');
  assert(await page.locator('details.response').first().isVisible(), 'answers stay visible');
  const formToken = sql(`SELECT public_token FROM formelio_forms WHERE organization_id = ${org} LIMIT 1`);
  res = await page.goto(B + '/formelio/f.php?f=' + formToken);
  assert(!(await page.locator('form button[type=submit]').count()), 'public form closed');
  step('Formelio: results and every answer visible; the public survey no longer takes answers');

  // RendezVous agenda navigation
  await page.goto(B + '/app.php?m=rendezvous');
  assert(await page.locator('#rv-goto input').isEnabled(), 'date navigation still works');
  assert(await page.locator('details:has(form)').count() === 0 || !(await page.locator('details:has(form)').first().isVisible()), 'new appointment hidden');
  const rvTok = sql(`SELECT public_token FROM rendezvous_settings WHERE organization_id = ${org}`);
  await page.goto(B + '/rendezvous/book.php?o=' + rvTok);
  assert(await page.locator('#booking-form, form button[type=submit]').count() === 0, 'online booking closed');
  step('RendezVous: agenda viewable, date navigation works, « Nouveau rendez-vous » hidden; online booking page closed');

  // ShopLokal / Bookora public
  const slTok = sql(`SELECT public_token FROM shoplokal_settings WHERE organization_id = ${org}`);
  await page.goto(B + '/shoplokal/s.php?o=' + slTok);
  assert((await page.textContent('main')).includes('fermée'), 'shop closed');
  const bkTok = sql(`SELECT public_token FROM bookora_settings WHERE organization_id = ${org}`);
  await page.goto(B + '/bookora/s.php?o=' + bkTok);
  assert((await page.textContent('main')).includes('fermées'), 'booking closed');
  r = await page.evaluate(async (o) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const x = await fetch('/api/bookora/public', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify({ action: 'search', o, check_in: '2027-02-01', check_out: '2027-02-03', guests: 2 }) });
    return x.status;
  }, bkTok);
  assert(r === 409, 'bookora API closed');
  const feed = sql(`SELECT ical_token FROM bookora_units WHERE organization_id = ${org} LIMIT 1`);
  const ics = await page.request.get(B + '/bookora/ical.php?u=' + feed);
  assert(ics.status() === 200 && (await ics.text()).includes('BEGIN:VEVENT'), 'ical still served');
  step('ShopLokal and Bookora public pages closed (API refuses too); the iCal feed is still served so Airbnb / Booking.com keep blocking the nights already booked');

  // BizPilot still reports
  await page.goto(B + '/app.php?m=bizpilot');
  const tiles = await page.$$eval('.card h3', hs => hs.map(h => h.textContent.trim()));
  assert(['Facturation', 'Hébergement', 'Boutique en ligne'].every(t => tiles.includes(t)), 'bizpilot tiles ' + tiles);
  await page.screenshot({ path: S + '/ro-3-bizpilot.png', fullPage: true });
  step('BizPilot, itself read-only, still shows every app\'s figures');

  // switch off / back on
  await page.goto(B + '/dashboard.php');
  await Promise.all([page.waitForNavigation(), page.click('button[data-action="deactivate"][data-module="teamnest"]')]);
  res = await page.goto(B + '/app.php?m=teamnest');
  assert(page.url().includes('/dashboard.php'), 'switched off');
  await Promise.all([page.waitForNavigation(), page.click('button[data-action="activate"][data-module="teamnest"]')]);
  assert(sql(`SELECT CONCAT(status, IF(trial_ends_at <= NOW(), ' ended', ' running')) FROM organization_modules WHERE organization_id = ${org} AND module_slug = 'teamnest'`) === 'trial ended', 'back read-only, no new trial');
  await page.goto(B + '/app.php?m=teamnest');
  assert(await page.locator('.project-card').count() === 2, 'projects kept');
  step('switching a read-only app off hides it; « Réactiver en lecture seule » brings it back with its data, without a new trial');

  // subscription by MIPS staff
  r = spawnSync('php', [S + '/t/tools/subscribe.php', '--org=' + org, '--app=facturo'], { encoding: 'utf8' });
  assert(r.status === 0 && r.stdout.includes('facturo      subscribed') && r.stdout.includes('read-only'), 'subscribe ' + r.stdout);
  await page.goto(B + '/app.php?m=facturo&p=invoices');
  assert(await page.locator('.ro-banner').count() === 0, 'no banner once subscribed');
  r = await api('/api/facturo/clients', { action: 'save', id: 0, name: 'Hôtel Nouveau', email: 'hotel@example.com' });
  assert(r.status === 200, 'write after subscription ' + JSON.stringify(r));
  r = spawnSync('php', [S + '/t/tools/subscribe.php', '--org=' + org, '--app=facturo', '--end'], { encoding: 'utf8' });
  assert(r.stdout.includes('facturo      read-only'), 'end ' + r.stdout);
  r = await api('/api/facturo/clients', { action: 'save', id: 0, name: 'Encore', email: 'e@example.com' });
  assert(r.status === 403, 'read-only again');
  step('tools/subscribe.php: subscribing makes Facturo writable again at once; --end puts it back to read-only');

  const after = sql(`SELECT (SELECT COUNT(*) FROM facturo_documents WHERE organization_id = ${org}), (SELECT COUNT(*) FROM bookora_bookings WHERE organization_id = ${org})`);
  assert(before === after, 'no data lost or added ' + before + ' / ' + after);
  assert(errors.length === 0, 'JS errors ' + errors);
  step('no data lost while read-only');
  console.log('ALL GREEN');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
