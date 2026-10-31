// Usage history: one row per member and day, 30-day charts and active days in the back-office, export, 13-month retention.
const { chromium } = require('playwright');
const { execFileSync, spawnSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);
const hash = (pw) => execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', pw]).toString();
const mu = (days) => new Date(Date.now() + 4 * 3600e3 + days * 86400e3).toISOString().slice(0, 10);

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const open = async (email, pw) => {
    const p = await (await browser.newContext({ acceptDownloads: true })).newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(B + '/login.php'); await p.fill('#email', email); await p.fill('#password', pw);
    await Promise.all([p.waitForURL('**/dashboard.php'), p.click('#submit-btn')]);
    return p;
  };

  sql(`INSERT INTO users (email, password_hash, name, is_active, terms_version) VALUES
       ('patron@epices.mu', '${hash('Patron2026!')}', 'Patron', 1, '2026-10-30'), ('vendeuse@epices.mu', '${hash('Vendeuse2026!')}', 'Vendeuse', 1, '2026-10-30'),
       ('staff@mips.mu', '${hash('Staff2026!')}', 'Équipe MIPS', 1, '2026-10-30')`);
  sql("INSERT INTO organizations (name, onboarded_at) VALUES ('Épices du Port', NOW())");
  const org = sql("SELECT id FROM organizations WHERE name = 'Épices du Port'");
  sql(`INSERT INTO organization_users (organization_id, user_id, role) SELECT ${org}, id, IF(email LIKE 'patron%', 'owner', 'member') FROM users WHERE email LIKE '%@epices.mu'`);
  sql(`INSERT INTO organization_modules (organization_id, module_slug, status, trial_ends_at) VALUES (${org}, 'shoplokal', 'trial', NOW() + INTERVAL 20 DAY)`);
  const patron = sql("SELECT id FROM users WHERE email = 'patron@epices.mu'"), vendeuse = sql("SELECT id FROM users WHERE email = 'vendeuse@epices.mu'");
  // history: the owner 12 days out of the last 29 (not today), the seller 3 days 10 days ago; one row 14 months old
  const rows = [];
  for (let d = 1; d <= 24; d += 2) rows.push(`(${org}, ${patron}, '${mu(-d)}')`);
  for (const d of [10, 11, 12]) rows.push(`(${org}, ${vendeuse}, '${mu(-d)}')`);
  rows.push(`(${org}, ${patron}, '${mu(-425)}')`);
  sql(`INSERT INTO user_activity (organization_id, user_id, day) VALUES ${rows.join(',')}`);
  sql(`INSERT INTO shoplokal_orders (organization_id, number, customer_name, phone, delivery_method, payment_method, subtotal_cents, tax_cents, total_cents, token, created_at, updated_at)
       VALUES (${org}, 1, 'A', '57000000', 'pickup', 'cod', 100, 0, 100, REPEAT('c', 48), '${mu(-2)} 10:00:00', NOW()), (${org}, 2, 'B', '57000001', 'pickup', 'cod', 100, 0, 100, REPEAT('d', 48), '${mu(-2)} 11:00:00', NOW())`);

  // 1. using the app today adds one row, once
  const p = await open('patron@epices.mu', 'Patron2026!');
  await p.goto(B + '/dashboard.php'); await p.goto(B + '/team.php'); await p.goto(B + '/dashboard.php');
  assert(sql(`SELECT COUNT(*) FROM user_activity WHERE user_id = ${patron} AND day = '${mu(0)}'`) === '1', 'today once');
  assert(sql(`SELECT COUNT(*) FROM user_activity WHERE user_id = ${patron}`) === '14', 'history + today');
  step('using the app today records one row (the date only) for the member, however many pages are opened');

  // 2. back-office
  const st = await open('staff@mips.mu', 'Staff2026!');
  await st.goto(B + '/backoffice.php?q=epices');
  const row = await st.textContent('tbody tr');
  assert(/Épices du Port[\s\S]*\b15\b/.test(row), 'active days column ' + row.replace(/\s+/g, ' '));
  await st.goto(B + '/backoffice.php?org=' + org);
  const kpi = async (label) => (await st.locator('.kpi', { hasText: label }).locator('strong').textContent()).trim();
  assert(await kpi('Jours avec au moins une connexion') === '15 / 30', 'active days kpi ' + await kpi('Jours avec au moins une connexion'));
  assert(await kpi('Membres actifs sur 7 jours') === '1 / 2' && await kpi('Enregistrements créés') === '2', 'kpis');
  assert(await st.locator('.bo-chart--users .bo-bar').count() === 30 && await st.locator('.bo-chart--records .bo-bar').count() === 30, '30 bars each');
  const tip = await st.locator('.bo-chart--records .bo-bar title').nth(27).textContent();
  assert(tip.endsWith(': 2'), 'tooltip of 2 days ago ' + tip);
  const members = await st.textContent('main');
  assert(/patron@epices\.mu[\s\S]*?\b13\b/.test(members) && /vendeuse@epices\.mu[\s\S]*?\b3\b/.test(members), 'member active days');
  await st.screenshot({ path: S + '/us-1-utilisation.png', fullPage: true });
  step('back-office: list column « Jours actifs (30 j) » = 15 (days with at least one member); company page: 15 / 30 days used, 1 / 2 members active this week, 2 records (orders), a bar per day for members and for records (weekends shaded, tooltip per day), 13 and 3 active days per member');

  // 3. export and retention
  const [dl] = await Promise.all([st.waitForEvent('download'), st.click('text=Exporter les données (ZIP)')]);
  const zip = S + '/usage-export.zip'; await dl.saveAs(zip);
  const csv = execFileSync('python3', ['-I', '-c', 'import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read("utilisation.csv").decode())', zip]).toString();
  assert(csv.includes('email,day') && csv.includes('vendeuse@epices.mu,' + mu(-10)), 'export');
  const r = spawnSync('php', [S + '/t/tools/purge_companies.php'], { encoding: 'utf8' });
  assert(r.status === 0 && sql(`SELECT COUNT(*) FROM user_activity WHERE day < CURDATE() - INTERVAL 13 MONTH`) === '0' && sql(`SELECT COUNT(*) FROM user_activity WHERE user_id = ${patron}`) === '13', 'pruned');
  step('the history is in the company export (utilisation.csv: e-mail, day) and the daily cleanup drops days older than 13 months, as the privacy policy says');

  assert(errors.length === 0, 'JS errors ' + errors);
  await browser.close();
  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
