const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const subjects = (addr) => fs.readdirSync(S + '/mail').map(f => fs.readFileSync(S + '/mail/' + f, 'utf8'))
  .filter(m => new RegExp('^To: .*' + addr.replace(/\./g, '\\.'), 'mi').test(m))
  .map(m => { const s = (m.match(/^Subject: (.*)$/mi) || [])[1] || ''; return s.replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8')).replace(/\s+/g, ' '); });
const line = (q, ht, bp) => { const t = q * ht; return t + Math.floor((2 * t * bp + 10000) / 20000); };
const ht = (ttc) => Math.round(ttc * 10000 / 11500);
const rs = c => 'Rs ' + Math.floor(c / 100).toLocaleString('en-US') + '.' + String(c % 100).padStart(2, '0');
const ics = (events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Airbnb Inc//Hosting Calendar//EN',
  ...events.flatMap(([s, e, sum, uid]) => ['BEGIN:VEVENT', 'DTSTAMP:20261030T100000Z', 'DTSTART;VALUE=DATE:' + s, 'DTEND;VALUE=DATE:' + e, 'SUMMARY:' + sum, 'UID:' + uid, 'END:VEVENT']),
  'END:VCALENDAR'].join('\r\n');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); return p; };
  watch(page);
  const step = (s) => console.log('✓', s);
  const call = (pg, url, p, csrf = true) => pg.evaluate(async ([u, p, csrf]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const h = { 'Content-Type': 'application/json' }; if (csrf) h['X-CSRF-Token'] = t;
    const r = await fetch(u, { method: 'POST', headers: h, body: JSON.stringify(p) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, [url, p, csrf]);
  const adm = (p) => call(page, '/api/bookora/admin', p);

  await page.goto(B + '/login.php');
  await page.fill('#email', 'admin@example.com'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  for (const m of ['bookora', 'facturo', 'bizpilot']) await Promise.all([page.waitForNavigation(), page.click(`button[data-module="${m}"][data-action="activate"]`)]);
  await call(page, '/api/suite/organization', { name: 'Villa Corail', legal_name: 'Villa Corail Ltd', brn: 'C77', vat_number: 'VAT27111111', address: 'Trou-aux-Biches', email: '', phone: '+230 5 900 1122', document_language: 'fr' });
  step('Bookora activated (with Facturo, BizPilot); company VAT-registered');

  // places
  await page.goto(B + '/app.php?m=bookora&p=units');
  assert(await page.inputValue('#u-tax') === 'TC01', 'VAT default');
  await page.fill('#u-name', 'Bungalow Corail'); await page.fill('#u-price', '3500'); await page.fill('#u-cap', '2'); await page.fill('#u-min', '2');
  await page.fill('#u-desc', 'Lit double, terrasse face au lagon, petit-déjeuner inclus.');
  await page.setInputFiles('#pr-image', __dirname + '/support/photo.png'); await page.waitForSelector('#pr-preview:not([hidden])');
  await Promise.all([page.waitForURL(/p=unit&id=\d+/), page.click('#bk-unit-form button[type=submit]')]);
  const bungalow = +new URL(page.url()).searchParams.get('id');
  await page.goto(B + '/app.php?m=bookora&p=units');
  await page.fill('#u-name', 'Villa Filaos'); await page.fill('#u-price', '9000'); await page.fill('#u-cap', '6'); await page.fill('#u-min', '3');
  await Promise.all([page.waitForURL(/p=unit&id=\d+/), page.click('#bk-unit-form button[type=submit]')]);
  const villa = +new URL(page.url()).searchParams.get('id');
  assert(sql(`SELECT price_cents FROM bookora_units WHERE id = ${villa}`) === String(ht(900000)), 'HT stored');
  // season on the villa
  await page.fill('#s-label', 'Fêtes'); await page.fill('#s-start', '2026-12-20'); await page.fill('#s-end', '2027-01-05'); await page.fill('#s-price', '12000');
  await Promise.all([page.waitForNavigation(), page.click('#bk-season button[type=submit]')]);
  let r = await adm({ action: 'season', unit_id: villa, label: 'Noël', start: '2026-12-24', end: '2026-12-26', price: '15000' });
  assert(r.status === 422 && r.body.error.includes('Fêtes'), 'season overlap');
  r = await adm({ action: 'unit', id: 0, name: 'X', price: '10', tax_code: 'TC01', capacity: '0', min_nights: '1', active: true, image: '' });
  assert(r.status === 422, 'capacity 0');
  step('places: Bungalow Corail (Rs 3,500/nuit, 2 pers., 2 nuits min., photo) and Villa Filaos (Rs 9,000, 6 pers., 3 nuits min.); season « Fêtes » 20/12→05/01 at Rs 12,000; overlapping season refused');

  // settings + link
  await page.goto(B + '/app.php?m=bookora&p=settings');
  const link = await page.inputValue('#bk-link'); const token = new URL(link).searchParams.get('o');
  const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const g = watch(await guestCtx.newPage());
  await g.goto(link);
  assert((await g.textContent('main')).includes('fermées'), 'closed');
  await page.check('input[name=booking_open]'); await page.fill('#st-intro', 'Bungalows et villa pieds dans l\'eau à Trou-aux-Biches.');
  await page.fill('#st-bank', 'MCB · Villa Corail Ltd · 000123456789'); await page.fill('#st-juice', '5 900 1122'); await page.fill('#st-notify', 'resa@villacorail.mu');
  await Promise.all([page.waitForNavigation(), page.click('#bk-settings button[type=submit]')]);
  step('booking page closed by default; opened with 30 % deposit (bank or Juice), 72 h to confirm');

  // guest search on phone: 18→22 Dec, 4 guests → only the villa (2 normal nights + 2 season nights)
  await g.goto(link);
  await g.fill('#b-in', '2026-12-18'); await g.dispatchEvent('#b-in', 'change'); await g.fill('#b-out', '2026-12-22'); await g.selectOption('#b-guests', '4');
  await g.click('#bk-search button[type=submit]');
  await g.waitForSelector('.bk-unit .bk-quote:not([hidden])');
  const expected = line(2, ht(900000), 1500) + line(2, ht(1200000), 1500);
  const villaCard = g.locator(`.bk-unit[data-unit="${villa}"]`);
  assert((await villaCard.textContent()).includes(rs(expected)), 'villa price ' + await villaCard.textContent() + ' vs ' + rs(expected));
  assert(await g.locator(`.bk-unit[data-unit="${bungalow}"].is-out`).count() === 1, 'bungalow too small');
  await g.screenshot({ path: S + '/bk-1-recherche-mobile.png', fullPage: true });
  await villaCard.locator('button').click();
  assert((await g.locator('#bk-lines li').count()) === 2, 'two price lines');
  assert((await g.textContent('#bk-deposit')).includes(rs(Math.round(expected * 0.3))), 'deposit 30 %');
  await g.fill('#g-name', 'Sophie Martin'); await g.fill('#g-phone', '+33 6 12 34 56 78'); await g.fill('#g-email', 'sophie@example.fr');
  await g.fill('#g-phone', '5 712 3344'); await g.fill('#g-note', 'Arrivée vers 16 h');
  await Promise.all([g.waitForURL(/b\.php\?t=/), g.click('#bk-request button[type=submit]')]);
  const v1 = sql(`SELECT id, number, total_cents, status, deposit_cents FROM bookora_bookings WHERE unit_id = ${villa}`).split('\t');
  assert(+v1[2] === expected && v1[3] === 'new' && +v1[4] === Math.round(expected * 0.3), 'booking ' + v1);
  const gp = await g.textContent('main');
  assert(gp.includes('En attente de confirmation') && gp.includes('000123456789') && gp.includes('réservation 1'), 'guest page');
  await g.screenshot({ path: S + '/bk-2-demande-client-mobile.png', fullPage: true });
  assert(subjects('sophie@example.fr').some(s => s.includes('Demande de réservation n° 1')) && subjects('resa@villacorail.mu').some(s => s.includes('Demande de réservation n° 1')), 'mails');
  step(`guest (phone) searches 18→22/12 for 4: only the villa fits; 2 nights at Rs 9,000 + 2 « Fêtes » nights at Rs 12,000 = ${rs(expected)}; request sent, dates held, deposit ${rs(Math.round(expected * 0.3))} by MCB or Juice; guest and owner e-mailed`);

  // held dates are taken for others; min nights, capacity, past, honeypot, CSRF
  const pub = (p, pg = g, csrf = true) => call(pg, '/api/bookora/public', Object.assign({ o: token }, p), csrf);
  r = await pub({ action: 'search', check_in: '2026-12-19', check_out: '2026-12-23', guests: 2 });
  assert(!r.body.units.some(u => u.unit_id === villa && u.available), 'villa held');
  r = await pub({ action: 'book', unit_id: bungalow, check_in: '2027-01-10', check_out: '2027-01-11', guests: 2, name: 'A', phone: '57001122' });
  assert(r.status === 422 && r.body.error.includes('2 nuits'), 'min nights ' + JSON.stringify(r));
  r = await pub({ action: 'book', unit_id: bungalow, check_in: '2027-01-10', check_out: '2027-01-12', guests: 3, name: 'A', phone: '57001122' });
  assert(r.status === 422 && r.body.error.includes('2 personnes'), 'capacity');
  r = await pub({ action: 'book', unit_id: bungalow, check_in: '2026-10-01', check_out: '2026-10-03', guests: 2, name: 'A', phone: '57001122' });
  assert(r.status === 422, 'past');
  r = await pub({ action: 'book', unit_id: bungalow, check_in: '2027-01-10', check_out: '2027-01-12', guests: 2, name: 'Bot', phone: '57001122', website: 'x' });
  assert(r.status === 200 && r.body.booking_url === null, 'honeypot');
  r = await pub({ action: 'book', unit_id: bungalow, check_in: '2027-01-10', check_out: '2027-01-12', guests: 2, name: 'A', phone: '57001122' }, g, false);
  assert(r.status === 419, 'csrf');
  step('held dates hidden from other guests; refused: 1 night (2 minimum), 3 guests in the bungalow, past dates, no CSRF; bot honeypot dropped');

  // race for the bungalow
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  const pgs = await Promise.all(ctxs.map(async c => { const p = await c.newPage(); await p.goto(link); return p; }));
  const race = await Promise.all(pgs.map((p, i) => pub({ action: 'book', unit_id: bungalow, check_in: '2027-01-10', check_out: '2027-01-13', guests: 2, name: 'Racer ' + i, phone: '5700112' + i, email: `racer${i}@example.mu` }, p)));
  assert(race.map(x => x.status).sort().join() === '200,409', 'race ' + JSON.stringify(race.map(x => x.status)));
  const racePage = pgs[race.findIndex(x => x.status === 200)];
  step('two guests ask the same bungalow nights at the same second: one request, the other « plus disponibles » (409)');

  // IP limit: 2 so far from 127.0.0.1
  for (let i = 0; i < 3; i++) {
    r = await pub({ action: 'book', unit_id: bungalow, check_in: `2027-05-0${2 * i + 1}`, check_out: `2027-05-0${2 * i + 3}`, guests: 1, name: 'L' + i, phone: '5700119' + i });
    assert(r.status === 200, 'under limit ' + JSON.stringify(r));
  }
  r = await pub({ action: 'book', unit_id: bungalow, check_in: '2027-06-01', check_out: '2027-06-03', guests: 1, name: 'L9', phone: '57001199' });
  assert(r.status === 409 && r.body.error.includes('Trop'), 'ip limit');
  sql("UPDATE bookora_bookings SET created_ip = NULL; UPDATE bookora_bookings SET status = 'cancelled' WHERE guest_name LIKE 'L_'");
  step('6th request in the hour from one connection refused');

  // guest cancels own request; owner confirms villa + deposit
  await racePage.goto(B + race.find(x => x.status === 200).body.booking_url);
  watch(racePage);
  await Promise.all([racePage.waitForNavigation(), racePage.click('#bk-cancel')]);
  assert((await racePage.textContent('main')).includes('Annulée'), 'guest cancelled');
  assert(subjects('resa@villacorail.mu').some(s => s.includes('annulée par le client')), 'owner told');
  await page.goto(B + `/app.php?m=bookora&p=booking&id=${v1[0]}`);
  await Promise.all([page.waitForNavigation(), page.click('[data-bk="confirm"]')]);
  await Promise.all([page.waitForNavigation(), page.click('[data-bk="deposit"]')]);
  assert(sql(`SELECT CONCAT(status, IF(deposit_paid_at IS NULL, '-', '+')) FROM bookora_bookings WHERE id = ${v1[0]}`) === 'confirmed+', 'confirmed + deposit');
  assert(subjects('sophie@example.fr').some(s => s.includes('confirmée')), 'confirm mail');
  const tok = sql(`SELECT token FROM bookora_bookings WHERE id = ${v1[0]}`);
  r = await call(g, '/api/bookora/public', { action: 'cancel', t: tok });
  assert(r.status === 422, 'guest cannot cancel confirmed');
  step('guest cancels own request from the booking page (owner e-mailed); owner confirms the villa, marks the deposit received (guest e-mailed); a confirmed stay cannot be cancelled online by the guest');

  // expiry: a request past its hold frees the dates; confirming it after someone else took them fails
  r = await pub({ action: 'book', unit_id: bungalow, check_in: '2027-01-20', check_out: '2027-01-23', guests: 2, name: 'Paul Lee', phone: '57004455' });
  const exp = sql("SELECT id FROM bookora_bookings WHERE guest_name = 'Paul Lee'");
  sql(`UPDATE bookora_bookings SET hold_until = NOW() - INTERVAL 1 HOUR WHERE id = ${exp}`);
  r = await pub({ action: 'search', check_in: '2027-01-20', check_out: '2027-01-23', guests: 2 });
  assert(r.body.units.some(u => u.unit_id === bungalow && u.available), 'freed after expiry');
  r = await adm({ action: 'booking', unit_id: bungalow, check_in: '2027-01-21', check_out: '2027-01-24', guests: 2, name: 'Nadia Aumeer', phone: '57006677', email: '', note: 'par téléphone' });
  assert(r.status === 200, 'manual ' + JSON.stringify(r));
  const manualId = r.body.id;
  r = await adm({ action: 'confirm', id: +exp });
  assert(r.status === 422 && r.body.error.includes('prises'), 'expired then taken');
  r = await adm({ action: 'booking', unit_id: bungalow, check_in: '2027-01-22', check_out: '2027-01-25', guests: 2, name: 'Double', phone: '57006678', email: '', note: '' });
  assert(r.status === 422 && r.body.error.includes('réservation n°'), 'manual overlap');
  step('an unconfirmed request whose 72 h ran out frees the nights; a phone booking takes them; confirming the expired request is then refused; overlapping phone booking refused');

  // closure
  r = await adm({ action: 'block', unit_id: bungalow, start: '2027-03-01', end: '2027-03-05', reason: 'Peinture' });
  r = await pub({ action: 'search', check_in: '2027-03-04', check_out: '2027-03-07', guests: 2 });
  assert(!r.body.units.some(u => u.unit_id === bungalow && u.available), 'closed nights');

  // iCal export
  const feed = sql(`SELECT ical_token FROM bookora_units WHERE id = ${villa}`);
  const bfeed = sql(`SELECT ical_token FROM bookora_units WHERE id = ${bungalow}`);
  let res = await page.request.get(B + '/bookora/ical.php?u=' + feed);
  let body = await res.text();
  assert(res.headers()['content-type'].includes('text/calendar') && body.includes('DTSTART;VALUE=DATE:20261218') && body.includes('DTEND;VALUE=DATE:20261222') && !body.includes('Sophie'), 'export');
  body = await (await page.request.get(B + '/bookora/ical.php?u=' + bfeed)).text();
  assert(body.includes('DTSTART;VALUE=DATE:20270301') && body.includes('DTEND;VALUE=DATE:20270306') && body.includes('20270121'), 'bungalow export ' + body);
  step('calendar feeds for Airbnb/Booking.com: confirmed villa stay 18→22/12, bungalow phone booking and closure 01→05/03; no guest names');

  // iCal import from a fake Airbnb: one new stay + one that overlaps Nadia's phone booking
  fs.writeFileSync(S + '/ical/airbnb.ics', ics([['20270410', '20270415', 'Reserved', 'a1@airbnb'], ['20270122', '20270124', 'Reserved', 'a2@airbnb'], ['20250101', '20250105', 'Old', 'a3@airbnb']]));
  await page.goto(B + `/app.php?m=bookora&p=unit&id=${bungalow}`);
  await page.fill('#bk-ical input[name=url]', 'http://127.0.0.1:8097/airbnb.ics');
  await Promise.all([page.waitForNavigation(), page.click('#bk-ical button[type=submit]')]);
  await page.click('#bk-sync'); await page.waitForSelector('#bk-error:not([hidden])');
  assert((await page.textContent('#bk-error')).includes('Double réservation') && (await page.textContent('#bk-error')).includes('n° '), 'double booking warning');
  assert(sql(`SELECT COUNT(*) FROM bookora_blocks WHERE unit_id = ${bungalow} AND source = 'ical'`) === '2', 'past event skipped');
  assert(subjects('resa@villacorail.mu').some(s => s.includes('double réservation')), 'owner warned');
  r = await pub({ action: 'search', check_in: '2027-04-11', check_out: '2027-04-13', guests: 2 });
  assert(!r.body.units.some(u => u.unit_id === bungalow && u.available), 'imported nights closed');
  body = await (await page.request.get(B + '/bookora/ical.php?u=' + bfeed)).text();
  assert(!body.includes('20270410'), 'imported events not echoed back');
  await page.reload();
  await page.screenshot({ path: S + '/bk-6-logement-sync.png', fullPage: true });
  // platform down: previous blocks kept, error shown
  fs.unlinkSync(S + '/ical/airbnb.ics');
  r = await adm({ action: 'ical_sync', unit_id: bungalow });
  assert(r.status === 429, 'manual sync throttled to once a minute ' + r.status);
  sql(`UPDATE bookora_units SET ical_synced_at = ical_synced_at - INTERVAL 2 MINUTE WHERE id = ${bungalow}`);
  r = await adm({ action: 'ical_sync', unit_id: bungalow });
  assert(r.body.warning && r.body.warning.includes('HTTP 404'), 'down ' + JSON.stringify(r));
  assert(sql(`SELECT COUNT(*) FROM bookora_blocks WHERE unit_id = ${bungalow} AND source = 'ical'`) === '2', 'blocks kept');
  // SSRF guard with production settings
  const ssrf = execFileSync('php', ['-r', `$_SERVER['HTTP_USER_AGENT']='cli'; require '${S}/t/src/bootstrap.php'; $GLOBALS['config']['bookora']['ical_allow_private'] = false;
    foreach (['http://127.0.0.1:8097/a.ics', 'https://127.0.0.1/a.ics', 'https://10.0.0.5/a.ics', 'https://localhost/a.ics', 'file:///etc/passwd'] as $u) {
      $unit = \\App\\Bookora\\Units::find(1, ${bungalow}); $unit['ical_import_url'] = $u; echo \\App\\Bookora\\Ical::sync($unit)[1], "\\n"; }`]).toString();
  assert(ssrf.split('\n').filter(l => l.includes('refusée')).length === 5, 'ssrf ' + ssrf);
  step('import from a fake Airbnb calendar: April stay closes the nights, past event ignored, overlap with phone booking n° flagged as « Double réservation » (owner e-mailed); imported nights never echoed back; platform down → previous nights kept + error; private/loopback/file URLs refused in production settings');

  // planning + bookings + invoice
  await page.goto(B + '/app.php?m=bookora&mo=2027-01');
  assert(await page.locator('.bk-warning').count() === 1, 'planning warning');
  assert(await page.locator('.bk-cal td.bk-booked').count() >= 3, 'booked cells');
  await page.screenshot({ path: S + '/bk-3-planning.png', fullPage: true });
  await page.goto(B + `/app.php?m=bookora&p=booking&id=${v1[0]}`);
  await page.screenshot({ path: S + '/bk-4-reservation.png', fullPage: true });
  await Promise.all([page.waitForURL(/m=facturo&p=edit/), page.click('[data-bk="invoice"]')]);
  const inv = new URL(page.url()).searchParams.get('id');
  const d = sql(`SELECT subtotal_cents, tax_cents, total_cents FROM facturo_documents WHERE id = ${inv}`).split('\t');
  const o = sql(`SELECT subtotal_cents, tax_cents, total_cents FROM bookora_bookings WHERE id = ${v1[0]}`).split('\t');
  assert(d.join() === o.join(), 'invoice = booking ' + d + ' / ' + o);
  r = await adm({ action: 'invoice', id: +v1[0] }); assert(r.status === 422, 'one invoice');
  step(`Facturo draft invoice ${rs(+d[2])} = booking to the cent (2 lines, season named); second invoice refused`);
  await page.goto(B + '/app.php?m=bookora&p=bookings&f=all');
  assert((await page.textContent('main')).includes('Expirée'), 'expired shown');
  await page.screenshot({ path: S + '/bk-5-reservations.png', fullPage: true });

  // place deletion rules
  r = await adm({ action: 'delete_unit', id: villa }); assert(r.status === 422, 'villa has bookings');
  r = await adm({ action: 'unit', id: 0, name: 'Chambre test', price: '1000', tax_code: 'TC01', capacity: '2', min_nights: '1', active: true, image: '' });
  r = await adm({ action: 'delete_unit', id: r.body.id }); assert(r.status === 200, 'delete unused');
  step('a place with bookings cannot be deleted (deactivate instead); an unused one can');

  // BizPilot
  sql("UPDATE bookora_bookings SET status = 'new', hold_until = NOW() + INTERVAL 1 DAY WHERE id = " + exp + "; UPDATE bookora_bookings SET status = 'cancelled' WHERE id = " + manualId);
  await page.goto(B + '/app.php?m=bizpilot&mo=2026-12');
  const bp = await page.textContent('main');
  assert(bp.includes('Hébergement') && bp.includes('Taux d\'occupation') && bp.includes('demande(s) de réservation à confirmer'), 'bizpilot');
  step('BizPilot: « Hébergement » occupancy and nights revenue; requests to confirm and calendar problems in « À faire »');

  // English
  await call(page, '/api/suite/organization', { name: 'Villa Corail', legal_name: 'Villa Corail Ltd', brn: 'C77', vat_number: 'VAT27111111', address: 'Trou-aux-Biches', email: '', phone: '+230 5 900 1122', document_language: 'en' });
  const desk = watch(await browser.newPage({ viewport: { width: 1280, height: 900 } }));
  await desk.goto(link);
  assert((await desk.textContent('body')).includes('See availability'), 'english');
  await desk.fill('#b-in', '2027-02-10'); await desk.dispatchEvent('#b-in', 'change'); await desk.fill('#b-out', '2027-02-14');
  await desk.click('#bk-search button[type=submit]'); await desk.waitForSelector('.bk-unit .bk-quote:not([hidden])');
  await desk.screenshot({ path: S + '/bk-7-booking-en.png', fullPage: true });
  step('booking page in English when company documents are in English');

  assert(errors.length === 0, 'JS errors: ' + errors.join(' | '));
  console.log('ALL GREEN');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
