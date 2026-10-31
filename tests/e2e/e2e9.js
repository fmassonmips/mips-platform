const { chromium } = require('playwright');
const fs = require('fs');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const mailsTo = (addr) => fs.readdirSync(S + '/mail').map(f => fs.readFileSync(S + '/mail/' + f, 'utf8')).filter(m => new RegExp('^To: .*' + addr.replace(/\./g, '\\.'), 'mi').test(m));
const bodyOf = (raw) => { const m = raw.match(/Content-Type: text\/plain[\s\S]*?\n\n([A-Za-z0-9+/=\n]+?)\n--/); return m ? Buffer.from(m[1].replace(/\n/g, ''), 'base64').toString('utf8') : raw; };

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
  for (const m of ['formelio', 'rendezvous', 'facturo']) {
    await Promise.all([page.waitForNavigation(), page.click(`button[data-module="${m}"][data-action="activate"]`)]);
  }
  step('Formelio and RendezVous activated');

  await page.goto(B + '/app.php?m=formelio');
  await Promise.all([page.waitForURL(/p=edit&id=\d+/), page.click('[data-fm-create="satisfaction"]')]);
  const formUrl = page.url();
  let labels = await page.$$eval('#fm-fields [data-k="label"]', els => els.map(e => e.value));
  step('created from template: ' + labels.join(' | '));
  assert(labels.length === 3, 'template has 3 questions');

  // builder: add a choice question with one option → refused
  await page.selectOption('#fm-add-type', 'choice'); await page.click('#fm-add');
  await page.locator('#fm-fields li').last().locator('[data-k="label"]').fill('Comment nous avez-vous connus ?');
  await page.locator('#fm-fields li').last().locator('[data-k="options"]').fill('Facebook');
  await page.click('#fm-form button[type=submit]'); await page.waitForSelector('#fm-error:not([hidden])');
  step('one-option choice refused: ' + await page.textContent('#fm-error'));
  await page.locator('#fm-fields li').last().locator('[data-k="options"]').fill('Facebook\nBouche-à-oreille\nGoogle');
  await page.locator('#fm-fields li').last().locator('[data-k="required"]').check();
  await page.locator('#fm-fields li').last().getByRole('button', { name: 'Monter' }).click();
  await page.fill('#fm-notify', 'avis@bellemare.mu');
  await Promise.all([page.waitForNavigation(), page.click('#fm-form button[type=submit]')]);
  labels = await page.$$eval('#fm-fields [data-k="label"]', els => els.map(e => e.value));
  step('saved order: ' + labels.join(' | '));
  assert(labels[2] === 'Comment nous avez-vous connus ?' && labels.length === 4, 'moved up and saved');
  await page.screenshot({ path: S + '/fm-1-editeur.png', fullPage: true });

  const link = (await page.inputValue('#fm-link')).replace(/^https?:\/\/[^/]+/, B);
  // draft: member sees a preview, the public sees "closed"
  await page.goto(link);
  assert(await page.isVisible('.preview-banner') && await page.isDisabled('#public-form button[type=submit]'), 'preview for members');
  await page.goto(formUrl);
  const anon = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  anon.on('pageerror', e => errors.push(e.message));
  await anon.goto(link);
  assert((await anon.textContent('main')).includes('n\'accepte plus de réponses'), 'draft closed to the public');
  step('draft: preview for the team, closed to the public');

  await Promise.all([page.waitForNavigation(), page.click('[data-fm-status="open"]')]);
  await anon.goto(link);
  await anon.click('#public-form button[type=submit]'); await anon.waitForSelector('#fm-error:not([hidden])');
  step('required check: ' + await anon.textContent('#fm-error'));
  await anon.click('.scale--rating .scale-item:has-text("4")');
  await anon.click('.scale--nps .scale-item:has-text("9")');
  await anon.check('input[value="Bouche-à-oreille"]');
  await anon.fill('textarea', 'Accueil parfait, un peu d\'attente.');
  await anon.screenshot({ path: S + '/fm-2-public-mobile.png', fullPage: true });
  assert(await anon.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile overflow');
  await anon.click('#public-form button[type=submit]'); await anon.waitForSelector('#fm-thanks:not([hidden])');
  step('public answer sent from a phone');

  // more answers through the API
  const ids = await page.$$eval('#fm-fields li', lis => lis.length);
  const fields = JSON.parse(await page.getAttribute('#fm-form', 'data-fields'));
  const fid = (type) => fields.find(f => f.type === type).id;
  const choiceId = fields.find(f => f.type === 'choice').id;
  const api = (payload, csrf) => anon.evaluate(async ([p, c]) => {
    const t = c || document.querySelector('meta[name=csrf-token]').content;
    const r = await fetch('/api/formelio/public', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify(p) });
    return { status: r.status, body: await r.json() };
  }, [payload, csrf]);
  await anon.goto(link);
  const t = new URL(link).searchParams.get('t');
  const answer = (rating, nps, choice, text) => api({ t, answers: { [fid('rating')]: String(rating), [fid('nps')]: String(nps), [choiceId]: choice, [fid('textarea')]: text } });
  for (const [r, n, c, x] of [[5, 10, 'Google', ''], [2, 3, 'Facebook', '=HYPERLINK("http://evil")'], [5, 10, 'Bouche-à-oreille', ''], [3, 7, 'Google', 'Bien']]) {
    const res = await answer(r, n, c, x); assert(res.status === 200, 'answer ' + JSON.stringify(res.body));
  }
  let res = await answer(9, 9, 'Google', '');
  assert(res.status === 422 && /choix invalide/.test(res.body.error), 'rating 9 refused ' + JSON.stringify(res.body));
  res = await api({ t, answers: { [fid('rating')]: '5', [fid('nps')]: '10', [choiceId]: 'Google' }, website: 'spam' });
  assert(res.status === 200, 'honeypot answers 200');
  res = await api({ t, answers: {} }, 'bad');
  assert(res.status === 419, 'csrf');
  step('API: invalid rating refused, honeypot silently dropped, missing CSRF refused');

  // results
  await page.goto(formUrl.replace('p=edit', 'p=results'));
  const head = await page.textContent('h2');
  const figures = await page.$$eval('.big-figure', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  step('results: ' + head + ' — ' + figures.join(' | '));
  assert(head.includes('5 réponses'), 'five responses (honeypot not stored)');
  // ratings 4,5,2,5,3 → 3.8 ; nps 9,10,3,10,7 → promoters 3, detractors 1 → +40
  assert(figures[0].startsWith('3,8') && figures[1].startsWith('+40'), 'average and NPS');
  await page.screenshot({ path: S + '/fm-3-resultats.png', fullPage: true });

  // CSV
  const csv = await page.evaluate(async (u) => (await fetch(u)).text(), '/formelio/export.php?id=' + new URL(formUrl).searchParams.get('id'));
  const lines = csv.replace(/^﻿/, '').trim().split('\n');
  step('CSV: ' + lines.length + ' lines; header: ' + lines[0].slice(0, 90) + '…');
  assert(lines.length === 6 && csv.includes(`"'=HYPERLINK`), 'csv rows and formula escaping');

  // renaming a question keeps the label the respondents saw
  await page.goto(formUrl);
  await page.locator('#fm-fields li').first().locator('[data-k="label"]').fill('Note globale');
  await Promise.all([page.waitForNavigation(), page.click('#fm-form button[type=submit]')]);
  await page.goto(formUrl.replace('p=edit', 'p=results'));
  await page.locator('details.response').first().click();
  const firstAnswers = await page.locator('details.response').first().textContent();
  assert(firstAnswers.includes('Êtes-vous satisfait(e) de votre visite ?') && (await page.textContent('main')).includes('Note globale'), 'old label kept in responses');
  step('renamed question: summary uses the new label, responses keep the one asked');

  // delete a response
  await Promise.all([page.waitForNavigation(), page.locator('details.response').first().locator('[data-fm-delete-response]').click()]);
  assert((await page.textContent('h2')).includes('4 réponses'), 'deleted');
  step('response deleted');

  // ---- RendezVous satisfaction survey
  await page.goto(B + '/app.php?m=rendezvous&p=services');
  await page.fill('#s-name', 'Massage'); await page.fill('#s-duration', '60');
  await Promise.all([page.waitForNavigation(), page.click('#service-form button[type=submit]')]);
  await page.goto(B + '/app.php?m=rendezvous&p=staff');
  await page.fill('#st-name', 'Anjali');
  await Promise.all([page.waitForNavigation(), page.click('#staff-form button[type=submit]')]);
  await page.goto(B + '/app.php?m=rendezvous&p=settings');
  await page.selectOption('#r-survey', { label: 'Votre avis compte' });
  await page.click('#rv-settings-form button[type=submit]'); await page.waitForSelector('#rv-settings-saved:not([hidden])');
  await page.goto(B + '/app.php?m=rendezvous');
  await page.$eval('#rv-book-form', f => { f.closest('details').open = true; });
  await page.fill('#b-time', '10:00'); await page.fill('#b-name', 'Nadia Li'); await page.fill('#b-email', 'nadia@example.mu');
  await Promise.all([page.waitForNavigation(), page.click('#rv-book-form button[type=submit]')]);
  await Promise.all([page.waitForNavigation(), page.locator('tr', { hasText: 'Nadia Li' }).locator('[data-rv-status="done"]').click()]);
  let survey = mailsTo('nadia@example.mu').map(bodyOf).filter(b => b.includes('/formelio/f.php'));
  assert(survey.length === 1, 'survey sent once ' + survey.length);
  const surveyLink = survey[0].match(/http\S+formelio\/f\.php\S+/)[0].replace(/^https?:\/\/[^/]+/, B);
  step('appointment honoured → survey e-mail: ' + survey[0].split('\n')[2]);
  // undo + done again: not sent twice
  await Promise.all([page.waitForNavigation(), page.locator('tr', { hasText: 'Nadia Li' }).locator('[data-rv-status="booked"]').click()]);
  await Promise.all([page.waitForNavigation(), page.locator('tr', { hasText: 'Nadia Li' }).locator('[data-rv-status="done"]').click()]);
  survey = mailsTo('nadia@example.mu').map(bodyOf).filter(b => b.includes('/formelio/f.php'));
  assert(survey.length === 1, 'survey not resent');
  await anon.goto(surveyLink);
  await anon.click('.scale--rating .scale-item:has-text("5")'); await anon.click('.scale--nps .scale-item:has-text("10")');
  await anon.check('input[value="Google"]');
  await anon.click('#public-form button[type=submit]'); await anon.waitForSelector('#fm-thanks:not([hidden])');
  await anon.goto(surveyLink);
  assert((await anon.textContent('main')).includes('déjà répondu'), 'one answer per appointment');
  await page.goto(formUrl.replace('p=edit', 'p=results'));
  assert((await page.textContent('main')).includes('après un rendez-vous'), 'source tag');
  step('survey answered once from the e-mail link; tagged « après un rendez-vous »');
  const notif = mailsTo('avis@bellemare.mu');
  step('notifications to avis@bellemare.mu: ' + notif.length);
  assert(notif.length === 6, 'notify each stored response');

  // English
  await page.goto(B + '/app.php?m=facturo&p=company').catch(() => {});
  if (await page.$('#o-lang')) {
    await page.selectOption('#o-lang', 'en'); await page.click('#company-form button[type=submit]'); await page.waitForSelector('#company-saved:not([hidden])');
    await anon.goto(link);
    assert((await anon.textContent('#public-form button[type=submit]')).trim() === 'Send', 'EN');
    step('public form in English when company documents are in English');
    await page.selectOption('#o-lang', 'fr'); await page.click('#company-form button[type=submit]');
  }

  // close
  await page.goto(formUrl);
  await Promise.all([page.waitForNavigation(), page.click('[data-fm-status="closed"]')]);
  res = await api({ t, answers: {} });
  assert(res.status === 409, 'closed');
  step('closed form refuses answers (409)');

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
