const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const mailsTo = (addr) => fs.readdirSync(S + '/mail').map(f => fs.readFileSync(S + '/mail/' + f, 'utf8')).filter(m => new RegExp('^To: .*' + addr.replace(/\./g, '\\.'), 'mi').test(m));
const mu = new Date(new Date().toLocaleString('en-US', { timeZone: 'Indian/Mauritius' }));
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const TODAY = ymd(mu), YESTERDAY = ymd(new Date(mu.getTime() - 864e5)), TOMORROW = ymd(new Date(mu.getTime() + 864e5));

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
  for (const m of ['teamnest', 'facturo', 'flowdesk', 'bizpilot']) {
    await Promise.all([page.waitForNavigation(), page.click(`button[data-module="${m}"][data-action="activate"]`)]);
  }
  const api = (url, p) => page.evaluate(async ([u, p]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(p) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, [url, p]);
  await page.goto(B + '/app.php?m=facturo');
  await api('/api/suite/organization', { name: 'Ocean Tech', legal_name: 'Ocean Tech Ltd', brn: 'C12345678', vat_number: 'VAT27000000', address: 'Ebène', email: '', phone: '', document_language: 'fr' });
  await api('/api/facturo/clients', { action: 'save', id: 0, name: 'Hôtel Le Lagon', email: 'compta@lagon.mu' });
  // a second member, to receive an assignment
  sql("INSERT INTO users (email, password_hash, name) VALUES ('kevin@oceantech.mu', 'x', 'Kevin')");
  sql("INSERT INTO organization_users (organization_id, user_id, role) SELECT 1, id, 'member' FROM users WHERE email = 'kevin@oceantech.mu'");
  const kevin = sql("SELECT id FROM users WHERE email = 'kevin@oceantech.mu'");
  step('apps activated; a second member (Kevin)');

  // project
  await page.goto(B + '/app.php?m=teamnest');
  await page.fill('#p-name', 'Site web Le Lagon'); await page.selectOption('#p-client', { label: 'Hôtel Le Lagon' }); await page.fill('#p-rate', '1500');
  await Promise.all([page.waitForURL(/p=project&id=\d+/), page.click('#tn-project-form button[type=submit]')]);
  const pid = new URL(page.url()).searchParams.get('id');
  step('project created, billed to a Facturo client at Rs 1,500 / h');

  // quick add
  for (const [title, due] of [['Maquettes', YESTERDAY], ['Intégration', TOMORROW], ['Mise en ligne', '']]) {
    await page.fill('#q-title', title); await page.fill('#q-due', due);
    await Promise.all([page.waitForNavigation(), page.click('#tn-quick button[type=submit]')]);
  }
  await Promise.all([page.waitForNavigation(), page.locator('.task-card', { hasText: 'Intégration' }).locator('[data-tn-move="doing"]').click()]);
  const cols = await page.$$eval('.board-col', cs => cs.map(c => c.querySelector('h3').textContent.replace(/\s+/g, ' ').trim()));
  step('board: ' + cols.join(' | '));
  assert(cols[0].endsWith('2') && cols[1].endsWith('1'), 'columns');
  assert(await page.locator('.task-card', { hasText: 'Maquettes' }).locator('.text-danger').count() === 1, 'overdue shown');
  await page.screenshot({ path: S + '/tn-1-board.png', fullPage: true });

  // task page: time
  const taskId = sql("SELECT id FROM teamnest_tasks WHERE title = 'Maquettes'");
  const task2 = sql("SELECT id FROM teamnest_tasks WHERE title = 'Intégration'");
  await page.goto(B + '/app.php?m=teamnest&p=task&id=' + taskId);
  for (const d of ['1h30', '0.5']) {
    await page.fill('#tm-d', d);
    await Promise.all([page.waitForNavigation(), page.click('#tn-time-form button[type=submit]')]);
  }
  await page.fill('#tm-d', 'beaucoup'); await page.click('#tn-time-form button[type=submit]'); await page.waitForSelector('#tn-error:not([hidden])');
  step('invalid duration refused: ' + await page.textContent('#tn-error'));
  let r = await api('/api/teamnest/tasks', { action: 'time', task_id: +taskId, duration: '1h', date: TOMORROW, note: '' });
  assert(r.status === 422, 'future date refused');
  r = await api('/api/teamnest/tasks', { action: 'time', task_id: +task2, duration: '45', date: TODAY, note: 'responsive' });
  assert(r.status === 200, 'time task2 ' + JSON.stringify(r));
  assert((await page.textContent('h3')).includes('2 h 00'), 'total 2h ' + await page.textContent('h3'));
  step('time logged: 1h30 + 0.5 h on Maquettes, 45 min on Intégration; future date refused');

  // assign to Kevin → e-mail
  await page.selectOption('#t-assignee', kevin);
  await page.click('#tn-task-form button[type=submit]'); await page.waitForSelector('#tn-saved:not([hidden])');
  assert(mailsTo('kevin@oceantech.mu').length === 1, 'assignment mail');
  step('assigned to Kevin → e-mail sent to him');
  await page.screenshot({ path: S + '/tn-2-task.png', fullPage: true });

  // bill
  await page.goto(B + '/app.php?m=teamnest&p=project&id=' + pid);
  assert((await page.textContent('#tn-bill')).includes('2 h 45'), 'bill button');
  // two clicks at once: only one invoice
  const both = await Promise.all([1, 2].map(() => api('/api/teamnest/tasks', { action: 'bill', id: +pid })));
  const ok = both.filter(x => x.status === 200);
  step('2 simultaneous « Facturer » → ' + both.map(x => x.status).join(',') + (both.find(x => x.status !== 200) ? ' (' + both.find(x => x.status !== 200).body.error + ')' : ''));
  assert(ok.length === 1 && sql("SELECT COUNT(*) FROM facturo_documents") === '1', 'one invoice');
  const inv = ok[0].body.id;
  const lines = sql(`SELECT GROUP_CONCAT(CONCAT(description, '=', quantity, 'x', unit_price_cents, ' ', tax_code) ORDER BY position SEPARATOR ' | ') FROM facturo_document_lines WHERE document_id = ${inv}`);
  const totals = sql(`SELECT CONCAT(status, ' ', subtotal_cents, ' ', total_cents) FROM facturo_documents WHERE id = ${inv}`);
  step('draft invoice: ' + lines + ' → ' + totals);
  assert(totals === 'draft 412500 474375', 'totals 4125 HT, 4743.75 TTC');
  await page.goto(B + '/app.php?m=facturo&p=edit&id=' + inv);
  await page.screenshot({ path: S + '/tn-3-facture.png', fullPage: true });

  r = await api('/api/teamnest/tasks', { action: 'bill', id: +pid });
  assert(r.status === 422 && /Aucun temps/.test(r.body.error), 'nothing left');
  const billedEntry = sql(`SELECT id FROM teamnest_time WHERE billed_invoice_id = ${inv} LIMIT 1`);
  r = await api('/api/teamnest/tasks', { action: 'delete_time', id: +billedEntry });
  assert(r.status === 422, 'billed time locked');
  r = await api('/api/teamnest/tasks', { action: 'delete_task', id: +taskId });
  assert(r.status === 422, 'task with billed time locked');
  step('billed time can be neither billed again nor deleted');

  // delete the draft → time is unbilled again
  await api('/api/facturo/documents', { action: 'delete', id: inv });
  assert(sql('SELECT COUNT(*) FROM teamnest_time WHERE billed_invoice_id IS NULL') === '3', 'freed');
  step('deleting the invoice draft frees the time');

  // FlowDesk ticket → task
  const t = await api('/api/flowdesk/tickets', { action: 'create', name: 'Hôtel Le Lagon', email: 'compta@lagon.mu', phone: '', subject: 'Formulaire de réservation en panne', message: 'Le formulaire ne s\'envoie plus.' });
  await page.goto(B + '/app.php?m=flowdesk&p=ticket&id=' + t.body.id);
  await Promise.all([page.waitForNavigation(), page.click('#fd-task button[type=submit]')]);
  assert((await page.textContent('.ticket-side')).includes('Formulaire de réservation en panne'), 'task shown on ticket');
  const fromTicket = sql("SELECT CONCAT(title, ' | ', status, ' | ', flowdesk_ticket_id IS NOT NULL) FROM teamnest_tasks WHERE flowdesk_ticket_id IS NOT NULL");
  step('ticket → task: ' + fromTicket);
  await page.goto(B + '/app.php?m=teamnest&p=mine');
  const mine = (await page.locator('tbody tr').allTextContents()).map(x => x.replace(/\s+/g, ' ').trim());
  step('Mes tâches: ' + mine.join(' | '));
  assert(mine.some(x => x.includes('Formulaire de réservation')) && !mine.some(x => x.includes('Maquettes')), 'mine');

  // BizPilot
  await page.goto(B + '/app.php?m=bizpilot');
  assert((await page.textContent('.todo')).includes('1 tâche(s) en retard'), 'bizpilot overdue');
  step('BizPilot « À faire »: 1 task overdue');

  // archive
  await page.goto(B + '/app.php?m=teamnest&p=project&id=' + pid);
  await page.click('details summary');
  await Promise.all([page.waitForNavigation(), page.click('[data-tn-archive="1"]')]);
  assert(!(await page.textContent('main')).includes('Site web Le Lagon'), 'archived hidden');
  await page.goto(B + '/app.php?m=teamnest&archived=1');
  assert((await page.textContent('main')).includes('Site web Le Lagon'), 'in archive');
  step('project archived');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(B + '/app.php?m=teamnest&p=project&id=' + pid);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile');
  step('board on a phone: no horizontal overflow');

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
