"""Monthly import straight from BigQuery, against the local emulator (bigquery_emulator.py):
service-account JWT, parameterised query with cost cap, job polling and paging,
Mauritius month bounds, same cleaning rules as a file upload.

Fictitious data: fixtures/bigquery_rows.csv (local time). November 2026 keeps
Alpha MPGS 1000 (online), Beta PowerCardCIM 2500 (TPE), Gamma IDP_API_JUICE 200
(online, 22:00 on the 30th); drops one test row, the 31 Oct 23:30 row and the
1 Dec 01:00 row (both are the other month in Mauritius, whatever UTC says).
Same environment as portal_test.py, plus BQ_LOG and BQ_KEY from run_tests.sh.
"""
import json, os, shutil, subprocess

from helpers import check, finish, near, sql, staff

LOG, KEY = os.environ['BQ_LOG'], os.environ['BQ_KEY']
fin = staff('fin@example.com', '/reports.php')
viewer = staff('viewer@example.com')


def bq(client, period):
    return client.post('/api/reports/import-bigquery', {'period': period})


print('== access and input checks')
r = bq(viewer, '2026-11')
check(r.status_code == 403, 'a user without the reporting role cannot import')
r = bq(fin, 'november')
check(r.status_code == 422, 'invalid month refused')

print('== import November 2026')
r = bq(fin, '2026-11')
check(r.status_code == 201, 'month read from BigQuery', r.text)
res = r.json().get('result', {})
p = res.get('periods', {})
check(list(p) == ['2026-11'] and 'warning' not in res, 'only November rows returned (local month bounds)', res)
n = p.get('2026-11', {})
check(n.get('rows_raw') == 4 and n.get('rows_test') == 1 and n.get('rows_clean') == 3, 'same cleaning rules: test row dropped', n)
check(sql("select filename from imports order by id desc limit 1") == 'bigquery:test-proj.ds.commission 2026-11', 'import source names the table')
check(len(sql("select file_sha256 from imports order by id desc limit 1")) == 64, 'fingerprint of the rows read is recorded')

rep = fin.get('/api/reports/monthly?period=2026-11').json()['report']
L = {l['label']: l for l in rep['lines']}
check(near(L['TPE total']['mur_vol'], 2500) and near(L['Online total (all rails)']['mur_vol'], 1200), 'TPE 2500, online 1200')
check(near(L['QR online']['mur_vol'], 200) and near(L['Ecom / MPGS / MCB']['mur_vol'], 1000), 'rails and gateways as for a file')
check(sql("select min(txn_date), max(txn_date) from transactions where period = '2026-11'") == '2026-11-01\t2026-11-30',
      'dates converted to Mauritius time (UTC would put them on Oct 31 and Nov 30 18:00)')
check(rep['previous_period'] == '2026-10', 'compared with the October upload')

log = open(LOG).read()
check('TOKEN ok=True' in log and 'scope=https://www.googleapis.com/auth/bigquery.readonly' in log, 'read-only token obtained with a signed JWT')
q = [x for x in log.splitlines() if x.startswith('QUERY')][-1]
check('legacy=False' in q and 'maxBytes=10737418240' in q and '"name": "start"' in q and "2026-11-01" in q and "2026-11-30" in q,
      'standard SQL, named parameters, cost cap', q[:300])
check('2026-11' not in q.split(' params=')[0], 'month values never inlined in the SQL text')
check('PAGE job=job_1 offset=2 rows=2' in log, 'job polled and results paged')

print('== replace, empty month, authentication failure')
r = bq(fin, '2026-11')
check(r.status_code == 201 and r.json()['result']['replaced_periods'] == ['2026-11'], 'second read replaces the month')
check(sql("select count(*) from transactions where period = '2026-11'") == '3', 'no duplicates')
r = bq(fin, '2027-01')
check(r.status_code == 422 and 'no row' in r.json()['error'], 'empty month refused', r.text)
check(sql("select count(*) from import_periods where period = '2027-01'") == '0', 'nothing recorded for it')

shutil.copy(KEY, KEY + '.bak')
other = subprocess.run(['openssl', 'genrsa', '2048'], capture_output=True, text=True).stdout
k = json.load(open(KEY))
k['private_key'] = other
json.dump(k, open(KEY, 'w'))
r = bq(fin, '2026-11')
shutil.move(KEY + '.bak', KEY)
check(r.status_code == 422 and 'authentication failed' in r.json()['error'], 'key not trusted by Google: refused, nothing imported', r.text)
check('BEGIN' not in r.text and 'assertion' not in r.text, 'error does not leak the key or the assertion')
check(sql("select count(*) from transactions where period = '2026-11'") == '3', 'data untouched after the failure')
check(sql("select count(*) from audit_log where action = 'import.rejected' and details like '%bigquery%'") == '2',
      'BigQuery rejections audited with their reason')

finish()
