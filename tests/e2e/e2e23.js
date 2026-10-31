// First steps after sign-up (wizard + « Bien démarrer ») and import from Excel (CSV).
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);
const verifyLink = () => {
  const m = fs.readdirSync(S + '/mail').sort().map(f => fs.readFileSync(S + '/mail/' + f, 'utf8')).filter(x => /^To: .*kavita@epicerie\.mu/mi.test(x)).pop();
  const body = Buffer.from((m.split(/\r?\n\r?\n/)[2] || '').split('--')[0].replace(/\s+/g, ''), 'base64').toString('utf8');
  return body.match(/\/verify\.php\?t=[0-9a-f]{64}/)[0];
};
const latin1 = (s) => Buffer.from(s, 'latin1');   // Excel « CSV (point-virgule) » on Windows

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));

  // 1. sign-up → confirmation → wizard
  await p.goto(B + '/register.php');
  await p.fill('#name', 'Kavita Doorgah'); await p.fill('#email', 'kavita@epicerie.mu'); await p.fill('#password', 'Epicerie2026!'); await p.check('#accept-terms');
  await p.click('#submit-btn'); await p.waitForSelector('#done-message:not([hidden])');
  await p.goto(B + verifyLink()); await p.fill('#password', 'Epicerie2026!');
  await Promise.all([p.waitForURL('**/welcome.php'), p.click('#submit-btn')]);
  assert(await p.isVisible('#wz-profile') && !(await p.isVisible('#wz-apps')), 'step 1 shown');
  await p.fill('#wz-name', 'Épicerie Fine Kavita'); await p.fill('#wz-legal', 'Kavita Trading Ltd'); await p.fill('#wz-brn', 'C21012345');
  await p.fill('#wz-address', 'Royal Road, Rose-Hill');
  await p.screenshot({ path: S + '/ob-1-profil-mobile.png', fullPage: true });
  await p.click('#wz-profile button[type=submit]'); await p.waitForSelector('#wz-apps:not([hidden])');
  assert(sql("SELECT CONCAT(o.name, '|', o.legal_name, '|', o.brn) FROM organizations o JOIN organization_users ou ON ou.organization_id = o.id JOIN users u ON u.id = ou.user_id WHERE u.email = 'kavita@epicerie.mu'") === 'Épicerie Fine Kavita|Kavita Trading Ltd|C21012345', 'profile saved');
  for (const a of ['facturo', 'clientbloom', 'shoplokal']) await p.check(`#wz-apps input[value="${a}"]`);
  await p.screenshot({ path: S + '/ob-2-apps-mobile.png', fullPage: true });
  await p.click('#wz-apps button[type=submit]'); await p.waitForSelector('#wz-team:not([hidden])');
  const org = sql("SELECT ou.organization_id FROM organization_users ou JOIN users u ON u.id = ou.user_id WHERE u.email = 'kavita@epicerie.mu'");
  assert(sql(`SELECT GROUP_CONCAT(module_slug ORDER BY module_slug) FROM organization_modules WHERE organization_id = ${org} AND status = 'trial'`) === 'clientbloom,facturo,shoplokal', 'apps activated');
  await p.fill('#wz-inv-0', 'pas-un-email'); await p.click('#wz-team button[type=submit]');
  await p.waitForSelector('#wz-error:not([hidden])');
  assert((await p.textContent('#wz-error')).includes('pas-un-email'), 'invalid invite named');
  await p.fill('#wz-inv-0', 'ravi@epicerie.mu');
  await Promise.all([p.waitForURL('**/dashboard.php'), p.click('#wz-team button[type=submit]')]);
  assert(sql(`SELECT COUNT(*) FROM organization_invitations WHERE organization_id = ${org}`) === '1', 'invited');
  step('sign-up → confirmation opens « Bien démarrer » on the phone: profile saved (raison sociale, BRN), 3 apps in trial, colleague invited (an invalid address is named and stops the step), then the dashboard');

  // 2. checklist
  let card = await p.textContent('#ob-card');
  assert(card.includes('3 / 4') && card.includes('Importer'), 'checklist 3/4 ' + card);
  assert((await p.locator('#ob-card li.ob-done').count()) === 3, '3 ticked');
  await p.screenshot({ path: S + '/ob-3-checklist-mobile.png', fullPage: true });
  await Promise.all([p.waitForURL('**/import.php?type=clients'), p.click('#ob-card a:has-text("Importer")')]);
  step('dashboard: « Bien démarrer 3 / 4 », the three done steps ticked, « Importer » leads to the clients import');

  // 3. clients from an Excel CSV (Windows-1252, « ; »)
  const res = await p.request.get(B + '/import.php?type=clients&template=1');
  const tpl = (await res.body()).toString('utf8');
  assert(tpl.startsWith('﻿"Nom / société";"E-mail";"Téléphone"') && res.headers()['content-disposition'].includes('modele-import-clients.csv'), 'template');
  const csv = 'Raison sociale;Courriel;Tél.;Adresse;N° TVA\r\n'
    + 'Hôtel Le Récif;compta@recif.mu;230 5712 3456;Pointe aux Piments;VAT27011111\r\n'
    + 'Boulangerie Gaëlle;;5823 1122;Quatre-Bornes;\r\n'
    + 'Mauvais Mail;pas-un-mail;;;\r\n'
    + ';sans-nom@x.mu;;;\r\n'
    + 'Hôtel Le Récif bis;COMPTA@recif.mu;;;\r\n'
    + 'Garage Ah-Kee;garage@ahkee.mu;;"Royal Road; Beau-Bassin";\r\n';
  await p.setInputFiles('#im-file', { name: 'clients.csv', mimeType: 'text/csv', buffer: latin1(csv) });
  await p.waitForSelector('#im-check:not([hidden])');
  await p.waitForFunction(() => document.getElementById('im-summary').textContent.includes('lignes dans le fichier'));
  assert(await p.inputValue('#im-map-name') === '0' && await p.inputValue('#im-map-email') === '1' && await p.inputValue('#im-map-vat_number') === '4' && await p.inputValue('#im-map-brn') === '-1', 'columns guessed');
  const sum = await p.textContent('#im-summary');
  assert(sum.includes('6 lignes') && sum.includes('3 lignes prêtes') && sum.includes('1 déjà présente') && sum.includes('2 lignes à corriger'), 'summary ' + sum);
  const errs = await p.textContent('#im-errors');
  assert(errs.includes('Ligne 4') && errs.includes('Ligne 5') && errs.includes('obligatoire'), 'errors ' + errs);
  assert(sql(`SELECT COUNT(*) FROM facturo_clients WHERE organization_id = ${org}`) === '0', 'nothing saved before confirming');
  await p.screenshot({ path: S + '/ob-4-import-verif-mobile.png', fullPage: true });
  await p.click('#im-go'); await p.waitForSelector('#im-done:not([hidden])');
  assert((await p.textContent('#im-done-text')).includes('3 lignes importées'), 'imported');
  assert(sql(`SELECT GROUP_CONCAT(CONCAT(name, '|', IFNULL(email, '-'), '|', IFNULL(address, '-')) ORDER BY name SEPARATOR ' ; ') FROM facturo_clients WHERE organization_id = ${org}`)
    === 'Boulangerie Gaëlle|-|Quatre-Bornes ; Garage Ah-Kee|garage@ahkee.mu|Royal Road; Beau-Bassin ; Hôtel Le Récif|compta@recif.mu|Pointe aux Piments', 'rows stored with accents');
  await p.screenshot({ path: S + '/ob-5-import-fait-mobile.png', fullPage: true });
  await p.setInputFiles('#im-file', { name: 'clients.csv', mimeType: 'text/csv', buffer: latin1(csv) });
  await p.waitForFunction(() => document.getElementById('im-summary').textContent.includes('déjà présentes'));
  assert(await p.isDisabled('#im-go') && (await p.textContent('#im-go')).includes('Rien'), 're-import: nothing new');
  step('clients from an Excel CSV (Windows-1252, « ; », accents, « ; » inside quotes): columns matched by name (Raison sociale, Courriel, Tél., N° TVA), 3 ready / 1 duplicate (same e-mail, other case) / 2 errors with line numbers, nothing saved before « Importer »; importing the same file again finds nothing new');

  // 4. checklist complete → gone
  await p.goto(B + '/dashboard.php');
  assert(await p.locator('#ob-card').count() === 0 && sql(`SELECT onboarded_at IS NOT NULL FROM organizations WHERE id = ${org}`) === '1', 'checklist gone for good');
  step('all four steps done: « Bien démarrer » disappears for good');

  // 5. loyalty customers: no welcome bonus, birthday d/m/Y, consent
  sql(`INSERT INTO clientbloom_settings (organization_id, welcome_bonus_cents) VALUES (${org}, 5000)`);
  await p.goto(B + '/app.php?m=clientbloom&p=customers');
  await Promise.all([p.waitForURL('**/import.php?type=customers'), p.click('text=Importer depuis Excel')]);
  const ccsv = '﻿Nom,Mobile,Email,Date de naissance,Newsletter\n'
    + 'Priya Ramdin,5712 3456,priya@x.mu,14/02/1990,oui\n'
    + 'Jean Li,+230 5799 0000,,3/7/1985,non\n'
    + 'Sans Contact,,,,\n'
    + 'Priya Doublon,57123456,,,\n';
  await p.setInputFiles('#im-file', { name: 'fidelite.csv', mimeType: 'text/csv', buffer: Buffer.from(ccsv, 'utf8') });
  await p.waitForFunction(() => document.getElementById('im-summary').textContent.includes('prêtes'));
  assert((await p.textContent('#im-summary')).includes('2 lignes prêtes') && (await p.textContent('#im-errors')).includes('Ligne 4'), 'customers check');
  await p.click('#im-go'); await p.waitForSelector('#im-done:not([hidden])');
  assert(sql(`SELECT GROUP_CONCAT(CONCAT(name, '|', phone, '|', IFNULL(birthday, '-'), '|', marketing_consent) ORDER BY name SEPARATOR ' ; ') FROM clientbloom_customers WHERE organization_id = ${org}`)
    === 'Jean Li|57990000|1985-07-03|0 ; Priya Ramdin|57123456|1990-02-14|1', 'customers stored');
  assert(sql(`SELECT COUNT(*) FROM clientbloom_transactions WHERE organization_id = ${org}`) === '0', 'no welcome bonus');
  step('loyalty customers (UTF-8, « , »): phone normalised (+230 removed), birthday 14/02/1990 read day first, consent « oui »; same phone in another format = duplicate; no welcome bonus credited to imported customers');

  // 6. products: a column to choose by hand, Mauritian price formats, VAT
  await p.goto(B + '/import.php?type=products');
  const pcsv = 'Article;Montant;Taxe;Qté\n'
    + 'Savon vanille;250,00;15 %;40\n'
    + 'Thé de Chamarel;"1 250,50";exonéré;\n'
    + 'Rhum arrangé;1,250;;3\n'
    + 'Panier cadeau;gratuit;;\n';
  await p.setInputFiles('#im-file', { name: 'produits.csv', mimeType: 'text/csv', buffer: Buffer.from(pcsv, 'utf8') });
  await p.waitForFunction(() => document.getElementById('im-error').textContent.includes('Prix TTC'));
  assert(await p.inputValue('#im-map-price') === '-1' && await p.isDisabled('#im-go'), 'price column not guessed');
  await p.selectOption('#im-map-price', '1');
  await p.waitForFunction(() => document.getElementById('im-summary').textContent.includes('3 lignes prêtes'));
  assert((await p.textContent('#im-errors')).includes('Ligne 5') && (await p.textContent('#im-errors')).includes('gratuit'), 'bad price named');
  await p.click('#im-go'); await p.waitForSelector('#im-done:not([hidden])');
  const prods = sql(`SELECT GROUP_CONCAT(CONCAT(name, '|', price_cents, '|', tax_code, '|', IFNULL(stock, '-'), '|', active) ORDER BY name SEPARATOR ' ; ') FROM shoplokal_products WHERE organization_id = ${org}`);
  assert(prods === 'Rhum arrangé|108696|TC01|3|1 ; Savon vanille|21739|TC01|40|1 ; Thé de Chamarel|125050|TC03|-|1', 'products ' + prods);
  step('products: the price column (« Montant ») chosen by hand after the warning; 250,00 / « 1 250,50 » / 1,250 read as Rs 250.00, 1 250.50, 1 250.00 TTC and stored excl. VAT (15 % or exonéré, empty = 15 %); « gratuit » refused with its line');

  // 7. who may import
  const owner = await (await browser.newContext()).newPage();
  await owner.goto(B + '/login.php'); await owner.fill('#email', 'admin@example.com'); await owner.fill('#password', 'Admin123!');
  await Promise.all([owner.waitForURL('**/dashboard.php'), owner.click('#submit-btn')]);
  assert(await owner.locator('#ob-card').count() === 1, 'seed owner has the checklist');
  await owner.click('#ob-hide'); await owner.waitForFunction(() => !document.getElementById('ob-card'));
  await owner.reload();
  assert(await owner.locator('#ob-card').count() === 0, 'hidden for good');
  await owner.goto(B + '/import.php?type=clients');
  assert(owner.url().includes('/dashboard.php'), 'app not activated → dashboard');
  sql(`INSERT INTO organization_users (organization_id, user_id, role) SELECT ${org}, id, 'member' FROM users WHERE email = 'admin@example.com'`);
  sql("DELETE FROM organization_users WHERE role = 'owner' AND user_id = (SELECT id FROM users WHERE email = 'admin@example.com')");
  await owner.goto(B + '/import.php?type=clients');
  assert(owner.url().includes('/dashboard.php'), 'member → dashboard');
  await owner.goto(B + '/dashboard.php');
  assert(await owner.locator('#ob-card').count() === 0, 'no checklist for a member');
  const r = await owner.evaluate(async () => {
    const t = document.querySelector('meta[name=csrf-token]').content;
    const res = await fetch('/api/suite/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify({ action: 'import', type: 'clients', file: btoa('Nom\nX\n'), mapping: { name: 0 } }) });
    return res.status;
  });
  assert(r === 403, 'member API 403');
  step('« Masquer cette liste » hides the checklist for good; import refused when the app is not active, and to a member (page → dashboard, API 403); members do not see the checklist');

  assert(errors.length === 0, 'JS errors ' + errors);
  await browser.close();
  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
