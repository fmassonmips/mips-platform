const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const mailsTo = (addr) => fs.readdirSync(S + '/mail').map(f => fs.readFileSync(S + '/mail/' + f, 'utf8')).filter(m => new RegExp('^To: .*' + addr.replace(/\./g, '\\.'), 'mi').test(m));
const linkIn = (mail) => { const b = mail.split(/\r?\n\r?\n/)[2] || ''; const m = Buffer.from(b.split('--')[0].replace(/\s+/g, ''), 'base64').toString('utf8').match(/\/invite\.php\?t=([0-9a-f]{64})/); return m && m[1]; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const step = (s) => console.log('✓', s);
  const login = async (pg, email, pw) => {
    await pg.goto(B + '/login.php'); await pg.fill('#email', email); await pg.fill('#password', pw);
    await Promise.all([pg.waitForURL('**/dashboard.php'), pg.click('#submit-btn')]);
  };
  const api = (pg, p) => pg.evaluate(async (p) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch('/api/suite/team', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(p) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, p);
  await login(page, 'admin@example.com', 'Admin123!');
  for (const m of ['teamnest', 'flowdesk']) await Promise.all([page.waitForNavigation(), page.click(`button[data-module="${m}"][data-action="activate"]`)]);
  await page.goto(B + '/dashboard.php');
  assert((await page.textContent('.meta')).includes('1 personne'), 'team size 1');
  await Promise.all([page.waitForNavigation(), page.click('text=Gérer l’équipe')]);
  step('dashboard shows « Équipe : 1 personne · Gérer l’équipe »');

  // invite Kevin (admin) and Anjali (member)
  await page.fill('#i-email', 'Kevin@OceanTech.mu'); await page.selectOption('#i-role', 'admin');
  await page.click('#invite-form button[type=submit]'); await page.waitForSelector('#invite-done:not([hidden])');
  const shown = await page.inputValue('#invite-link');
  assert(/\/invite\.php\?t=[0-9a-f]{64}$/.test(shown), 'link shown ' + shown);
  const mk = mailsTo('kevin@oceantech.mu');
  assert(mk.length === 1 && linkIn(mk[0]) === shown.split('t=')[1], 'mail with same link');
  assert(sql("SELECT token_hash = SHA2('" + shown.split('t=')[1] + "', 256) FROM organization_invitations WHERE email = 'kevin@oceantech.mu'") === '1', 'only hash stored');
  assert(sql("SELECT COUNT(*) FROM organization_invitations WHERE token_hash = '" + shown.split('t=')[1] + "'") === '0', 'raw token not stored');
  await page.fill('#i-email', 'anjali@oceantech.mu'); await page.click('#invite-form button[type=submit]');
  await page.waitForFunction(() => document.getElementById('invite-msg').textContent.includes('anjali'));
  const anjaliLink = await page.inputValue('#invite-link');
  step('invited kevin@ (admin, e-mail lower-cased) and anjali@ (member); link shown to copy + e-mailed; only SHA-256 stored');

  // refusals
  let r = await api(page, { action: 'invite', email: 'kevin@oceantech.mu', role: 'admin' });
  assert(r.status === 422 && r.body.error.includes('10 minutes'), 'resend too soon ' + JSON.stringify(r));
  r = await api(page, { action: 'invite', email: 'admin@example.com', role: 'member' });
  assert(r.status === 422 && r.body.error.includes('déjà partie'), 'already member');
  sql("INSERT INTO users (email, password_hash, name, is_active) VALUES ('other@boss.mu', 'x', 'Other', 1)");
  sql("INSERT INTO organizations (name) VALUES ('Autre société')");
  sql("INSERT INTO organization_users (organization_id, user_id, role) SELECT (SELECT MAX(id) FROM organizations), id, 'owner' FROM users WHERE email = 'other@boss.mu'");
  r = await api(page, { action: 'invite', email: 'other@boss.mu', role: 'member' });
  assert(r.status === 200 && r.body.success, 'other company: same answer as a new address ' + JSON.stringify(r));
  const otherUrl = r.body.url;
  r = await api(page, { action: 'invite', email: 'pas-un-email', role: 'member' });
  assert(r.status === 422, 'bad email');
  step('refused: resend within 10 min, existing member, invalid e-mail; an address of another company gets the same answer as a new one (no enumeration)');

  await page.reload();
  assert(await page.locator('[data-revoke]').count() === 3, '3 pending');
  await page.screenshot({ path: S + '/team-1-invitations.png', fullPage: true });

  // Kevin accepts on his phone
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const k = await phone.newPage(); k.on('pageerror', e => errors.push(e.message));
  await k.goto(shown);
  assert((await k.textContent('h1')).includes('Rejoindre'), 'accept page');
  await k.screenshot({ path: S + '/team-2-accept-mobile.png', fullPage: true });
  await k.fill('#name', 'Kevin Li'); await k.fill('#password', 'court'); await k.check('#accept-terms');
  await k.click('#submit-btn'); await k.waitForSelector('#error-message:not([hidden])');
  await k.fill('#password', 'Kevin2026!');
  await Promise.all([k.waitForURL('**/dashboard.php'), k.click('#submit-btn')]);
  assert((await k.textContent('.meta')).includes('administrateur'), 'kevin admin');
  await k.goto(shown);
  assert((await k.textContent('h1')).includes('non valable'), 'link single use');
  step('Kevin opens the link on his phone, short password refused, joins as admin, logged in; link dead after use');

  // Kevin (admin) can invite members but not admins, cannot change roles, cannot remove owner
  r = await api(k, { action: 'invite', email: 'x@oceantech.mu', role: 'admin' });
  assert(r.status === 403, 'admin cannot invite admin ' + r.status);
  const ownerId = +sql("SELECT id FROM users WHERE email = 'admin@example.com'");
  r = await api(k, { action: 'remove', user_id: ownerId });
  assert(r.status === 422, 'cannot remove owner');
  r = await api(k, { action: 'role', user_id: ownerId, role: 'member' });
  assert(r.status === 403, 'admin cannot change roles');
  r = await api(page, { action: 'invite', email: 'chef@oceantech.mu', role: 'admin' });
  const chefId = +sql("SELECT id FROM organization_invitations WHERE email = 'chef@oceantech.mu'");
  r = await api(k, { action: 'revoke', id: chefId });
  assert(r.status >= 400 && r.body.error.includes('propriétaire'), 'admin cannot revoke an admin invite ' + JSON.stringify(r));
  sql("UPDATE organization_invitations SET created_at = created_at - INTERVAL 1 HOUR WHERE email = 'chef@oceantech.mu'");
  r = await api(k, { action: 'invite', email: 'chef@oceantech.mu', role: 'member' });
  assert(r.status === 403 && r.body.error.includes('propriétaire'), 'admin cannot downgrade an admin invite');
  assert(sql("SELECT role FROM organization_invitations WHERE email = 'chef@oceantech.mu'") === 'admin', 'still admin');
  r = await api(page, { action: 'revoke', id: chefId });
  assert(r.status === 200, 'owner revokes');
  step('admin Kevin: cannot invite an admin, change roles or remove the owner, nor withdraw or downgrade the owner\'s admin invitation');

  // the other company's user cannot be pulled in
  const o = await (await browser.newContext()).newPage();
  await o.goto(otherUrl);
  assert((await o.textContent('label[for=password]')).includes('votre compte MIPS'), 'existing account asks for its password');
  await o.fill('#name', 'Other'); await o.fill('#password', 'Nimporte2026!'); await o.check('#accept-terms'); await o.click('#submit-btn'); await o.waitForSelector('#error-message:not([hidden])');
  assert(sql("SELECT COUNT(*) FROM organization_users ou JOIN users u ON u.id = ou.user_id WHERE u.email = 'other@boss.mu'") === '1', 'still one company');
  step('the account of another company: accepting is refused, it stays in its company');

  // Anjali accepts; then works on a task and a ticket
  const a = await (await browser.newContext()).newPage();
  await a.goto(anjaliLink); await a.fill('#name', 'Anjali Ramsamy'); await a.fill('#password', 'Anjali2026!'); await a.check('#accept-terms');
  await Promise.all([a.waitForURL('**/dashboard.php'), a.click('#submit-btn')]);
  const anjali = +sql("SELECT id FROM users WHERE email = 'anjali@oceantech.mu'");
  r = await api(a, { action: 'invite', email: 'y@oceantech.mu', role: 'member' });
  assert(r.status === 403, 'member cannot invite');
  sql(`INSERT INTO teamnest_projects (organization_id, name, created_at) VALUES (1, 'Site', NOW())`);
  sql(`INSERT INTO teamnest_tasks (organization_id, project_id, title, status, assignee_id, created_by, created_at, updated_at) SELECT 1, MAX(id), 'Open task', 'doing', ${anjali}, ${ownerId}, NOW(), NOW() FROM teamnest_projects`);
  sql(`INSERT INTO teamnest_tasks (organization_id, project_id, title, status, assignee_id, created_by, created_at, updated_at) SELECT 1, MAX(id), 'Done task', 'done', ${anjali}, ${ownerId}, NOW(), NOW() FROM teamnest_projects`);
  await page.goto(B + '/app.php?m=teamnest');
  step('Anjali joins as member (cannot invite); she has an open task and a finished one');

  // owner promotes then demotes, then removes Anjali
  await page.goto(B + '/team.php');
  assert((await page.locator('tbody tr').count()) >= 3, 'three members');
  await Promise.all([page.waitForNavigation(), page.selectOption(`[data-role-of="${anjali}"]`, 'admin')]);
  assert(sql(`SELECT role FROM organization_users WHERE user_id = ${anjali}`) === 'admin', 'promoted');
  await Promise.all([page.waitForNavigation(), page.selectOption(`[data-role-of="${anjali}"]`, 'member')]);
  await page.screenshot({ path: S + '/team-3-equipe.png', fullPage: true });
  await Promise.all([page.waitForNavigation(), page.click(`[data-remove="${anjali}"]`)]);
  assert(sql(`SELECT is_active FROM users WHERE id = ${anjali}`) === '0', 'deactivated');
  assert(sql("SELECT IFNULL(assignee_id, 'null') FROM teamnest_tasks WHERE title = 'Open task'") === 'null', 'open task unassigned');
  assert(sql("SELECT assignee_id FROM teamnest_tasks WHERE title = 'Done task'") === String(anjali), 'done task keeps her name');
  await a.goto(B + '/dashboard.php');
  assert(a.url().includes('/login.php'), 'Anjali locked out at once');
  step('owner promotes Anjali then demotes her, then removes her: logged out at once, open task unassigned, finished task keeps her name');

  // re-invite the removed person: the inviter also holds the link, so the account's own password is required
  r = await api(page, { action: 'invite', email: 'anjali@oceantech.mu', role: 'member' });
  assert(r.status === 200, 're-invite removed ' + JSON.stringify(r));
  await a.goto(r.body.url);
  assert((await a.textContent('label[for=password]')).includes('votre compte MIPS'), 'existing account wording');
  await a.fill('#name', 'Anjali R.'); await a.fill('#password', 'Pirate2026!'); await a.check('#accept-terms');
  await a.click('#submit-btn'); await a.waitForSelector('#error-message:not([hidden])');
  assert((await a.textContent('#error-message')).includes('incorrect'), 'password of the account required');
  assert(sql(`SELECT is_active FROM users WHERE id = ${anjali}`) === '0', 'not taken over');
  await a.fill('#password', 'Anjali2026!');
  await Promise.all([a.waitForURL('**/dashboard.php'), a.click('#submit-btn')]);
  assert(sql(`SELECT is_active FROM users WHERE id = ${anjali}`) === '1', 'reactivated same account');
  step('re-invited: whoever holds the link must type the account\'s own password (no takeover by the inviter); with it, the same account is reactivated');

  // revoke + replaced link
  r = await api(page, { action: 'invite', email: 'zoe@oceantech.mu', role: 'member' });
  const z1 = r.body.url;
  sql("UPDATE organization_invitations SET created_at = created_at - INTERVAL 1 HOUR WHERE email = 'zoe@oceantech.mu'");
  r = await api(page, { action: 'invite', email: 'zoe@oceantech.mu', role: 'member' });
  const z2 = r.body.url;
  let res = await a.goto(z1); assert(res.status() === 404, 'replaced link dead');
  await page.goto(B + '/team.php');
  await Promise.all([page.waitForNavigation(), page.click('[data-revoke]')]);
  res = await a.goto(z2); assert(res.status() === 404, 'revoked link dead');
  // expired
  r = await api(page, { action: 'invite', email: 'late@oceantech.mu', role: 'member' });
  sql("UPDATE organization_invitations SET expires_at = NOW() - INTERVAL 1 DAY WHERE email = 'late@oceantech.mu'");
  res = await a.goto(r.body.url); assert(res.status() === 404, 'expired');
  step('resending replaces the old link; revoked and expired links show « Invitation non valable »');

  // double accept race
  r = await api(page, { action: 'invite', email: 'race@oceantech.mu', role: 'member' });
  const tok = r.body.url.split('t=')[1];
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  const pgs = await Promise.all(ctxs.map(async c => { const p = await c.newPage(); await p.goto(r.body.url); return p; }));
  const race = await Promise.all(pgs.map((p, i) => p.evaluate(async ([t, i]) => {
    const c = document.querySelector('meta[name=csrf-token]').content;
    const x = await fetch('/api/auth/invite', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': c }, body: JSON.stringify({ t, name: 'R' + i, password: 'Race2026!!', accept_terms: true }) });
    return x.status;
  }, [tok, i])));
  assert(race.sort().join() === '200,422', 'race ' + race);
  assert(sql("SELECT COUNT(*) FROM users WHERE email = 'race@oceantech.mu'") === '1', 'one account');
  step('the same link opened twice at once: one account, the other gets « plus valable »');

  // daily cap
  for (let i = 0; i < 30; i++) {
    r = await api(page, { action: 'invite', email: `cap${i}@oceantech.mu`, role: 'member' });
    if (r.status !== 200) break;
  }
  assert(r.status === 422 && r.body.error.includes('Limite'), 'cap ' + JSON.stringify(r));
  step('20 invitations per day cap');

  assert(errors.length === 0, 'JS errors: ' + errors.join(' | '));
  console.log('ALL GREEN');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
