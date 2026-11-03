// Automatic e-mails: welcome, end-of-trial reminders, overdue invoice reminders (tools/reminders.php).
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);
const hash = (pw) => execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', pw]).toString();
const run = () => spawnSync('php', [S + '/t/tools/reminders.php'], { encoding: 'utf8' });
const decode = (h) => h.replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
const mails = () => fs.readdirSync(S + '/mail').sort().map(f => {
  const m = fs.readFileSync(S + '/mail/' + f, 'utf8');
  return { to: ((m.match(/^To: <(.*)>$/mi) || [])[1] || ''), subject: decode((m.match(/^Subject: (.*)$/mi) || [])[1] || ''),
           from: decode((m.match(/^From: (.*)$/mi) || [])[1] || ''), replyTo: ((m.match(/^Reply-To: <(.*)>$/mi) || [])[1] || ''),
           body: Buffer.from(((m.split(/\r?\n\r?\n/)[2] || '').split('--')[0]).replace(/\s+/g, ''), 'base64').toString('utf8') };
});
let seen = 0;
const fresh = () => { const all = mails(); const out = all.slice(seen); seen = all.length; return out; };
const mu = (days) => new Date(Date.now() + 4 * 3600e3 + days * 86400e3).toISOString().slice(0, 10);   // date in Mauritius ± days

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // 1. welcome e-mail on confirmation
  const p = await (await browser.newContext()).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(B + '/register.php');
  await p.fill('#name', 'Anil Seeruttun'); await p.fill('#email', 'anil@quincaillerie.mu'); await p.fill('#password', 'Quinca2026!'); await p.check('#accept-terms');
  await p.click('#submit-btn'); await p.waitForSelector('#done-message:not([hidden])');
  const link = fresh().pop().body.match(/\/verify\.php\?t=[0-9a-f]{64}/)[0];
  await p.goto(B + link); await p.fill('#password', 'Quinca2026!');
  await Promise.all([p.waitForURL('**/welcome.php'), p.click('#submit-btn')]);
  let m = fresh();
  assert(m.length === 1 && m[0].to === 'anil@quincaillerie.mu' && m[0].subject === 'Bienvenue sur MIPS' && m[0].body.includes('Anil Seeruttun') && m[0].body.includes('/welcome.php') && m[0].replyTo === 'abonnement@mips.mu', 'welcome ' + JSON.stringify(m));
  sql("UPDATE users SET is_active = 1 WHERE email = 'anil@quincaillerie.mu'");
  step('confirming a sign-up sends « Bienvenue sur MIPS » (first steps, link to the wizard, replies to the MIPS contact)');

  const noDigest = () => sql('UPDATE users SET digest_opt_out = 1');   // on a Monday the weekly summary would add e-mails (e2e28 covers it)
  // 2. end of trial
  const anil = sql("SELECT ou.organization_id FROM organization_users ou JOIN users u ON u.id = ou.user_id WHERE u.email = 'anil@quincaillerie.mu'");
  sql(`INSERT INTO users (email, password_hash, name, is_active) VALUES ('admin2@quincaillerie.mu', '${hash('x2026xx!')}', 'Admin', 1), ('membre@quincaillerie.mu', '${hash('x2026xx!')}', 'Membre', 1)`);
  sql(`INSERT INTO organization_users (organization_id, user_id, role) SELECT ${anil}, id, IF(email LIKE 'admin2%', 'admin', 'member') FROM users WHERE email IN ('admin2@quincaillerie.mu', 'membre@quincaillerie.mu')`);
  sql(`INSERT INTO organization_modules (organization_id, module_slug, status, trial_ends_at) VALUES
       (${anil}, 'facturo', 'trial', NOW() + INTERVAL 5 DAY), (${anil}, 'shoplokal', 'trial', NOW() + INTERVAL 6 DAY), (${anil}, 'clientbloom', 'active', NULL),
       (${anil}, 'teamnest', 'trial', NOW() + INTERVAL 20 DAY)`);
  noDigest();
  let r = run();
  m = fresh();
  assert(r.status === 0 && r.stdout.includes('2 end-of-trial'), 'run ' + r.stdout + r.stderr);
  assert(m.length === 2 && m.map(x => x.to).sort().join() === 'admin2@quincaillerie.mu,anil@quincaillerie.mu', 'owner + admin only ' + m.map(x => x.to));
  assert(m[0].subject === 'Plus que quelques jours d’essai : Facturo, ShopLokal' && m[0].body.includes('abonnement@mips.mu') && !m[0].body.includes('TeamNest'), 'trial_7 ' + m[0].subject);
  r = run(); m = fresh();
  assert(r.status === 0 && m.length === 0, 'sent once');
  sql(`UPDATE organization_modules SET trial_ends_at = NOW() + INTERVAL 12 HOUR WHERE organization_id = ${anil} AND module_slug = 'facturo'`);
  run(); m = fresh();
  assert(m.length === 2 && m[0].subject === 'Dernier jour d’essai : Facturo' && m[0].body.includes('lecture seule'), 'trial_1 ' + (m[0] || {}).subject);
  sql(`UPDATE organization_modules SET trial_ends_at = NOW() - INTERVAL 1 HOUR WHERE organization_id = ${anil} AND module_slug = 'facturo'`);
  run(); m = fresh();
  assert(m.length === 2 && m[0].subject === 'Votre essai est terminé : Facturo en lecture seule' && m[0].body.includes('Rien n’est perdu'), 'trial_end');
  sql(`UPDATE organization_modules SET trial_ends_at = NOW() + INTERVAL 4 DAY WHERE organization_id = ${anil} AND module_slug = 'facturo'`);   // extended from the back-office
  run(); m = fresh();
  assert(m.length === 2 && m[0].subject.includes('Facturo'), 'extended trial reminded again');
  sql(`UPDATE organizations SET suspended_at = NOW() WHERE id = ${anil}`);
  sql(`UPDATE organization_modules SET trial_ends_at = NOW() + INTERVAL 10 HOUR WHERE organization_id = ${anil} AND module_slug = 'shoplokal'`);
  run(); m = fresh();
  assert(m.length === 0, 'suspended company: nothing');
  sql(`UPDATE organizations SET suspended_at = NULL WHERE id = ${anil}`);
  run(); m = fresh();
  assert(m.length === 2 && m[0].subject === 'Dernier jour d’essai : ShopLokal', 'resumes after reactivation');
  step('end of trial: 7 days before one e-mail per company listing Facturo + ShopLokal to the owner and the admin (not the member, not the subscribed or far-off apps), once; the day before; the day it turns read-only; again for a trial extended to a new date; nothing to a suspended company, and the pending one once reactivated');

  // 3. overdue invoices
  const owner = await (await browser.newContext()).newPage();
  owner.on('pageerror', e => errors.push(e.message));
  await owner.goto(B + '/login.php'); await owner.fill('#email', 'admin@example.com'); await owner.fill('#password', 'Admin123!');
  await Promise.all([owner.waitForURL('**/dashboard.php'), owner.click('#submit-btn')]);
  await Promise.all([owner.waitForNavigation(), owner.click('button[data-module="facturo"][data-action="activate"]')]);
  const org = sql("SELECT ou.organization_id FROM organization_users ou JOIN users u ON u.id = ou.user_id WHERE u.email = 'admin@example.com'");
  sql(`UPDATE organization_modules SET trial_ends_at = NOW() + INTERVAL 25 DAY WHERE organization_id = ${org}`);
  await owner.goto(B + '/app.php?m=facturo&p=company');
  const api = (url, b) => owner.evaluate(async ([u, b]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const res = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(b) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, [url, b]);
  await api('/api/suite/organization', { name: 'Ocean Tech', legal_name: 'Ocean Tech Ltd', brn: 'C12345678', vat_number: '', address: 'Ebène', email: 'compta@oceantech.mu', phone: '', document_language: 'fr' });
  const client = async (name, email, lang) => (await api('/api/facturo/clients', { action: 'save', id: 0, name, email, document_language: lang })).body.id;
  const fr = await client('Hôtel Le Lagon', 'compta@lagon.mu', ''), en = await client('Sunset Villas', 'accounts@sunset.mu', 'en'), none = await client('Sans E-mail', '', '');
  const invoice = async (cid, due, price) => {
    const id = (await api('/api/facturo/documents', { action: 'save', id: 0, type: 'invoice', client_id: cid, issue_date: mu(-40), due_date: mu(0), currency: 'MUR', notes: '',
      lines: [{ description: 'Prestation', quantity: '1', unit_price: price, tax_code: 'TC03', nature: 'SERVICES' }] })).body.id;
    const iss = await api('/api/facturo/documents', { action: 'issue', id });
    assert(iss.status === 200, 'issue ' + JSON.stringify(iss));
    sql(`UPDATE facturo_documents SET due_date = '${due}' WHERE id = ${id}`);
    return id;
  };
  // switched on through the page
  await owner.reload();
  await owner.check('#reminders-form input[name=enabled]');
  await Promise.all([owner.waitForNavigation(), owner.click('#reminders-form button[type=submit]')]);
  assert((await owner.textContent('#reminders-form')).includes('Activé le'), 'switched on');
  await owner.screenshot({ path: S + '/rl-1-reglage.png', fullPage: true });
  sql(`UPDATE organizations SET facturo_reminders_since = '${mu(-60)} 08:00:00' WHERE id = ${org}`);   // as if switched on two months ago
  const a = await invoice(fr, mu(-8), '1000'), b = await invoice(fr, mu(-9), '2000'), c = await invoice(fr, mu(-3), '3000');
  const d = await invoice(en, mu(-31), '4000'), g = await invoice(none, mu(-10), '5000'), old = await invoice(fr, mu(-70), '6000');
  await api('/api/facturo/documents', { action: 'status', id: b, status: 'paid' });
  fresh();
  noDigest();
  r = run(); m = fresh();
  assert(r.status === 0 && r.stdout.includes('2 invoice reminder(s) sent'), 'run ' + r.stdout);
  const ma = m.find(x => x.to === 'compta@lagon.mu'), md = m.find(x => x.to === 'accounts@sunset.mu');
  assert(m.length === 2 && ma && md, 'two reminders ' + m.map(x => x.to + ' ' + x.subject));
  const numA = sql(`SELECT number FROM facturo_documents WHERE id = ${a}`), numD = sql(`SELECT number FROM facturo_documents WHERE id = ${d}`);
  assert(ma.subject === `Rappel : facture ${numA} – Ocean Tech Ltd` && ma.body.includes('Sauf erreur de notre part') && ma.body.includes('Rs 1,000.00') && ma.body.includes('/facturo/view.php?t=') && ma.replyTo === 'compta@oceantech.mu' && ma.from.includes('Ocean Tech Ltd'), 'fr reminder ' + JSON.stringify(ma));
  assert(md.subject === `Reminder: invoice ${numD} – Ocean Tech Ltd` && md.body.includes('has not been paid yet'), 'en reminder, worded as a first one ' + md.subject);
  assert(sql(`SELECT GROUP_CONCAT(kind ORDER BY kind) FROM notification_log WHERE organization_id = ${org} AND ref = '${d}'`) === 'invoice_1,invoice_2', 'first marked done too');
  await owner.goto(B + `/app.php?m=facturo&p=edit&id=${a}`);
  assert((await owner.textContent('.send-log')).includes('Relance automatique envoyée à compta@lagon.mu'), 'in history');
  await owner.screenshot({ path: S + '/rl-2-historique.png', fullPage: true });
  r = run(); m = fresh();
  assert(m.length === 0, 'once');
  step(`overdue invoices: 8 days late → « Rappel : facture ${numA} » in French, from the company, replies to its address, link to the invoice, in its history as « Relance automatique »; 31 days late with no earlier reminder → one, worded as a first, in English for an English client; paid, 3 days late, before switch-on (70 days) and no client e-mail → nothing; never twice`);

  // second reminder, client e-mail added later, credited, switch off
  sql(`UPDATE facturo_documents SET due_date = '${mu(-31)}' WHERE id = ${a}`);
  sql(`UPDATE facturo_clients SET email = 'tard@client.mu' WHERE id = ${none}`);
  sql(`UPDATE facturo_documents SET client_snapshot = JSON_SET(client_snapshot, '$.email', 'tard@client.mu') WHERE id = ${g}`);
  r = run(); m = fresh();
  assert(m.length === 2 && m.find(x => x.to === 'compta@lagon.mu').subject.startsWith('Second rappel') && m.find(x => x.to === 'compta@lagon.mu').body.includes('toujours impayée') && m.find(x => x.to === 'tard@client.mu'), 'second + late e-mail ' + m.map(x => x.to + ' ' + x.subject));
  await owner.goto(B + '/app.php?m=facturo&p=company');
  await owner.uncheck('#reminders-form input[name=enabled]');
  await Promise.all([owner.waitForNavigation(), owner.click('#reminders-form button[type=submit]')]);
  sql(`UPDATE facturo_documents SET due_date = '${mu(-40)}' WHERE id = ${c}`);
  r = run(); m = fresh();
  assert(m.length === 0 && sql(`SELECT facturo_reminders_since IS NULL FROM organizations WHERE id = ${org}`) === '1', 'switched off');
  step('30 days late after a first reminder → « Second rappel … toujours impayée »; an invoice whose client had no e-mail is reminded once one is added; switched off → nothing');

  // 4. SMTP down: exit 1, retried next run
  await owner.goto(B + '/app.php?m=facturo&p=company');
  await owner.check('#reminders-form input[name=enabled]');
  await Promise.all([owner.waitForNavigation(), owner.click('#reminders-form button[type=submit]')]);
  sql(`UPDATE organizations SET facturo_reminders_since = '${mu(-60)} 08:00:00' WHERE id = ${org}`);
  execFileSync('pkill', ['-f', 'fake_smtp.py']);
  await new Promise(res => setTimeout(res, 500));
  r = run();
  assert(r.status === 1 && r.stdout.includes('failed (retried tomorrow)'), 'smtp down ' + r.stdout);
  assert(sql(`SELECT COUNT(*) FROM notification_log WHERE ref = '${c}'`) === '0', 'claim released');
  execFileSync('bash', [S + '/up.sh']);   // tests/e2e/run.sh writes it: restarts the fake SMTP
  r = run(); m = fresh();
  assert(r.status === 0 && m.some(x => x.subject.includes(sql(`SELECT number FROM facturo_documents WHERE id = ${c}`))), 'retried ' + r.stdout);
  step('mail server down: the script exits 1 (cron alert), the reminder is not marked sent and goes out on the next run');

  assert(errors.length === 0, 'JS errors ' + errors);
  await browser.close();
  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
