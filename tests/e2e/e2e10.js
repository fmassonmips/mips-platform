const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const mails = () => fs.readdirSync(S + '/mail').sort().map(f => fs.readFileSync(S + '/mail/' + f, 'utf8'));
const mailsTo = (addr) => mails().filter(m => new RegExp('^To: .*' + addr.replace(/\./g, '\\.'), 'mi').test(m));
const bodyOf = (raw) => { const m = raw.match(/Content-Type: text\/plain[\s\S]*?\n\n([A-Za-z0-9+/=\n]+?)\n--/); return m ? Buffer.from(m[1].replace(/\n/g, ''), 'base64').toString('utf8') : raw; };
const sql = (q) => execFileSync('mysql', ['-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const step = (s) => console.log('✓', s);

  await page.goto(B + '/login.php');
  await page.fill('#email', 'admin@example.com'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  for (const m of ['flowdesk', 'formelio', 'clientbloom', 'facturo']) {
    await Promise.all([page.waitForNavigation(), page.click(`button[data-module="${m}"][data-action="activate"]`)]);
  }
  await page.goto(B + '/app.php?m=facturo&p=company');
  await page.fill('#o-name', 'Ocean Tech'); await page.fill('#o-email', 'hello@oceantech.mu');
  await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  step('apps activated');

  await page.goto(B + '/app.php?m=flowdesk&p=settings');
  await page.fill('#s-notify', 'support@oceantech.mu'); await page.fill('#s-intro', 'Une question ? Nous répondons sous 24 h ouvrées.');
  await page.click('#fd-settings button[type=submit]'); await page.waitForSelector('#fd-saved:not([hidden])');
  const link = (await page.inputValue('#fd-link')).replace(/^https?:\/\/[^/]+/, B);

  // ---- customer opens a ticket from a phone
  const cust = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  cust.on('pageerror', e => errors.push(e.message));
  await cust.goto(link);
  await cust.fill('#fd-name', 'Priya Ramdin'); await cust.fill('#fd-subject', 'Facture introuvable');
  await cust.fill('#fd-message', 'Bonjour, je ne retrouve pas ma facture d\'octobre.');
  await cust.click('#fd-new button[type=submit]'); await cust.waitForSelector('#fd-error:not([hidden])');
  step('e-mail required: ' + await cust.textContent('#fd-error'));
  await cust.fill('#fd-email', 'priya@example.mu'); await cust.fill('#fd-phone', '5712 3456');
  await cust.screenshot({ path: S + '/fd-2-contact-mobile.png', fullPage: true });
  await Promise.all([cust.waitForURL(/flowdesk\/t\.php/), cust.click('#fd-new button[type=submit]')]);
  assert((await cust.textContent('main')).includes('Votre demande est enregistrée'), 'ticket page');
  const ticketUrl = cust.url().replace('&new=1', '');
  step('ticket created from the contact form: ' + (await cust.textContent('p.muted.small')).trim());
  assert(mailsTo('priya@example.mu').length === 1 && mailsTo('support@oceantech.mu').length === 1, 'ack + team mail');
  step('acknowledgement to the customer, alert to support@');

  // rate limit + honeypot via API
  const api = (p, csrf) => cust.evaluate(async ([p, c]) => {
    const t = c || document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch('/api/flowdesk/public', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(p) });
    return { status: r.status, body: await r.json() };
  }, [p, csrf]);
  await cust.goto(link);
  const o = new URL(link).searchParams.get('o');
  let r = await api({ action: 'create', o, name: 'Bot', email: 'bot@x.io', subject: 'x', message: 'spam', website: 'http://spam' });
  assert(r.status === 200 && sql('SELECT COUNT(*) FROM flowdesk_tickets') === '1', 'honeypot not stored');
  for (let i = 2; i <= 5; i++) { r = await api({ action: 'create', o, name: 'Client ' + i, email: `c${i}@example.mu`, subject: 'Question ' + i, message: 'Bonjour ' + i }); assert(r.status === 200, 'create ' + i); }
  r = await api({ action: 'create', o, name: 'Client 6', email: 'c6@example.mu', subject: 'Question 6', message: 'Bonjour' });
  assert(r.status === 409 && /Trop d'envois/.test(r.body.error), 'IP limit');
  r = await api({ action: 'create', o, name: 'X', email: 'x@example.mu', subject: 'x', message: 'x' }, 'bad');
  assert(r.status === 419, 'csrf');
  step('honeypot dropped, 6th ticket in an hour refused, missing CSRF refused');
  sql("UPDATE flowdesk_tickets SET created_ip = '10.0.0.1'");

  // ---- inbox
  await page.goto(B + '/app.php?m=flowdesk');
  let rows = (await page.locator('table.tickets tbody tr').allTextContents()).map(x => x.replace(/\s+/g, ' ').trim());
  step('inbox « À traiter »: ' + rows.length + ' — first: ' + rows[0]);
  assert(rows.length === 5 && rows[0].startsWith('#1'), 'oldest first');
  // urgent goes to the top
  await page.goto(B + '/app.php?m=flowdesk&p=ticket&id=4');
  await Promise.all([page.waitForNavigation(), page.selectOption('#fd-priority', 'urgent')]);
  await page.goto(B + '/app.php?m=flowdesk');
  rows = (await page.locator('table.tickets tbody tr').allTextContents()).map(x => x.replace(/\s+/g, ' ').trim());
  assert(rows[0].startsWith('#4') && rows[0].includes('Urgente'), 'urgent first');
  step('urgent ticket moves to the top');

  // ---- reply, note
  await page.goto(B + '/app.php?m=flowdesk&p=ticket&id=1');
  await page.fill('#fd-answer textarea', 'Bonjour Priya, votre facture FAC-2026-0042 vous a été renvoyée par e-mail.');
  await Promise.all([page.waitForNavigation(), page.click('#fd-answer button[type=submit]')]);
  await page.check('#fd-answer input[value="note"]');
  await page.fill('#fd-answer textarea', 'Cliente fidèle, à traiter en priorité.');
  await Promise.all([page.waitForNavigation(), page.click('#fd-answer button[type=submit]')]);
  const side = (await page.textContent('.ticket-side')).replace(/\s+/g, ' ');
  assert(await page.inputValue('#fd-status') === 'pending' && await page.inputValue('#fd-assignee') !== '0', 'pending + auto-assigned');
  step('reply sent → « En attente du client », assigned to the person who replied; internal note added');
  const replyMail = mailsTo('priya@example.mu').map(bodyOf).find(b => b.includes('FAC-2026-0042'));
  assert(replyMail && replyMail.includes('/flowdesk/t.php?t=') && !mails().some(m => bodyOf(m).includes('Cliente fidèle')), 'reply mailed, note not');
  step('reply e-mailed with the ticket link; the note is never e-mailed');
  await page.screenshot({ path: S + '/fd-3-ticket.png', fullPage: true });

  // ---- customer sees the reply (not the note) and answers
  await cust.goto(ticketUrl);
  const thread = await cust.textContent('.thread');
  assert(thread.includes('FAC-2026-0042') && !thread.includes('Cliente fidèle'), 'public thread hides notes');
  await cust.fill('#fd-body', 'Merci, bien reçue !');
  await Promise.all([cust.waitForNavigation(), cust.click('#fd-reply button[type=submit]')]);
  await cust.screenshot({ path: S + '/fd-4-ticket-client.png', fullPage: true });
  assert(sql('SELECT status FROM flowdesk_tickets WHERE id = 1') === 'open', 'reopened');
  assert(mailsTo('admin@example.com').map(bodyOf).some(b => b.includes('Merci, bien reçue')), 'assignee notified');
  step('customer reply → ticket back to « À traiter », assignee notified');

  // resolve then close
  await page.goto(B + '/app.php?m=flowdesk&p=ticket&id=1');
  await Promise.all([page.waitForNavigation(), page.selectOption('#fd-status', 'closed')]);
  await cust.goto(ticketUrl);
  assert((await cust.textContent('main')).includes('clôturée') && !(await cust.$('#fd-reply')), 'closed: no reply box');
  r = await cust.evaluate(async (t) => (await fetch('/api/flowdesk/public', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name=csrf-token]').content }, body: JSON.stringify({ action: 'reply', t, body: 'encore' }) })).status, new URL(ticketUrl).searchParams.get('t'));
  assert(r === 409, 'closed refuses replies');
  step('closed ticket: no more replies');

  // ---- phone request entered by the team, no e-mail
  await page.goto(B + '/app.php?m=flowdesk&p=new');
  await page.fill('#n-name', 'M. Ramsamy'); await page.fill('#n-phone', '5 799 1122');
  await page.fill('#n-subject', 'Rappel demandé'); await page.fill('#n-message', 'Souhaite un devis pour 3 postes.');
  await Promise.all([page.waitForURL(/p=ticket&id=\d+/), page.click('#fd-staff-new button[type=submit]')]);
  assert(await page.isDisabled('#fd-answer input[value="reply"]'), 'no e-mail → reply disabled');
  step('ticket entered by the team (phone), reply disabled without e-mail');

  // ---- gap-free numbers under concurrency
  const nums = await page.evaluate(async () => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const rs = await Promise.all([1, 2, 3, 4, 5].map(i => fetch('/api/flowdesk/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t },
      body: JSON.stringify({ action: 'create', name: 'Lot ' + i, subject: 'Lot ' + i, message: 'm' }) }).then(r => r.status)));
    return rs;
  });
  const numbers = sql('SELECT GROUP_CONCAT(number ORDER BY number) FROM flowdesk_tickets');
  step('5 simultaneous creations → statuses ' + nums.join(',') + '; numbers ' + numbers);
  assert(numbers === '1,2,3,4,5,6,7,8,9,10,11', 'gap-free');

  // ---- search
  await page.goto(B + '/app.php?m=flowdesk&q=' + encodeURIComponent('priya@example'));
  rows = await page.locator('table.tickets tbody tr').allTextContents();
  assert(rows.length === 1 && rows[0].includes('#1'), 'search by e-mail');
  await page.goto(B + '/app.php?m=flowdesk&q=%236');
  assert((await page.locator('table.tickets tbody tr').allTextContents()).length === 1, 'search by number');
  step('search by e-mail and by #number');

  // ---- ClientBloom match
  await page.goto(B + '/app.php?m=clientbloom&p=customer');
  await page.evaluate(async () => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    await fetch('/api/clientbloom/customers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t },
      body: JSON.stringify({ action: 'save', id: 0, name: 'Priya Ramdin', phone: '57123456', email: 'priya@example.mu', tags: '', marketing_consent: false }) });
  });
  await page.goto(B + '/app.php?m=flowdesk&p=ticket&id=1');
  assert((await page.textContent('.ticket-side')).includes('Client fidélité'), 'loyalty shown');
  step('ClientBloom customer recognised on the ticket');

  // ---- Formelio contact form → ticket
  await page.goto(B + '/app.php?m=formelio');
  await Promise.all([page.waitForURL(/p=edit&id=\d+/), page.click('[data-fm-create="contact"]')]);
  await page.check('input[name="flowdesk_ticket"]');
  await Promise.all([page.waitForNavigation(), page.click('#fm-form button[type=submit]')]);
  await Promise.all([page.waitForNavigation(), page.click('[data-fm-status="open"]')]);
  const formLink = (await page.inputValue('#fm-link')).replace(/^https?:\/\/[^/]+/, B);
  await cust.goto(formLink);
  const inputs = cust.locator('#public-form input:not([type=hidden]):not([name=website]), #public-form textarea');
  await inputs.nth(0).fill('Kevin Li'); await inputs.nth(1).fill('kevin@example.mu'); await inputs.nth(2).fill('5800 1234');
  await inputs.nth(3).fill('Pouvez-vous me rappeler ?');
  await cust.click('#public-form button[type=submit]'); await cust.waitForSelector('#fm-thanks:not([hidden])');
  const fromForm = sql("SELECT CONCAT(number, '|', customer_name, '|', email, '|', phone, '|', source, '|', subject) FROM flowdesk_tickets WHERE source = 'formelio'");
  step('Formelio « Nous contacter » response → ticket ' + fromForm);
  assert(fromForm.startsWith('12|Kevin Li|kevin@example.mu|58001234|formelio|Nous contacter'), 'formelio ticket');

  // ---- English
  await page.goto(B + '/app.php?m=facturo&p=company');
  await page.selectOption('#o-lang', 'en'); await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
  await cust.goto(link);
  assert((await cust.textContent('h1')) === 'Contact support', 'EN');
  step('contact form in English when company documents are in English');
  await page.selectOption('#o-lang', 'fr'); await page.click('#company-form button[type=submit]');

  await page.goto(B + '/app.php?m=flowdesk&f=all');
  await page.screenshot({ path: S + '/fd-1-inbox.png', fullPage: true });
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
