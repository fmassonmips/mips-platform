// MIPS back-office: staff only, companies list and filters, subscribe / end / extend, notes, suspension.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const php = (code) => execFileSync('php', ['-r', "require '" + S + "/t/src/bootstrap.php'; " + code]).toString().trim();
const step = (s) => console.log('✓', s);
const hash = (pw) => execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', pw]).toString();

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const open = async (email, pw, opts = {}) => {
    const p = await (await browser.newContext(opts)).newPage();
    p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(B + '/login.php'); await p.fill('#email', email); await p.fill('#password', pw);
    await Promise.all([p.waitForURL('**/dashboard.php'), p.click('#submit-btn')]);
    return p;
  };
  const api = (p, body) => p.evaluate(async (b) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch('/api/backoffice/company', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, body);

  // a second company, set up as a pilot would be
  sql(`INSERT INTO users (email, password_hash, name, is_active, verified_at) VALUES ('staff@mips.mu', '${hash('Staff2026!')}', 'Équipe MIPS', 1, NOW()), ('nadia@zen.mu', '${hash('Zen20266!')}', 'Nadia', 1, NOW())`);
  sql("INSERT INTO organizations (name, legal_name, brn, created_at) VALUES ('Boutique Zen', 'Zen Ltd', 'C99887766', NOW() - INTERVAL 20 DAY)");
  const zen = sql("SELECT id FROM organizations WHERE name = 'Boutique Zen'");
  sql(`INSERT INTO organization_users (organization_id, user_id, role) SELECT ${zen}, id, 'owner' FROM users WHERE email = 'nadia@zen.mu'`);
  sql(`INSERT INTO organization_modules (organization_id, module_slug, status, activated_at, trial_ends_at) VALUES
       (${zen}, 'shoplokal', 'trial', NOW() - INTERVAL 27 DAY, NOW() + INTERVAL 3 DAY),
       (${zen}, 'facturo', 'trial', NOW() - INTERVAL 40 DAY, NOW() - INTERVAL 10 DAY),
       (${zen}, 'clientbloom', 'active', NOW() - INTERVAL 60 DAY, NULL)`);
  sql(`INSERT INTO shoplokal_orders (organization_id, number, customer_name, phone, delivery_method, payment_method, subtotal_cents, tax_cents, total_cents, token, created_at, updated_at)
       VALUES (${zen}, 1, 'Client', '57000000', 'pickup', 'cod', 43478, 6522, 50000, REPEAT('a', 48), NOW(), NOW())`);

  // 1. customers never see it
  const owner = await open('admin@example.com', 'Admin123!');
  assert(await owner.locator('a[href="/backoffice.php"]').count() === 0, 'no link for customers');
  let res = await owner.goto(B + '/backoffice.php');
  assert(res.status() === 404, 'page 404 for a customer');
  await owner.goto(B + '/dashboard.php');
  let r = await api(owner, { action: 'subscribe', org_id: Number(zen), app: 'facturo' });
  assert(r.status === 404 && sql(`SELECT status FROM organization_modules WHERE organization_id = ${zen} AND module_slug = 'facturo'`) === 'trial', 'API 404 for a customer');
  res = await (await (await browser.newContext()).newPage()).goto(B + '/backoffice.php');
  assert(res.url().includes('/login.php'), 'anonymous → login');
  step('a customer (even an owner) gets a 404 on the page and the API, and no link; anonymous visitors go to the login page');

  // 2. staff: link, figures, filters, search
  const st = await open('staff@mips.mu', 'Staff2026!');
  await Promise.all([st.waitForURL('**/backoffice.php'), st.click('a[href="/backoffice.php"]')]);
  const kpi = async (label) => (await st.locator('.kpi', { hasText: label }).locator('strong').textContent()).trim();
  assert(await kpi('Essais finissant') === '1' && await kpi('Abonnements') === '1', 'kpis');
  assert((await st.textContent('tbody')).includes('Boutique Zen'), 'listed');
  await st.screenshot({ path: S + '/bo-1-liste.png', fullPage: true });
  for (const [f, expect] of [['ending', true], ['read_only', true], ['customers', true], ['suspended', false]]) {
    await st.goto(B + '/backoffice.php?f=' + f);
    assert((await st.textContent('tbody')).includes('Boutique Zen') === expect, 'filter ' + f);
  }
  await st.goto(B + '/backoffice.php?q=nadia%40zen');
  assert(await st.locator('tbody tr').count() === 1, 'search by member e-mail');
  step('MIPS staff: « Back-office » link on the dashboard; figures (1 trial ending within 7 days, 1 subscription); filters ending / read-only / customers / suspended; search by a member\'s e-mail');

  // 3. company page: apps, usage, members
  await Promise.all([st.waitForURL('**/backoffice.php?org=' + zen), st.click('text=Boutique Zen')]);
  const row = (name) => st.locator('tbody tr', { hasText: name }).first();
  assert((await row('ShopLokal').textContent()).includes('Essai') && (await row('ShopLokal').textContent()).includes('1 commande'), 'shoplokal trial + usage');
  assert((await row('Facturo').textContent()).includes('Lecture seule'), 'facturo read-only');
  assert((await row('ClientBloom').textContent()).includes('Abonné'), 'clientbloom subscribed');
  assert((await st.textContent('main')).includes('nadia@zen.mu'), 'members');
  await st.screenshot({ path: S + '/bo-2-entreprise.png', fullPage: true });
  step('company page: each app with its state (trial / read-only / subscribed), trial end, activity over 30 days; members with last login');

  // 4. subscribe, end, extend
  await Promise.all([st.waitForNavigation(), row('Facturo').locator('[data-bo="subscribe"]').click()]);
  assert(sql(`SELECT CONCAT(status, IFNULL(trial_ends_at, '-')) FROM organization_modules WHERE organization_id = ${zen} AND module_slug = 'facturo'`) === 'active-', 'subscribed');
  assert(php(`echo App\\Suite\\Modules::isEnabled(${zen}, 'facturo') ? 1 : 0;`) === '1', 'writable again');
  await Promise.all([st.waitForNavigation(), row('Facturo').locator('[data-bo="end"]').click()]);
  assert(php(`echo App\\Suite\\Modules::isReadOnly(${zen}, 'facturo') ? 1 : 0;`) === '1', 'read-only after end');
  const before = sql(`SELECT DATE(trial_ends_at) FROM organization_modules WHERE organization_id = ${zen} AND module_slug = 'shoplokal'`);
  await row('ShopLokal').locator('[data-bo-extend]').click();
  await st.fill('#bo-days', '10'); await st.fill('#bo-reason', 'Pilote : attente du catalogue');
  await Promise.all([st.waitForNavigation(), st.click('#bo-extend button[type=submit]')]);
  assert(sql(`SELECT DATEDIFF(trial_ends_at, '${before}') FROM organization_modules WHERE organization_id = ${zen} AND module_slug = 'shoplokal'`) === '10', '+10 days');
  await row('Facturo').locator('[data-bo-extend]').click();
  await st.fill('#bo-days', '7');
  await Promise.all([st.waitForNavigation(), st.click('#bo-extend button[type=submit]')]);
  assert(php(`echo App\\Suite\\Modules::isEnabled(${zen}, 'facturo') ? 1 : 0;`) === '1', 'read-only reopened as trial');
  assert(sql(`SELECT DATEDIFF(trial_ends_at, NOW()) FROM organization_modules WHERE organization_id = ${zen} AND module_slug = 'facturo'`) === '7', 'counted from today');
  r = await api(st, { action: 'extend', org_id: Number(zen), app: 'shoplokal', days: 91 });
  assert(r.status === 422, '> 90 days refused');
  r = await api(st, { action: 'extend', org_id: Number(zen), app: 'clientbloom', days: 5 });
  assert(r.status === 422 && r.body.error.includes('essai'), 'subscribed app cannot be extended');
  r = await api(st, { action: 'subscribe', org_id: 999999, app: 'facturo' });
  assert(r.status === 404, 'unknown company');
  step('« Abonner » makes Facturo writable at once; « Fin d\'abonnement » turns it read-only; « Prolonger » adds 10 days to a running trial and reopens an ended one for 7 days from today; > 90 days, a subscribed app, an unknown company are refused');

  // 5. notes and log
  await st.fill('#bo-note-text', 'Appel du 30/10 : veut ShopLokal pour Noël, rappeler lundi');
  await Promise.all([st.waitForNavigation(), st.click('#bo-note button[type=submit]')]);
  const log = await st.textContent('.bo-log');
  for (const w of ['Abonnement', 'Fin d’abonnement', 'Essai prolongé', 'ShopLokal : +10 j — Pilote : attente du catalogue', 'rappeler lundi', 'Équipe MIPS']) assert(log.includes(w), 'log ' + w);
  step('note saved; the journal lists every action with its author: subscription, end, extensions (with reason), note');

  // 6. suspension
  const z = await open('nadia@zen.mu', 'Zen20266!', { viewport: { width: 390, height: 844 }, isMobile: true });
  r = await api(st, { action: 'suspend', org_id: Number(zen), reason: '' });
  assert(r.status === 422, 'reason required');
  const ownOrg = sql("SELECT organization_id FROM organization_users ou JOIN users u ON u.id = ou.user_id WHERE u.email = 'staff@mips.mu'");
  r = await api(st, { action: 'suspend', org_id: Number(ownOrg), reason: 'test' });
  assert(r.status === 422 && r.body.error.includes('membre'), 'cannot suspend own company');
  await st.fill('#bo-suspend-reason', 'Facture impayée');
  await Promise.all([st.waitForNavigation(), st.click('#bo-suspend button[type=submit]')]);
  assert((await st.textContent('main')).includes('Entreprise suspendue'), 'banner');
  await st.screenshot({ path: S + '/bo-3-suspendue.png', fullPage: true });
  await z.goto(B + '/dashboard.php');
  assert(z.url().includes('/login.php'), 'open session ended');
  await z.fill('#email', 'nadia@zen.mu'); await z.fill('#password', 'Zen20266!'); await z.click('#submit-btn');
  await z.waitForSelector('#error-message:not([hidden])');
  const msg = await z.textContent('#error-message');
  assert(msg.includes('suspendu') && msg.includes('Facture impayée') && msg.includes('abonnement@mips.mu'), 'login message ' + msg);
  await z.screenshot({ path: S + '/bo-4-connexion-suspendue.png', fullPage: true });
  assert(php(`echo App\\Suite\\Modules::isReadable(${zen}, 'shoplokal') ? 1 : 0;`) === '0', 'public pages closed');
  await owner.goto(B + '/dashboard.php');
  assert(owner.url().includes('/dashboard.php'), 'other companies unaffected');
  await Promise.all([st.waitForNavigation(), st.click('[data-bo="unsuspend"]')]);
  await z.fill('#password', 'Zen20266!');
  await Promise.all([z.waitForURL('**/dashboard.php'), z.click('#submit-btn')]);
  assert(php(`echo App\\Suite\\Modules::isReadable(${zen}, 'shoplokal') ? 1 : 0;`) === '1', 'reopened');
  assert(sql(`SELECT last_login_at IS NOT NULL FROM users WHERE email = 'nadia@zen.mu'`) === '1', 'last login recorded');
  step('suspension: reason required, never one\'s own company; the owner\'s open session ends, login says « suspendu (Facture impayée) … abonnement@mips.mu », public pages close, other companies unaffected; « Réactiver » restores everything');

  assert(errors.length === 0, 'JS errors ' + errors);
  await browser.close();
  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
