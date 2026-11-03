// Security review fixes: login limiter, pre-sign-up takeover, removed member, public mail cap, IPv6 /64, bcrypt length.
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const php = (code) => execFileSync('php', ['-r', "require '" + S + "/t/src/bootstrap.php'; " + code]).toString().trim();
const step = (s) => console.log('✓', s);
const mails = (addr) => fs.readdirSync(S + '/mail').sort().map(f => fs.readFileSync(S + '/mail/' + f, 'utf8'))
  .filter(m => new RegExp('^To: .*' + addr.replace(/\./g, '\\.'), 'mi').test(m))
  .map(m => Buffer.from(((m.split(/\r?\n\r?\n/)[2] || '').split('--')[0]).replace(/\s+/g, ''), 'base64').toString('utf8'));
const link = (body) => (body.match(/\/verify\.php\?t=([0-9a-f]{64})/) || [])[1];
const hash = (pw) => execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', pw]).toString();

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto(B + '/login.php');
  const post = (url, body) => page.evaluate(async ([u, b]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, [url, body]);
  const login = async (email, password) => { const r = await post('/api/auth/login', { email, password }); await page.goto(B + '/login.php'); return r.status; };
  const logout = async () => { await page.context().clearCookies(); await page.goto(B + '/login.php'); };

  sql(`INSERT INTO users (email, password_hash, name, is_active, verified_at) VALUES ('victime@corp.mu', '${hash('Victime2026!')}', 'Victime', 1, NOW()), ('pirate@evil.mu', '${hash('Pirate2026!')}', 'Pirate', 1, NOW())`);

  // 1. a successful login on one's own account no longer wipes the failures on someone else's
  for (let i = 0; i < 4; i++) assert(await login('victime@corp.mu', 'Faux2026!' + i) === 401, 'wrong ' + i);
  assert(await login('pirate@evil.mu', 'Pirate2026!') === 200, 'attacker logs in to own account'); await logout();
  assert(await login('victime@corp.mu', 'Faux2026!x') === 401, '5th guess');
  assert(await login('victime@corp.mu', 'Faux2026!y') === 429, '6th guess blocked');
  assert(await login('victime@corp.mu', 'Victime2026!') === 429, 'even the right one, from a stranger IP');
  step('4 guesses on the victim, attacker logs in to his own account, guessing goes on: blocked at 5 failures (the login only cleared the attacker\'s own address)');

  // 2. lock-out by e-mail does not shut out the owner from a known IP
  sql("DELETE FROM login_attempts");
  assert(await login('victime@corp.mu', 'Victime2026!') === 200, 'victim logs in once (IP becomes known)'); await logout();
  sql("INSERT INTO login_attempts (ip_address, email, success, attempted_at) VALUES " + Array.from({ length: 8 }, (_, i) => `('203.0.113.${i}', 'victime@corp.mu', 0, NOW())`).join(','));
  assert(await login('victime@corp.mu', 'Victime2026!') === 200, 'owner still gets in from her usual connection'); await logout();
  sql("INSERT INTO login_attempts (ip_address, email, success, attempted_at) VALUES " + Array.from({ length: 8 }, (_, i) => `('203.0.113.${i}', 'victime@corp.mu', 0, NOW())`).join(','));
  sql("DELETE FROM login_attempts WHERE success = 1");
  assert(await login('victime@corp.mu', 'Victime2026!') === 429, 'unknown connection waits');
  sql("DELETE FROM login_attempts");
  sql("INSERT INTO login_attempts (ip_address, email, success, attempted_at) VALUES " + Array.from({ length: 20 }, (_, i) => `('127.0.0.1', 'x${i}@a.mu', 0, NOW())`).join(','));
  assert(await login('pirate@evil.mu', 'Pirate2026!') === 429, '20 failures from one IP block that IP');
  sql("DELETE FROM login_attempts");
  step('8 failures on her address from other IPs: she still logs in from a connection she used before; an unknown connection waits; 20 failures from one IP block that IP');

  // 3. pre-sign-up takeover: the attacker registers the address first with his password
  assert((await post('/api/auth/register', { name: 'Pirate', email: 'nouvelle@corp.mu', password: 'Pirate2026!', accept_terms: true })).status === 201, 'attacker sign-up');
  assert((await post('/api/auth/register', { name: 'Nouvelle', email: 'nouvelle@corp.mu', password: 'Vraie2026!', accept_terms: true })).status === 201, 'owner sign-up');
  let m = mails('nouvelle@corp.mu');
  assert(m.length === 2, 'two links ' + m.length);
  // she opens the first mail (the one the attacker's sign-up sent): it asks for the sign-up password
  await page.goto(B + '/verify.php?t=' + link(m[0]));
  await page.fill('#password', 'Autre2026!'); await page.click('#submit-btn'); await page.waitForSelector('#error-message:not([hidden])');
  await page.fill('#password', 'Vraie2026!');
  await Promise.all([page.waitForURL('**/welcome.php'), page.click('#submit-btn')]);
  await logout();
  assert(await login('nouvelle@corp.mu', 'Pirate2026!') === 401, 'attacker password does not work');
  assert(await login('nouvelle@corp.mu', 'Vraie2026!') === 200, 'her password works'); await logout();
  step('attacker signs up her address first with his password, she signs up after: whichever link she opens asks for the sign-up password; she types hers → her password is the account\'s, the attacker\'s fails');

  // 4. a member removed after confirming cannot reactivate herself by signing up again
  const before = mails('nouvelle@corp.mu').length;
  sql("UPDATE users SET is_active = 0 WHERE email = 'nouvelle@corp.mu'");
  assert((await post('/api/auth/register', { name: 'Nouvelle', email: 'nouvelle@corp.mu', password: 'Encore2026!', accept_terms: true })).status === 201, 'same answer');
  assert(mails('nouvelle@corp.mu').length === before, 'no new link');
  assert(sql("SELECT is_active FROM users WHERE email = 'nouvelle@corp.mu'") === '0', 'stays closed');
  step('removed (deactivated) after confirming: signing up again gives the usual answer but sends no link; the account stays closed');

  // 5. public forms cannot mail one address more than 5 times a day, nor a company more than 200
  const caps = php("$r = []; for ($i = 0; $i < 6; $i++) { $r[] = App\\RateLimiter::allowPublicMail(1, 'Cible@Ext.mu') ? 1 : 0; } echo implode('', $r);");
  assert(caps === '111110', 'per recipient ' + caps);
  assert(php("echo App\\RateLimiter::allowPublicMail(2, 'cible@ext.mu') ? 1 : 0;") === '0', 'across companies');
  assert(sql("SELECT COUNT(*) FROM login_attempts WHERE email LIKE '%cible%'") === '0', 'address not stored');
  sql("INSERT INTO login_attempts (ip_address, email, success, attempted_at) SELECT 'org:3', CONCAT('#mail:', SHA2(seq, 256)), 1, NOW() FROM (SELECT @n := @n + 1 AS seq FROM information_schema.columns, (SELECT @n := 0) x LIMIT 200) s");
  assert(php("echo App\\RateLimiter::allowPublicMail(3, 'neuf@ext.mu') ? 1 : 0;") === '0', 'per company');
  step('public-form e-mails: 5 a day per address across all companies, 200 a day per company; only a hash of the address is kept');

  // 6. IPv6 counted per /64, IPv4 as is; bcrypt's 72-byte limit enforced
  const ip = (a) => php(`$_SERVER['REMOTE_ADDR'] = '${a}'; echo App\\Request::clientIp();`);
  assert(ip('2001:db8:1:2:aaaa::1') === '2001:db8:1:2::/64' && ip('2001:db8:1:2:ffff::9') === '2001:db8:1:2::/64', 'v6 /64 ' + ip('2001:db8:1:2:aaaa::1'));
  assert(ip('203.0.113.7') === '203.0.113.7' && ip('::ffff:203.0.113.7') === '::ffff:203.0.113.7', 'v4');
  const long = await post('/api/auth/register', { name: 'Long', email: 'long@corp.mu', password: 'a'.repeat(73), accept_terms: true });
  assert(long.status === 422 && long.body.error.includes('72'), 'bcrypt cap');
  step('rate limits count an IPv6 /64 as one client; passwords over 72 bytes refused (bcrypt would ignore the rest)');

  // 7. FlowDesk subject no longer carries visitor text
  assert(php("echo App\\FlowDesk\\Text::for('fr')['mail_new_subject'];") === '[#%d] Demande reçue', 'subject');
  step('FlowDesk acknowledgement subject: number only, no text typed by the visitor');

  // 8. iCal fetch: https on 443 only, extra IPv4 ranges denied, generic error; sender names quoted
  const fetchIcal = (url) => php(`$GLOBALS['config']['bookora']['ical_allow_private'] = false; $m = new ReflectionMethod(App\\Bookora\\Ical::class, 'fetch'); echo $m->invoke(null, '${url}')[1] ?? 'ok';`);
  assert(fetchIcal('https://8.8.8.8:8443/cal.ics').includes('https'), 'port refused');
  for (const h of ['100.64.1.1', '198.18.0.1', '192.0.0.8', '127.0.0.1', '10.1.2.3', '169.254.169.254']) {
    assert(fetchIcal('https://' + h + '/cal.ics').includes('réseau privé'), 'denied ' + h + ' ' + fetchIcal('https://' + h + '/cal.ics'));
  }
  const from = php(`$m = new ReflectionMethod(App\\Mail\\SmtpMailer::class, 'encodeName'); echo $m->invoke(App\\Mail\\SmtpMailer::fromConfig(), 'PayPal <service@paypal.com>, "x"');`);
  assert(from === '"PayPal <service@paypal.com>, \\"x\\""', 'quoted name ' + from);
  step('iCal: a port other than 443 and the CGNAT / benchmark / IETF / private / link-local ranges are refused; a company name like « PayPal <service@paypal.com> » is sent as a quoted name, not an address');

  await browser.close();
  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
