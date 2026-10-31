// Supervision and backups: /health.php, tools/cron.sh, tools/ops.php watchdog alerts, tools/backup.sh and tools/restore.sh.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const B = 'http://127.0.0.1:8099', S = process.argv[2];
const DB = process.env.MIPS_E2E_DB || 'mips_platform';
const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
const sql = (q, db = DB) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', db, '-e', q]).toString().trim();
const step = (s) => console.log('✓', s);
const php = (...a) => spawnSync('php', [S + '/t/tools/ops.php', ...a], { encoding: 'utf8' });
const cron = (job, ...cmd) => spawnSync(S + '/t/tools/cron.sh', [job, ...cmd], { encoding: 'utf8' });
const decode = (h) => h.replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
const mails = () => fs.readdirSync(S + '/mail').sort().map(f => {
  const m = fs.readFileSync(S + '/mail/' + f, 'utf8');
  return { to: ((m.match(/^To: <(.*)>$/mi) || [])[1] || ''), subject: decode((m.match(/^Subject: (.*)$/mi) || [])[1] || ''),
           body: Buffer.from(((m.split(/\r?\n\r?\n/)[2] || '').split('--')[0]).replace(/\s+/g, ''), 'base64').toString('utf8') };
});
let seen = 0;
const fresh = () => { const all = mails(); const out = all.slice(seen); seen = all.length; return out; };
const health = async () => { const r = await fetch(B + '/health.php'); return { status: r.status, body: (await r.text()).trim(), cookie: r.headers.get('set-cookie') }; };
const JOBS = ['mra_retry', 'rendezvous_reminders', 'bookora_ical_sync', 'reminders', 'clientbloom_expire', 'purge_companies', 'backup', 'watchdog'];

(async () => {
  // 1. Health and job records
  let h = await health();
  assert(h.status === 503 && h.body === 'degraded' && !h.cookie, 'nothing recorded yet ' + JSON.stringify(h));
  assert(php('status').status === 1 && php('status').stdout.includes('n’a jamais tourné'), 'status lists missing jobs');
  for (const j of JOBS) assert(php('record', j, '0').status === 0, 'record ' + j);
  h = await health();
  assert(h.status === 200 && h.body === 'ok', 'all recorded ' + JSON.stringify(h));
  assert(php('status').stdout.trim() === 'OK', 'status OK');
  let r = cron('mra_retry', 'bash', '-c', 'echo transmis; exit 0');
  assert(r.status === 0 && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \[mra_retry\] transmis$/m.test(r.stdout), 'cron.sh prefixes output ' + r.stdout);
  step('/health.php: 503 « degraded » until every job has run, then 200 « ok », no session cookie; cron.sh dates and labels each output line');

  // 2. A failed job: one alert, no repeat, a reminder after 24 h, then « Résolu »
  r = cron('mra_retry', 'bash', '-c', 'echo "MRA injoignable" >&2; exit 3');
  assert(r.status === 3 && r.stdout.includes('[mra_retry] MRA injoignable'), 'job exit code kept ' + r.status);
  assert((await health()).status === 503, 'failed job degrades health');
  fresh();
  r = php('watchdog');
  let m = fresh();
  assert(r.status === 0 && m.length === 1 && m[0].to === 'ops@mips.mu' && m[0].subject === '[my.mips.mu] 1 problème : mra_retry'
         && m[0].body.includes('Transmission des factures à la MRA') && m[0].body.includes('a échoué, code 3'), 'alert ' + JSON.stringify(m) + r.stdout);
  php('watchdog');
  assert(fresh().length === 0, 'not twice');
  sql("UPDATE ops_alerts SET notified_at = NOW() - INTERVAL 25 HOUR");
  php('watchdog'); m = fresh();
  assert(m.length === 1 && m[0].body.includes('rappel : toujours en cours'), 'reminder after 24 h ' + JSON.stringify(m));
  cron('mra_retry', 'true');
  php('watchdog'); m = fresh();
  assert(m.length === 1 && m[0].subject === '[my.mips.mu] Résolu : mra_retry' && sql('SELECT COUNT(*) FROM ops_alerts') === '0', 'resolved ' + JSON.stringify(m));
  assert((await health()).status === 200, 'healthy again');
  php('watchdog');
  assert(fresh().length === 0, 'nothing more to say');
  step('a job fails (code 3): health 503, one e-mail to ops.alert_email naming it and its code, not repeated, a reminder after 24 h, « Résolu » once it succeeds again');

  // 3. A job that stopped running; the mail server down while alerting
  sql("UPDATE ops_jobs SET last_run_at = NOW() - INTERVAL 2 DAY, last_ok_at = NOW() - INTERVAL 2 DAY WHERE job = 'reminders'");
  assert((await health()).status === 503, 'stale job');
  execFileSync('pkill', ['-f', 'fake_smtp.py']);
  await new Promise(res => setTimeout(res, 500));
  r = php('watchdog');
  assert(r.status === 1 && r.stdout.includes('Alert e-mail failed'), 'smtp down ' + r.stdout);
  assert(sql("SELECT COUNT(*) FROM ops_alerts WHERE notified_at IS NULL") === '1', 'not marked as sent');
  execFileSync('bash', [S + '/up.sh']);
  r = php('watchdog'); m = fresh();
  assert(r.status === 0 && m.length === 1 && m[0].body.includes('E-mails automatiques du matin') && m[0].body.includes('aucune exécution réussie depuis le'), 'stale alert ' + JSON.stringify(m));
  php('record', 'reminders', '0'); php('watchdog'); fresh();
  step('a job that has not succeeded for 2 days is reported; mail server down: watchdog exits 1 (cron alert), the alert goes out on the next run');

  // 4. Backup: encrypted, rotated, refused without an off-site copy; restore gives identical tables
  execFileSync('php', [S + '/t/tools/demo_seed.php', '--yes', '--password=Lagon-Bleu-2026'], { stdio: 'pipe' });
  const gnupg = fs.mkdtempSync(path.join(os.tmpdir(), 'mips-gpg-'));
  const env = { ...process.env, GNUPGHOME: gnupg };
  execFileSync('gpg', ['--batch', '--passphrase', '', '--quick-gen-key', 'MIPS backup test <ops@mips.mu>', 'default', 'default', 'never'], { env, stdio: 'pipe' });
  fs.writeFileSync(S + '/backup-key.asc', execFileSync('gpg', ['--armor', '--export', 'ops@mips.mu'], { env }));
  const dir = S + '/backups', off = S + '/offsite';
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(off, { recursive: true, force: true });
  fs.mkdirSync(dir); fs.mkdirSync(off);
  fs.writeFileSync(dir + '/mips-2026-01-01-2145.sql.gz.gpg', 'old'); execFileSync('touch', ['-d', '40 days ago', dir + '/mips-2026-01-01-2145.sql.gz.gpg']);
  const benv = { ...process.env, MIPS_BACKUP_ENV: '/nonexistent', MIPS_BACKUP_KEY: S + '/backup-key.asc', MIPS_BACKUP_DIR: dir, MIPS_BACKUP_DB: DB, MIPS_BACKUP_MYCNF: '/nonexistent' };
  r = spawnSync(S + '/t/tools/backup.sh', [], { encoding: 'utf8', env: benv });
  assert(r.status === 1 && r.stderr.includes('No off-site copy configured'), 'off-site required ' + r.status + r.stdout + r.stderr);
  assert(!fs.existsSync(dir + '/mips-2026-01-01-2145.sql.gz.gpg') && r.stdout.includes('Removed (older than 30 days)'), 'rotation');
  await new Promise(res => setTimeout(res, 1100));   // file names are stamped to the second
  r = spawnSync(S + '/t/tools/cron.sh', ['backup', S + '/t/tools/backup.sh'], { encoding: 'utf8', env: { ...benv, MIPS_BACKUP_RSYNC_TARGET: off + '/' } });
  assert(r.status === 0 && r.stdout.includes('Copied off-site'), 'backup ok ' + r.stdout + r.stderr);
  const dumps = fs.readdirSync(dir).filter(f => f.endsWith('.sql.gz.gpg'));
  const confs = fs.readdirSync(dir).filter(f => f.endsWith('-config.php.gpg'));
  assert(dumps.length === 2 && confs.length === 2 && fs.readdirSync(off).filter(f => f.endsWith('.sql.gz.gpg')).length === 1, 'files ' + fs.readdirSync(dir) + ' / ' + fs.readdirSync(off));
  const latest = dir + '/' + dumps.sort().pop();
  const raw = fs.readFileSync(latest);
  assert(!raw.includes('Lagon') && !raw.includes('INSERT INTO') && raw.length > 10000, 'encrypted, ' + raw.length + ' bytes');
  assert((fs.statSync(latest).mode & 0o077) === 0, 'readable by its owner only');
  const conf = execFileSync('gpg', ['--batch', '--quiet', '--decrypt', dir + '/' + confs.sort().pop()], { env }).toString();
  assert(conf === fs.readFileSync(S + '/t/config/config.local.php', 'utf8'), 'config backup decrypts to config.local.php');
  assert(sql("SELECT last_exit FROM ops_jobs WHERE job = 'backup'") === '0', 'backup recorded');
  step('backup: database and config.local.php encrypted to the public key (no readable data, owner-only files), 40-day-old backup removed, exit 1 without an off-site copy, copied with rsync otherwise, recorded by cron.sh');

  const target = DB + '_restore';
  sql(`DROP DATABASE IF EXISTS \`${target}\``, 'mysql');
  r = spawnSync(S + '/t/tools/restore.sh', [latest, target], { encoding: 'utf8', env });
  assert(r.status === 0 && r.stdout.includes('Checksum OK') && r.stdout.includes('Restored into ' + target), 'restore ' + r.stdout + r.stderr);
  // ops_jobs changed after the dump: cron.sh recorded the backup itself.
  const tables = sql(`SELECT table_name FROM information_schema.tables WHERE table_schema = '${DB}' AND table_name <> 'ops_jobs' ORDER BY table_name`).split('\n');
  const sum = (db) => sql(`CHECKSUM TABLE ${tables.map(t => '`' + db + '`.`' + t + '`').join(', ')}`).split('\n').map(l => l.split('\t')[1]);
  const a = sum(DB), b = sum(target);
  assert(tables.length >= 45 && a.join() === b.join(), 'identical tables ' + tables.filter((t, i) => a[i] !== b[i]));
  assert(sql(`SELECT COUNT(*) FROM \`${target}\`.organizations WHERE name LIKE '%Lagon%'`) !== '0', 'demo company restored');
  r = spawnSync(S + '/t/tools/restore.sh', [latest, target], { encoding: 'utf8', env });
  assert(r.status === 2 && r.stderr.includes('--replace'), 'refuses a non-empty database');
  fs.appendFileSync(latest, 'x');
  r = spawnSync(S + '/t/tools/restore.sh', [latest, target, '--replace'], { encoding: 'utf8', env });
  assert(r.status === 1 && r.stderr.includes('Checksum mismatch'), 'damaged file refused ' + r.stderr);
  sql(`DROP DATABASE \`${target}\``, 'mysql');
  fs.rmSync(gnupg, { recursive: true, force: true });
  step(`restore into another database: checksum checked, ${tables.length} tables identical row for row (CHECKSUM TABLE); a database with tables is refused without --replace; a damaged backup is refused`);

  console.log('ALL GREEN');
})().catch(e => { console.error(e); process.exit(1); });
