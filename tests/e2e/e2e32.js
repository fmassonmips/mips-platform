// Money fixes from the risk review: ClientBloom (purchase of a Facturo invoice, double reversal,
// counter sale sent twice) and ShopLokal (cancelling an invoiced order).
const { execFileSync, spawn } = require('child_process');
const S = process.argv[2];
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', process.env.MIPS_E2E_DB || 'mips_platform', '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);
const boot = 'define("MIPS_NO_SESSION", true); $_SERVER["HTTP_USER_AGENT"] = "cli"; require "' + S + '/t/src/bootstrap.php"; ';
const app = (code) => execFileSync('php', ['-r', boot + code]).toString().trim();
const appAsync = (code) => new Promise(res => { let out = ''; const p = spawn('php', ['-r', boot + code]); p.stdout.on('data', d => out += d); p.on('close', c => res([c, out.trim()])); });
const L = '\\App\\ClientBloom\\Ledger';

(async () => {
  sql("INSERT INTO organizations (name) VALUES ('Boutique Test')");
  const org = Number(sql("SELECT id FROM organizations WHERE name = 'Boutique Test'"));
  sql("INSERT INTO users (email, password_hash, name) VALUES ('caisse@test.mu', 'h', 'Caisse')");
  const user = Number(sql("SELECT id FROM users WHERE email = 'caisse@test.mu'"));
  sql(`INSERT INTO organization_users (organization_id, user_id, role) VALUES (${org}, ${user}, 'owner')`);
  app(`[$f] = \\App\\ClientBloom\\Customers::validate(["name" => "Priya", "phone" => "57123456"]); \\App\\ClientBloom\\Customers::save(${org}, ${user}, 0, $f, false);`);
  const cust = Number(sql(`SELECT id FROM clientbloom_customers WHERE organization_id = ${org}`));
  const buy = (amount, key = 'null') => app(`[$r, $e] = ${L}::checkout(${org}, ${user}, ${cust}, ${amount}, 0, "T", 1000, 0, ${key}); echo $e ?? $r["purchase_tx_id"];`);

  // 1. A purchase earned on a Facturo invoice cannot be reversed from ClientBloom
  const tx1 = Number(buy(1000000));
  sql(`INSERT INTO facturo_clients (organization_id, name) VALUES (${org}, 'Priya')`);
  const fc = Number(sql(`SELECT id FROM facturo_clients WHERE organization_id = ${org}`));
  sql(`INSERT INTO facturo_documents (organization_id, type, number, status, client_id, issue_date, due_date, currency, subtotal_cents, tax_cents, total_cents, paid_at, clientbloom_tx_id, created_by, created_at)
       VALUES (${org}, 'invoice', 'FAC-2026-0042', 'paid', ${fc}, CURDATE(), CURDATE(), 'MUR', 1000000, 0, 1000000, NOW(), ${tx1}, NULL, NOW())`);
  let r = app(`echo ${L}::reverse(${org}, ${user}, ${tx1}) ?? "ok";`);
  assert(r.includes('vient de la facture FAC-2026-0042') && r.includes('Facturo'), 'refused ' + r);
  assert(sql(`SELECT COUNT(*) FROM clientbloom_transactions WHERE reversal_of = ${tx1}`) === '0', 'not reversed');
  step('a purchase earned on invoice FAC-2026-0042 cannot be reversed in ClientBloom (« il s\'annule depuis Facturo »): its cashback is never taken back twice');

  // 2. Two reversals at the same moment: one succeeds, the other gets a message, no server error
  const tx2 = Number(buy(50000));
  const both = await Promise.all([1, 2].map(() => appAsync(`echo ${L}::reverse(${org}, ${user}, ${tx2}) ?? "ok";`)));
  assert(both.every(([code]) => code === 0), 'no crash ' + JSON.stringify(both));
  assert(both.filter(([, out]) => out === 'ok').length === 1 && sql(`SELECT COUNT(*) FROM clientbloom_transactions WHERE reversal_of = ${tx2}`) === '1', 'reversed once ' + JSON.stringify(both));
  step('two simultaneous reversals of one sale: one done, the other answered « ne peut pas être annulée / vient d\'être annulée », no 500');

  // 3. A counter sale sent twice with the same key is recorded once
  const key = '"' + 'ab'.repeat(16) + '"';
  const first = buy(30000, key), second = buy(30000, key);
  assert(/^\d+$/.test(first) && second.includes('déjà enregistrée'), 'once ' + first + ' / ' + second);
  assert(sql(`SELECT COUNT(*) FROM clientbloom_transactions WHERE organization_id = ${org} AND type = 'purchase' AND amount_cents = 30000`) === '1', 'one purchase');
  assert(/^\d+$/.test(buy(30000, '"' + 'cd'.repeat(16) + '"')), 'a new sale with a new key');
  step('the same counter sale submitted twice (retry after a lost answer) is recorded once; the next sale goes through');

  // 4. ShopLokal: an order whose invoice is issued cannot be cancelled before a credit note; a draft goes with it
  const order = (n) => {
    sql(`INSERT INTO shoplokal_orders (organization_id, number, status, customer_name, phone, delivery_method, payment_method, subtotal_cents, tax_cents, total_cents, token, created_at, updated_at)
         VALUES (${org}, ${n}, 'confirmed', 'Priya', '57123456', 'pickup', 'cod', 100000, 0, 100000, '${String(n).repeat(48).slice(0, 48)}', NOW(), NOW())`);
    const id = Number(sql(`SELECT id FROM shoplokal_orders WHERE organization_id = ${org} AND number = ${n}`));
    sql(`INSERT INTO shoplokal_order_lines (order_id, name, unit_price_cents, tax_code, quantity, line_total_cents, line_tax_cents) VALUES (${id}, 'Vase', 100000, 'TC03', 1, 100000, 0)`);
    return id;
  };
  app(`\\App\\Suite\\Tenant::updateProfile(${org}, ["name" => "Boutique Test", "legal_name" => "Boutique Test Ltd", "brn" => "C1", "address" => "Port-Louis", "vat_number" => "", "email" => "", "phone" => "", "document_language" => "fr"]);`);
  const o1 = order(1);
  const inv = Number(app(`[$id, $e] = \\App\\ShopLokal\\Orders::createInvoice(${org}, ${user}, ${o1}); echo $e ?? $id;`));
  r = app(`echo \\App\\ShopLokal\\Orders::setStatus(${org}, ${o1}, "cancelled") ?? "ok";`);
  assert(r === 'ok' && sql(`SELECT COUNT(*) FROM facturo_documents WHERE id = ${inv}`) === '0' && sql(`SELECT facturo_invoice_id IS NULL FROM shoplokal_orders WHERE id = ${o1}`) === '1', 'draft deleted ' + r);
  const o2 = order(2);
  const inv2 = Number(app(`[$id, $e] = \\App\\ShopLokal\\Orders::createInvoice(${org}, ${user}, ${o2}); echo $e ?? $id;`));
  r = app(`echo \\App\\Facturo\\Documents::issue(${org}, ${inv2}) ?? "ok";`);
  assert(r === 'ok', 'issued ' + r);
  r = app(`echo \\App\\ShopLokal\\Orders::setStatus(${org}, ${o2}, "cancelled") ?? "ok";`);
  assert(r.includes('faites d\'abord un avoir') && sql(`SELECT status FROM shoplokal_orders WHERE id = ${o2}`) === 'confirmed', 'issued invoice blocks ' + r);
  step('cancelling a ShopLokal order: its draft invoice is deleted with it; with an issued invoice it is refused until a credit note covers it');

  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
