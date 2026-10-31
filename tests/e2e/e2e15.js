const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const subjects = (addr) => fs.readdirSync(S + '/mail').map(f => fs.readFileSync(S + '/mail/' + f, 'utf8'))
  .filter(m => new RegExp('^To: .*' + addr.replace(/\./g, '\\.'), 'mi').test(m))
  .map(m => { const s = (m.match(/^Subject: (.*)$/mi) || [])[1] || ''; const b = s.match(/=\?UTF-8\?B\?(.*)\?=/); return b ? Buffer.from(b[1], 'base64').toString('utf8') : s; });
const mu = new Date(new Date().toLocaleString('en-US', { timeZone: 'Indian/Mauritius' }));
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const TODAY = ymd(mu);
let YESTERDAY = new Date(mu.getTime() - 864e5); while ([0, 6].includes(YESTERDAY.getDay())) YESTERDAY = new Date(YESTERDAY.getTime() - 864e5); YESTERDAY = ymd(YESTERDAY);
let OLD = new Date(mu.getTime() - 40 * 864e5); while ([0, 6].includes(OLD.getDay())) OLD = new Date(OLD.getTime() - 864e5); OLD = ymd(OLD);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); return p; };
  watch(page);
  const step = (s) => console.log('✓', s);
  const call = (pg, url, p) => pg.evaluate(async ([u, p]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(p) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, [url, p]);
  const sz = (pg, p) => call(pg, '/api/staffzen/leave', p);

  await page.goto(B + '/login.php');
  await page.fill('#email', 'admin@example.com'); await page.fill('#password', 'Admin123!');
  await Promise.all([page.waitForURL('**/dashboard.php'), page.click('#submit-btn')]);
  for (const m of ['staffzen', 'bizpilot']) await Promise.all([page.waitForNavigation(), page.click(`button[data-module="${m}"][data-action="activate"]`)]);
  await call(page, '/api/suite/organization', { name: 'Ocean Tech', legal_name: 'Ocean Tech Ltd', brn: 'C1', vat_number: '', address: 'Ebène', email: '', phone: '', document_language: 'fr' });
  sql("UPDATE users SET name = 'Marie Laval' WHERE email = 'admin@example.com'");
  const join = async (email, role, name, mobile) => {
    await page.goto(B + '/team.php');
    const r = await call(page, '/api/suite/team', { action: 'invite', email, role });
    const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true } : { viewport: { width: 1280, height: 900 } });
    const p = watch(await ctx.newPage());
    await p.goto(r.body.url); await p.fill('#name', name); await p.fill('#password', 'Secret2026!'); await p.check('#accept-terms');
    await Promise.all([p.waitForURL('**/dashboard.php'), p.click('#submit-btn')]);
    return [p, +sql(`SELECT id FROM users WHERE email = '${email}'`)];
  };
  const [kevin, kevinId] = await join('kevin@oceantech.mu', 'admin', 'Kevin Li', false);
  const [anjali, anjaliId] = await join('anjali@oceantech.mu', 'member', 'Anjali Ramsamy', true);
  step('Ocean Tech: owner Marie, admin Kevin and member Anjali joined through invitations');

  // settings: defaults + fixed holidays
  await page.goto(B + '/app.php?m=staffzen&p=settings&y=2026');
  assert(await page.locator('[data-type-row]').count() === 4, '3 default types + new row');
  await Promise.all([page.waitForNavigation(), page.click('#sz-fixed')]);
  assert(sql("SELECT COUNT(*) FROM staffzen_holidays WHERE YEAR(day) = 2026") === '9', '9 fixed holidays');
  await page.screenshot({ path: S + '/sz-5-reglages.png', fullPage: true });
  step('defaults: Congé annuel 20 j, maladie 15 j, sans solde non décompté; 9 fixed-date Mauritian holidays added in one click');
  const T = {}; for (const r of sql('SELECT name, id FROM staffzen_leave_types').split('\n')) { const [n, id] = r.split('\t'); T[n] = +id; }

  // Anjali on her phone: request Mon 2 – Fri 6 Nov (2 Nov is a holiday) = 4 days
  await anjali.goto(B + '/app.php?m=staffzen');
  assert((await anjali.textContent('.kpis')).includes('20 j'), 'balance 20');
  await anjali.fill('#rq-start', '2026-11-02'); await anjali.dispatchEvent('#rq-start', 'change');
  await anjali.fill('#rq-end', '2026-11-06'); await anjali.dispatchEvent('#rq-end', 'change');
  assert((await anjali.textContent('[data-count]')).includes('4 j'), 'live count ' + await anjali.textContent('[data-count]'));
  assert(await anjali.isHidden('[data-half-field]'), 'half hidden for multi-day');
  await anjali.fill('#rq-note', 'Mariage de ma sœur');
  await Promise.all([anjali.waitForNavigation(), anjali.click('#sz-request button[type=submit]')]);
  assert(sql(`SELECT CONCAT(halfdays, status) FROM staffzen_requests WHERE user_id = ${anjaliId}`) === '8pending', '4 days pending');
  assert(subjects('admin@example.com').some(s => s.includes('Demande de congé')) && subjects('kevin@oceantech.mu').some(s => s.includes('Demande de congé')), 'managers mailed');
  assert(!subjects('anjali@oceantech.mu').some(s => s.includes('Demande de congé')), 'not herself');
  step('Anjali (phone) asks 02→06/11: live count « 4 j » (02/11 is a holiday); owner and Kevin e-mailed');

  // half days, overlaps, weekends, years
  let r = await sz(anjali, { action: 'request', type_id: T['Congé annuel'], start: '2026-11-05', end: '2026-11-05', half: '', note: '' });
  assert(r.status === 422 && r.body.error.includes('existe déjà'), 'overlap');
  r = await sz(anjali, { action: 'request', type_id: T['Congé annuel'], start: '2026-11-09', end: '2026-11-09', half: 'am', note: '' }); assert(r.status === 200, 'am');
  r = await sz(anjali, { action: 'request', type_id: T['Congé annuel'], start: '2026-11-09', end: '2026-11-09', half: 'pm', note: '' }); assert(r.status === 200, 'pm complementary');
  const pmId = r.body.id;
  r = await sz(anjali, { action: 'request', type_id: T['Congé annuel'], start: '2026-11-09', end: '2026-11-09', half: 'am', note: '' }); assert(r.status === 422, 'am twice');
  r = await sz(anjali, { action: 'request', type_id: T['Congé annuel'], start: '2026-11-07', end: '2026-11-08', half: '', note: '' });
  assert(r.status === 422 && r.body.error.includes('Aucun jour'), 'weekend');
  r = await sz(anjali, { action: 'request', type_id: T['Congé annuel'], start: '2026-12-28', end: '2027-01-04', half: '', note: '' });
  assert(r.status === 422 && r.body.error.includes('deux années'), 'cross year');
  r = await sz(anjali, { action: 'request', type_id: T['Congé annuel'], start: OLD, end: OLD, half: '', note: '' });
  assert(r.status === 422 && r.body.error.includes('responsable'), 'too old for self');
  step('half days: morning + afternoon of 09/11 both fine, a second morning refused; overlap, weekend-only, two-year span and 40-day-old absence refused');

  // balance: 15 left; Dec has 22 working days (25/12 holiday) → refused; race of 8 + 8
  r = await sz(anjali, { action: 'request', type_id: T['Congé annuel'], start: '2026-12-01', end: '2026-12-31', half: '', note: '' });
  assert(r.status === 422 && r.body.error.includes('Solde insuffisant') && r.body.error.includes('15 j') && r.body.error.includes('22 j'), 'balance ' + JSON.stringify(r));
  const ctx2 = await browser.newContext(); const a2 = await ctx2.newPage();
  await ctx2.addCookies(await anjali.context().cookies());
  await a2.goto(B + '/app.php?m=staffzen');
  const race = await Promise.all([
    sz(anjali, { action: 'request', type_id: T['Congé annuel'], start: '2026-12-01', end: '2026-12-10', half: '', note: 'A' }),
    sz(a2, { action: 'request', type_id: T['Congé annuel'], start: '2026-12-14', end: '2026-12-23', half: '', note: 'B' }),
  ]);
  assert(race.map(x => x.status).sort().join() === '200,422', 'race ' + JSON.stringify(race));
  await anjali.goto(B + '/app.php?m=staffzen');
  assert((await anjali.textContent('.kpis')).includes('7 j'), 'remaining 7 ' + await anjali.textContent('.kpis'));
  await anjali.screenshot({ path: S + '/sz-1-mes-conges-mobile.png', fullPage: true });
  step('balance: December (22 j) refused with « il reste 15 j »; two 8-day requests sent at once → one accepted; 7 j left');

  // member cannot manage
  r = await sz(anjali, { action: 'decide', id: pmId, approve: true, note: '' }); assert(r.status === 403, 'member decide');
  r = await sz(anjali, { action: 'record', user_id: kevinId, type_id: T['Congé maladie'], start: TODAY, end: TODAY, half: '', note: '' }); assert(r.status === 403, 'member record');
  r = await sz(anjali, { action: 'work_days', days: '1111111' }); assert(r.status === 403, 'member settings');
  step('member: cannot approve, record for others or change settings (403)');

  // owner approves / refuses
  await page.goto(B + '/app.php?m=staffzen&p=approvals');
  assert(await page.locator('.sz-queue-item').count() === 4, 'four pending');
  const first = sql(`SELECT id FROM staffzen_requests WHERE start_date = '2026-11-02'`);
  await page.fill(`[data-note-for="${first}"]`, 'Félicitations !');
  await page.screenshot({ path: S + '/sz-3-a-valider.png', fullPage: true });
  await Promise.all([page.waitForNavigation(), page.click(`[data-sz-decide="${first}"][data-approve="1"]`)]);
  await page.fill(`[data-note-for="${pmId}"]`, 'Inventaire ce jour-là');
  await Promise.all([page.waitForNavigation(), page.click(`[data-sz-decide="${pmId}"][data-approve="0"]`)]);
  assert(subjects('anjali@oceantech.mu').some(s => s.includes('Congé accordé')) && subjects('anjali@oceantech.mu').some(s => s.includes('Congé refusé')), 'decision mails');
  r = await sz(page, { action: 'decide', id: +first, approve: false, note: '' }); assert(r.status === 422, 'already decided');
  step('owner approves 02→06/11 (« Félicitations ! ») and refuses 09/11 afternoon (« Inventaire ») → Anjali e-mailed each time; a decided request cannot be decided again');

  // Kevin (admin) cannot approve his own request; owner can approve hers
  r = await sz(kevin, { action: 'request', type_id: T['Congé annuel'], start: '2026-11-16', end: '2026-11-20', half: '', note: '' });
  r = await sz(kevin, { action: 'decide', id: r.body.id, approve: true, note: '' });
  assert(r.status === 422 && r.body.error.includes('autre responsable'), 'own approval');
  r = await sz(page, { action: 'request', type_id: T['Congé annuel'], start: '2026-11-23', end: '2026-11-27', half: '', note: '' });
  r = await sz(page, { action: 'decide', id: r.body.id, approve: true, note: '' }); assert(r.status === 200, 'owner self-approves');
  step('admin Kevin cannot approve his own leave; the owner can approve hers');

  // record: sick yesterday for Anjali, sick today for Kevin
  await page.goto(B + '/app.php?m=staffzen&p=approvals');
  await page.selectOption('#rc-user', String(anjaliId)); await page.selectOption('#rc-type', String(T['Congé maladie']));
  await page.fill('#rc-start', YESTERDAY); await page.dispatchEvent('#rc-start', 'change');
  await Promise.all([page.waitForNavigation(), page.click('#sz-record button[type=submit]')]);
  assert(sql(`SELECT status FROM staffzen_requests WHERE user_id = ${anjaliId} AND start_date = '${YESTERDAY}'`) === 'approved', 'recorded approved');
  assert(subjects('anjali@oceantech.mu').some(s => s.includes('Absence enregistrée')), 'recorded mail');
  r = await sz(page, { action: 'record', user_id: kevinId, type_id: T['Congé maladie'], start: TODAY, end: TODAY, half: 'pm', note: '' });
  const todayIsWork = r.status === 200;
  step(`owner records Anjali's sick day ${YESTERDAY} (accepted at once, she is e-mailed)` + (todayIsWork ? '; Kevin off this afternoon' : ''));

  // planning: privacy of leave type
  await anjali.goto(B + '/app.php?m=staffzen&p=planning&mo=2026-11');
  const kevinCell = await anjali.getAttribute(`.sz-cal tr:has(th:text("Kevin Li")) td.sz-pending >> nth=0`, 'title');
  assert(kevinCell === 'Absent (en attente)', 'member sees Absent only: ' + kevinCell);
  const ownCell = await anjali.getAttribute(`.sz-cal tr:has(th:text("Anjali Ramsamy")) td.sz-approved >> nth=0`, 'title');
  assert(ownCell === 'Congé annuel', 'own type ' + ownCell);
  await page.goto(B + '/app.php?m=staffzen&p=planning&mo=2026-11');
  const ownerView = await page.getAttribute(`.sz-cal tr:has(th:text("Kevin Li")) td.sz-pending >> nth=0`, 'title');
  assert(ownerView === 'Congé annuel (en attente)', 'manager sees type ' + ownerView);
  assert(await page.locator('.sz-cal tr:has(th:text("Anjali Ramsamy")) td.sz-approved').count() === 4, '4 approved days in Nov (holiday cell grey)');
  await page.screenshot({ path: S + '/sz-2-planning.png', fullPage: true });
  step('planning: a member sees « Absent » for colleagues (not the leave type, e.g. sick leave), managers see the type; holiday and weekends greyed');

  // cancel: approved future leave by Anjali → managers mailed; started leave cannot be self-cancelled
  const before = subjects('kevin@oceantech.mu').length;
  r = await sz(anjali, { action: 'cancel', id: +first }); assert(r.status === 200, 'cancel future approved');
  assert(subjects('kevin@oceantech.mu').length === before + 1, 'managers told');
  const sick = sql(`SELECT id FROM staffzen_requests WHERE user_id = ${anjaliId} AND start_date = '${YESTERDAY}'`);
  r = await sz(anjali, { action: 'cancel', id: +sick }); assert(r.status === 422 && r.body.error.includes('commencé'), 'started');
  r = await sz(anjali, { action: 'cancel', id: +sql(`SELECT id FROM staffzen_requests WHERE user_id = ${kevinId} LIMIT 1`) }); assert(r.status === 404, 'other person');
  step('Anjali cancels her approved November leave (managers e-mailed, balance back); she cannot cancel a started absence or someone else\'s');

  // balances: per-person allowance 22.5
  await page.goto(B + '/app.php?m=staffzen&p=balances&y=2026');
  const allow = page.locator(`[data-sz-allow][data-user="${anjaliId}"][data-type="${T['Congé annuel']}"]`);
  await allow.fill('22.5'); await Promise.all([page.waitForNavigation(), allow.dispatchEvent('change')]);
  r = await sz(anjali, { action: 'request', type_id: T['Congé annuel'], start: '2026-12-14', end: '2026-12-24', half: '', note: '' });
  // 22.5 − 0.5 (09/11 am pending) − 8 (Dec 1-10 pending) = 14 → 9 days ok
  assert(r.status === 200, 'with 22.5 ' + JSON.stringify(r));
  r = await sz(page, { action: 'allowance', user_id: anjaliId, type_id: T['Congé annuel'], year: 2026, days: '2.3' }); assert(r.status === 422, 'bad allowance');
  await page.reload();
  await page.screenshot({ path: S + '/sz-4-soldes.png', fullPage: true });
  step('Anjali\'s annual allowance raised to 22,5 j for 2026 → a 9-day request now fits; « 2.3 » refused (half days only)');

  // types: add, delete unused, cannot delete used; Saturday as work day
  r = await sz(page, { action: 'type', id: 0, name: 'Congé de formation', days: '5', active: true }); const ft = r.body.id;
  r = await sz(page, { action: 'delete_type', id: ft }); assert(r.status === 200, 'delete unused');
  r = await sz(page, { action: 'delete_type', id: T['Congé annuel'] }); assert(r.status === 422, 'used type');
  r = await sz(page, { action: 'work_days', days: '1111110' });
  r = await sz(page, { action: 'request', type_id: T['Congé sans solde'], start: '2026-11-28', end: '2026-11-28', half: '', note: '' });
  assert(r.status === 200 && sql(`SELECT halfdays FROM staffzen_requests WHERE id = ${r.body.id}`) === '2', 'saturday counts');
  step('types: unused one deleted, used one protected; with Saturday worked, a Saturday counts 1 j (unpaid, not counted against a balance)');

  // BizPilot
  await page.goto(B + '/app.php?m=bizpilot');
  const bp = await page.textContent('.todo');
  assert(bp.includes('demande(s) de congé à valider'), 'bizpilot pending');
  if (todayIsWork) assert(bp.includes('Kevin Li (après-midi)'), 'away today ' + bp);
  step('BizPilot « À faire »: leave requests to approve' + (todayIsWork ? ' and « Absent(s) aujourd\'hui : Kevin Li (après-midi) »' : ''));

  // removal cancels pending requests
  await page.goto(B + '/team.php');
  await Promise.all([page.waitForNavigation(), page.click(`[data-remove="${anjaliId}"]`)]);
  assert(sql(`SELECT COUNT(*) FROM staffzen_requests WHERE user_id = ${anjaliId} AND status = 'pending'`) === '0', 'pending cancelled on removal');
  assert(sql(`SELECT COUNT(*) FROM staffzen_requests WHERE user_id = ${anjaliId} AND status = 'approved'`) === '1', 'history kept');
  step('removing Anjali from the team cancels her pending requests and keeps her past absences');

  assert(errors.length === 0, 'JS errors: ' + errors.join(' | '));
  console.log('ALL GREEN');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
