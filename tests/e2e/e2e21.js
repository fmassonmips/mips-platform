// Facturo roles: members prepare, owner/admin issue invoices, credit, mark paid, retry MRA.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);
const hash = (pw) => execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', pw]).toString();

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const open = async (email, pw) => {
    const p = await (await browser.newContext()).newPage();
    p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(B + '/login.php'); await p.fill('#email', email); await p.fill('#password', pw);
    await Promise.all([p.waitForURL('**/dashboard.php'), p.click('#submit-btn')]);
    return p;
  };
  const api = (p, url, body) => p.evaluate(async ([u, b]) => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, [url, body]);

  const owner = await open('admin@example.com', 'Admin123!');
  await Promise.all([owner.waitForNavigation(), owner.click('button[data-module="facturo"][data-action="activate"]')]);
  await owner.goto(B + '/app.php?m=facturo');
  await api(owner, '/api/suite/organization', { name: 'Ocean Tech', legal_name: 'Ocean Tech Ltd', brn: 'C12345678', vat_number: '', address: 'Ebène', email: '', phone: '', document_language: 'fr' });
  sql(`INSERT INTO users (email, password_hash, name, is_active, verified_at) VALUES ('membre@oceantech.mu', '${hash('Membre2026!')}', 'Priya', 1, NOW())`);
  sql("INSERT INTO organization_users (organization_id, user_id, role) SELECT 1, id, 'member' FROM users WHERE email = 'membre@oceantech.mu'");
  const m = await open('membre@oceantech.mu', 'Membre2026!');
  await m.goto(B + '/app.php?m=facturo');

  // the member prepares: client, quote (issued and accepted), invoice draft from it
  let r = await api(m, '/api/facturo/clients', { action: 'save', id: 0, name: 'Hôtel Le Lagon', email: 'compta@lagon.mu' });
  assert(r.status === 200, 'member saves a client');
  const client = r.body.id;
  const draft = (type) => ({ action: 'save', id: 0, type, client_id: client, issue_date: '2026-10-30', due_date: '2026-11-29', currency: 'MUR', notes: '',
    lines: [{ description: 'Maintenance', quantity: '1', unit_price: '1000', tax_code: 'TC01', nature: 'SERVICES' }] });
  r = await api(m, '/api/facturo/documents', draft('quote')); assert(r.status === 200, 'quote draft ' + JSON.stringify(r));
  const quote = r.body.id;
  r = await api(m, '/api/facturo/documents', { action: 'issue', id: quote }); assert(r.status === 200, 'member issues a quote ' + JSON.stringify(r));
  r = await api(m, '/api/facturo/documents', { action: 'status', id: quote, status: 'accepted' }); assert(r.status === 200, 'member marks quote accepted');
  r = await api(m, '/api/facturo/documents', { action: 'convert', id: quote }); assert(r.status === 200, 'member converts');
  const inv = r.body.id;
  step('member: saves a client, issues a quote, marks it accepted, turns it into an invoice draft');

  // the member cannot issue the invoice; the button is replaced by a note
  await m.goto(B + `/app.php?m=facturo&p=edit&id=${inv}`);
  assert(await m.locator('[data-doc-action="issue"]').count() === 0, 'no issue button');
  assert((await m.textContent('main')).includes('réservée au propriétaire'), 'note shown');
  await m.screenshot({ path: S + '/fac-role-1-membre.png', fullPage: true });
  r = await api(m, '/api/facturo/documents', { action: 'issue', id: inv });
  assert(r.status === 403 && sql(`SELECT status FROM facturo_documents WHERE id = ${inv}`) === 'draft', 'member cannot issue invoice');
  r = await api(m, '/api/facturo/documents', { action: 'issue', id: 999999 });
  assert(r.status === 403, 'unknown id refused as fiscal');
  step('member: no « Émettre » on the invoice draft (note instead); the API refuses with 403, the draft stays a draft');

  // owner issues; member cannot mark paid, credit, or retry MRA; buttons hidden
  r = await api(owner, '/api/facturo/documents', { action: 'issue', id: inv }); assert(r.status === 200, 'owner issues ' + JSON.stringify(r));
  await m.goto(B + `/app.php?m=facturo&p=edit&id=${inv}`);
  for (const sel of ['[data-status="paid"]', '[data-doc-action="credit"]', '[data-doc-action="mra"]']) {
    assert(await m.locator(sel).count() === 0, 'hidden for member ' + sel);
  }
  for (const body of [{ action: 'status', id: inv, status: 'paid' }, { action: 'credit', id: inv }, { action: 'mra', id: inv }]) {
    r = await api(m, '/api/facturo/documents', body);
    assert(r.status === 403, 'member refused ' + body.action);
  }
  assert(sql(`SELECT status FROM facturo_documents WHERE id = ${inv}`) === 'issued', 'still issued');
  assert(sql("SELECT COUNT(*) FROM facturo_documents WHERE type = 'credit_note'") === '0', 'no credit note');
  await owner.goto(B + `/app.php?m=facturo&p=edit&id=${inv}`);
  assert(await owner.locator('[data-status="paid"]').count() === 1 && await owner.locator('[data-doc-action="credit"]').count() === 1, 'owner sees the actions');
  r = await api(owner, '/api/facturo/documents', { action: 'status', id: inv, status: 'paid' }); assert(r.status === 200, 'owner marks paid');
  step('issued invoice: the member sees neither « Marquer payée » nor « Créer un avoir » nor the MRA retry, and the API refuses all three (403); the owner sees and uses them');

  // promoting to admin grants it
  sql("UPDATE organization_users SET role = 'admin' WHERE user_id = (SELECT id FROM users WHERE email = 'membre@oceantech.mu')");
  r = await api(m, '/api/facturo/documents', { action: 'credit', id: inv });
  assert(r.status === 200, 'admin creates a credit note ' + JSON.stringify(r));
  step('the same person promoted to admin can create the credit note');

  assert(errors.length === 0, 'JS errors ' + errors);
  await browser.close();
  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
