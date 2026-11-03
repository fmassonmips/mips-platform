"""Merchant records: profile, contacts, identifiers (MID/TUI), contracts with PDF,
contract notice alerts, change history and access control.

Fictitious data only: merchants named "... Test ...", contract PDF = fixtures/specimen.pdf.
Same environment as portal_test.py.
"""
import datetime, glob, hashlib, os

from helpers import APP_DIR, B, check, finish, fixture, sql, staff

fin = staff('fin@example.com', '/merchants.php')
viewer = staff('viewer@example.com')
PDF = fixture('specimen.pdf')
fin_id = int(sql("select id from users where email = 'fin@example.com'"))
viewer_id = int(sql("select id from users where email = 'viewer@example.com'"))

print('== access')
r = viewer.get('/api/merchants/list')
check(r.status_code == 403, 'a user without the merchants role cannot list merchants')
r = viewer.post('/api/merchants/save', {'name': 'Intruder Test Ltd'})
check(r.status_code == 403, 'nor create one')

print('== profile')
bad = [
    ({'name': ''}, 422, 'Name is required'),
    ({'name': 'Kappa Test Ltd', 'status': 'gone'}, 422, 'Invalid status'),
    ({'name': 'Kappa Test Ltd', 'billing_email': 'not-an-email'}, 422, 'Billing email'),
    ({'name': 'Kappa Test Ltd', 'account_manager_id': viewer_id}, 422, 'Invalid account manager'),
    ({'name': 'Kappa Test Ltd', 'brn': 'C' * 40}, 422, 'too long'),
]
for body, code, msg in bad:
    r = fin.post('/api/merchants/save', body)
    check(r.status_code == code and msg in r.json().get('error', ''), f'profile refused: {msg}', r.text)
r = fin.post('/api/merchants/save', {'name': 'Kappa Test Ltd', 'legal_name': 'Kappa Test Company Ltd', 'status': 'prospect',
                                      'brn': 'C00000001', 'sector': 'Retail', 'account_manager_id': fin_id,
                                      'billing_email': 'billing@kappa.example', 'is_billable': 1})
check(r.status_code == 201, 'merchant created', r.text)
kid = r.json()['id']
r = fin.post('/api/merchants/save', {'name': 'Kappa Test Ltd'})
check(r.status_code == 409, 'duplicate import name refused')
r = fin.post('/api/merchants/save', {'name': 'Lambda Test Ltd', 'status': 'active', 'is_billable': 1})
lid = r.json()['id']

g = fin.get(f'/api/merchants/get?id={kid}').json()
m = g['merchant']
check(m['legal_name'] == 'Kappa Test Company Ltd' and m['account_manager_email'] == 'fin@example.com' and m['status'] == 'prospect',
      'profile stored with its account manager')
check(g['has_transactions'] is False and g['onboarding'] is None, 'no transactions, no onboarding case yet')
check(fin.get('/api/merchants/get?id=999999').status_code == 404, 'unknown merchant answers 404')

body = {k: m.get(k) for k in ('name', 'legal_name', 'brn', 'vat_number', 'address', 'sector', 'billing_email', 'notes')}
body.update(id=kid, status='active', account_manager_id=fin_id, is_billable=1)
r = fin.post('/api/merchants/save', body)
check(r.status_code == 200, 'status changed to active')
body.update(sector='Hospitality')
fin.post('/api/merchants/save', body)
hist = fin.get(f'/api/merchants/get?id={kid}').json()['history']
acts = [h['action'] for h in hist]
check(acts[:3] == ['merchant.update', 'merchant.status_change', 'merchant.create'], 'history: create, status change, update', acts)
check(hist[0]['details'] == {'sector': {'from': 'Retail', 'to': 'Hospitality'}} and hist[0]['user_email'] == 'fin@example.com',
      'history records who changed what, from and to', hist[0])
fin.post('/api/merchants/save', body)
check(len(fin.get(f'/api/merchants/get?id={kid}').json()['history']) == 3, 'saving without change logs nothing')

print('== import name locked once transactions exist')
NU = ('date_transaction,form_name,form_nickname,sof_proc_nickname,somme_totale,symbole_monnaie,is_for_till_id,fi_name,last_transaction_status\n'
      '2023-01-10,Mu Test Shop,,MPGS,10.00,MUR,,MCB,SUCCESS\n').encode()
r = fin.post('/api/reports/import', files={'file': ('mu.csv', NU, 'text/csv')})
check(r.status_code == 201, 'a month imported for "Mu Test Shop"', r.text)
mu = int(sql("select id from merchants where name = 'Mu Test Shop'"))
g = fin.get(f'/api/merchants/get?id={mu}').json()
check(g['has_transactions'] is True and g['volumes'][0]['period'] == '2023-01', 'merchant record shows its imported volumes')
r = fin.post('/api/merchants/save', {'id': mu, 'name': 'Mu Test Shop Renamed', 'status': 'active', 'is_billable': 1})
check(r.status_code == 409 and 'import name' in r.json()['error'], 'renaming a merchant with transactions refused (next import would duplicate it)')
r = fin.post('/api/merchants/save', {'id': mu, 'name': 'Mu Test Shop', 'legal_name': 'Mu Test Shop Ltd', 'status': 'active', 'is_billable': 1})
check(r.status_code == 200, 'other fields still editable')

print('== list and search')
lst = fin.get('/api/merchants/list?q=Kappa').json()
check([x['name'] for x in lst['merchants']] == ['Kappa Test Ltd'] and lst['merchants'][0]['account_manager'] == 'Test Finance', 'search by name')
check(fin.get('/api/merchants/list?status=gone').status_code == 422, 'invalid status filter refused')
lst = fin.get('/api/merchants/list?status=active&q=Test+Ltd').json()['merchants']
check({x['name'] for x in lst} >= {'Kappa Test Ltd', 'Lambda Test Ltd'}, 'status filter')
lst = fin.get('/api/merchants/list?q=%25').json()['merchants']
check(lst == [], 'LIKE wildcards in the search are taken literally', [x['name'] for x in lst][:5])

print('== contacts')
bad = [
    ({'merchant_id': kid, 'name': ''}, 'Contact name is required'),
    ({'merchant_id': kid, 'name': 'Ann Test', 'email': 'ann@'}, ''),
    ({'merchant_id': kid, 'name': 'Ann Test', 'phone': '5123<script>'}, 'Phone may contain'),
]
for body, msg in bad:
    r = fin.post('/api/merchants/contact-save', body)
    check(r.status_code == 422 and msg in r.json().get('error', ''), f'contact refused: {msg or "invalid email"}', r.text)
r = fin.post('/api/merchants/contact-save', {'merchant_id': 999999, 'name': 'Ann Test'})
check(r.status_code == 404, 'contact for an unknown merchant refused')
c1 = fin.post('/api/merchants/contact-save', {'merchant_id': kid, 'name': 'Ann Test', 'email': 'ann@kappa.example',
                                               'phone': '+230 5123 4567', 'is_primary': 1}).json()['id']
c2 = fin.post('/api/merchants/contact-save', {'merchant_id': kid, 'name': 'Bob Test', 'email': 'bob@kappa.example',
                                               'is_primary': 1, 'is_billing': 1}).json()['id']
contacts = {c['name']: c for c in fin.get(f'/api/merchants/get?id={kid}').json()['contacts']}
check(contacts['Bob Test']['is_primary'] in (1, '1') and contacts['Ann Test']['is_primary'] in (0, '0'), 'one primary contact per merchant')
r = fin.post('/api/merchants/contact-save', {'id': c1, 'merchant_id': lid, 'name': 'Ann Test', 'job_title': 'CFO'})
check(r.status_code == 200 and sql(f'select merchant_id from merchant_contacts where id = {c1}') == str(kid),
      'editing a contact never moves it to another merchant')
r = fin.post('/api/merchants/contact-delete', {'id': c2})
check(r.status_code == 200 and sql(f'select count(*) from merchant_contacts where id = {c2}') == '0', 'contact deleted')
check(fin.post('/api/merchants/contact-delete', {'id': c2}).status_code == 404, 'deleting twice answers 404')

print('== identifiers')
r = fin.post('/api/merchants/identifier-save', {'merchant_id': kid, 'type': 'IBAN', 'value': 'X'})
check(r.status_code == 422, 'unknown identifier type refused')
r = fin.post('/api/merchants/identifier-save', {'merchant_id': kid, 'type': 'MID', 'value': ''})
check(r.status_code == 422, 'empty value refused')
r = fin.post('/api/merchants/identifier-save', {'merchant_id': kid, 'type': 'MID', 'value': '9200000001', 'label': 'e-commerce'})
check(r.status_code == 201, 'MID linked')
r = fin.post('/api/merchants/identifier-save', {'merchant_id': lid, 'type': 'MID', 'value': '9200000001'})
check(r.status_code == 409 and 'Kappa Test Ltd' in r.json()['error'], 'same MID on a second merchant refused, owner named')
r = fin.post('/api/merchants/identifier-save', {'merchant_id': lid, 'type': 'TUI', 'value': '9200000001'})
check(r.status_code == 201, 'same value under another type is allowed')
lst = fin.get('/api/merchants/list?q=9200000001').json()['merchants']
check({x['name'] for x in lst} == {'Kappa Test Ltd', 'Lambda Test Ltd'}, 'search by identifier')
iid = int(sql("select id from merchant_identifiers where type = 'TUI' and value = '9200000001'"))
check(fin.post('/api/merchants/identifier-delete', {'id': iid}).status_code == 200, 'identifier removed')
check(fin.post('/api/merchants/identifier-delete', {'id': iid}).status_code == 404, 'removing twice answers 404')

print('== contracts')


def contract(data, doc=None):
    files = {'document': (doc[0], doc[1], 'application/pdf')} if doc else {'none': ('', b'', 'text/plain')}
    return fin.post('/api/merchants/contract-save', files=files, data=data)


base = {'merchant_id': kid, 'reference': 'MSA-TEST-1', 'type': 'MSA', 'status': 'draft'}
bad = [
    ({'type': 'LEASE'}, 'Invalid contract type'),
    ({'status': 'archived'}, 'Invalid contract status'),
    ({'start_date': '2026-02-30'}, 'Invalid start date'),
    ({'start_date': '2026-06-01', 'end_date': '2026-05-01'}, 'End date is before start date'),
    ({'status': 'signed'}, 'needs a signature date'),
    ({'notice_days': '4000'}, 'Notice period'),
]
for extra, msg in bad:
    r = contract({**base, **extra})
    check(r.status_code == 422 and msg in r.json().get('error', ''), f'contract refused: {msg}', r.text)
r = contract(base, ('fake.pdf', b'PK\x03\x04 zip archive renamed'))
check(r.status_code == 422 and 'Only PDF' in r.json()['error'], 'a file that is not a PDF refused (content checked, not the name)', r.text)
r = contract(base, ('contract.pdf', b'<html>hi</html>'))
check(r.status_code == 422, 'HTML renamed .pdf refused')
r = contract({**base, 'merchant_id': 999999})
check(r.status_code == 404, 'contract for an unknown merchant refused')

today = datetime.date.today()
end = today + datetime.timedelta(days=60)
r = contract({**base, 'status': 'signed', 'signed_at': today.isoformat(), 'start_date': today.isoformat(),
              'end_date': end.isoformat(), 'notice_days': '30', 'auto_renew': '1'}, ('MSA signed.pdf', PDF))
check(r.status_code == 200, 'signed contract saved with its PDF', r.text)
cid = r.json()['id']
row = sql(f'select document_path, document_sha256, document_size from contracts where id = {cid}').split('\t')
path = os.path.join(APP_DIR, 'storage', row[0])
check(os.path.isfile(path) and open(path, 'rb').read() == PDF and int(row[2]) == len(PDF), 'PDF stored outside the web root, size recorded')
check(row[1] == hashlib.sha256(PDF).hexdigest(), 'sha256 of the document recorded')
r = fin.s.get(B + f'/api/merchants/contract-file?id={cid}')
check(r.status_code == 200 and r.content == PDF and r.headers['Content-Type'] == 'application/pdf'
      and 'MSA signed.pdf' in r.headers.get('Content-Disposition', ''), 'download returns the exact file')
check(viewer.s.get(B + f'/api/merchants/contract-file?id={cid}').status_code == 403, 'download needs the merchants role')
check(fin.s.get(B + '/storage/' + row[0]).status_code == 404,
      'stored file not reachable over the web')

c = fin.get(f'/api/merchants/get?id={kid}').json()['contracts'][0]
check(c['notice_deadline'] == (end - datetime.timedelta(days=30)).isoformat() and c['document_name'] == 'MSA signed.pdf',
      'notice deadline = end date - notice period', c)
exp = [x for x in fin.get('/api/merchants/expiring').json()['contracts'] if x['id'] == cid]
check(len(exp) == 1 and int(exp[0]['days_to_deadline']) == 30 and int(exp[0]['days_to_end']) == 60,
      'contract listed in the notice alerts (deadline within 90 days)', exp)

r = contract({**base, 'id': cid, 'merchant_id': lid, 'status': 'signed', 'signed_at': today.isoformat(),
              'start_date': today.isoformat(), 'end_date': end.isoformat(), 'notice_days': '30'}, ('MSA v2.pdf', PDF + b'\n%v2'))
check(r.status_code == 200 and sql(f'select merchant_id from contracts where id = {cid}') == str(kid),
      'editing a contract never moves it to another merchant')
files = glob.glob(os.path.join(APP_DIR, 'storage', 'contracts', str(kid), '*.pdf'))
check(len(files) == 2 and os.path.isfile(path), 'replaced document kept on disk (its hash stays in the audit trail)', files)
r = fin.post('/api/merchants/contract-delete', {'id': cid})
check(r.status_code == 409, 'a signed contract cannot be deleted, only terminated')
far = contract({**base, 'reference': 'NDA-TEST', 'type': 'NDA', 'end_date': (today + datetime.timedelta(days=400)).isoformat(), 'notice_days': '30'})
nda = far.json()['id']
check(not any(x['id'] == nda for x in fin.get('/api/merchants/expiring').json()['contracts']), 'drafts and far deadlines are not alerted')
check(fin.s.get(B + f'/api/merchants/contract-file?id={nda}').status_code == 404, 'no document: 404')
r = fin.post('/api/merchants/contract-delete', {'id': nda})
check(r.status_code == 200, 'a draft can be deleted')
check(fin.post('/api/merchants/contract-delete', {'id': nda}).status_code == 404, 'deleting twice answers 404')

print('== audit')
acts = [h['action'] for h in fin.get(f'/api/merchants/get?id={kid}').json()['history']]
for a in ('merchant.contact_save', 'merchant.contact_delete', 'merchant.identifier_add', 'merchant.contract_create',
          'merchant.contract_update', 'merchant.contract_download'):
    check(a in acts, f'history shows {a}')
d = sql(f"select details from audit_log where action = 'merchant.contract_create' and entity_id = '{kid}' order by id limit 1")
check(hashlib.sha256(PDF).hexdigest() in d, 'contract creation logged with the document hash')

finish()
