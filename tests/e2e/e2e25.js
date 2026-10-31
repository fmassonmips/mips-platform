// Data export (owner, MIPS team) and account closing: closed at once, cancellable, deleted after 30 days.
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const php = (code) => execFileSync('php', ['-r', "require '" + S + "/t/src/bootstrap.php'; " + code]).toString().trim();
const step = (s) => console.log('✓', s);
const hash = (pw) => execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', pw]).toString();
const unzip = (file) => JSON.parse(execFileSync('python3', ['-I', '-c',
  'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n: z.read(n).decode("utf-8","replace") if n.endswith((".csv",".txt")) else len(z.read(n)) for n in z.namelist()}))', file]).toString());
const decode = (h) => h.replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
const mailsTo = (addr) => fs.readdirSync(S + '/mail').sort().map(f => fs.readFileSync(S + '/mail/' + f, 'utf8')).filter(m => m.includes('To: <' + addr + '>'))
  .map(m => ({ subject: decode((m.match(/^Subject: (.*)$/mi) || [])[1] || ''), body: Buffer.from(((m.split(/\r?\n\r?\n/)[2] || '').split('--')[0]).replace(/\s+/g, ''), 'base64').toString('utf8') }));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const open = async (email, pw) => {
    const p = await (await browser.newContext({ acceptDownloads: true })).newPage();
    p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(B + '/login.php'); await p.fill('#email', email); await p.fill('#password', pw);
    await Promise.all([p.waitForURL('**/dashboard.php'), p.click('#submit-btn')]);
    return p;
  };
  const api = (p, url, b) => p.evaluate(async ([u, b]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const res = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(b) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, [url, b]);

  // a company with data, a member, the MIPS team
  sql(`INSERT INTO users (email, password_hash, name, is_active) VALUES ('owner@boutique.mu', '${hash('Owner2026!')}', 'Owner', 1), ('membre@boutique.mu', '${hash('Membre2026!')}', 'Membre', 1), ('staff@mips.mu', '${hash('Staff2026!')}', 'Équipe MIPS', 1)`);
  sql("INSERT INTO organizations (name, legal_name, brn, onboarded_at) VALUES ('Boutique Zen', 'Zen Ltd', 'C99887766', NOW())");
  const org = sql("SELECT id FROM organizations WHERE name = 'Boutique Zen'");
  sql(`INSERT INTO organization_users (organization_id, user_id, role) SELECT ${org}, id, IF(email LIKE 'owner%', 'owner', 'member') FROM users WHERE email LIKE '%@boutique.mu'`);
  sql(`INSERT INTO organization_modules (organization_id, module_slug, status, trial_ends_at) VALUES (${org}, 'facturo', 'trial', NOW() + INTERVAL 3 DAY), (${org}, 'shoplokal', 'trial', NOW() + INTERVAL 20 DAY)`);
  sql(`INSERT INTO facturo_clients (organization_id, name, email) VALUES (${org}, '=HYPERLINK("http://x")', 'piege@client.mu'), (${org}, 'Hôtel Le Récif', 'compta@recif.mu')`);
  sql(`INSERT INTO shoplokal_products (organization_id, name, price_cents, tax_code, image, active, created_at) VALUES (${org}, 'Savon', 21739, 'TC01', '${PNG}', 1, NOW())`);
  sql(`INSERT INTO shoplokal_settings (organization_id, public_token) VALUES (${org}, REPEAT('b', 32)) ON DUPLICATE KEY UPDATE public_token = REPEAT('b', 32)`);
  const shopToken = sql(`SELECT public_token FROM shoplokal_settings WHERE organization_id = ${org}`);
  const product = sql(`SELECT id FROM shoplokal_products WHERE organization_id = ${org}`);

  // 1. export by the owner
  const o = await open('owner@boutique.mu', 'Owner2026!');
  await Promise.all([o.waitForURL('**/data.php'), o.click('text=Télécharger ou fermer le compte')]);
  const [dl] = await Promise.all([o.waitForEvent('download'), o.click('#export-link')]);
  assert(/^mips-export-boutique-zen-\d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename()), 'name ' + dl.suggestedFilename());
  const zfile = S + '/export-test.zip'; await dl.saveAs(zfile);
  const z = unzip(zfile);
  assert(z['facturo_clients.csv'].startsWith('﻿') && z['facturo_clients.csv'].includes('Hôtel Le Récif') && z['facturo_clients.csv'].includes(`"'=HYPERLINK(""http://x"")"`), 'clients csv, formula neutralised');
  assert(z[`images/produits/${product}.png`] > 0 && z['shoplokal_products.csv'].includes(`images/produits/${product}.png`) && !z['shoplokal_products.csv'].includes('base64'), 'photo as a file');
  const all = Object.values(z).filter(v => typeof v === 'string').join('\n');
  assert(!/password_hash|token_hash|public_token|mra_password_enc|bbbbbbbbbbbbbbbb/.test(all), 'no secrets or private links');
  assert(z['equipe.csv'].includes('membre@boutique.mu') && z['LISEZMOI.txt'].includes('Boutique Zen') && Object.keys(z).length >= 41, 'team, readme, every table');
  await o.screenshot({ path: S + '/cl-1-donnees.png', fullPage: true });
  step('owner: « Vos données » → ZIP « mips-export-boutique-zen-<date>.zip »: one CSV per table (UTF-8 BOM, accents), product photo as a file, team, LISEZMOI; a client named =HYPERLINK(…) is neutralised; no password, MRA secret or private link');

  // 2. a member can do neither
  const m = await open('membre@boutique.mu', 'Membre2026!');
  assert(await m.locator('a[href="/data.php"]').count() === 0, 'no link for a member');
  await m.goto(B + '/data.php'); assert(m.url().includes('/dashboard.php'), 'member → dashboard');
  await m.goto(B + '/export.php'); assert(m.url().includes('/dashboard.php'), 'member export → dashboard');
  let r = await api(m, '/api/suite/closure', { action: 'request', name: 'Boutique Zen', password: 'Membre2026!' });
  assert(r.status === 403, 'member cannot close');
  step('a member sees no link, and gets the dashboard instead of the page or the export; closing refused (403)');

  // 3. closing
  await o.goto(B + '/data.php');
  await o.fill('#cl-name', 'Boutique Zn'); await o.fill('#cl-password', 'Owner2026!'); await o.click('#closure-form button[type=submit]');
  await o.waitForSelector('#data-error:not([hidden])'); assert((await o.textContent('#data-error')).includes('exactement'), 'name check');
  await o.fill('#cl-name', 'boutique zen'); await o.fill('#cl-password', 'Mauvais2026!'); await o.click('#closure-form button[type=submit]');
  await o.waitForFunction(() => document.getElementById('data-error').textContent.includes('Mot de passe incorrect'));
  await o.fill('#cl-password', 'Owner2026!');
  await Promise.all([o.waitForNavigation(), o.click('#closure-form button[type=submit]')]);
  assert((await o.textContent('main')).includes('Fermeture du compte demandée'), 'banner');
  await o.screenshot({ path: S + '/cl-2-fermeture.png', fullPage: true });
  const days = sql(`SELECT DATEDIFF(deletion_scheduled_at, NOW()) FROM organizations WHERE id = ${org}`);
  assert(days === '30', '30 days ' + days);
  assert(php(`echo App\\Suite\\Modules::isReadable(${org}, 'shoplokal') ? 1 : 0;`) === '0', 'apps and public pages closed');
  let res = await o.goto(B + '/shoplokal/s.php?o=' + shopToken);
  assert(res.status() >= 400 || !(await o.textContent('body')).includes('Savon'), 'public shop closed');
  await m.goto(B + '/dashboard.php'); assert(m.url().includes('/login.php'), 'member session ended');
  await m.fill('#email', 'membre@boutique.mu'); await m.fill('#password', 'Membre2026!'); await m.click('#submit-btn');
  await m.waitForSelector('#error-message:not([hidden])'); assert((await m.textContent('#error-message')).includes('fermeture du compte'), 'member login message');
  await o.goto(B + '/dashboard.php');
  assert((await o.textContent('main')).includes('toutes les données seront supprimées'), 'owner still in, dashboard banner');
  const mail = mailsTo('owner@boutique.mu').pop();
  assert(mail.subject === 'Fermeture de votre compte MIPS : Boutique Zen' && mail.body.includes('/data.php') && mail.body.includes('annulez'), 'request e-mail');
  const before = fs.readdirSync(S + '/mail').length;
  assert(spawnSync('php', [S + '/t/tools/reminders.php'], { encoding: 'utf8' }).status === 0 && fs.readdirSync(S + '/mail').length === before, 'no trial reminder to a closing company');
  step('closing: wrong name / wrong password refused; then 30 days; apps and public shop closed, the member logged out and told « fermeture du compte demandée » at login; the owner still logs in (banner) and gets an e-mail with the date, the link to download or cancel; no more automatic e-mails');

  // 4. cancel by the owner; again, then by the MIPS team
  await o.goto(B + '/data.php');
  await Promise.all([o.waitForNavigation(), o.click('#closure-cancel')]);
  assert(sql(`SELECT deletion_scheduled_at IS NULL FROM organizations WHERE id = ${org}`) === '1' && php(`echo App\\Suite\\Modules::isEnabled(${org}, 'shoplokal') ? 1 : 0;`) === '1', 'reopened');
  await o.fill('#cl-name', 'Boutique Zen'); await o.fill('#cl-password', 'Owner2026!');
  await Promise.all([o.waitForNavigation(), o.click('#closure-form button[type=submit]')]);
  const st = await open('staff@mips.mu', 'Staff2026!');
  await st.goto(B + '/backoffice.php?f=closing');
  assert((await st.textContent('tbody')).includes('Boutique Zen') && (await st.textContent('tbody')).includes('suppression le'), 'back-office filter + tag');
  await st.goto(B + '/backoffice.php?org=' + org);
  const [sdl] = await Promise.all([st.waitForEvent('download'), st.click('text=Exporter les données (ZIP)')]);
  assert(sdl.suggestedFilename().startsWith('mips-export-boutique-zen'), 'staff export');
  await st.goto(B + '/backoffice.php?org=' + org);
  await st.screenshot({ path: S + '/cl-3-backoffice.png', fullPage: true });
  await Promise.all([st.waitForNavigation(), st.click('[data-bo="reopen"]')]);
  const log = await st.textContent('.bo-log');
  assert(log.includes('Export des données') && log.includes('Fermeture annulée'), 'logged');
  assert(sql(`SELECT deletion_scheduled_at IS NULL FROM organizations WHERE id = ${org}`) === '1', 'staff reopened');
  step('the owner cancels: everything back; closing again shows in the back-office (filter « Fermeture demandée », tag « suppression le … »); the MIPS team exports the data and cancels the closing, both logged');

  // 5. deletion after the delay
  await o.goto(B + '/data.php');
  await o.fill('#cl-name', 'Boutique Zen'); await o.fill('#cl-password', 'Owner2026!');
  await Promise.all([o.waitForNavigation(), o.click('#closure-form button[type=submit]')]);
  sql(`UPDATE organizations SET deletion_scheduled_at = NOW() + INTERVAL 1 DAY WHERE id = ${org}`);
  let p = spawnSync('php', [S + '/t/tools/purge_companies.php'], { encoding: 'utf8' });
  assert(p.status === 0 && sql(`SELECT COUNT(*) FROM organizations WHERE id = ${org}`) === '1', 'not before the date');
  sql(`UPDATE organizations SET deletion_scheduled_at = NOW() - INTERVAL 1 MINUTE WHERE id = ${org}`);
  p = spawnSync('php', [S + '/t/tools/purge_companies.php'], { encoding: 'utf8' });
  assert(p.status === 0 && p.stdout.includes(`#${org} deleted`), 'purged ' + p.stdout + p.stderr);
  assert(sql(`SELECT CONCAT((SELECT COUNT(*) FROM organizations WHERE id = ${org}), (SELECT COUNT(*) FROM facturo_clients WHERE organization_id = ${org}), (SELECT COUNT(*) FROM shoplokal_products WHERE organization_id = ${org}), (SELECT COUNT(*) FROM users WHERE email LIKE '%@boutique.mu'))`) === '0000', 'all gone');
  assert(sql("SELECT COUNT(*) FROM users WHERE email = 'staff@mips.mu'") === '1' && sql("SELECT COUNT(*) FROM users WHERE email = 'admin@example.com'") === '1', 'other accounts kept');
  assert(mailsTo('owner@boutique.mu').pop().subject === 'Votre compte MIPS est supprimé', 'deletion e-mail');
  await st.goto(B + '/backoffice.php');
  assert((await st.textContent('.bo-log')).includes('Entreprise supprimée') && (await st.textContent('.bo-log')).includes('Boutique Zen (#' + org + ')') && (await st.textContent('.bo-log')).includes('Automatique'), 'purge logged');
  r = await (await (await browser.newContext()).newPage()).goto(B + '/login.php');
  const q = await (await browser.newContext()).newPage();
  await q.goto(B + '/login.php'); await q.fill('#email', 'owner@boutique.mu'); await q.fill('#password', 'Owner2026!'); await q.click('#submit-btn');
  await q.waitForSelector('#error-message:not([hidden])');
  step('nothing deleted before the date; after it, tools/purge_companies.php deletes the company, its data and its team\'s accounts (other accounts kept), e-mails the owner « Votre compte MIPS est supprimé », and the back-office log keeps « Entreprise supprimée — Boutique Zen » (Automatique); the owner can no longer log in');

  // every company table is exported (a new app must add its tables)
  const internal = ['backoffice_log', 'login_attempts', 'mra_tokens', 'notification_log', 'facturo_sequences', 'users', 'user_tokens', 'organization_users', 'organizations', 'organization_modules', 'organization_invitations',
                    'ops_jobs', 'ops_alerts'];   // platform supervision, no company data
  const tables = sql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '" + (process.env.MIPS_E2E_DB || 'mips_platform') + "'").split(/\n/).filter(t => !internal.includes(t));
  const exported = php("echo implode(' ', (new ReflectionClassConstant(App\\Suite\\DataExport::class, 'TABLES'))->getValue());");
  const missing = tables.filter(t => !exported.includes(' ' + t + ' '));
  assert(missing.length === 0, 'tables missing from the export: ' + missing);
  step('every table holding company data is in the export (guard for future apps)');

  assert(errors.length === 0, 'JS errors ' + errors);
  await browser.close();
  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
