"""Non-regression test of the staff onboarding/KYC document flow (shared DocumentStore).

Same environment as portal_test.py (see tests/README.md).
"""
import os

from helpers import B, FILES, APP_DIR, Client, check, finish, sql

PDF = open(os.path.join(FILES, 'specimen.pdf'), 'rb').read()
PNG = open(os.path.join(FILES, 'specimen-id.png'), 'rb').read()

fin = Client('/login.php')
fin.post('/api/auth/login', {'email': 'fin@example.com', 'password': 'Admin123!'})
fin.refresh('/onboarding.php')
adm = Client('/login.php')
adm.post('/api/auth/login', {'email': 'admin@example.com', 'password': 'Admin123!'})
adm.refresh('/onboarding.php')

print('== staff case and documents')
mid = sql("insert into merchants (name, status) values (concat('Regression ', unix_timestamp(), ' ', floor(rand()*100000)), 'prospect'); select last_insert_id()")
r = fin.post('/api/onboarding/open', {'merchant_id': int(mid)})
check(r.status_code == 201, 'staff opens a case', r.text)
cid = r.json()['id']
r = fin.post('/api/onboarding/upload', files={'file': ('a.pdf', PDF, 'application/pdf')}, data={'case_id': cid, 'requirement': 'brn'})
check(r.status_code == 201, 'staff upload', r.text)
did = r.json()['id']
r = fin.post('/api/onboarding/upload', files={'file': ('a.pdf', b'hello', 'application/pdf')}, data={'case_id': cid, 'requirement': 'brn'})
check(r.status_code == 422, 'wrong format refused (checked on content)')
r = fin.post('/api/onboarding/upload', files={'file': ('a.pdf', PDF, 'application/pdf')}, data={'case_id': cid, 'requirement': 'nope'})
check(r.status_code == 422, 'unknown document type refused')
r = fin.post('/api/onboarding/upload', files={'file': ('a.png', PNG, 'image/png')}, data={'case_id': cid, 'requirement': 'id', 'party_id': 0, 'expires_at': '2031-01-01'})
check(r.status_code == 422 and 'person' in r.json()['error'], 'identity document needs a person of the case')
r = fin.post('/api/onboarding/document-review', {'id': did, 'decision': 'accept'})
check(r.status_code == 409, 'four eyes: uploader cannot review own document')
r = adm.post('/api/onboarding/document-review', {'id': did, 'decision': 'accept'})
check(r.status_code == 200, 'another staff member accepts')
r = fin.post('/api/onboarding/upload', files={'file': ('a.pdf', PDF, 'application/pdf')}, data={'case_id': cid, 'requirement': 'vat'})
d2 = r.json()['id']
path = sql(f'select path from kyc_documents where id={d2}')
r = fin.post('/api/onboarding/document-delete', {'id': d2})
check(r.status_code == 200 and not os.path.exists(os.path.join(APP_DIR, 'storage', path)), 'uploader removes own pending document and its file')
check(sql(f'select scan_status from kyc_documents where id={did}') == 'not_scanned', 'scan status recorded on staff uploads')
r = fin.s.get(B + f'/api/onboarding/document?id={did}')
check(r.status_code == 200 and r.content == PDF, 'download returns the exact file')
fin.post('/api/onboarding/transition', {'id': cid, 'to': 'under_review'})
r = fin.post('/api/onboarding/transition', {'id': cid, 'to': 'collecting'})
check(r.status_code == 200, 'case goes back to collecting')

finish()
