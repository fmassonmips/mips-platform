// Demo company seeder: guarded, complete, resettable, every app filled, BizPilot alive.
const { chromium } = require('playwright');
const { execFileSync, spawnSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const seed = (...args) => spawnSync('php', [S + '/t/tools/demo_seed.php', ...args], { encoding: 'utf8' });
const step = (s) => console.log('✓', s);

(async () => {
  let r = seed();
  assert(r.status === 1 && r.stderr.includes('--yes'), 'needs --yes');
  r = seed('--yes', '--password=court');
  assert(r.status === 1, 'short password');
  step('refuses to run without --yes, or with a password under 8 characters');

  const mails = sql('SELECT COUNT(*) FROM users');
  r = seed('--yes');
  assert(r.status === 0 && r.stderr === '', 'clean run: ' + r.stderr);
  const pw = r.stdout.match(/Password: (\S+)/)[1];
  assert(pw.length >= 12, 'random password generated');
  const org = sql("SELECT id FROM organizations WHERE name = 'Le Lagon Bleu'");
  const counts = sql(`SELECT
    (SELECT COUNT(*) FROM organization_users WHERE organization_id = ${org}),
    (SELECT COUNT(*) FROM organization_modules WHERE organization_id = ${org} AND status = 'active'),
    (SELECT COUNT(*) FROM facturo_documents WHERE organization_id = ${org} AND type = 'invoice'),
    (SELECT COUNT(*) FROM clientbloom_customers WHERE organization_id = ${org}),
    (SELECT COUNT(*) FROM rendezvous_appointments WHERE organization_id = ${org}),
    (SELECT COUNT(*) FROM formelio_responses WHERE organization_id = ${org}),
    (SELECT COUNT(*) FROM flowdesk_tickets WHERE organization_id = ${org}),
    (SELECT COUNT(*) FROM teamnest_tasks WHERE organization_id = ${org}),
    (SELECT COUNT(*) FROM shoplokal_orders WHERE organization_id = ${org}),
    (SELECT COUNT(*) FROM staffzen_requests WHERE organization_id = ${org}),
    (SELECT COUNT(*) FROM bookora_bookings WHERE organization_id = ${org})`).split('\t').map(Number);
  assert(counts[0] === 5 && counts[1] === 10 && counts.slice(2).every(n => n > 5), 'data in every app ' + counts);
  // invoices numbered in date order, totals consistent
  const order = sql(`SELECT GROUP_CONCAT(number ORDER BY issue_date, id) = GROUP_CONCAT(number ORDER BY number) FROM facturo_documents WHERE organization_id = ${org} AND type = 'invoice'`);
  assert(order === '1', 'numbers follow dates');
  assert(sql(`SELECT COUNT(*) FROM facturo_documents WHERE organization_id = ${org} AND total_cents <> subtotal_cents + tax_cents`) === '0', 'totals');
  assert(sql(`SELECT COUNT(*) FROM clientbloom_customers c WHERE organization_id = ${org} AND balance_cents <> (SELECT COALESCE(SUM(cashback_cents), 0) FROM clientbloom_transactions t WHERE t.customer_id = c.id)`) === '0', 'ledger balances');
  // no two stays on the same night
  assert(sql(`SELECT COUNT(*) FROM bookora_bookings a JOIN bookora_bookings b ON a.unit_id = b.unit_id AND a.id < b.id AND a.check_in < b.check_out AND b.check_in < a.check_out
              WHERE a.organization_id = ${org} AND a.status IN ('new','confirmed') AND b.status IN ('new','confirmed')`) === '0', 'no double booking');
  assert(sql(`SELECT COUNT(*) FROM rendezvous_appointments a JOIN rendezvous_appointments b ON a.staff_id = b.staff_id AND a.id < b.id AND a.starts_at < b.ends_at AND b.starts_at < a.ends_at
              WHERE a.organization_id = ${org} AND a.status <> 'cancelled' AND b.status <> 'cancelled'`) === '0', 'no double appointment');
  step(`seeded in one clean run: 5 people, 10 apps active, ${counts.slice(2).join(' / ')} invoices / customers / appointments / responses / tickets / tasks / orders / leave / stays; invoice numbers follow dates, totals and loyalty balances consistent, no night or therapist booked twice`);

  r = seed('--yes');
  assert(r.status === 1 && r.stderr.includes('--reset'), 'second run refused');
  const before = sql("SELECT COUNT(*) FROM users WHERE email NOT LIKE '%@lagonbleu.example'");
  r = seed('--yes', '--reset', '--password=Demo2026!');
  assert(r.status === 0 && r.stderr === '', 'reset ' + r.stderr);
  assert(sql("SELECT COUNT(*) FROM organizations WHERE name = 'Le Lagon Bleu'") === '1', 'one demo company');
  assert(sql("SELECT COUNT(*) FROM users WHERE email NOT LIKE '%@lagonbleu.example'") === before, 'other accounts untouched');
  step('a second run is refused without --reset; --reset recreates it and leaves every other account alone');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(B + '/login.php');
  await page.fill('#email', 'kevin@lagonbleu.example'); await page.fill('#password', 'Demo2026!');
  await page.click('#submit-btn'); await page.waitForSelector('#error-message:not([hidden])');
  await page.fill('#email', 'demo@lagonbleu.example'); await page.fill('#password', 'Demo2026!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  assert((await page.textContent('.meta')).includes('5 personnes'), 'team of 5');
  step('demo owner logs in; the colleagues\' accounts cannot (random passwords)');

  await page.goto(B + '/app.php?m=bizpilot');
  const todo = await page.textContent('.todo');
  for (const s of ['facture(s) en retard', 'devis envoyé', 'ticket(s) support sans réponse', 'stock bas', 'demande(s) de réservation à confirmer', 'demande(s) de congé à valider', 'tâche(s) en retard'])
    assert(todo.includes(s), 'todo ' + s);
  const tiles = await page.$$eval('.card h3', hs => hs.map(h => h.textContent.trim()));
  for (const t of ['Facturation', 'Rendez-vous', 'Fidélité', 'Satisfaction', 'Support', 'Boutique en ligne', 'Hébergement']) assert(tiles.includes(t), 'tile ' + t);
  step('BizPilot: every block filled and « À faire » lists overdue invoices, a quote to chase, an unanswered ticket, low stock, bookings and leave to approve, late tasks');

  for (const m of ['facturo&p=invoices', 'clientbloom&p=customers', 'rendezvous', 'formelio', 'flowdesk', 'teamnest', 'shoplokal', 'staffzen&p=approvals', 'bookora&p=bookings']) {
    const res = await page.goto(B + '/app.php?m=' + m);
    assert(res.status() === 200 && !(await page.textContent('main')).includes('introuvable'), 'page ' + m);
  }
  assert(errors.length === 0, 'JS errors ' + errors);
  step('every app opens on real data without errors');
  console.log('ALL GREEN');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
