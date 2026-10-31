// Self-service sign-up confirmed by e-mail, forgotten password, no account enumeration.
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);
const mails = (addr) => fs.readdirSync(S + '/mail').sort().map(f => fs.readFileSync(S + '/mail/' + f, 'utf8'))
  .filter(m => new RegExp('^To: .*' + addr.replace(/\./g, '\\.'), 'mi').test(m))
  .map(m => {
    const subj = ((m.match(/^Subject: (.*)$/mi) || [])[1] || '').replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
    const part = m.split(/\r?\n\r?\n/)[2] || '';
    return { subj, body: Buffer.from(part.split('--')[0].replace(/\s+/g, ''), 'base64').toString('utf8') };
  });
const link = (m, path) => { const x = m.body.match(new RegExp(path.replace('.', '\\.') + '\\?t=([0-9a-f]{64})')); return x && x[1]; };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = async (opts = {}) => { const c = await browser.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); return p; };
  const post = (pg, url, body) => pg.evaluate(async ([u, b]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, [url, body]);

  // sign-up on a phone
  const p = await ctx({ viewport: { width: 390, height: 844 }, isMobile: true });
  await p.goto(B + '/register.php');
  await p.fill('#name', 'Nadia Aumeer'); await p.fill('#email', 'Nadia@Salon-Belle.mu'); await p.fill('#password', 'Salon2026!'); await p.check('#accept-terms');
  await p.click('#submit-btn'); await p.waitForSelector('#done-message:not([hidden])');
  assert((await p.textContent('#done-message')).includes('nadia@salon-belle.mu'), 'check your mail');
  await p.screenshot({ path: S + '/acc-1-inscription-mobile.png', fullPage: true });
  assert(sql("SELECT is_active FROM users WHERE email = 'nadia@salon-belle.mu'") === '0', 'inactive until confirmed');
  let m = mails('nadia@salon-belle.mu');
  assert(m.length === 1 && m[0].subj.includes('Confirmez'), 'confirmation mail');
  const v1 = link(m[0], '/verify.php');
  assert(sql(`SELECT COUNT(*) FROM user_tokens WHERE token_hash = SHA2('${v1}', 256)`) === '1' && sql(`SELECT COUNT(*) FROM user_tokens WHERE token_hash = '${v1}'`) === '0', 'hash only');
  step('sign-up on a phone: « ouvrez le lien envoyé à nadia@salon-belle.mu » (address lower-cased); account inactive; confirmation e-mail; only the token\'s SHA-256 stored');

  // log in before confirming → link sent again, old one replaced
  await p.goto(B + '/login.php'); await p.fill('#email', 'nadia@salon-belle.mu'); await p.fill('#password', 'Salon2026!');
  await p.click('#submit-btn'); await p.waitForSelector('#error-message:not([hidden])');
  assert((await p.textContent('#error-message')).includes('pas encore confirmée'), 'pending message');
  await p.fill('#password', 'Mauvais2026!'); await p.click('#submit-btn');
  await p.waitForFunction(() => document.getElementById('error-message').textContent.includes('Identifiants invalides'));
  m = mails('nadia@salon-belle.mu');
  assert(m.length === 2, 'resent once (wrong password resends nothing)');
  const v2 = link(m[1], '/verify.php');
  step('logging in before confirming: right password → « pas encore confirmée », link sent again; wrong password → the usual « Identifiants invalides »');

  // opening the link does not use it; the password typed at sign-up is required
  await p.goto(B + '/verify.php?t=' + v2);
  assert(sql(`SELECT used_at IS NULL FROM user_tokens WHERE token_hash = SHA2('${v2}', 256)`) === '1', 'GET does not use the link');
  await p.fill('#password', 'Autre2026!'); await p.click('#submit-btn'); await p.waitForSelector('#error-message:not([hidden])');
  assert((await p.textContent('#error-message')).includes('choisi à l’inscription'), 'wrong sign-up password');
  assert(sql("SELECT is_active FROM users WHERE email = 'nadia@salon-belle.mu'") === '0', 'still inactive');
  await p.fill('#password', 'Salon2026!');
  await p.screenshot({ path: S + '/acc-2-confirmer-mobile.png', fullPage: true });
  await Promise.all([p.waitForURL('**/welcome.php'), p.click('#submit-btn')]);   // new account: first steps
  assert(sql("SELECT is_active, verified_at IS NOT NULL FROM users WHERE email = 'nadia@salon-belle.mu'") === '1\t1', 'active and verified');
  await Promise.all([p.waitForURL('**/dashboard.php'), p.click('text=Plus tard')]);
  assert((await p.textContent('.meta')).includes('propriétaire'), 'own company created');
  for (const v of [v1, v2]) {
    await p.goto(B + '/verify.php?t=' + v); await p.fill('#password', 'Salon2026!'); await p.click('#submit-btn'); await p.waitForSelector('#error-message:not([hidden])');
  }
  step('confirmation: opening the link only shows the form (mail scanners cannot use it up); a wrong password is refused; the sign-up password activates, logs in and creates her company; every link of the address then stops working');

  // signing up again with an existing address: same answer, warning e-mail, password unchanged
  const q = await ctx();
  await q.goto(B + '/register.php');
  let r = await post(q, '/api/auth/register', { name: 'Intrus', email: 'nadia@salon-belle.mu', password: 'Pirate2026!', accept_terms: true });
  const fresh = await post(q, '/api/auth/register', { name: 'Jean', email: 'jean@example.mu', password: 'Jean20266!', accept_terms: true });
  assert(r.status === 201 && fresh.status === 201 && r.body.message.replace('nadia@salon-belle.mu', 'X') === fresh.body.message.replace('jean@example.mu', 'X'), 'same answer');
  m = mails('nadia@salon-belle.mu');
  assert(m[m.length - 1].subj.includes('existe déjà'), 'already-registered mail');
  assert(sql("SELECT password_hash IS NOT NULL FROM users WHERE email = 'nadia@salon-belle.mu'") === '1', 'kept');
  await q.goto(B + '/login.php'); await q.fill('#email', 'nadia@salon-belle.mu'); await q.fill('#password', 'Pirate2026!');
  await q.click('#submit-btn'); await q.waitForSelector('#error-message:not([hidden])');
  step('sign-up with an address that already has an account: identical answer to a new address (no enumeration); the owner gets « Votre compte MIPS existe déjà »; the password is not changed');

  // link flood capped at 3 per hour per address
  for (let i = 0; i < 4; i++) await post(q, '/api/auth/register', { name: 'Jean', email: 'jean@example.mu', password: 'Jean20266!', accept_terms: true });
  assert(mails('jean@example.mu').length === 3, 'max 3 links per hour: ' + mails('jean@example.mu').length);
  step('repeated sign-ups for one address: at most 3 e-mails per hour');

  // forgot password
  await q.goto(B + '/login.php'); await q.click('text=Mot de passe oublié ?');
  await q.fill('#email', 'personne@example.mu'); await q.click('#submit-btn'); await q.waitForSelector('#done-message:not([hidden])');
  const unknownMsg = (await q.textContent('#done-message')).replace('personne@example.mu', 'X');
  assert(mails('personne@example.mu').length === 0, 'no mail for unknown');
  await q.goto(B + '/forgot.php');
  await q.fill('#email', 'nadia@salon-belle.mu'); await q.click('#submit-btn'); await q.waitForSelector('#done-message:not([hidden])');
  assert((await q.textContent('#done-message')).replace('nadia@salon-belle.mu', 'X') === unknownMsg, 'same answer');
  await q.screenshot({ path: S + '/acc-3-oubli.png', fullPage: true });
  m = mails('nadia@salon-belle.mu');
  const r1 = link(m[m.length - 1], '/reset.php');
  r = await post(q, '/api/auth/account', { action: 'forgot', email: 'nadia@salon-belle.mu' });
  m = mails('nadia@salon-belle.mu');
  const r2 = link(m[m.length - 1], '/reset.php');
  let res = await q.goto(B + '/reset.php?t=' + r1);
  assert(res.status() === 404 && (await q.textContent('main')).includes('plus valable'), 'older link replaced');
  step('« Mot de passe oublié » : same answer for a known and an unknown address, e-mail only to the real account; a new request replaces the previous link');

  // reset while another session is open
  await p.goto(B + '/dashboard.php');
  assert(p.url().includes('/dashboard.php'), 'phone session open');
  await q.goto(B + '/reset.php?t=' + r2);
  await q.fill('#password', 'court'); await q.fill('#password2', 'court'); await q.click('#submit-btn'); await q.waitForSelector('#error-message:not([hidden])');
  await q.fill('#password', 'Nouveau2026!'); await q.fill('#password2', 'Nouveau2026?'); await q.click('#submit-btn');
  await q.waitForFunction(() => document.getElementById('error-message').textContent.includes('correspondent'));
  await q.fill('#password2', 'Nouveau2026!');
  await q.screenshot({ path: S + '/acc-4-nouveau-mdp.png', fullPage: true });
  await new Promise(r => setTimeout(r, 1100));   // password change lands in a later second than the phone login
  await Promise.all([q.waitForURL('**/dashboard.php'), q.click('#submit-btn')]);
  await p.goto(B + '/dashboard.php');
  assert(p.url().includes('/login.php'), 'other session ended');
  await p.fill('#email', 'nadia@salon-belle.mu'); await p.fill('#password', 'Salon2026!'); await p.click('#submit-btn'); await p.waitForSelector('#error-message:not([hidden])');
  await p.fill('#password', 'Nouveau2026!');
  await Promise.all([p.waitForURL('**/dashboard.php'), p.click('#submit-btn')]);
  res = await q.goto(B + '/reset.php?t=' + r2);
  assert(res.status() === 404, 'reset link single use');
  step('new password: too short and mismatch refused; saved → logged in; the phone session opened before is logged out; old password refused, new one works; link single-use');

  // expired link, deactivated account
  r = await post(q, '/api/auth/account', { action: 'forgot', email: 'nadia@salon-belle.mu' });
  m = mails('nadia@salon-belle.mu');
  const r3 = link(m[m.length - 1], '/reset.php');
  sql(`UPDATE user_tokens SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE token_hash = SHA2('${r3}', 256)`);
  res = await q.goto(B + '/reset.php?t=' + r3); assert(res.status() === 404, 'expired');
  sql("UPDATE users SET is_active = 0 WHERE email = 'nadia@salon-belle.mu'");
  const before = mails('nadia@salon-belle.mu').length;
  r = await post(q, '/api/auth/account', { action: 'forgot', email: 'nadia@salon-belle.mu' });
  assert(r.status === 200 && mails('nadia@salon-belle.mu').length === before, 'no reset for a deactivated account');
  step('an expired link (1 h) shows « plus valable »; a deactivated account (removed from a team) gets no reset link, with the same answer');

  // throttling of forgot
  let last;
  for (let i = 0; i < 7; i++) last = await post(q, '/api/auth/account', { action: 'forgot', email: 'flood@example.mu' });
  assert(last.status === 429, 'forgot throttled ' + last.status);
  step('« mot de passe oublié » in a loop for one address: blocked after 10 requests in the hour from one connection (429)');

  assert(errors.length === 0, 'JS errors ' + errors);
  console.log('ALL GREEN');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
