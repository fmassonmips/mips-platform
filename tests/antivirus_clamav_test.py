"""Antivirus on KYC uploads with the real ClamAV engine (clamscan and the clamd daemon).

What is real: the ClamAV engine, its exit codes and the application's handling of
them (clean / infected / error, fail closed). What is NOT: the virus signatures.
The official databases are not downloaded here; the suite builds a one-line test
database that recognises the EICAR test string, so it proves the integration, not
ClamAV's detection rate. In production, freshclam must keep the official
signatures up to date.

Uploads go through the staff KYC upload, which scans every file as soon as
portal.antivirus_command is set (the merchant portal uses the same DocumentStore).
The suite edits antivirus_command in the throw-away copy of the application and
restores it at the end. Skipped, with a message, when ClamAV is not installed.
Same environment as portal_test.py.
"""
import os, shutil, subprocess, sys, tempfile, time

from helpers import APP_DIR, check, finish, fixture, sql, staff

if not (shutil.which('clamscan') and shutil.which('clamd') and shutil.which('clamdscan')):
    print('SKIPPED: ClamAV not installed (apt-get install clamav clamav-daemon)')
    sys.exit(0)

CONFIG = os.path.join(APP_DIR, 'config', 'config.php')
DEFAULT = "'antivirus_command'      => null"
PDF = fixture('specimen.pdf')
EICAR = b'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
INFECTED = PDF + b'\n' + EICAR + b'\n'          # still a PDF for the format check, carries the test string

work = tempfile.mkdtemp(prefix='clamav-test-')
db, empty = os.path.join(work, 'db'), os.path.join(work, 'empty')
os.makedirs(db)
os.makedirs(empty)
open(os.path.join(db, 'test.ndb'), 'w').write('MIPS.Test.EICAR:0:*:' + EICAR.hex() + '\n')
sock = os.path.join(work, 'clamd.sock')
conf = os.path.join(work, 'clamd.conf')
open(conf, 'w').write(f'LocalSocket {sock}\nDatabaseDirectory {db}\nForeground yes\nUser root\nLogFile {work}/clamd.log\n')

fin = staff('fin@example.com', '/onboarding.php')
mid = fin.post('/api/merchants/save', {'name': 'Antivirus Test Ltd', 'status': 'prospect', 'is_billable': 1}).json()['id']
cid = fin.post('/api/onboarding/open', {'merchant_id': mid}).json()['id']


def use_scanner(command):
    s = open(CONFIG).read()
    start = s.index("'antivirus_command'")
    end = s.index('\n', start)
    value = 'null' if command is None else '[' + ', '.join("'%s'" % c for c in command) + ']'
    open(CONFIG, 'w').write(s[:start] + "'antivirus_command'      => " + value + ',' + s[end:])


def upload(content, req='incorporation'):
    before = len(os.listdir(os.path.join(APP_DIR, 'storage', 'kyc', str(cid)))) if os.path.isdir(os.path.join(APP_DIR, 'storage', 'kyc', str(cid))) else 0
    t = time.time()
    r = fin.post('/api/onboarding/upload', files={'file': ('doc.pdf', content, 'application/pdf')}, data={'case_id': cid, 'requirement': req})
    d = os.path.join(APP_DIR, 'storage', 'kyc', str(cid))
    after = len(os.listdir(d)) if os.path.isdir(d) else 0
    return r, after - before, time.time() - t


def scan_status(r):
    return sql(f"select scan_status from kyc_documents where id = {r.json()['id']}") if r.status_code == 201 else None


daemon = None
try:
    print('== clamscan (one process per file)')
    use_scanner(['/usr/bin/clamscan', '--no-summary', '-d', db])
    r, files, secs = upload(PDF)
    check(r.status_code == 201 and scan_status(r) == 'clean' and files == 1, 'clean PDF accepted, recorded as scanned clean', r.text)
    r, files, _ = upload(INFECTED)
    check(r.status_code == 422 and 'antivirus' in r.json().get('error', '') and files == 0, 'infected PDF refused, nothing stored', r.text)
    check(sql(f"select count(*) from kyc_documents where case_id = {cid}") == '1', 'no document row for the refused file')
    print(f'  (clamscan with the one-line test database: {secs:.2f} s per upload)')

    print('== fail closed')
    use_scanner(['/usr/bin/clamscan', '--no-summary', '-d', empty])
    r, files, _ = upload(PDF, 'brn')
    check(r.status_code == 503 and files == 0, 'ClamAV without signatures (freshclam never ran): upload refused, not waved through', r.text)
    use_scanner(['/usr/bin/clamscan-not-installed', '--no-summary'])
    r, files, _ = upload(PDF, 'brn')
    check(r.status_code == 503 and files == 0, 'scanner binary missing: upload refused', r.text)
    log = open(os.path.join(os.path.dirname(APP_DIR), 'server.log')).read() if os.path.exists(os.path.join(os.path.dirname(APP_DIR), 'server.log')) else ''
    check('antivirus error' in log, 'scanner errors logged on the server for the operator')

    print('== clamd daemon (production setup: signatures loaded once)')
    daemon = subprocess.Popen(['clamd', '--config-file', conf], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        if os.path.exists(sock):
            break
        time.sleep(0.5)
    check(os.path.exists(sock), 'clamd started with the test database')
    use_scanner(['/usr/bin/clamdscan', '--config-file=' + conf, '--fdpass', '--no-summary'])
    r, files, secs = upload(PDF, 'registers')
    check(r.status_code == 201 and scan_status(r) == 'clean' and files == 1, 'clean PDF accepted through clamd', r.text)
    print(f'  (clamdscan: {secs:.2f} s per upload)')
    r, files, _ = upload(INFECTED, 'registers')
    check(r.status_code == 422 and files == 0, 'infected PDF refused through clamd', r.text)
    daemon.terminate()
    daemon.wait(10)
    daemon = None
    r, files, _ = upload(PDF, 'bank_proof')
    check(r.status_code == 503 and files == 0, 'clamd stopped: upload refused, not waved through', r.text)
finally:
    if daemon:
        daemon.terminate()
    use_scanner(None)
    check(DEFAULT in open(CONFIG).read(), 'test configuration restored')
    shutil.rmtree(work, ignore_errors=True)

finish()
