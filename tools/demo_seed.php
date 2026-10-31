<?php
/**
 * Demo company for sales demos and pilots: "Le Lagon Bleu", a small resort
 * with spa and shop in Trou-aux-Biches, with three months of activity in
 * every app (dated relative to today), so BizPilot and each app show real
 * figures. Data goes through the apps' own classes (numbering, VAT, ledger,
 * stock) and is then back-dated.
 *
 *   php tools/demo_seed.php --yes [--password=…] [--email=demo@lagonbleu.example] [--reset]
 *
 * --reset deletes the demo company and its accounts first (only those: the
 * company named below whose owner has the demo e-mail, and the @lagonbleu.example
 * accounts). Without --password a random password is generated and printed.
 * No e-mail is sent while seeding. For demo / staging databases, never production.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}
$_SERVER['HTTP_USER_AGENT'] = 'cli';
require __DIR__ . '/../src/bootstrap.php';

use App\Bookora\Bookings as BkBookings;
use App\Bookora\Settings as BkSettings;
use App\Bookora\Text as BkText;
use App\Bookora\Units as BkUnits;
use App\ClientBloom\Customers;
use App\ClientBloom\Ledger;
use App\Database;
use App\Facturo\Clients;
use App\Facturo\Documents;
use App\FlowDesk\Settings as FdSettings;
use App\FlowDesk\Text as FdText;
use App\FlowDesk\Tickets;
use App\Formelio\Forms;
use App\Formelio\Responses;
use App\Formelio\Text as FmText;
use App\RendezVous\Booking;
use App\RendezVous\Services;
use App\RendezVous\Settings as RvSettings;
use App\RendezVous\Staff;
use App\ShopLokal\Orders;
use App\ShopLokal\Products;
use App\ShopLokal\Settings as SlSettings;
use App\ShopLokal\Text as SlText;
use App\StaffZen\Leaves;
use App\StaffZen\Settings as SzSettings;
use App\Suite\Catalog;
use App\TeamNest\Projects;
use App\TeamNest\Tasks;

const DEMO_NAME   = 'Le Lagon Bleu';
const DEMO_DOMAIN = 'lagonbleu.example';

$opts = getopt('', ['yes', 'reset', 'password:', 'email:', 'force-production']);
if (($GLOBALS['config']['app']['env'] ?? 'production') === 'production' && !isset($opts['force-production'])) {
    fwrite(STDERR, "app.env is 'production': the demo company belongs on a separate demo instance.\n"
        . "Set app.env to 'demo' in config/config.local.php there, or add --force-production if you really mean it.\n");
    exit(1);
}
if (!isset($opts['yes'])) {
    fwrite(STDERR, "Creates a demo company with sample data. For demo / staging databases only.\nRun again with --yes to proceed.\n");
    exit(1);
}
$email    = (string) ($opts['email'] ?? 'demo@' . DEMO_DOMAIN);
$password = (string) ($opts['password'] ?? rtrim(strtr(base64_encode(random_bytes(12)), '+/', 'Ab'), '='));
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
    fwrite(STDERR, "Invalid --email or --password (8 characters minimum).\n");
    exit(1);
}

$GLOBALS['config']['mail']['host'] = '';   // seeding must not e-mail anyone
mt_srand(2026);
$pdo   = Database::connection();
$now   = Booking::now();
$today = $now->format('Y-m-d');
$day   = static fn (int $offset): string => $now->modify(($offset >= 0 ? '+' : '') . $offset . ' days')->format('Y-m-d');
$at    = static fn (string $date, string $time = '10:00'): string => $date . ' ' . $time . ':00';
$pick  = static fn (array $list) => $list[mt_rand(0, count($list) - 1)];
$warn  = static function (?string $error, string $what): void {
    if ($error !== null) {
        fwrite(STDERR, '  ! ' . $what . ' : ' . $error . "\n");
    }
};

/* ---------------------------------------------------------------- reset */

$existing = $pdo->prepare(
    'SELECT o.id FROM organizations o JOIN organization_users ou ON ou.organization_id = o.id AND ou.role = \'owner\'
     JOIN users u ON u.id = ou.user_id WHERE o.name = :n AND u.email = :e'
);
$existing->execute([':n' => DEMO_NAME, ':e' => $email]);
$oldOrg = $existing->fetchColumn();
if ($oldOrg !== false) {
    if (!isset($opts['reset'])) {
        fwrite(STDERR, "The demo company already exists. Use --reset to recreate it.\n");
        exit(1);
    }
    foreach (['facturo_documents', 'rendezvous_appointments', 'staffzen_requests', 'bookora_bookings'] as $table) {
        $pdo->prepare("DELETE FROM $table WHERE organization_id = :o")->execute([':o' => $oldOrg]);
    }
    $pdo->prepare('DELETE FROM organizations WHERE id = :o')->execute([':o' => $oldOrg]);
    $pdo->prepare('DELETE FROM users WHERE email LIKE :d OR email = :e')->execute([':d' => '%@' . DEMO_DOMAIN, ':e' => $email]);
    echo "Previous demo company deleted.\n";
}
$taken = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = :e');
$taken->execute([':e' => $email]);
if ((int) $taken->fetchColumn() > 0) {
    fwrite(STDERR, "An account already uses $email.\n");
    exit(1);
}

/* ---------------------------------------------------------------- company and team */

$pdo->prepare(
    'INSERT INTO organizations (name, legal_name, address, brn, vat_number, email, phone, document_language, onboarded_at)
     VALUES (:n, \'Lagon Bleu Ltd\', \'Royal Road, Trou-aux-Biches\', \'C18099999\', \'VAT27999999\', :e, \'+230 265 0000\', \'fr\', NOW())'
)->execute([':n' => DEMO_NAME, ':e' => 'contact@' . DEMO_DOMAIN]);
$orgId = (int) $pdo->lastInsertId();
$org   = ['id' => $orgId, 'name' => DEMO_NAME, 'role' => 'owner'];

$addUser = static function (string $mail, string $name, string $role, string $pw) use ($pdo, $orgId, $at, $day): int {
    $pdo->prepare('INSERT INTO users (email, password_hash, name, role, is_active, created_at, updated_at) VALUES (:e, :h, :n, \'user\', 1, :at, :at2)')
        ->execute([':e' => $mail, ':h' => password_hash($pw, PASSWORD_DEFAULT), ':n' => $name, ':at' => $at($day(-120)), ':at2' => $at($day(-120))]);
    $id = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES (:o, :u, :r, :at)')
        ->execute([':o' => $orgId, ':u' => $id, ':r' => $role, ':at' => $at($day(-120))]);
    return $id;
};
$owner  = $addUser($email, 'Marie Laval', 'owner', $password);
// Colleagues cannot log in (random passwords): they exist so assignments, leave and the team page look real.
$priya  = $addUser('priya@' . DEMO_DOMAIN, 'Priya Ramdin', 'admin', bin2hex(random_bytes(16)));
$kevin  = $addUser('kevin@' . DEMO_DOMAIN, 'Kevin Li', 'member', bin2hex(random_bytes(16)));
$anjali = $addUser('anjali@' . DEMO_DOMAIN, 'Anjali Ramsamy', 'member', bin2hex(random_bytes(16)));
$jm     = $addUser('jeanmarc@' . DEMO_DOMAIN, 'Jean-Marc Félicité', 'member', bin2hex(random_bytes(16)));
$team   = [$owner, $priya, $kevin, $anjali, $jm];

foreach (array_keys(Catalog::all()) as $slug) {
    $pdo->prepare('INSERT INTO organization_modules (organization_id, module_slug, status, activated_at, trial_ends_at) VALUES (:o, :s, \'active\', :at, NULL)')
        ->execute([':o' => $orgId, ':s' => $slug, ':at' => $at($day(-120))]);
}
echo "Company, team (5) and the 10 apps.\n";

$people = ['Sophie Martin', 'Rajesh Doobur', 'Nadia Aumeer', 'Jean Li', 'Aurélie Bégué', 'Vikash Ramgoolam', 'Laura Chung', 'Didier Labonne',
    'Fatima Joomun', 'Thomas Weber', 'Emma Fischer', 'Kavita Seeruttun', 'Olivier Rivet', 'Meera Bhoyroo', 'Yannick Ah-Kee', 'Claire Dupont',
    'Ashvin Gopaul', 'Nathalie Tse', 'Sanjay Bissoon', 'Julie Moreau', 'Kenny Ng', 'Isabelle Lagesse', 'Ravi Seebaluck', 'Anna Schmidt',
    'Patrick Ah-Yan', 'Shreya Ramkissoon', 'Marc Lebon', 'Lucie Fanchon', 'Imran Khodabux', 'Chloé Mamet', 'David Wong', 'Priyanka Jhurry',
    'Hans Müller', 'Sarah Koenig', 'Ludovic Hardy', 'Neha Dhunnoo', 'Bertrand Ip', 'Cindy Auguste', 'Arnaud Pierre', 'Leena Gungah'];
$phoneOf = static fn (int $i): string => (string) (57100000 + $i * 137);
$mailOf  = static fn (string $name): string => strtolower(preg_replace('/[^a-z]+/i', '.', iconv('UTF-8', 'ASCII//TRANSLIT', $name)) ?: 'client') . '@example.com';

/* ---------------------------------------------------------------- Facturo */

$clientIds = [];
foreach ([['Ocean Bank Ltd', 'events@oceanbank.example', 'Ebène Cybercity', 'C07012345', 'VAT20111111'],
          ['Tropical Tours DMC', 'ops@tropicaltours.example', 'Grand Baie', 'C10023456', 'VAT20222222'],
          ['Île Maurice Événements', 'contact@ime.example', 'Port-Louis', 'C11034567', ''],
          ['Société Sucrière du Nord', 'admin@ssn.example', 'Goodlands', 'C05045678', 'VAT20333333'],
          ['Air Austral Crew Services', 'crew@airaustral.example', 'Plaine Magnien', 'C12056789', 'VAT20444444'],
          ['Cabinet Lagesse & Associés', 'secretariat@lagesse.example', 'Curepipe', 'C09067890', 'VAT20555555'],
          ['Wedding Dreams Mauritius', 'hello@weddingdreams.example', 'Flic-en-Flac', 'C14078901', ''],
          ['École Française du Nord', 'direction@efn.example', 'Pereybère', 'C08089012', '']] as [$n, $e, $a, $brn, $vat]) {
    [$fields, $err] = Clients::validate(['name' => $n, 'email' => $e, 'phone' => '', 'address' => $a, 'brn' => $brn, 'vat_number' => $vat]);
    $warn($err, 'client ' . $n);
    if ($err === null) {
        $clientIds[] = (int) Clients::save($orgId, 0, $fields);
    }
}
$catalogue = [['Location salle de séminaire (journée)', 1, 2, '18500.00'], ['Pause-café et déjeuner (couvert)', 15, 60, '950.00'],
              ['Hébergement groupe (chambre double, nuit)', 4, 20, '4200.00'], ['Dîner de gala (couvert)', 20, 80, '1650.00'],
              ['Excursion catamaran (personne)', 6, 30, '2400.00'], ['Massage relaxant 60 min (bon cadeau)', 2, 12, '2500.00']];
$issueOne = static function (string $type, string $date, int $clientId, array $lines, string $notes) use ($orgId, $owner, $warn, $pdo, $at): ?int {
    $due = (new DateTimeImmutable($date))->modify('+30 days')->format('Y-m-d');   // invoice: payment due; quote: valid until
    [$draft, $err] = Documents::validate($orgId, ['type' => $type, 'client_id' => $clientId, 'issue_date' => $date, 'due_date' => $due,
        'currency' => 'MUR', 'notes' => $notes, 'lines' => $lines]);
    if ($err !== null) {
        $warn($err, $type . ' ' . $date);
        return null;
    }
    [$id, $err] = Documents::saveDraft($orgId, $owner, 0, $draft);
    if ($err !== null || ($err = Documents::issue($orgId, (int) $id)) !== null) {
        $warn($err, $type . ' ' . $date);
        return null;
    }
    $pdo->prepare('UPDATE facturo_documents SET issued_at = :a, created_at = :a2 WHERE id = :id')->execute([':a' => $at($date, '11:00'), ':a2' => $at($date, '09:30'), ':id' => $id]);
    return (int) $id;
};
$invoices = 0;
for ($d = -95; $d <= -1; $d += mt_rand(3, 5)) {
    $date  = $day($d);
    $lines = [];
    foreach ((array) array_rand($catalogue, mt_rand(1, 3)) as $k) {
        [$desc, $min, $max, $price] = $catalogue[$k];
        $lines[] = ['description' => $desc, 'quantity' => (string) mt_rand($min, $max), 'unit_price' => $price, 'tax_code' => 'TC01', 'nature' => 'SERVICES'];
    }
    $id = $issueOne('invoice', $date, $pick($clientIds), $lines, 'Merci de votre confiance.');
    if ($id === null) {
        continue;
    }
    $invoices++;
    // Older invoices are mostly paid; a few stay overdue so BizPilot has something to chase.
    $paidAfter = mt_rand(5, 28);
    if ($d + $paidAfter < -1 && mt_rand(1, 100) <= 85) {
        $warn(Documents::setStatus($orgId, $id, 'paid'), 'paid');
        $pdo->prepare('UPDATE facturo_documents SET paid_at = :p WHERE id = :id')->execute([':p' => $at($day($d + $paidAfter), '15:00'), ':id' => $id]);
    }
}
foreach ([[-24, 'Séminaire de fin d\'année — 40 personnes'], [-6, 'Mariage — 60 invités, 2 nuits'], [-2, 'Incentive — 25 personnes']] as [$d, $note]) {
    $issueOne('quote', $day($d), $pick($clientIds), [
        ['description' => 'Location salle de séminaire (journée)', 'quantity' => '2', 'unit_price' => '18500.00', 'tax_code' => 'TC01', 'nature' => 'SERVICES'],
        ['description' => 'Hébergement groupe (chambre double, nuit)', 'quantity' => (string) mt_rand(12, 30), 'unit_price' => '4200.00', 'tax_code' => 'TC01', 'nature' => 'SERVICES'],
        ['description' => 'Dîner de gala (couvert)', 'quantity' => (string) mt_rand(25, 60), 'unit_price' => '1650.00', 'tax_code' => 'TC01', 'nature' => 'SERVICES'],
    ], $note);
}
echo "Facturo: " . count($clientIds) . " clients, $invoices invoices, 3 quotes.\n";

/* ---------------------------------------------------------------- ClientBloom */

$customers = [];
foreach ($people as $i => $name) {
    [$f, $err] = Customers::validate(['name' => $name, 'phone' => $phoneOf($i), 'email' => $i % 3 === 0 ? $mailOf($name) : '',
        'birthday' => '', 'tags' => $pick(['', '', 'spa', 'boutique', 'fidèle', 'resident']), 'marketing_consent' => $i % 2 === 0]);
    if ($err !== null) {
        $warn($err, 'customer ' . $name);
        continue;
    }
    [$cid, $err] = Customers::save($orgId, $owner, 0, $f);
    $warn($err, 'customer ' . $name);
    if ($err === null) {
        $customers[$i] = (int) $cid;
    }
}
$purchases = 0;
foreach ($customers as $i => $cid) {
    $visits = mt_rand(1, 6);
    $first  = mt_rand(-90, -10);
    for ($v = 0; $v < $visits; $v++) {
        $d = min(-1, $first + $v * mt_rand(6, 18));
        $c = Customers::find($orgId, $cid);
        $redeem = (int) $c['balance_cents'] >= 10000 && mt_rand(0, 2) === 0 ? 10000 : 0;
        [, $err] = Ledger::checkout($orgId, $owner, $cid, mt_rand(8, 60) * 2500, $redeem, 'Ticket ' . mt_rand(1000, 9999));
        if ($err !== null) {
            $warn($err, 'checkout');
            continue;
        }
        $purchases++;
        $pdo->prepare('UPDATE clientbloom_transactions SET created_at = :a WHERE customer_id = :c AND created_at > :d')
            ->execute([':a' => $at($day($d), sprintf('%02d:%02d', mt_rand(9, 18), mt_rand(0, 59))), ':c' => $cid, ':d' => $at($day(-1), '23:59')]);
    }
    $pdo->prepare(
        'UPDATE clientbloom_customers c SET created_at = (SELECT MIN(created_at) FROM clientbloom_transactions t WHERE t.customer_id = c.id),
                last_visit_at = (SELECT MAX(created_at) FROM clientbloom_transactions t WHERE t.customer_id = c.id AND t.type = \'purchase\'),
                last_activity_at = (SELECT MAX(created_at) FROM clientbloom_transactions t WHERE t.customer_id = c.id) WHERE c.id = :c'
    )->execute([':c' => $cid]);
}
echo "ClientBloom: " . count($customers) . " customers, $purchases purchases.\n";

/* ---------------------------------------------------------------- Formelio */

$formId = Forms::create($orgId, 'satisfaction');
$warn(Forms::setStatus($orgId, $formId, 'open'), 'form open');
$form    = Forms::find($orgId, $formId);
$ft      = FmText::for('fr');
$quotes  = ['Massage exceptionnel, merci Nadia !', 'Très bon accueil, bungalow impeccable.', 'Le petit-déjeuner pourrait être plus varié.',
            'Vue magnifique, on reviendra.', 'Un peu d\'attente au spa.', '', '', '', 'Personnel adorable.', 'Wi-Fi faible dans le bungalow 3.'];
$offsets = array_map(static fn (): int => mt_rand(-90, -1), range(1, 46));
sort($offsets);   // oldest first: ids follow the dates, as in real life
foreach ($offsets as $r => $d) {
    [$rid, $err] = Responses::submit($form, ['f1' => (string) $pick([5, 5, 5, 4, 4, 4, 3, 5, 4, 2]), 'f2' => (string) $pick([10, 10, 9, 9, 9, 8, 8, 7, 10, 6, 9, 5]),
        'f3' => $pick($quotes)], 'demo-' . $r, null, $ft);
    $warn($err, 'response');
    if ($err === null) {
        $pdo->prepare('UPDATE formelio_responses SET created_at = :a, created_ip = NULL WHERE id = :id')->execute([':a' => $at($day($d), sprintf('%02d:%02d', mt_rand(8, 21), mt_rand(0, 59))), ':id' => $rid]);
    }
}
echo "Formelio: satisfaction survey, 46 responses.\n";

/* ---------------------------------------------------------------- RendezVous */

$services = [];
foreach ([['Massage relaxant 60 min', 60, '2500'], ['Massage aux pierres chaudes 90 min', 90, '3800'], ['Soin du visage', 60, '2200'], ['Manucure', 45, '1200']] as [$n, $min, $p]) {
    [$sid, $err] = Services::save($orgId, 0, ['name' => $n, 'duration_min' => $min, 'price' => $p, 'active' => true]);
    $warn($err, 'service');
    $services[] = ['id' => (int) $sid, 'min' => $min];
}
$staff = [];
foreach (['Nadia', 'Leela'] as $n) {
    $hours = [];
    foreach ([1, 2, 3, 4, 5, 6] as $wd) {
        $hours[$wd] = '09:00-13:00, 14:00-18:00';
    }
    [$stid, $err] = Staff::save($orgId, 0, $n, true, $hours);
    $warn($err, 'staff');
    $staff[] = (int) $stid;
}
$warn(RvSettings::save($orgId, ['slot_step_min' => 15, 'min_notice_min' => 120, 'max_days_ahead' => 60, 'cancel_notice_min' => 1440,
    'notify_email' => 'spa@' . DEMO_DOMAIN, 'intro' => 'Spa du Lagon Bleu : massages et soins face à la mer.', 'survey_form_id' => $formId]), 'rendezvous settings');
$appts = 0;
for ($d = -75; $d <= 14; $d++) {
    $date = $day($d);
    if ((int) (new DateTimeImmutable($date))->format('N') === 7) {
        continue;
    }
    foreach ($staff as $si => $stid) {
        foreach (['09:30', '11:00', '14:30', '16:00'] as $slot) {
            if (mt_rand(1, 100) > ($d >= 0 ? 45 : 70)) {
                continue;
            }
            $svc   = $services[mt_rand(0, count($services) - 1)];
            $start = new DateTimeImmutable($date . ' ' . $slot);
            $i     = mt_rand(0, count($people) - 1);
            $status = $d < 0 ? (mt_rand(1, 100) <= 6 ? 'no_show' : (mt_rand(1, 100) <= 8 ? 'cancelled' : 'done')) : ($d === 0 && $slot < $now->format('H:i') ? 'done' : 'booked');
            $pdo->prepare(
                'INSERT INTO rendezvous_appointments (organization_id, staff_id, service_id, starts_at, ends_at, status, customer_name, phone, email, source, token, cancelled_at, created_at)
                 VALUES (:o, :st, :sv, :s, :e, :status, :n, :p, :m, :src, :t, :c, :at)'
            )->execute([':o' => $orgId, ':st' => $stid, ':sv' => $svc['id'], ':s' => $start->format('Y-m-d H:i:s'),
                ':e' => $start->modify('+' . $svc['min'] . ' minutes')->format('Y-m-d H:i:s'), ':status' => $status, ':n' => $people[$i],
                ':p' => $phoneOf($i), ':m' => $i % 3 === 0 ? $mailOf($people[$i]) : null, ':src' => mt_rand(0, 2) === 0 ? 'staff' : 'online',
                ':t' => bin2hex(random_bytes(24)), ':c' => $status === 'cancelled' ? $at($day($d - 1), '18:00') : null,
                ':at' => $at($day(min($d, -1) - mt_rand(1, 10)), '20:00')]);
            $appts++;
        }
    }
}
echo "RendezVous: 4 treatments, 2 therapists, $appts appointments.\n";

/* ---------------------------------------------------------------- FlowDesk */

$warn(FdSettings::save($orgId, true, 'contact@' . DEMO_DOMAIN, 'Une question sur votre séjour ? Écrivez-nous, réponse sous 24 h.'), 'flowdesk settings');
$fdt = FdText::for('fr');
$tickets = [['Facture pour mon séjour', 'Bonjour, pourriez-vous m\'envoyer la facture de mon séjour de la semaine dernière ?'],
            ['Navette depuis l\'aéroport', 'Proposez-vous une navette depuis l\'aéroport le 12 ? Nous sommes 3.'],
            ['Objet oublié', 'J\'ai oublié un chargeur dans le bungalow 2.'], ['Annulation massage', 'Je dois annuler mon massage de demain, désolée.'],
            ['Bon cadeau', 'Je souhaite offrir un bon cadeau spa à ma mère.'], ['Réservation de groupe', 'Avez-vous de la place pour 12 personnes en décembre ?'],
            ['Allergie alimentaire', 'Mon fils est allergique aux arachides, le petit-déjeuner peut-il être adapté ?'], ['Remboursement acompte', 'Mon vol est annulé, puis-je récupérer l\'acompte ?'],
            ['Wi-Fi', 'Le Wi-Fi ne fonctionne pas dans le bungalow 3.'], ['Commande boutique non reçue', 'Ma commande n° 4 n\'est pas arrivée.'],
            ['Accès PMR', 'Le spa est-il accessible en fauteuil roulant ?'], ['Horaires du restaurant', 'Le restaurant est-il ouvert le lundi soir ?'],
            ['Climatisation bruyante', 'La climatisation de la villa fait beaucoup de bruit la nuit.'], ['Devis séminaire', 'Pouvez-vous me rappeler pour le devis du séminaire ?']];
foreach ($tickets as $n => [$subject, $message]) {
    $i = mt_rand(0, count($people) - 1);
    [$tk, $err] = Tickets::create($orgId, ['name' => $people[$i], 'email' => $mailOf($people[$i]), 'phone' => '', 'subject' => $subject, 'message' => $message],
        'web', null, 'demo-fd-' . $n, $fdt);
    if ($err !== null || $tk === null) {
        $warn($err, 'ticket');
        continue;
    }
    $tid     = (int) $tk['id'];
    $opened  = $now->modify('-' . (60 - $n * 4) . ' days')->setTime(mt_rand(8, 20), mt_rand(0, 59));
    $recent  = $n >= count($tickets) - 3;
    $pdo->prepare('UPDATE flowdesk_tickets SET created_at = :a, updated_at = :a2, created_ip = NULL WHERE id = :id')->execute([':a' => $opened->format('Y-m-d H:i:s'), ':a2' => $opened->format('Y-m-d H:i:s'), ':id' => $tid]);
    $pdo->prepare('UPDATE flowdesk_messages SET created_at = :a WHERE ticket_id = :id')->execute([':a' => $opened->format('Y-m-d H:i:s'), ':id' => $tid]);
    if ($n === count($tickets) - 1) {
        $warn(Tickets::update($orgId, $tid, null, 'high', $priya), 'ticket priority');   // unanswered, high: shows in BizPilot
        continue;
    }
    $who = $pick([$owner, $priya, $kevin]);
    $warn(Tickets::update($orgId, $tid, null, null, $who), 'ticket assign');
    $warn(Tickets::answer($orgId, $who, $tid, 'reply', 'Bonjour, merci pour votre message. C\'est noté, nous revenons vers vous rapidement.', $recent ? 'pending' : 'resolved'), 'ticket answer');
    $replied = $opened->modify('+' . mt_rand(1, 9) . ' hours');
    $pdo->prepare('UPDATE flowdesk_messages SET created_at = :a WHERE ticket_id = :id AND kind = \'reply\'')->execute([':a' => $replied->format('Y-m-d H:i:s'), ':id' => $tid]);
    $pdo->prepare('UPDATE flowdesk_tickets SET first_response_at = :a, updated_at = :a2, resolved_at = IF(status = \'resolved\', :a3, NULL) WHERE id = :id')
        ->execute([':a' => $replied->format('Y-m-d H:i:s'), ':a2' => $replied->format('Y-m-d H:i:s'), ':a3' => $replied->modify('+1 day')->format('Y-m-d H:i:s'), ':id' => $tid]);
}
echo "FlowDesk: " . count($tickets) . " tickets.\n";

/* ---------------------------------------------------------------- TeamNest */

[$p1, $err] = Projects::save($orgId, 0, ['name' => 'Rénovation des bungalows', 'description' => 'Peinture, salles de bain et terrasses avant la haute saison.', 'client_id' => 0, 'hourly_rate' => '']);
$warn($err, 'project');
[$p2, $err] = Projects::save($orgId, 0, ['name' => 'Séminaire Ocean Bank — décembre', 'description' => '40 participants, 2 jours, dîner de gala.', 'client_id' => $clientIds[0] ?? 0, 'hourly_rate' => '1500']);
$warn($err, 'project');
$taskDefs = [[$p1, 'Peinture bungalows 1 et 2', 'done', $jm, -20], [$p1, 'Changer les robinets bungalow 3', 'doing', $jm, -3], [$p1, 'Devis carreleur terrasses', 'todo', $priya, 5],
             [$p1, 'Commander les nouveaux transats', 'todo', $kevin, -2], [$p1, 'Contrôle climatisation villa', 'todo', $jm, 10],
             [$p2, 'Valider le menu du dîner de gala', 'done', $priya, -15], [$p2, 'Réserver le catamaran', 'doing', $kevin, 4],
             [$p2, 'Badges et signalétique', 'todo', $anjali, 12], [$p2, 'Liste des chambres', 'doing', $priya, 2], [$p2, 'Envoyer le programme au client', 'done', $owner, -8]];
foreach ($taskDefs as [$pid, $title, $status, $who, $due]) {
    [$tid, $err] = Tasks::save($orgId, $owner, 0, ['project_id' => $pid, 'title' => $title, 'description' => '', 'status' => $status,
        'priority' => $due < 0 && $status !== 'done' ? 'high' : 'normal', 'assignee_id' => $who, 'due_date' => $day($due)]);
    $warn($err, 'task');
    if ($err === null && $status !== 'todo') {
        foreach ([mt_rand(-30, -10), mt_rand(-9, -1)] as $d) {
            $warn(Tasks::addTime($orgId, $who, (int) $tid, (string) mt_rand(1, 4) . 'h' . $pick(['', '30']), $day($d), ''), 'time');
        }
    }
}
echo "TeamNest: 2 projects, " . count($taskDefs) . " tasks with time.\n";

/* ---------------------------------------------------------------- ShopLokal */

$warn(SlSettings::save($orgId, ['shop_open' => true, 'intro' => 'Artisanat et produits de l\'île, retrait à la réception ou livraison sur l\'île.',
    'pay_cod' => true, 'pay_bank' => true, 'bank_details' => 'MCB · Lagon Bleu Ltd · 000444555666', 'pay_juice' => true, 'juice_number' => '5 265 0000',
    'delivery_enabled' => true, 'delivery_fee' => '150', 'free_delivery_from' => '3000', 'pickup_enabled' => true,
    'pickup_address' => 'Réception du Lagon Bleu, Trou-aux-Biches', 'notify_email' => 'boutique@' . DEMO_DOMAIN]), 'shop settings');
$products = [];
foreach ([['Panier en vacoas', '1200', '40'], ['Savon artisanal vanille', '180', '40'], ['Thé vanille Bois Chéri (100 g)', '145', '60'],
          ['Paréo imprimé dodo', '850', '30'], ['Sel de mer aux épices', '220', '25'], ['Huile de massage coco', '650', '3']] as [$n, $p, $s]) {
    [$pid, $err] = Products::save($orgId, 0, ['name' => $n, 'description' => '', 'price' => $p, 'tax_code' => 'TC01', 'stock' => $s, 'active' => true, 'image' => '']);
    $warn($err, 'product');
    $products[] = (int) $pid;
}
$slt = SlText::for('fr');
$orders = 0;
for ($o = 0; $o < 22; $o++) {
    $i    = mt_rand(0, count($people) - 1);
    $cart = [];
    // The last product keeps its 3 units: it shows the low-stock alert.
    foreach ((array) array_rand(array_slice($products, 0, -1), mt_rand(1, 3)) as $k) {
        $cart[] = ['product_id' => $products[$k], 'quantity' => mt_rand(1, 3)];
    }
    $how = mt_rand(0, 2) === 0 ? 'delivery' : 'pickup';
    [$order, $err] = Orders::place($orgId, $cart, ['name' => $people[$i], 'phone' => $phoneOf($i), 'email' => $i % 3 === 0 ? $mailOf($people[$i]) : '',
        'address' => $how === 'delivery' ? 'Grand Baie' : '', 'delivery_method' => $how, 'payment_method' => $pick(['cod', 'bank', 'juice']), 'note' => ''], 'demo-sl-' . $o, $slt);
    if ($err !== null) {
        $warn($err, 'order');
        continue;
    }
    $orders++;
    $oid = (int) $order['id'];
    $d   = -60 + $o * 3;
    if ($d < -4) {
        foreach (['confirmed', 'shipped', 'completed'] as $st) {
            $warn(Orders::setStatus($orgId, $oid, $st), 'order status');
        }
        $warn(Orders::setPaid($orgId, $oid, true), 'order paid');
    } elseif ($d < -1) {
        $warn(Orders::setStatus($orgId, $oid, 'confirmed'), 'order status');
    }
    $pdo->prepare('UPDATE shoplokal_orders SET created_at = :a, updated_at = :a2, created_ip = NULL, paid_at = IF(paid_at IS NULL, NULL, :p) WHERE id = :id')
        ->execute([':a' => $at($day(min($d, 0)), '12:00'), ':a2' => $at($day(min($d + 2, 0)), '12:00'), ':p' => $at($day(min($d + 2, 0)), '16:00'), ':id' => $oid]);
}
echo "ShopLokal: 6 products, $orders orders.\n";

/* ---------------------------------------------------------------- StaffZen */

SzSettings::get($orgId);
$fixed = ['01-01' => 'Nouvel An', '01-02' => 'Lendemain du Nouvel An', '02-01' => 'Abolition de l\'esclavage', '03-12' => 'Fête de l\'Indépendance',
          '05-01' => 'Fête du Travail', '08-15' => 'Assomption', '11-01' => 'Toussaint', '11-02' => 'Arrivée des travailleurs engagés', '12-25' => 'Noël'];
foreach ([(int) $now->format('Y'), (int) $now->format('Y') + 1] as $y) {
    foreach ($fixed as $md => $n) {
        $warn(SzSettings::addHoliday($orgId, $y . '-' . $md, $n), 'holiday');
    }
}
$types = [];
foreach (SzSettings::types($orgId) as $t) {
    $types[$t['name']] = $t['id'];
}
// Leave starts and ends on working days (Monday–Friday), whatever today is.
$workday = static function (int $offset) use ($day): string {
    $d = new DateTimeImmutable($day($offset));
    while ((int) $d->format('N') >= 6) {
        $d = $d->modify('+1 day');
    }
    return $d->format('Y-m-d');
};
$leave = static function (int $userId, string $type, int $from, int $to, bool $record, string $half = '') use ($org, $owner, $types, $workday, $warn): void {
    $start = $workday($from);
    $end   = max($start, $workday($to));
    [, $err] = Leaves::request($org, $record ? $owner : $userId, ['user_id' => $userId, 'type_id' => $types[$type], 'start' => $start, 'end' => $half !== '' ? $start : $end,
        'half' => $half, 'note' => ''], $record);
    $warn($err, 'leave');
};
// Past leave recorded by the owner; one person away today; two requests waiting for approval.
$leave($kevin, 'Congé annuel', -40, -36, true);
$leave($anjali, 'Congé maladie', -22, -22, true);
$leave($jm, 'Congé annuel', -12, -10, true);
$leave($priya, 'Congé annuel', -5, -5, true, 'pm');
$leave($anjali, 'Congé annuel', 0, 0, true);
$leave($kevin, 'Congé annuel', 18, 22, false);
$leave($jm, 'Congé annuel', 30, 34, false);
echo "StaffZen: leave types, holidays, absences and 2 requests to approve.\n";

/* ---------------------------------------------------------------- Bookora */

$warn(BkSettings::save($orgId, ['booking_open' => true, 'intro' => 'Bungalows pieds dans l\'eau et villa familiale à Trou-aux-Biches.',
    'checkin_time' => '14:00', 'checkout_time' => '11:00', 'deposit_percent' => '30', 'hold_hours' => '72',
    'bank_details' => 'MCB · Lagon Bleu Ltd · 000444555666', 'juice_number' => '5 265 0000', 'notify_email' => 'resa@' . DEMO_DOMAIN]), 'bookora settings');
$units = [];
foreach ([['Bungalow Corail', '3800', 2, 2], ['Bungalow Filao', '3800', 2, 2], ['Bungalow Badamier', '4500', 3, 2], ['Villa Lagon', '11000', 6, 3]] as [$n, $p, $cap, $min]) {
    [$uid, $err] = BkUnits::save($orgId, 0, ['name' => $n, 'description' => $cap > 3 ? '3 chambres, piscine, cuisine équipée, accès plage.' : 'Lit double, terrasse face au lagon, petit-déjeuner inclus.',
        'price' => $p, 'tax_code' => 'TC01', 'capacity' => (string) $cap, 'min_nights' => (string) $min, 'active' => true, 'image' => '']);
    $warn($err, 'unit');
    $units[] = ['id' => (int) $uid, 'cap' => $cap];
    $year = (int) $now->format('Y');
    $warn(BkUnits::addSeason($orgId, (int) $uid, 'Fêtes', $year . '-12-20', ($year + 1) . '-01-05', (string) round((int) $p * 1.3)), 'season');
}
$bkt  = BkText::for('fr');
$stays = 0;
$open  = 0;   // online requests left to confirm
foreach ($units as $u) {
    for ($d = -58; $d < 45;) {
        $len = mt_rand(2, 7);
        if (mt_rand(1, 100) <= 30) {             // free nights between stays
            $d += mt_rand(1, 4);
            continue;
        }
        $i = mt_rand(0, count($people) - 1);
        $owned = $d < 0 || mt_rand(0, 1) === 0;  // past stays typed by the team; some future ones come online
        [$b, $err] = BkBookings::place($orgId, ['unit_id' => $u['id'], 'check_in' => $day($d), 'check_out' => $day($d + $len), 'guests' => mt_rand(1, $u['cap']),
            'name' => $people[$i], 'phone' => $phoneOf($i), 'email' => $mailOf($people[$i]), 'note' => ''], $bkt, $owned, $owned ? null : 'demo-bk-' . $stays);
        if ($err === null) {
            $stays++;
            $bid = (int) $b['id'];
            if (!$owned && ++$open > 3) {
                $warn(BkBookings::confirm($orgId, $bid), 'confirm');   // most online requests were confirmed after the deposit
                $owned = true;
            }
            if ($owned) {
                $warn(BkBookings::setPayment($orgId, $bid, 'deposit', true), 'deposit');
                if ($d + $len <= 0) {
                    $warn(BkBookings::setPayment($orgId, $bid, 'paid', true), 'paid');
                }
            }
            $pdo->prepare('UPDATE bookora_bookings SET created_at = :a, created_ip = NULL, source = IF(:on = 1, \'online\', source) WHERE id = :id')
                ->execute([':a' => $at($day(min($d, 0) - mt_rand(3, 20)), '20:00'), ':on' => mt_rand(0, 1), ':id' => $bid]);
        }
        $d += $len;
    }
}
echo "Bookora: 4 places, seasons, $stays stays.\n";

echo "\nDemo ready: " . DEMO_NAME . "\n  Login:    $email\n  Password: $password\n";
