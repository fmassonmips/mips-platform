const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
// Next Tuesday in Mauritius, at least 2 days ahead.
const mu = new Date(new Date().toLocaleString('en-US', { timeZone: 'Indian/Mauritius' }));
const tue = new Date(mu); tue.setDate(mu.getDate() + 2); while (tue.getDay() !== 2) tue.setDate(tue.getDate() + 1);
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const DATE = ymd(tue);
const sun = new Date(tue); sun.setDate(tue.getDate() + 5); const SUNDAY = ymd(sun);

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
  await page.click('button[data-module="rendezvous"]'); await page.waitForSelector('a[href="/app.php?m=rendezvous"]');
  step('RendezVous activated from launcher');

  // company profile (address shown to customers)
  await page.click('button[data-module="facturo"]'); await page.waitForSelector('a[href="/app.php?m=facturo"]');
  await page.goto(B + '/app.php?m=facturo&p=company');
  await page.fill('#o-name', 'Salon Belle Mare'); await page.fill('#o-legal', 'Belle Mare Beauty Ltd'); await page.fill('#o-phone', '+230 415 0000');
  await page.fill('#o-address', 'Royal Road, Belle Mare');
  await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');

  // services
  const service = async (name, dur, price) => {
    await page.goto(B + '/app.php?m=rendezvous&p=services');
    await page.fill('#s-name', name); await page.fill('#s-duration', String(dur)); await page.fill('#s-price', price);
    await Promise.all([page.waitForNavigation(), page.click('#service-form button[type=submit]')]);
    await page.waitForSelector('text=' + name);
  };
  await service('Coupe femme', 45, '800');
  await service('Barbe', 20, '');
  step('services created');

  // staff
  await page.goto(B + '/app.php?m=rendezvous&p=staff');
  await page.fill('#st-name', 'Anjali');
  await Promise.all([page.waitForNavigation(), page.click('#staff-form button[type=submit]')]);
  await page.waitForSelector('text=Anjali');
  await page.fill('#st-name', 'Kevin');
  for (let d = 1; d <= 7; d++) await page.fill('#st-h' + d, d === 2 ? '9h-12h' : '');
  await Promise.all([page.waitForNavigation(), page.click('#staff-form button[type=submit]')]);
  await page.waitForSelector('text=Kevin');
  const staffRows = (await page.locator('tbody tr').allTextContents()).map(r => r.replace(/\s+/g, ' ').trim());
  step('team: ' + staffRows.join(' | '));
  assert(staffRows.some(r => r.includes('Kevin') && r.includes('Mar 09:00-12:00')), 'Kevin hours parsed');
  // invalid hours
  await page.fill('#st-name', 'Bad'); await page.fill('#st-h1', '14-9');
  await page.click('#staff-form button[type=submit]'); await page.waitForSelector('#rv-error:not([hidden])');
  step('invalid hours refused: ' + await page.textContent('#rv-error'));

  // settings: notify email, get link
  await page.goto(B + '/app.php?m=rendezvous&p=settings');
  await page.fill('#r-notify', 'agenda@bellemare.mu'); await page.fill('#r-intro', 'Bienvenue au salon !');
  await page.click('#rv-settings-form button[type=submit]'); await page.waitForSelector('#rv-settings-saved:not([hidden])');
  const link = await page.inputValue('#rv-link');
  const pub = link.replace(/^https?:\/\/[^/]+/, B);
  step('booking link: ' + link.replace(/o=.*/, 'o=…'));

  // ---- customer books online
  const cust = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  cust.on('pageerror', e => errors.push(e.message));
  cust.on('dialog', d => d.accept());
  await cust.goto(pub);
  assert((await cust.textContent('h1')) === 'Prendre rendez-vous', 'FR booking page');
  await pick(cust, '#bk-service', 'Coupe femme');
  await cust.fill('#bk-date', DATE); await cust.dispatchEvent('#bk-date', 'change');
  await cust.waitForSelector('#bk-slots .slot');
  const times = await cust.locator('#bk-slots .slot').allTextContents();
  step(`slots ${DATE} (any): ${times.length} → ${times.slice(0, 6).join(' ')} … ${times.slice(-3).join(' ')}`);
  assert(times[0] === '08:30' && times.includes('11:45') && !times.includes('12:00') && times.includes('13:30') && times.at(-1) === '16:15', 'slot grid');
  assert(await cust.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile no overflow');
  await cust.locator('#bk-slots .slot', { hasText: '09:00' }).click();
  await cust.fill('#bk-name', 'Priya Ramdin'); await cust.fill('#bk-phone', '5712 3456'); await cust.fill('#bk-email', 'priya@example.mu');
  await cust.screenshot({ path: S + '/rv-2-booking-mobile.png', fullPage: true });
  await Promise.all([cust.waitForURL(/manage\.php/), cust.click('#booking-form button[type=submit]')]);
  assert((await cust.textContent('h1')) === 'Rendez-vous confirmé', 'confirmed');
  const details = (await cust.textContent('.appt-details')).replace(/\s+/g, ' ');
  step('confirmed: ' + details);
  await cust.screenshot({ path: S + '/rv-3-confirmed-mobile.png', fullPage: true });
  const manageUrl = cust.url();

  // API helper in the public page context
  const api = async (payload) => cust.evaluate(async (p) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch('/api/rendezvous/public', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(p) });
    return { status: r.status, body: await r.json() };
  }, payload);
  await cust.goto(pub);
  const o = new URL(pub).searchParams.get('o');
  const ids = await cust.evaluate(() => ({ s: [...document.querySelectorAll('#bk-service option')].map(x => [x.textContent, x.value]), st: [...document.querySelectorAll('#bk-staff option')].map(x => [x.textContent, x.value]) }));
  const coupe = ids.s.find(x => x[0].includes('Coupe'))[1], anjali = ids.st.find(x => x[0] === 'Anjali')[1], kevin = ids.st.find(x => x[0] === 'Kevin')[1];

  // 09:00 was given to the least busy person; the other one is still free at 09:00 for "anyone"
  let r = await api({ action: 'slots', o, service_id: +coupe, staff_id: 0, date: DATE });
  assert(r.body.slots.some(s => s.time === '09:00'), '09:00 still free with the other person');
  // Kevin works Tuesday 09-12 only; Sunday nobody
  r = await api({ action: 'slots', o, service_id: +coupe, staff_id: +kevin, date: DATE });
  step('Kevin slots: ' + r.body.slots.map(s => s.time).join(' '));
  r = await api({ action: 'slots', o, service_id: +coupe, staff_id: 0, date: SUNDAY });
  assert(r.body.slots.length === 0, 'closed on Sunday');
  step('Sunday: no slot');

  // concurrency: 4 customers want Anjali at 10:00 at the same time → exactly one wins
  const book = (name, phone, time, staff) => api({ action: 'book', o, service_id: +coupe, staff_id: staff, date: DATE, time, name, phone, email: '' });
  const res = await Promise.all([1, 2, 3, 4].map(i => book('Client ' + i, '5800000' + i, '10:00', +anjali)));
  const ok = res.filter(x => x.status === 200).length;
  step('4 simultaneous bookings for Anjali 10:00 → ' + ok + ' accepted, others: ' + res.find(x => x.status !== 200).body.error);
  assert(ok === 1, 'exactly one booking wins');
  // IP limit: 2 online bookings so far from this IP → 3 more allowed, the 6th refused
  for (let i = 0; i < 3; i++) { r = await book('Lim ' + i, '5900000' + i, ['14:00', '15:00', '16:00'][i], +anjali); assert(r.status === 200, 'limit pre ' + JSON.stringify(r.body)); }
  r = await book('Lim X', '59000009', '16:15', 0);
  assert(r.status === 409 && /Trop de réservations/.test(r.body.error), 'IP limit ' + JSON.stringify(r.body));
  step('6th online booking in an hour from the same connection refused');
  mysql(`UPDATE rendezvous_appointments SET created_ip = '10.0.0.1'`);   // reset the limit for the rest of the test
  // invalid phone
  r = await book('No phone', '12', '16:15', 0);
  assert(r.status === 409 && /téléphone/.test(r.body.error), 'phone required');
  // bad CSRF
  const bad = await cust.evaluate(async (o) => (await fetch('/api/rendezvous/public', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'x' }, body: JSON.stringify({ action: 'slots', o }) })).status, o);
  assert(bad === 419, 'csrf');
  step('invalid phone and missing CSRF token refused');

  // ---- back office agenda
  await page.goto(B + '/app.php?m=rendezvous&d=' + DATE);
  let rows = (await page.locator('table.agenda tbody tr').allTextContents()).map(r => r.replace(/\s+/g, ' ').trim());
  step('agenda ' + DATE + ': ' + rows.length + ' rdv — ' + rows[0]);
  assert(rows.length === 5, 'five appointments');
  // manual booking overlapping Anjali 10:00 → refused; at 12:00 OK
  await page.click('details summary');
  await pick(page, '#b-service', 'Barbe'); await page.selectOption('#b-staff', { label: 'Anjali' });
  await page.fill('#b-time', '10:15'); await page.fill('#b-name', 'Walk-in');
  await page.click('#rv-book-form button[type=submit]'); await page.waitForSelector('#rv-error:not([hidden])');
  step('overlap refused: ' + await page.textContent('#rv-error'));
  await page.fill('#b-time', '12:40'); await page.fill('#b-phone', '57123456');
  await Promise.all([page.waitForNavigation(), page.click('#rv-book-form button[type=submit]')]);
  await page.waitForSelector('text=Walk-in');
  // status changes
  await Promise.all([page.waitForNavigation(), page.locator('tr', { hasText: 'Walk-in' }).locator('[data-rv-status="done"]').click()]);
  await page.waitForSelector('tr:has-text("Walk-in") .status--rv-done');
  await Promise.all([page.waitForNavigation(), page.locator('tr', { hasText: 'Lim 2' }).locator('[data-rv-status="cancelled"]').click()]);
  await page.waitForSelector('tr:has-text("Lim 2") .status--rv-cancelled');
  step('walk-in booked off-hours (12:40, lunch), marked honoured; one appointment cancelled by the salon');
  await page.screenshot({ path: S + '/rv-1-agenda.png', fullPage: true });

  // cancelled slot is free again online
  r = await api({ action: 'slots', o, service_id: +coupe, staff_id: +anjali, date: DATE });
  assert(r.body.slots.some(s => s.time === '16:00'), 'cancelled slot free again');

  // ---- customer cancels from the manage link
  await cust.goto(manageUrl);
  await Promise.all([cust.waitForNavigation(), cust.click('#bk-cancel')]);
  await cust.waitForSelector('text=Ce rendez-vous est annulé.');
  step('customer cancelled from the link');

  // ---- e-mails
  const mails = require('fs').readdirSync(S + '/mail').map(f => require('fs').readFileSync(S + '/mail/' + f, 'utf8'));
  const to = (addr) => mails.filter(m => m.includes('RCPT TO:<' + addr + '>') || m.match(new RegExp('^To: .*' + addr.replace('.', '\\.'), 'mi')));
  step('e-mails: priya=' + to('priya@example.mu').length + ', agenda=' + to('agenda@bellemare.mu').length);
  assert(to('priya@example.mu').length === 2 && to('agenda@bellemare.mu').length >= 6, 'mails');

  // ---- reminder: an appointment tomorrow-ish booked > 12 h ahead
  mysql(`INSERT INTO rendezvous_appointments (organization_id, staff_id, service_id, starts_at, ends_at, customer_name, email, source, token, created_at)
         SELECT organization_id, staff_id, service_id, DATE_ADD(starts_at, INTERVAL 0 DAY), ends_at, 'Rappel Test', 'rappel@example.mu', 'staff', REPEAT('a',48), created_at
         FROM rendezvous_appointments LIMIT 1`);
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Indian/Mauritius' }));
  const in20 = new Date(now.getTime() + 20 * 3600e3), ago = new Date(now.getTime() - 48 * 3600e3);
  const fmt = d => ymd(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':00';
  mysql(`UPDATE rendezvous_appointments SET starts_at='${fmt(in20)}', ends_at=DATE_ADD('${fmt(in20)}', INTERVAL 45 MINUTE), created_at='${fmt(ago)}' WHERE token=REPEAT('a',48)`);
  const out1 = execFileSync('php', [S + '/t/tools/rendezvous_reminders.php']).toString().trim();
  const out2 = execFileSync('php', [S + '/t/tools/rendezvous_reminders.php']).toString().trim();
  step('reminders: ' + out1 + ' then ' + out2);
  assert(out1.startsWith('1 ') && out2.startsWith('0 '), 'one reminder, once');

  // ---- English booking page
  await page.goto(B + '/app.php?m=facturo&p=company');
  await page.selectOption('#o-lang', 'en'); await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  await cust.goto(pub);
  assert((await cust.textContent('h1')) === 'Book an appointment', 'EN page');
  await cust.fill('#bk-date', SUNDAY); await cust.dispatchEvent('#bk-date', 'change');
  await cust.waitForSelector('text=No time available');
  step('booking page in English when the company documents are in English');
  await page.goto(B + '/app.php?m=facturo&p=company');
  await page.selectOption('#o-lang', 'fr'); await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');

  // ---- booking closed when the app is deactivated
  await page.goto(B + '/dashboard.php');
  await page.click('button[data-module="rendezvous"][data-action="deactivate"]');
  await page.waitForLoadState('load');
  r = await api({ action: 'slots', o, service_id: +coupe, staff_id: 0, date: DATE });
  step('app deactivated → public API: ' + r.status + ' ' + (r.body.error || ''));
  assert(r.status === 409, 'closed when deactivated');

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

async function pick(p, sel, text) {
  const v = await p.$eval(sel, (el, t) => [...el.options].find(o => o.textContent.includes(t)).value, text);
  await p.selectOption(sel, v);
}
function mysql(sql) { execFileSync('mysql', [process.env.MIPS_E2E_DB || 'mips_platform', '-e', sql]); }
