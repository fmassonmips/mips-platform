"""Commission billing: fee rules (validation, specificity, validity dates), invoice
generation with VAT, lifecycle and numbering, month lock, non-billable merchants.

Fictitious data: fixtures/commission_2026_10.csv. Expected fees computed by hand:

  R1 global 2 %          R2 rail CARD 1.5 % + 0.75 / txn
  R3 Alpha + MPGS 1 %, valid from 2026-10-15   R4 channel TPE 3 %

  Alpha MUR: MPGS 10-05 1000 -> R2 15.75 ; MPGS 10-20 2000 -> R3 20.00 ;
             PowerCardCIM TPE 500 -> R2 (rail beats channel) 8.25   = 44.00 + VAT 6.60 = 50.60
  Beta  MUR: MyT_money_v2 TPE 400 -> R4 12.00                       = 12.00 + 1.80 = 13.80
  Beta  USD: Cybersource 150 -> R2 3.00 (charged in USD)            =  3.00 + 0.45 =  3.45
  Gamma MUR: IDP_API_JUICE 300 -> R1 6.00                           =  6.00 + 0.90 =  6.90
Same environment as portal_test.py.
"""
import csv, io, re

from helpers import check, finish, fixture, near, sql, staff

fin = staff('fin@example.com', '/billing.php')
viewer = staff('viewer@example.com')

r = fin.post('/api/reports/import', files={'file': ('commission_2026_10.csv', fixture('commission_2026_10.csv'), 'text/csv')})
check(r.status_code == 201 and r.json()['result']['rows_clean'] == 6, 'October imported', r.text)
mid = {n: int(sql(f"select id from merchants where name = '{n}'")) for n in ('Alpha Test Shop', 'Beta Test Hotel', 'Gamma Test Kiosk')}

print('== fee rules')
r = viewer.post('/api/billing/fee-rule', {'rate_pct': 1, 'valid_from': '2026-01-01'})
check(r.status_code == 403, 'a user without the billing role cannot create rules')
bad = [
    ({'rate_pct': 120, 'valid_from': '2026-01-01'}, 'Rate must be between'),
    ({'rate_pct': 1, 'fixed_fee': -1, 'valid_from': '2026-01-01'}, 'Fixed fee'),
    ({'rate_pct': 1}, 'Start date'),
    ({'rate_pct': 1, 'valid_from': '2026-02-30'}, 'Start date'),
    ({'rate_pct': 1, 'valid_from': '2026-05-01', 'valid_to': '2026-04-01'}, 'End date'),
    ({'rate_pct': 1, 'valid_from': '2026-01-01', 'rail_type': 'CRYPTO'}, 'Invalid rail type'),
    ({'rate_pct': 1, 'valid_from': '2026-01-01', 'channel': 'ATM'}, 'Invalid channel'),
    ({'rate_pct': 1, 'valid_from': '2026-01-01', 'merchant_id': 999999}, 'Merchant not found'),
]
for body, msg in bad:
    r = fin.post('/api/billing/fee-rule', body)
    check(r.status_code == 422 and msg in r.json().get('error', ''), f'rule refused: {msg}', r.text)


def rule(**kw):
    r = fin.post('/api/billing/fee-rule', kw)
    check(r.status_code == 201, f'rule created {kw}', r.text)
    return r.json().get('id')


r1 = rule(rate_pct=2, valid_from='2026-01-01')
r2 = rule(rail_type='CARD', rate_pct=1.5, fixed_fee=0.75, valid_from='2026-01-01')
r3 = rule(merchant_id=mid['Alpha Test Shop'], sof_proc_nickname='MPGS', rate_pct=1, valid_from='2026-10-15')
r4 = rule(channel='TPE', rate_pct=3, valid_from='2026-01-01')
old = rule(rate_pct=50, valid_from='2026-01-01', valid_to='2026-09-30')     # expired before October: never used
off = rule(channel='ONLINE', rate_pct=40, valid_from='2026-01-01')
r = fin.post('/api/billing/fee-rule-disable', {'id': off})
check(r.status_code == 200, 'rule disabled')
r = fin.post('/api/billing/fee-rule-disable', {'id': off})
check(r.status_code == 404, 'disabling twice answers 404')
rules = fin.get('/api/billing/fee-rules').json()
check(len(rules['fee_rules']) == 6 and rules['rail_types'] == ['CARD', 'QR', 'PUSH', 'OTHER'], 'rules listed with history kept')

print('== generation, October 2026')
r = fin.post('/api/billing/generate', {'period': '2026-03'})
check(r.status_code == 422 and 'No transactions' in r.json()['error'], 'month without data refused')
r = fin.post('/api/billing/generate', {'period': '2026-10'})
res = r.json().get('result', {})
check(r.status_code == 200 and res.get('created') == 4 and res.get('unpriced_lines') == 0 and res.get('skipped_locked') == 0,
      '4 invoices (one per merchant and currency), every line priced', r.text)


def invoices():
    return {(i['merchant_name'], i['currency']): i for i in fin.get('/api/billing/invoices?period=2026-10').json()['invoices']}


inv = invoices()
expect = {
    ('Alpha Test Shop', 'MUR'): (3, 3500, 44.00, 6.60, 50.60),
    ('Beta Test Hotel', 'MUR'): (1, 400, 12.00, 1.80, 13.80),
    ('Beta Test Hotel', 'USD'): (1, 150, 3.00, 0.45, 3.45),
    ('Gamma Test Kiosk', 'MUR'): (1, 300, 6.00, 0.90, 6.90),
}
for k, (n, vol, sub, vat, tot) in expect.items():
    i = inv.get(k, {})
    check(int(i.get('txn_count', -1)) == n and near(i.get('volume'), vol) and near(i.get('subtotal'), sub)
          and near(i.get('vat_amount'), vat) and near(i.get('total'), tot) and i.get('status') == 'draft',
          f'{k[0]} {k[1]}: subtotal {sub}, VAT 15 % {vat}, total {tot}', i)

alpha = inv[('Alpha Test Shop', 'MUR')]['id']
lines = sql(f'select sof_proc_nickname, channel, fee_rule_id, txn_count, volume, amount from invoice_lines where invoice_id = {alpha} order by amount')
got = [l.split('\t') for l in lines.splitlines()]
want = [['PowerCardCIM', 'TPE', str(r2), '1', '500.00', '8.25'], ['MPGS', 'ONLINE', str(r2), '1', '1000.00', '15.75'],
        ['MPGS', 'ONLINE', str(r3), '1', '2000.00', '20.00']]
check(got == want, 'Alpha lines: merchant rule applies from its start date only, rail rule beats channel rule', got)
check(sql(f'select count(*) from invoice_lines where fee_rule_id in ({old}, {off}, {r1}) and invoice_id = {alpha}') == '0',
      'expired and disabled rules are never used')

print('== lifecycle and numbering')
r = fin.post('/api/billing/invoice-status', {'id': alpha, 'status': 'paid'})
check(r.status_code == 409, 'a draft cannot be marked paid')
r = fin.post('/api/billing/invoice-status', {'id': alpha, 'status': 'sent'})
check(r.status_code == 422, 'unknown status refused')
r = fin.post('/api/billing/invoice-status', {'id': 999999, 'status': 'issued'})
check(r.status_code == 404, 'unknown invoice answers 404')
r = fin.post('/api/billing/invoice-status', {'id': alpha, 'status': 'issued'})
n1 = r.json().get('invoice', {}).get('number', '')
check(r.status_code == 200 and re.fullmatch(r'MIPS-\d{4}-00001', n1 or ''), 'first issued invoice numbered MIPS-YYYY-00001', r.text[:200])
check(len(r.json()['invoice']['lines']) == 3, 'issued invoice returned with its lines')
gamma = inv[('Gamma Test Kiosk', 'MUR')]['id']
r = fin.post('/api/billing/invoice-status', {'id': gamma, 'status': 'issued'})
n2 = r.json().get('invoice', {}).get('number', '')
check(n2 == n1[:-5] + '00002', 'numbers follow without gaps', n2)
r = fin.post('/api/billing/invoice-status', {'id': gamma, 'status': 'issued'})
check(r.status_code == 409, 'an issued invoice cannot be issued again')
r = fin.post('/api/billing/invoice-status', {'id': alpha, 'status': 'paid'})
check(r.status_code == 200 and r.json()['invoice']['paid_at'], 'issued invoice marked paid')
r = fin.post('/api/billing/invoice-status', {'id': alpha, 'status': 'void'})
check(r.status_code == 409, 'a paid invoice cannot be voided')

print('== locked month')
r = fin.post('/api/reports/import', files={'file': ('commission_2026_10.csv', fixture('commission_2026_10.csv'), 'text/csv')})
check(r.status_code == 422 and 'issued invoices' in r.json()['error'] and '2026-10' in r.json()['error'], 're-import of an invoiced month refused', r.text)
check(sql("select count(*) from transactions where period = '2026-10'") == '6', 'refused import changed nothing')

print('== regeneration and non-billable merchant')
m = fin.get(f"/api/merchants/get?id={mid['Beta Test Hotel']}").json()['merchant']
body = {k: m.get(k) for k in ('id', 'name', 'legal_name', 'status', 'brn', 'vat_number', 'address', 'sector', 'billing_email', 'notes')}
body['is_billable'] = 0
r = fin.post('/api/merchants/save', body)
check(r.status_code == 200, 'Beta set as non-billable', r.text)
r = fin.post('/api/billing/generate', {'period': '2026-10'})
res = r.json()['result']
check(res['created'] == 0 and res['skipped_locked'] == 2, 'regeneration keeps issued and paid invoices, drops Beta', res)
inv = invoices()
check(set(inv) == {('Alpha Test Shop', 'MUR'), ('Gamma Test Kiosk', 'MUR')}, 'non-billable merchant gets no invoice', list(inv))
check(inv[('Alpha Test Shop', 'MUR')]['number'] == n1 and inv[('Alpha Test Shop', 'MUR')]['status'] == 'paid', 'paid invoice untouched')

r = fin.post('/api/billing/invoice-status', {'id': gamma, 'status': 'void'})
check(r.status_code == 200, 'issued invoice voided')
r = fin.post('/api/billing/generate', {'period': '2026-10'})
res = r.json()['result']
inv = fin.get('/api/billing/invoices?period=2026-10').json()['invoices']
gam = [i for i in inv if i['merchant_name'] == 'Gamma Test Kiosk']
check(res['created'] == 1 and sorted(i['status'] for i in gam) == ['draft', 'void'], 'voiding frees the slot: a new draft replaces it', gam)

print('== export')
r = fin.get('/api/billing/export?period=2026-10')
rows = list(csv.reader(io.StringIO(r.content.decode('utf-8-sig'))))
check(r.status_code == 200 and rows[0][:3] == ['number', 'status', 'merchant'], 'accounting CSV export')
paid = next((x for x in rows if x[0] == n1), None)
check(paid is not None and paid[1] == 'paid' and paid[9] == '50.6', 'export carries number, status and total', paid)
r = viewer.get('/api/billing/export?period=2026-10')
check(r.status_code == 403, 'export needs the billing role')

finish()
