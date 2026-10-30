const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const mu = new Date(new Date().toLocaleString('en-US', { timeZone: 'Indian/Mauritius' }));
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const TODAY = ymd(mu), MONTH = TODAY.slice(0, 7), FIRST = MONTH + '-01';
const prev = new Date(mu.getFullYear(), mu.getMonth() - 1, 15), PREV = ymd(prev), PREV_MONTH = PREV.slice(0, 7);
const ago20 = ymd(new Date(mu.getTime() - 20 * 864e5));

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

  // BizPilot alone: invites to activate other apps
  await Promise.all([page.waitForNavigation(), page.click('button[data-module="bizpilot"][data-action="activate"]')]);
  await page.goto(B + '/app.php?m=bizpilot');
  assert((await page.textContent('main')).includes('Activez-en au moins une'), 'empty state');
  step('BizPilot alone: invites to activate the other apps');
  await page.goto(B + '/dashboard.php');
  for (const m of ['facturo', 'rendezvous', 'clientbloom', 'formelio', 'flowdesk']) {
    await Promise.all([page.waitForNavigation(), page.click(`button[data-module="${m}"][data-action="activate"]`)]);
  }

  const api = (url, p) => page.evaluate(async ([u, p]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(p) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(u + ' ' + JSON.stringify(p).slice(0, 80) + ' → ' + JSON.stringify(b));
    return b;
  }, [url, p]);
  await page.goto(B + '/app.php?m=facturo');
  await api('/api/suite/organization', { name: 'Salon Belle Mare', legal_name: 'Belle Mare Beauty Ltd', brn: 'C12345678', vat_number: 'VAT27000000', address: 'Royal Road, Belle Mare', email: '', phone: '', document_language: 'fr' });
  const client = (await api('/api/facturo/clients', { action: 'save', id: 0, name: 'Hôtel Le Lagon', email: 'compta@lagon.mu' })).id;
  const client2 = (await api('/api/facturo/clients', { action: 'save', id: 0, name: 'Spa Azur', email: 'spa@azur.mu' })).id;
  const doc = async (type, cid, date, due, price) => {
    const id = (await api('/api/facturo/documents', { action: 'save', id: 0, type, client_id: cid, issue_date: date, due_date: due, currency: 'MUR', notes: '',
      lines: [{ description: 'Prestation', quantity: '1', unit_price: price, tax_code: 'TC01', nature: 'SERVICES' }] })).id;
    await api('/api/facturo/documents', { action: 'issue', id });
    return id;
  };
  const a = await doc('invoice', client, FIRST, TODAY, '1000');      // paid this month
  await api('/api/facturo/documents', { action: 'status', id: a, status: 'paid' });
  await doc('invoice', client2, FIRST, FIRST, '2000');                // overdue (due on the 1st) unless today is the 1st
  const c = await doc('invoice', client, PREV, PREV, '500');          // last month
  await api('/api/facturo/documents', { action: 'status', id: c, status: 'paid' });
  sql(`UPDATE facturo_documents SET paid_at = '${PREV} 10:00:00' WHERE id = ${c}`);
  await doc('quote', client, ago20, null, '3000');                    // to follow up
  step('Facturo: 2 invoices this month (one paid, one overdue), 1 last month, a 20-day-old quote');

  // RendezVous
  await page.goto(B + '/app.php?m=rendezvous');
  const svc = (await api('/api/rendezvous/setup', { action: 'service', id: 0, name: 'Soin visage', duration_min: 60, price: '800', active: true })).id;
  const staff = (await api('/api/rendezvous/setup', { action: 'staff', id: 0, name: 'Anjali', active: true, hours: { 1: '08:00-18:00', 2: '08:00-18:00', 3: '08:00-18:00', 4: '08:00-18:00', 5: '08:00-18:00', 6: '08:00-18:00', 7: '08:00-18:00' } })).id;
  const book = async (time, name) => (await api('/api/rendezvous/agenda', { action: 'book', service_id: svc, staff_id: staff, date: TODAY, time, name, phone: '', email: '', note: '' })).id;
  const r1 = await book('06:00', 'Mme A'), r2 = await book('07:00', 'Mme B'), r3 = await book('05:00', 'Mme C');
  await book('20:00', 'Mme D');
  for (const [id, st] of [[r1, 'done'], [r2, 'done'], [r3, 'no_show']]) await api('/api/rendezvous/agenda', { action: 'status', id, status: st });
  step('RendezVous: 2 honoured, 1 no-show, 1 still booked today');

  // ClientBloom
  await page.goto(B + '/app.php?m=clientbloom');
  const cust = (await api('/api/clientbloom/customers', { action: 'save', id: 0, name: 'Priya', phone: '57123456', email: '', tags: '', marketing_consent: false })).id;
  await api('/api/clientbloom/loyalty', { action: 'checkout', id: cust, amount: '1000', redeem: '', reference: 'T1' });
  // Formelio
  await page.goto(B + '/app.php?m=formelio');
  const form = (await api('/api/formelio/forms', { action: 'create', template: 'satisfaction' })).id;
  await api('/api/formelio/forms', { action: 'status', id: form, status: 'open' });
  const fields = JSON.parse(sql(`SELECT fields FROM formelio_forms WHERE id = ${form}`));
  const tok = sql(`SELECT public_token FROM formelio_forms WHERE id = ${form}`);
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(B + '/formelio/f.php?t=' + tok);
  for (const [rating, nps] of [[5, 10], [3, 6]]) {
    const st = await anon.evaluate(async ([t, f, r, n]) => (await fetch('/api/formelio/public', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name=csrf-token]').content },
      body: JSON.stringify({ t, answers: { [f[0].id]: String(r), [f[1].id]: String(n) } }) })).status, [tok, fields, rating, nps]);
    assert(st === 200, 'formelio answer');
  }
  // FlowDesk
  await page.goto(B + '/app.php?m=flowdesk');
  const t1 = (await api('/api/flowdesk/tickets', { action: 'create', name: 'Client X', email: 'x@example.mu', phone: '', subject: 'Question', message: 'Bonjour' })).id;
  await api('/api/flowdesk/tickets', { action: 'create', name: 'Client Y', email: '', phone: '', subject: 'Urgent', message: 'Rappelez-moi' });
  await api('/api/flowdesk/tickets', { action: 'answer', id: t1, kind: 'reply', body: 'Réponse', status: '' });
  step('ClientBloom sale, 2 survey answers, 2 tickets (one answered)');

  // ---- dashboard
  await page.goto(B + '/app.php?m=bizpilot');
  const txt = (await page.textContent('main')).replace(/\s+/g, ' ');
  const tile = async (label) => (await page.locator('.kpi', { has: page.locator('.kpi-label', { hasText: new RegExp('^' + label + '$') }) }).textContent()).replace(/\s+/g, ' ').trim();
  const todo = (await page.locator('.todo li').allTextContents()).map(x => x.trim());
  step('À faire: ' + todo.join(' | '));
  assert(todo.some(x => x.includes('en retard de paiement : Rs 2,300.00')), 'overdue');
  assert(todo.some(x => x.includes('devis') && x.includes('relancer')), 'stale quote');
  assert(todo.some(x => x.includes('1 ticket(s) support sans réponse')), 'unanswered');
  assert(todo.some(x => x.includes('1 rendez-vous aujourd')), 'today');
  const checks = {
    'Facturé TTC': 'Rs 3,450.00', 'Factures payées': 'Rs 1,150.00', 'Impayés': 'Rs 2,300.00', 'Devis en attente': 'Rs 3,450.00',
    'Rendez-vous': '4', "Taux d'absence": '33 %', 'Prestations honorées': 'Rs 1,600.00',
    'Ventes fidélité': 'Rs 1,000.00', 'Score NPS': '0', 'Note moyenne': '4,0 / 5', 'Tickets reçus': '2', 'À traiter maintenant': '1',
  };
  for (const [label, value] of Object.entries(checks)) {
    const t = await tile(label);
    assert(t.includes(value), label + ' → ' + t);
  }
  step('tiles: ' + Object.keys(checks).length + ' figures checked (facturé Rs 3,450.00, impayés Rs 2,300.00, absence 33 %, NPS 0, note 4,0)');
  const fact = await tile('Facturé TTC');
  assert(fact.includes('▲ +500 %'), 'delta vs last month ' + fact);
  step('comparison with last month: ' + fact);
  await page.screenshot({ path: S + '/bp-1-dashboard.png', fullPage: true });

  // previous month
  await page.goto(B + '/app.php?m=bizpilot&mo=' + PREV_MONTH);
  assert((await tile('Facturé TTC')).includes('Rs 575.00') && (await tile('Factures payées')).includes('Rs 575.00'), 'previous month');
  step('previous month: Rs 575.00 invoiced and paid');

  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(B + '/app.php?m=bizpilot');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile overflow');
  await page.screenshot({ path: S + '/bp-2-mobile.png', fullPage: true });
  step('mobile: no horizontal overflow');

  // member without management role
  sql("UPDATE organization_users SET role = 'member'");
  await page.goto(B + '/app.php?m=bizpilot');
  assert((await page.textContent('main')).includes('réservé au propriétaire'), 'members blocked');
  sql("UPDATE organization_users SET role = 'owner'");
  step('members see no figures');

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
