"""MCB vs MIPS reconciliation: MID remaps and watch list, gap split into categories,
scope warnings, claim items, exports, recompute after a settings change.

Fictitious data: fixtures/mcb_2026_09.csv and mips_2026_09.csv, test MIDs 91000000xx
(none of them in the remaps seeded by sql/schema.sql). Expected split per MUR line:

  9100000006  card verification  +10   (MIPS row at 0, MCB books MUR 10)
  9100000001  month-end clearing -300  (MIPS 300 on the 30th, not yet at MCB)
  9100000002  real gap           -500  (MCB under 9100000077, remapped; R1 500 to claim)
  9100000004  watch list         -700  (last_merchant_mid 9100000099 on the watch list)
  9100000005  only on MIPS side  -120
  9100000003  only on MCB side   +80
  9100000008  real gap           -200  (a 0-amount verification on a line where MIPS exceeds
                                       MCB: the +10 has the wrong sign and is not taken; S1 to claim)
  9100000001 USD: 85 on both sides
MUR totals: MCB 1640, MIPS 3370, gap -1730, unexplained 0.
The harness sets recon.sentinel_merchants to ['Sentinel Test Ltd'].
Same environment as portal_test.py.
"""
import csv, io

from helpers import check, finish, fixture, near, sql, staff

fin = staff('fin@example.com', '/recon.php')
viewer = staff('viewer@example.com')
MCB, MIPS = fixture('mcb_2026_09.csv'), fixture('mips_2026_09.csv')


def run(client, mcb=MCB, mips=MIPS, period='2026-09', mcb_name='mcb_2026_09.csv'):
    return client.post('/api/recon/run', data={'period': period},
                       files={'mcb': (mcb_name, mcb, 'text/csv'), 'mips': ('mips_2026_09.csv', mips, 'text/csv')})


print('== settings')
r = viewer.post('/api/recon/watch-add', {'mid': '9100000099'})
check(r.status_code == 403, 'a user without the recon role cannot change settings')
r = fin.post('/api/recon/remap-add', {'from_mid': '9100000077', 'to_mid': '9100000077'})
check(r.status_code == 422, 'remap to itself refused')
r = fin.post('/api/recon/remap-add', {'from_mid': '91000000AB', 'to_mid': '9100000002'})
check(r.status_code == 422, 'non-numeric MID refused')
r = fin.post('/api/recon/remap-add', {'from_mid': '9100000077', 'to_mid': '9100000002', 'label': 'Real Gap Test Shop'})
check(r.status_code == 201, 'remap added', r.text)
r = fin.post('/api/recon/remap-add', {'from_mid': '9100000002', 'to_mid': '9100000088'})
check(r.status_code == 409, 'remap chains refused')
r = fin.post('/api/recon/watch-add', {'mid': '9100000099', 'label': 'Watch Test new MID'})
check(r.status_code == 201, 'watch-list MID added')
st = fin.get('/api/recon/settings').json()
check(any(x['from_mid'] == '9100000077' for x in st['remaps']) and any(x['mid'] == '9100000099' for x in st['watch']), 'settings listed')

print('== input checks')
r = run(fin, period='2026-9')
check(r.status_code == 422, 'invalid month refused')
r = fin.post('/api/recon/run', data={'period': '2026-09'}, files={'mcb': ('mcb.csv', MCB, 'text/csv')})
check(r.status_code == 422 and 'MIPS file missing' in r.json()['error'], 'both files required')
r = run(fin, mcb_name='mcb.pdf')
check(r.status_code == 422 and '.xlsx or .csv' in r.json()['error'], 'only .xlsx / .csv accepted')
r = run(fin, mcb=b'Outlet_Number,trx_amt\n9100000001,10\n')
check(r.status_code == 422 and 'missing column' in r.json()['error'], 'missing MCB columns named', r.text)
check(sql('select count(*) from recon_runs') == '0', 'refused runs leave no record')
r = run(viewer)
check(r.status_code == 403, 'a user without the recon role cannot run a reconciliation')

print('== run 2026-09')
r = run(fin)
check(r.status_code == 201, 'reconciliation computed', r.text)
rid = r.json().get('id')
g = fin.get(f'/api/recon/get?id={rid}').json()
s = g['run']['summary']['currencies']
mur = s.get('MUR', {})
check(near(mur.get('mcb'), 1640) and near(mur.get('mips'), 3370) and near(mur.get('diff'), -1730), 'MUR totals: MCB 1640, MIPS 3370, gap -1730', mur)
check(mur.get('unexplained') == 0 and mur.get('lines') == 7, 'gap fully explained over 7 MUR lines')
cats = mur.get('categories', {})
check({k: round(v, 2) for k, v in cats.items()} == {'card_verif': 10.0, 'clearing': -300.0, 'watch': -700.0, 'mips_only': -120.0, 'mcb_only': 80.0, 'real': -700.0},
      'MUR categories', cats)
usd = s.get('USD', {})
check(near(usd.get('diff'), 0) and near(usd.get('mcb'), 85) and usd.get('lines') == 1, 'USD reconciles on its own, never converted', usd)
files = g['run']['summary']['files']
check(files['mips']['bundled_rows'] == 2 and files['mips']['unbundled_rows'] == 11, 'bundle split counted', files['mips'])

lines = {(l['mid'], l['currency']): l for l in g['lines']}
CAT = ['amt_card_verif', 'amt_clearing', 'amt_watch', 'amt_mips_only', 'amt_mcb_only', 'amt_real']


def split(mid, cur, col, amount):
    l = lines.get((mid, cur), {})
    others = [c for c in CAT if c != col]
    ok = near(l.get(col), amount) and near(l.get('diff'), amount) and all(near(l.get(c), 0) for c in others)
    check(ok, f'{mid} {cur}: {col[4:]} {amount}', {k: l.get(k) for k in ['diff'] + CAT})


split('9100000006', 'MUR', 'amt_card_verif', 10)
split('9100000001', 'MUR', 'amt_clearing', -300)
split('9100000002', 'MUR', 'amt_real', -500)
split('9100000004', 'MUR', 'amt_watch', -700)
split('9100000005', 'MUR', 'amt_mips_only', -120)
split('9100000003', 'MUR', 'amt_mcb_only', 80)
split('9100000008', 'MUR', 'amt_real', -200)
check(('9100000077', 'MUR') not in lines, 'remapped MID merged into its target')
check(lines[('9100000006', 'MUR')]['is_bundled'] in (1, '1') and int(lines[('9100000006', 'MUR')]['mips_zero_count']) == 1, 'zero-amount verification counted')
check(lines[('9100000003', 'MUR')]['merchant_name'] == 'MCB ONLY TEST SHOP', 'MCB-only line named from the MCB file')
check(lines[('9100000002', 'MUR')]['merchant_name'] == 'Real Gap Test Shop', 'line named from the MIPS file')

w = g['run']['warnings']
expect_w = [
    'MCB rows dated outside 2026-09 excluded: MUR 400.00 (usually last month\'s clearing carried over).',
    'MIPS rows dated outside 2026-09 excluded: MUR 60.00.',
    'MIPS rows without card_merchant_id excluded (QR / non-card, out of e-commerce scope): MUR 99.00.',
    'MCB: 1 non-PURCHASE rows ignored.',
    'MIPS: 1 non-SUCCESS and 1 test rows ignored.',
]
for e in expect_w:
    check(e in w, 'warning: ' + e[:60], w)
check(not any(x.startswith('BLOCKING') for x in w), 'no blocking warning on a full (mixed bundle) extraction', w)
check(not any('Sentinel' in x for x in w), 'sentinel merchant present: no scope warning', w)
check(len(w) == len(expect_w), 'no other warning', w)

print('== daily view and claims')
real = lines[('9100000002', 'MUR')]
check(int(real['claim_items']) == 1, 'one transaction to claim on the real-gap line')
d = fin.get(f"/api/recon/daily?line_id={real['id']}").json()
days = {x['day']: (float(x['mcb_amount']), float(x['mips_amount'])) for x in d['days']}
check(days == {'2026-09-12': (0.0, 500.0), '2026-09-13': (250.0, 250.0)}, 'daily MCB vs MIPS after remap', days)
check(len(d['claims']) == 1 and d['claims'][0]['reference'] == 'R1' and near(d['claims'][0]['amount'], 500)
      and d['claims'][0]['txn_at'] == '2026-09-12 09:30:00', 'claim item: R1, 500, with its time', d['claims'])
check(sql(f'select count(*) from recon_claim_items c join recon_lines l on l.id = c.line_id where l.run_id = {rid}') == '2',
      'claims only where MCB is short on a real-gap line (not on clearing / watch / MIPS-only lines)')

print('== exports')
r = fin.get(f'/api/recon/export?id={rid}&kind=summary')
rows = list(csv.reader(io.StringIO(r.content.decode('utf-8-sig'))))
check(['MUR', 'Unexplained (must be 0)', '0'] in rows and ['MUR', 'Missing on MCB side (real)', '-700'] in rows, 'summary CSV', rows[:12])
check(sum(1 for x in rows if x[1] == 'WARNING') == 5, 'summary CSV lists the warnings')
r = fin.get(f'/api/recon/export?id={rid}&kind=claims')
rows = list(csv.reader(io.StringIO(r.content.decode('utf-8-sig'))))
check(r.headers.get('Content-Disposition', '').endswith('Reclamation_MCB_202609.csv"') and [x[0] + x[4] for x in rows[1:]] == ['9100000002R1', '9100000008S1'],
      'claims CSV for MCB, zero-amount rows never claimed', rows)
r = fin.get(f'/api/recon/export?id={rid}&kind=lines')
rows = list(csv.reader(io.StringIO(r.content.decode('utf-8-sig'))))
check(len(rows) == 9 and rows[0][:3] == ['mid', 'merchant', 'currency'], 'per-merchant CSV: 8 lines + header', len(rows))
r = fin.get('/api/recon/export?id=999999&kind=lines')
check(r.status_code == 404, 'unknown run answers 404')

print('== runs list and recompute after a settings change')
runs = fin.get('/api/recon/runs').json()['runs']
check(len(runs) == 1 and runs[0]['warning_count'] == 5 and near(runs[0]['currencies']['MUR']['real'], -700), 'runs listed with their headline')
wid = next(x['id'] for x in st['watch'] if x['mid'] == '9100000099')
r = fin.post('/api/recon/watch-delete', {'id': wid})
check(r.status_code == 200, 'watch-list MID removed')
r = fin.post('/api/recon/recompute', {'id': rid})
check(r.status_code == 200, 'run recomputed from its stored files')
g = fin.get(f'/api/recon/get?id={rid}').json()
cats = g['run']['summary']['currencies']['MUR']['categories']
check(near(cats['watch'], 0) and near(cats['mips_only'], -820), 'without the watch list, that gap becomes MIPS-only', cats)
fin.post('/api/recon/watch-add', {'mid': '9100000099'})
fin.post('/api/recon/recompute', {'id': rid})
cats = fin.get(f'/api/recon/get?id={rid}').json()['run']['summary']['currencies']['MUR']['categories']
check(near(cats['watch'], -700), 'restored after re-adding the MID')

print('== scope check: filtered extraction')
hdr, *body = MIPS.decode().splitlines()
bundled_only = '\n'.join([hdr] + [x for x in body if x.split(',')[4] == '1']).encode()
r = run(fin, mips=bundled_only)
w = fin.get(f"/api/recon/get?id={r.json()['id']}").json()['run']['warnings']
check(any(x.startswith('BLOCKING: every MIPS row has order_is_bundled = 1') for x in w), 'bundled-only MIPS extraction flagged as blocking', w)
r = run(fin, mips=MIPS.replace(b'Sentinel Test Ltd', b'Other Test Ltd'))
w = fin.get(f"/api/recon/get?id={r.json()['id']}").json()['run']['warnings']
check(any(x.startswith('Sentinel merchant "Sentinel Test Ltd" is absent') for x in w), 'missing sentinel merchant flagged', w)
check(sql("select count(*) from audit_log where action = 'recon.run'") == '3', 'each run is audited with its file hashes')

finish()
