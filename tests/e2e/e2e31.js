// Fixes from the risk review: permanent deletion keeps other companies' history, a cancelled closure
// is never purged, a suspended company's public links close, product edits keep the sales made
// meanwhile, Bookora season prices survive a change of VAT treatment.
const { execFileSync, spawnSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);
const app = (code) => execFileSync('php', ['-r', 'define("MIPS_NO_SESSION", true); $_SERVER["HTTP_USER_AGENT"] = "cli"; require "' + S + '/t/src/bootstrap.php"; ' + code]).toString().trim();
const id = (q) => Number(sql(q));

(async () => {
  // 1. Permanent deletion: an account another company still has history about is anonymised, not deleted
  sql("INSERT INTO organizations (name) VALUES ('Ancien employeur'), ('Société fermée'), ('Annulée')");
  const a = id("SELECT id FROM organizations WHERE name = 'Ancien employeur'");
  const b = id("SELECT id FROM organizations WHERE name = 'Société fermée'");
  const c = id("SELECT id FROM organizations WHERE name = 'Annulée'");
  sql("INSERT INTO users (email, password_hash, name) VALUES ('x@ex.mu', 'h', 'Xavier'), ('y@ex.mu', 'h', 'Yasmine'), ('z@ex.mu', 'h', 'Zoé')");
  const x = id("SELECT id FROM users WHERE email = 'x@ex.mu'"), y = id("SELECT id FROM users WHERE email = 'y@ex.mu'"), z = id("SELECT id FROM users WHERE email = 'z@ex.mu'");
  // Xavier worked at A (left: no membership, his usage history stays), now owner of B; Yasmine only in B; Zoé owns C.
  sql(`INSERT INTO organization_users (organization_id, user_id, role) VALUES (${b}, ${x}, 'owner'), (${b}, ${y}, 'member'), (${c}, ${z}, 'owner')`);
  sql(`INSERT INTO user_activity (organization_id, user_id, day) VALUES (${a}, ${x}, '2026-03-02'), (${b}, ${y}, '2026-10-01')`);
  sql(`UPDATE organizations SET deletion_scheduled_at = NOW() - INTERVAL 1 HOUR WHERE id IN (${b}, ${c})`);
  // Closure of C cancelled after the due list was read: purge() itself must refuse.
  sql(`UPDATE organizations SET deletion_scheduled_at = NULL WHERE id = ${c}`);
  assert(app(`echo \\App\\Suite\\Closure::purge(${c}) ? "purged" : "kept";`) === 'kept' && id(`SELECT COUNT(*) FROM organizations WHERE id = ${c}`) === 1, 'cancelled closure kept');
  const r = spawnSync('php', [S + '/t/tools/purge_companies.php'], { encoding: 'utf8' });
  assert(r.status === 0 && r.stdout.includes(`Company #${b} deleted`), 'purge ' + r.stdout + r.stderr);
  assert(id(`SELECT COUNT(*) FROM organizations WHERE id = ${b}`) === 0, 'B deleted');
  assert(id(`SELECT COUNT(*) FROM users WHERE id = ${y}`) === 0, 'Yasmine deleted');
  assert(sql(`SELECT CONCAT(email, '|', name, '|', is_active) FROM users WHERE id = ${x}`) === `supprime-${x}@invalid|Ancien membre|0`, 'Xavier anonymised ' + sql(`SELECT email FROM users WHERE id = ${x}`));
  assert(id(`SELECT COUNT(*) FROM user_activity WHERE organization_id = ${a} AND user_id = ${x}`) === 1, 'A keeps its history');
  assert(sql("SELECT detail FROM backoffice_log WHERE action = 'purge' ORDER BY id DESC LIMIT 1").includes('1 anonymisé(s)'), 'logged');
  step('deleting a company: its accounts are deleted, except one another company still has history about (anonymised: « Ancien membre », no e-mail, no login), so that history is kept; a closure cancelled at the last moment is not purged');

  // 2. A suspended company's public links close; reopened, they work again
  const org = c, admin = z;   // Zoé's company, still open
  app(`[$f, $e] = \\App\\ClientBloom\\Customers::validate(["name" => "Priya", "email" => "priya@ex.mu"]); \\App\\ClientBloom\\Customers::save(${org}, ${admin}, 0, $f);`);
  const cid = id(`SELECT id FROM clientbloom_customers WHERE organization_id = ${org} AND name = 'Priya'`);
  const token = app(`echo \\App\\ClientBloom\\Customers::publicToken(${org}, ${cid});`);
  const card = async () => (await fetch(B + '/clientbloom/card.php?t=' + token)).status;
  assert(await card() === 200, 'card open');
  sql(`UPDATE organizations SET suspended_at = NOW(), suspended_reason = 'test' WHERE id = ${org}`);
  assert(await card() === 404, 'card closed while suspended');
  sql(`UPDATE organizations SET suspended_at = NULL, suspended_reason = NULL, deletion_scheduled_at = NOW() + INTERVAL 30 DAY WHERE id = ${org}`);
  assert(await card() === 404, 'card closed while closing');
  sql(`UPDATE organizations SET deletion_scheduled_at = NULL WHERE id = ${org}`);
  assert(await card() === 200, 'card back');
  step('a customer link (ClientBloom card) answers 404 while the company is suspended or closing, and works again once reopened');

  // 3. Editing a product keeps the units sold since the form was opened
  const pid = Number(app(`[$id, $e] = \\App\\ShopLokal\\Products::save(${org}, 0, ["name" => "Rhum arrangé", "price" => "500", "tax_code" => "TC01", "stock" => "5", "active" => true]); echo $id;`));
  sql(`UPDATE shoplokal_products SET stock = 1 WHERE id = ${pid}`);   // 4 sold while the owner edits
  app(`\\App\\ShopLokal\\Products::save(${org}, ${pid}, ["name" => "Rhum arrangé vanille", "price" => "500", "tax_code" => "TC01", "stock" => "5", "stock_was" => "5", "active" => true]);`);
  assert(sql(`SELECT CONCAT(name, '|', stock) FROM shoplokal_products WHERE id = ${pid}`) === 'Rhum arrangé vanille|1', 'stock kept ' + sql(`SELECT stock FROM shoplokal_products WHERE id = ${pid}`));
  app(`\\App\\ShopLokal\\Products::save(${org}, ${pid}, ["name" => "Rhum arrangé vanille", "price" => "500", "tax_code" => "TC01", "stock" => "11", "stock_was" => "5", "active" => true]);`);
  assert(sql(`SELECT stock FROM shoplokal_products WHERE id = ${pid}`) === '7', 'delta applied');
  step('a product edited while 4 units sold: renaming it keeps the live stock (1, not 5 again); typing 11 instead of 5 adds 6 to what is left (7)');

  // 4. Bookora: season prices keep the price guests pay when the VAT treatment changes
  const uid = Number(app(`[$id, $e] = \\App\\Bookora\\Units::save(${org}, 0, ["name" => "Villa Corail", "price" => "4000", "tax_code" => "TC03", "capacity" => "4", "min_nights" => "1", "active" => true]); echo $id;`));
  const err = app(`echo \\App\\Bookora\\Units::addSeason(${org}, ${uid}, "Haute saison", "2026-12-15", "2027-01-15", "5000") ?? "ok";`);
  assert(err === 'ok', 'season ' + err);
  app(`\\App\\Bookora\\Units::save(${org}, ${uid}, ["name" => "Villa Corail", "price" => "4000", "tax_code" => "TC01", "capacity" => "4", "min_nights" => "1", "active" => true]);`);
  const ttc = app(`echo json_encode(array_map(fn ($s) => $s["price_ttc_cents"], \\App\\Bookora\\Units::seasons(${uid}, "TC01")));`);
  assert(ttc === '[500000]', 'season price incl. VAT kept ' + ttc);
  step('a villa switched from exempt to VAT 15 %: its high-season price stays Rs 5,000 per night VAT included (not Rs 5,750)');

  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
