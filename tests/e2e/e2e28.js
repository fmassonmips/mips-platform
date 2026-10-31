// Monday summary e-mail: last week + what is waiting, owner/admins, once a week, one-click unsubscribe.
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);
const hash = (pw) => execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', pw]).toString();
const run = (...a) => spawnSync('php', [S + '/t/tools/reminders.php', ...a], { encoding: 'utf8' });
const decode = (h) => h.replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
let seen = 0;
const fresh = () => { const all = fs.readdirSync(S + '/mail').sort().map(f => fs.readFileSync(S + '/mail/' + f, 'utf8')); const out = all.slice(seen); seen = all.length;
  return out.map(m => ({ to: (m.match(/^To: <(.*)>$/mi) || [])[1], subject: decode((m.match(/^Subject: (.*)$/mi) || [])[1] || ''),
    body: Buffer.from(((m.split(/\r?\n\r?\n/)[2] || '').split('--')[0]).replace(/\s+/g, ''), 'base64').toString('utf8') })); };
// Mauritius dates of last week (Monday to Sunday)
const now = new Date(Date.now() + 4 * 3600e3);
const dow = (now.getUTCDay() + 6) % 7;   // 0 = Monday
const day = (offset) => new Date(now.getTime() + (offset - dow) * 86400e3).toISOString().slice(0, 10);   // offset from this Monday

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  sql(`INSERT INTO users (email, password_hash, name, is_active, terms_version) VALUES
       ('patron@cafe.mu', '${hash('Patron2026!')}', 'Patron', 1, '2026-10-30'), ('admin@cafe.mu', '${hash('Admin2026!x')}', 'Admin', 1, '2026-10-30'),
       ('serveur@cafe.mu', '${hash('Serveur2026!')}', 'Serveur', 1, '2026-10-30'), ('calme@vide.mu', '${hash('Calme2026!')}', 'Calme', 1, '2026-10-30')`);
  sql("INSERT INTO organizations (name, legal_name, brn, onboarded_at) VALUES ('Café du Port', 'Café du Port Ltd', 'C1', NOW()), ('Vide', NULL, NULL, NOW())");
  const org = sql("SELECT id FROM organizations WHERE name = 'Café du Port'"), empty = sql("SELECT id FROM organizations WHERE name = 'Vide'");
  sql(`INSERT INTO organization_users (organization_id, user_id, role) SELECT ${org}, id, CASE WHEN email LIKE 'patron%' THEN 'owner' WHEN email LIKE 'admin%' THEN 'admin' ELSE 'member' END FROM users WHERE email LIKE '%@cafe.mu'`);
  sql(`INSERT INTO organization_users (organization_id, user_id, role) SELECT ${empty}, id, 'owner' FROM users WHERE email = 'calme@vide.mu'`);
  sql(`INSERT INTO organization_modules (organization_id, module_slug, status, trial_ends_at) VALUES
       (${org}, 'facturo', 'trial', NOW() + INTERVAL 20 DAY), (${org}, 'shoplokal', 'trial', NOW() + INTERVAL 20 DAY), (${org}, 'bizpilot', 'trial', NOW() + INTERVAL 20 DAY),
       (${empty}, 'facturo', 'trial', NOW() + INTERVAL 20 DAY)`);
  sql(`INSERT INTO facturo_clients (organization_id, name, email) VALUES (${org}, 'Hôtel', 'h@x.mu')`);
  const cl = sql(`SELECT id FROM facturo_clients WHERE organization_id = ${org}`);
  // last week: two invoices issued (one paid during the week, one overdue now), two shop orders; now: one order to confirm
  sql(`INSERT INTO facturo_documents (organization_id, type, number, status, client_id, issue_date, due_date, currency, subtotal_cents, tax_cents, total_cents, paid_at, created_by, created_at)
       VALUES (${org}, 'invoice', 'FAC-2026-0001', 'paid', ${cl}, '${day(-6)}', '${day(-6)}', 'MUR', 100000, 15000, 115000, '${day(-4)} 10:00:00', NULL, NOW()),
              (${org}, 'invoice', 'FAC-2026-0002', 'issued', ${cl}, '${day(-5)}', '${day(-1)}', 'MUR', 200000, 30000, 230000, NULL, NULL, NOW())`);
  sql(`INSERT INTO shoplokal_orders (organization_id, number, customer_name, phone, delivery_method, payment_method, subtotal_cents, tax_cents, total_cents, token, status, created_at, updated_at) VALUES
       (${org}, 1, 'A', '57000000', 'pickup', 'cod', 40000, 6000, 46000, REPEAT('e', 48), 'completed', '${day(-3)} 10:00:00', NOW()),
       (${org}, 2, 'B', '57000001', 'pickup', 'cod', 20000, 3000, 23000, REPEAT('f', 48), 'completed', '${day(-2)} 10:00:00', NOW()),
       (${org}, 3, 'C', '57000002', 'pickup', 'cod', 10000, 1500, 11500, REPEAT('g', 48), 'new', NOW(), NOW())`);
  sql("UPDATE users SET digest_opt_out = 1 WHERE email = 'admin@cafe.mu'");
  fresh();

  // 1. not Monday without the flag
  if (dow !== 0) {
    const r0 = run();
    assert(r0.status === 0 && r0.stdout.includes('0 weekly summary'), 'only on Mondays ' + r0.stdout);
    assert(fresh().length === 0, 'nothing sent');
  }
  // 2. the summary
  let r = run('--digest');
  let m = fresh();
  assert(r.status === 0 && m.length === 1 && m[0].to === 'patron@cafe.mu', 'owner only (admin opted out, member never, empty company nothing) ' + r.stdout + m.map(x => x.to));
  const b = m[0].body;
  assert(m[0].subject.startsWith('Votre semaine : Café du Port (du '), 'subject ' + m[0].subject);
  assert(b.includes('Facturé : Rs 3,450.00 (2 factures) · encaissé : Rs 1,150.00'), 'invoiced/collected ' + b);
  assert(b.includes('À encaisser : Rs 2,300.00, dont Rs 2,300.00 en retard (1 facture)'), 'receivables');
  assert(b.includes('2 commandes · Rs 690.00 TTC'), 'shop week');
  assert(b.includes('Relancer 1 facture(s) en retard') && b.includes('Confirmer 1 commande(s) en ligne'), 'to-do');
  assert(b.includes('/app.php?m=bizpilot') && /\/digest\.php\?u=\d+&s=[0-9a-f]{32}/.test(b), 'BizPilot link + unsubscribe');
  r = run('--digest'); assert(fresh().length === 0, 'once a week');
  step('Monday summary (forced with --digest; on other days nothing): only to the owner (admin turned it off, members never, a company with nothing to tell gets nothing); last week invoiced Rs 3,450.00 / collected Rs 1,150.00, Rs 2,300.00 overdue, 2 shop orders Rs 690.00; to-do with links; BizPilot link; sent once per week');

  // 3. one-click unsubscribe, safe from mail scanners
  const link = b.match(/\/digest\.php\?u=\d+&s=[0-9a-f]{32}/)[0];
  const p = await (await browser.newContext()).newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(B + link);
  assert((await p.textContent('main')).includes('activé') && sql("SELECT digest_opt_out FROM users WHERE email = 'patron@cafe.mu'") === '0', 'opening the link changes nothing');
  await p.screenshot({ path: S + '/dg-1-desabonnement.png', fullPage: true });
  await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
  assert((await p.textContent('main')).includes('ne recevrez plus') && sql("SELECT digest_opt_out FROM users WHERE email = 'patron@cafe.mu'") === '1', 'unsubscribed');
  await p.goto(B + link.replace(/s=[0-9a-f]/, 's=0').replace(/s=0[0-9a-f]/, 's=00'));
  assert(p.url().includes('/login.php'), 'bad signature → login');
  sql(`DELETE FROM notification_log WHERE kind = 'digest'`);
  run('--digest'); assert(fresh().length === 0, 'nobody left');
  step('the e-mail\'s link opens a page showing « activé » without changing anything (mail scanners); the button turns it off, no login needed; a tampered link leads to the login page; then nothing is sent');

  // 4. back on from the dashboard
  const o = await (await browser.newContext()).newPage(); o.on('pageerror', e => errors.push(e.message));
  await o.goto(B + '/login.php'); await o.fill('#email', 'patron@cafe.mu'); await o.fill('#password', 'Patron2026!');
  await Promise.all([o.waitForURL('**/dashboard.php'), o.click('#submit-btn')]);
  assert((await o.textContent('.meta')).includes('Résumé du lundi') && (await o.textContent('.meta')).includes('désactivé'), 'dashboard shows it off');
  await Promise.all([o.waitForURL('**/digest.php'), o.click('a[href="/digest.php"]')]);
  await Promise.all([o.waitForNavigation(), o.click('button[type=submit]')]);
  assert(sql("SELECT digest_opt_out FROM users WHERE email = 'patron@cafe.mu'") === '0', 'back on');
  const s = await (await browser.newContext()).newPage();
  await s.goto(B + '/login.php'); await s.fill('#email', 'serveur@cafe.mu'); await s.fill('#password', 'Serveur2026!');
  await Promise.all([s.waitForURL('**/dashboard.php'), s.click('#submit-btn')]);
  assert(!(await s.textContent('.meta')).includes('Résumé du lundi'), 'not offered to members');
  step('the owner turns it back on from the dashboard (« Résumé du lundi : désactivé · changer »); members are not offered it');

  assert(errors.length === 0, 'JS errors ' + errors);
  await browser.close();
  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
