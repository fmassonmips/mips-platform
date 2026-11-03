// Terms of use and privacy policy: public pages, acceptance at sign-up and invitation, new version on the dashboard.
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const php = (code) => execFileSync('php', ['-r', "require '" + S + "/t/src/bootstrap.php'; " + code]).toString().trim();
const step = (s) => console.log('✓', s);
const VERSION = php('echo App\\Legal::VERSION;');
const verifyLink = (addr) => {
  const m = fs.readdirSync(S + '/mail').sort().map(f => fs.readFileSync(S + '/mail/' + f, 'utf8')).filter(x => x.includes('To: <' + addr + '>')).pop();
  return Buffer.from((m.split(/\r?\n\r?\n/)[2] || '').split('--')[0].replace(/\s+/g, ''), 'base64').toString('utf8').match(/\/verify\.php\?t=[0-9a-f]{64}/)[0];
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = async (opts = {}) => { const p = await (await browser.newContext(opts)).newPage(); p.on('pageerror', e => errors.push(e.message)); return p; };

  // 1. public pages
  const v = await page({ viewport: { width: 390, height: 844 }, isMobile: true });
  let res = await v.goto(B + '/cgu.php');
  let text = await v.textContent('main');
  assert(res.status() === 200 && text.includes('Conditions générales d’utilisation') && text.includes('Version provisoire') && text.includes('[raison sociale de l’éditeur à compléter]'), 'cgu');
  assert(text.includes('30 jours') && text.includes('lecture seule') && text.includes('Vos données') && text.includes('Mauritius Revenue Authority') && text.includes('droit de la République de Maurice'), 'cgu content');
  await v.screenshot({ path: S + '/lg-1-cgu-mobile.png', fullPage: true });
  res = await v.goto(B + '/confidentialite.php');
  text = await v.textContent('main');
  assert(res.status() === 200 && text.includes('MIPSSESSID') && text.includes('90 jours') && text.includes('sous-traitant') && text.includes('[hébergeur et pays d’hébergement à compléter]') && text.includes('Data Protection Office'), 'privacy');
  await v.goto(B + '/login.php');
  assert(await v.locator('.legal-links a[href="/cgu.php"]').count() === 1 && await v.locator('.legal-links a[href="/confidentialite.php"]').count() === 1, 'footer links on login');
  assert(php("$GLOBALS['config']['legal']['company'] = 'MIPSIT Test Ltd'; echo App\\Legal::get('company'), '|', App\\Legal::get('brn');") === 'MIPSIT Test Ltd|[BRN à compléter]', 'config value or placeholder');
  assert(php("$GLOBALS['config']['legal']['draft'] = false; echo App\\Legal::isDraft() ? 1 : 0;") === '0', 'draft off');
  step(`/cgu.php and /confidentialite.php open without an account (phone), dated ${VERSION}, « Version provisoire » banner, missing publisher details shown as « [… à compléter] »; the texts state the product\'s real rules (30-day trial, read-only, export, deletion, MRA, cookie MIPSSESSID, 90 days); links under the login form`);

  // 2. sign-up requires the box
  const p = await page();
  await p.goto(B + '/register.php');
  await p.fill('#name', 'Lina Ah-Sing'); await p.fill('#email', 'lina@atelier.mu'); await p.fill('#password', 'Atelier2026!');
  await p.click('#submit-btn'); await p.waitForSelector('#error-message:not([hidden])');
  assert((await p.textContent('#error-message')).includes('acceptez les conditions'), 'refused without the box');
  assert(sql("SELECT COUNT(*) FROM users WHERE email = 'lina@atelier.mu'") === '0', 'no account');
  await p.check('#accept-terms'); await p.click('#submit-btn'); await p.waitForSelector('#done-message:not([hidden])');
  await p.goto(B + verifyLink('lina@atelier.mu')); await p.fill('#password', 'Atelier2026!');
  await Promise.all([p.waitForURL('**/welcome.php'), p.click('#submit-btn')]);
  assert(sql("SELECT CONCAT(terms_version, '|', terms_accepted_at IS NOT NULL) FROM users WHERE email = 'lina@atelier.mu'") === VERSION + '|1', 'acceptance recorded');
  await p.goto(B + '/dashboard.php');
  assert(await p.locator('#terms-card').count() === 0, 'no banner for an up-to-date user');
  step('sign-up without ticking « J’accepte les conditions… » is refused and creates nothing; ticked: the confirmed account records the version and the date; no banner afterwards');

  // 3. invitation requires the box
  const owner = await page();
  await owner.goto(B + '/login.php'); await owner.fill('#email', 'admin@example.com'); await owner.fill('#password', 'Admin123!');
  await Promise.all([owner.waitForURL('**/dashboard.php'), owner.click('#submit-btn')]);
  assert(await owner.locator('#terms-card').count() === 1, 'existing user asked to accept');
  await owner.screenshot({ path: S + '/lg-2-bandeau.png', fullPage: true });
  const r = await owner.evaluate(async () => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const res = await fetch('/api/suite/team', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify({ action: 'invite', email: 'yan@atelier.mu', role: 'member' }) });
    return res.json();
  });
  const i = await page();
  await i.goto(r.url); await i.fill('#name', 'Yan'); await i.fill('#password', 'Yan20266!x');
  await i.click('#submit-btn'); await i.waitForSelector('#error-message:not([hidden])');
  assert((await i.textContent('#error-message')).includes('acceptez les conditions') && sql("SELECT COUNT(*) FROM users WHERE email = 'yan@atelier.mu'") === '0', 'invite refused without the box');
  await i.check('#accept-terms');
  await Promise.all([i.waitForURL('**/dashboard.php'), i.click('#submit-btn')]);
  assert(sql("SELECT terms_version FROM users WHERE email = 'yan@atelier.mu'") === VERSION && await i.locator('#terms-card').count() === 0, 'invitee accepted');
  step('joining a team by invitation also requires the box; the acceptance is recorded');

  // 4. existing users (none, or an older version): banner until accepted
  await owner.click('#terms-accept'); await owner.waitForFunction(() => !document.getElementById('terms-card'));
  assert(sql("SELECT terms_version FROM users WHERE email = 'admin@example.com'") === VERSION, 'accepted');
  await owner.reload();
  assert(await owner.locator('#terms-card').count() === 0, 'gone');
  sql("UPDATE users SET terms_version = '2026-01-01' WHERE email = 'admin@example.com'");   // as if the texts changed since
  await owner.reload();
  assert(await owner.locator('#terms-card').count() === 1, 'asked again after a new version');
  step('a user who never accepted (account created before) or accepted an older version sees « Conditions d’utilisation … J’accepte » on the dashboard; one click records the version in force and the banner goes');

  assert(errors.length === 0, 'JS errors ' + errors);
  await browser.close();
  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
