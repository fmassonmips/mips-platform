"""Monthly reporting: Commission_Data import, frozen cleaning rules, report lines,
12-month trend, CSV / Excel export, month replacement and access control.

Fictitious data: fixtures/commission_2026_08.csv and commission_2026_09.csv.
Expected figures are computed by hand from those files (see tests/README.md).
Same environment as portal_test.py.
"""
import csv, io, zipfile

from helpers import check, finish, fixture, near, sql, staff

fin = staff('fin@example.com', '/reports.php')
viewer = staff('viewer@example.com')
adm = staff('admin@example.com', '/audit.php')


def upload(client, name, content, period=None):
    data = {'period': period} if period else {}
    return client.post('/api/reports/import', files={'file': (name, content, 'text/csv')}, data=data)


print('== access and input checks')
r = upload(viewer, 'commission_2026_09.csv', fixture('commission_2026_09.csv'))
check(r.status_code == 403, 'a user without the reporting role cannot import', r.status_code)
r = viewer.get('/api/reports/monthly?period=2026-09')
check(r.status_code == 403, 'nor read a report')
r = upload(fin, 'missing.csv', b'date_transaction,form_name,somme_totale\n2026-09-01,X,1\n')
check(r.status_code == 422 and 'Missing columns' in r.json()['error'] and 'sof_proc_nickname' in r.json()['error'],
      'missing Commission_Data columns are named', r.text)
NODATE = (b'form_name,form_nickname,sof_proc_nickname,somme_totale,symbole_monnaie,is_for_till_id,fi_name,last_transaction_status\n'
          b'Delta Test Cafe,,MPGS,40.00,MUR,,MCB,SUCCESS\n')
r = upload(fin, 'nodate.csv', NODATE)
check(r.status_code == 422 and 'No date column' in r.json()['error'], 'file without a date column needs the month', r.text)
r = upload(fin, 'nodate.csv', NODATE, period='2024-13')
check(r.status_code == 422 and 'YYYY-MM' in r.json()['error'], 'invalid month refused')
r = upload(fin, 'nodate.csv', NODATE, period='2024-01')
res = r.json().get('result', {})
check(r.status_code == 201 and res.get('date_column') is None and list(res.get('periods', {})) == ['2024-01'] and res.get('rows_clean') == 1,
      'file without a date column imported into the given month', r.text)
r = upload(fin, 'empty.csv', NODATE.split(b'\n')[0] + b'\n', period='2024-02')
check(r.status_code == 422 and 'No usable rows' in r.json()['error'], 'header-only file refused', r.text)
check(sql("select count(*) from import_periods where period = '2024-02'") == '0', 'refused import leaves nothing behind')
r = fin.get('/api/reports/monthly?period=2026-05')
check(r.status_code == 404, 'month never imported answers 404')

print('== import and cleaning (2026-08, 2026-09)')
r = upload(fin, 'commission_2026_08.csv', fixture('commission_2026_08.csv'))
check(r.status_code == 201 and r.json()['result']['rows_clean'] == 2, 'August imported', r.text)
r = upload(fin, 'commission_2026_09.csv', fixture('commission_2026_09.csv'))
check(r.status_code == 201, 'September imported', r.text)
res = r.json()['result']
p = res['periods'].get('2026-09', {})
check(res['rows_raw'] == 14 and res['rows_bad_date'] == 1 and res['rows_clean'] == 10, 'file totals: 14 rows read, 1 bad date, 10 kept', res)
check(p.get('rows_raw') == 13 and p.get('rows_not_success') == 1 and p.get('rows_test') == 1 and p.get('rows_refund_only') == 1,
      'cleaning: 1 non-SUCCESS, 1 test, 1 refund-only row dropped', p)
check(near(p.get('refund_total_reported'), 170), 'refunds reported (120 + 50), never netted', p)
check(res['replaced_periods'] == [], 'first import replaces nothing')
r = fin.get('/api/reports/periods')
periods = r.json()['periods']
check(periods[:2] == ['2026-09', '2026-08'], 'periods listed most recent first', periods)

print('== monthly report 2026-09')
rep = fin.get('/api/reports/monthly?period=2026-09').json()['report']
L = {l['label']: l for l in rep['lines']}
check(rep['previous_period'] == '2026-08', 'compared with August')
check(int(rep['cleaning']['rows_clean']) == 10 and rep['cleaning']['filename'] == 'commission_2026_09.csv', 'cleaning block carries the file')


def line(label, txn, mur_txn, vol, fx=0):
    l = L.get(label)
    ok = l is not None and l['txn'] == txn and l['mur_txn'] == mur_txn and near(l['mur_vol'], vol) and l['fx_txn'] == fx
    check(ok, f'{label}: {txn} txn, {mur_txn} MUR, {vol}', l)


line('TPE total', 2, 2, 2300)
check(near(L['TPE total']['avg_ticket'], 1150) and near(L['TPE total']['mom_vol'], 1.3), 'TPE average ticket 1150, +130% vs August')
line('TPE / MyT_money_v2', 1, 1, 300)
line('TPE / PowerCardCIM', 1, 1, 2000)
line('Online total (all rails)', 8, 7, 2435.75, fx=1)
line('Ecom gateways (strict)', 5, 4, 2150.50, fx=1)
line('Ecom / MPGS / MCB', 3, 3, 1900.50)
line('Ecom / MPGS_SBM / SBM', 1, 1, 250)
line('Ecom / Cybersource / ABSA', 1, 0, 0, fx=1)
line('CARD all', 6, 5, 4150.50, fx=1)
line('CARD TPE', 1, 1, 2000)
line('CARD online', 5, 4, 2150.50, fx=1)
line('QR all', 2, 2, 375.25)
line('QR TPE', 1, 1, 300)
line('QR online', 1, 1, 75.25)
line('PUSH all', 1, 1, 150)
line('OTHER all', 1, 1, 60)
line('QR incl. push (alt convention)', 3, 3, 525.25)
check('TPE / JUICE_auto' not in L, 'push without till stays online')
total = L['TPE total']['mur_vol'] + L['Online total (all rails)']['mur_vol']
check(near(total, 4735.75), 'MUR volume of the month 4735.75 (USD excluded, refunds not netted)', total)
check(rep['segments'] == {'active_forms': 3, 'tpe_only': 0, 'online_only': 2, 'both': 1}, 'segments: 3 active, 1 on both channels', rep['segments'])
check(len(rep['fx']) == 1 and rep['fx'][0]['currency'] == 'USD' and rep['fx'][0]['txn'] == 1 and near(rep['fx'][0]['vol'], 100),
      'FX section: USD 1 txn, 100, not converted', rep['fx'])
top = [(m['merchant'], round(m['mur_vol'], 2)) for m in rep['top_merchants']]
check(top == [('Beta Test Hotel', 2850.0), ('Alpha Test Shop', 1810.5), ('Gamma Test Kiosk', 75.25)],
      'top merchants on MUR volume, form_nickname used when form_name is blank', top)
check(near(rep['top_merchants'][1]['prev_mur_vol'], 1000), 'top merchants carry last month')
check(any(f == 'Nicknames classified OTHER: BankXfer' for f in rep['flags']), 'unknown rail flagged', rep['flags'])
check(any(f.startswith('TPE / PowerCardCIM MUR volume MoM: +100.0%') for f in rep['flags']), 'PowerCardCIM watch flag', rep['flags'])
check(sql("select count(*) from transactions where period = '2026-09' and refund_amount > 0") == '1',
      'refund amount stored on the kept row only')

print('== trend')
t = fin.get('/api/reports/trend?to=2026-09').json()['trend']
check(len(t['periods']) == 12 and t['periods'][0] == '2025-10' and t['periods'][-1] == '2026-09', '12 months ending September')
s = t['series']
check(s['total'][-2:] == [2000.0, 4735.75] and all(v is None for v in s['total'][:-2]), 'months never imported are gaps, not zeros', s['total'])
check(s['tpe'][-1] == 2300.0 and s['online'][-1] == 2435.75 and s['merchants'][-2:] == [2, 3], 'channel and merchant series')
check(s['rail_QR'][-1] == 375.25 and s['rail_PUSH'][-1] == 150.0 and s['txn'][-1] == 10, 'rail series, txn count includes FX')
check(near(t['headline']['mom'], 1.367875, 1e-6) and t['headline']['yoy'] is None, 'headline: +136.79% MoM, no YoY base', t['headline'])
r = fin.get('/api/reports/trend?to=bad')
check(r.status_code == 422, 'trend month validated')

print('== exports')
r = fin.get('/api/reports/export?period=2026-09')
check(r.status_code == 200 and r.headers['Content-Type'].startswith('text/csv') and r.content.startswith(b'\xef\xbb\xbf'), 'CSV export with BOM')
rows = list(csv.reader(io.StringIO(r.content.decode('utf-8-sig'))))
check(rows[0][:4] == ['line', 'txn', 'mur_txn', 'mur_vol'], 'CSV header', rows[0])
tpe = next((x for x in rows if x[0] == 'TPE total'), None)
check(tpe is not None and tpe[1:4] == ['2', '2', '2300'] and tpe[6] == '1000' and tpe[7] == '1.3', 'CSV TPE line with MoM', tpe)
check(any(x[0] == 'FLAG: Nicknames classified OTHER: BankXfer' for x in rows), 'flags exported')
r = fin.get('/api/reports/export?period=2026-09&format=xlsx')
ok = r.status_code == 200 and r.content[:2] == b'PK'
names = ''
if ok:
    z = zipfile.ZipFile(io.BytesIO(r.content))
    ok = z.testzip() is None
    names = z.read('xl/workbook.xml').decode()
check(ok and all(n in names for n in ('Cleaning', 'Detail_2026-09', 'Merchant_segments', 'FX', 'Top_merchants', 'Flags')),
      'Excel workbook is a valid archive with one tab per view', names[:300])
r = fin.get('/api/reports/export?period=2026-05')
check(r.status_code == 404, 'no export for a month without data')

print('== re-import replaces the month')
r = upload(fin, 'commission_2026_09_v2.csv', fixture('commission_2026_09.csv'))
check(r.status_code == 201 and r.json()['result']['replaced_periods'] == ['2026-09'], 'second import of September replaces it', r.text)
check(sql("select count(*) from transactions where period = '2026-09'") == '10', 'no duplicate transactions after re-import')
rep = fin.get('/api/reports/monthly?period=2026-09').json()['report']
check(rep['cleaning']['filename'] == 'commission_2026_09_v2.csv', 'report now cites the latest file')
check(sql("select count(*) from merchants where name in ('Alpha Test Shop','Beta Test Hotel','Gamma Test Kiosk')") == '3',
      'merchants created once, matched by name')

print('== audit trail')
r = adm.get('/api/audit/list?action=import.create')
check(r.status_code == 200 and r.json()['total'] >= 4, 'each import is in the audit log', r.text[:200])
r = adm.get('/api/audit/list?action=import.rejected')
check(r.json()['total'] >= 3, 'rejected imports are logged with their reason')
r = adm.get('/api/audit/list?action=report.export')
check(r.json()['total'] >= 2, 'exports are logged')
r = fin.get('/api/audit/list')
check(r.status_code == 403, 'finance cannot read the audit log')

finish()
