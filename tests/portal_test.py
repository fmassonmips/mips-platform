"""End-to-end API test of the merchant portal (onboarding phase 2).

Runs against a live test instance prepared by tests/run_tests.sh, which sets:
  BASE_URL   instance URL (default http://127.0.0.1:8099)
  MAIL_FILE  file the SMTP sink writes messages to
  APP_DIR    the instance's code copy (its config is switched during the antivirus checks)
  DB_NAME    the instance's database (read with the mysql client)
Staff accounts admin@example.com (admin) and fin@example.com (finance), password Admin123!,
without two-factor, must exist. Never point this at a production database.
"""
import os, re, time

import requests
from helpers import B, FILES, APP_DIR, UA, Client, check, finish, sql, totp, mails_to, last_link, wait_next_step

run = str(int(time.time()))
EMAIL = f'owner{run}@example.com'
EMAIL2 = f'other{run}@example.com'
PDF = open(os.path.join(FILES, 'specimen.pdf'), 'rb').read()
PNG = open(os.path.join(FILES, 'specimen-id.png'), 'rb').read()

print('== staff: publish terms')
staff = Client('/login.php')
r = staff.post('/api/auth/login', {'email': 'admin@example.com', 'password': 'Admin123!'})
check(r.status_code == 200, 'admin login', r.text)
staff.refresh('/terms.php')
fin = Client('/login.php')
r = fin.post('/api/auth/login', {'email': 'fin@example.com', 'password': 'Admin123!'})
check(r.status_code == 200, 'finance login', r.text)
fin.refresh('/onboarding.php')
r = fin.post('/api/terms/publish', {'version': 'x' + run, 'title': 'T', 'body': 'x' * 60})
check(r.status_code == 403, 'finance cannot publish terms (admin only)', r.status_code)
body1 = 'DEMO TERMS — placeholder text for testing only.\n' + 'Clause. ' * 20
r = staff.post('/api/terms/publish', {'version': 'T1-' + run, 'title': 'Merchant portal terms (test)', 'body': body1})
check(r.status_code == 201, 'admin publishes terms v1', r.text)
r = staff.post('/api/terms/publish', {'version': 'T1-' + run, 'title': 'dup', 'body': body1})
check(r.status_code == 409, 'same version number refused', r.text)

print('== register / verify')
p = Client('/portal/register.php')
r = p.post('/api/portal/register', {'name': 'Owner Test', 'email': EMAIL, 'password': 'Merchant123!', 'phone': '+230 0000'})
check(r.status_code == 200 and r.json().get('success'), 'register', r.text)
tok = last_link(EMAIL, 'verify.php')
check(tok is not None, 'verification email received')
r = p.post('/api/portal/login', {'email': EMAIL, 'password': 'Merchant123!'})
check(r.status_code == 403 and 'Confirm' in r.json()['error'], 'login refused before email confirmed', r.text)
# pre-hijacking: someone re-registers the unconfirmed address with another password
r = p.post('/api/portal/register', {'name': 'Attacker', 'email': EMAIL, 'password': 'Attacker123!'})
check(r.status_code == 200, 'second registration same answer')
tok = last_link(EMAIL, 'verify.php')
p.refresh('/portal/verify.php?token=' + tok)
r = p.post('/api/portal/verify', {'token': tok})
check(r.status_code == 200, 'verify', r.text)
r = p.post('/api/portal/verify', {'token': tok})
check(r.status_code == 410, 'verify link single use', r.status_code)
r = p.post('/api/portal/login', {'email': EMAIL, 'password': 'Attacker123!'})
check(r.status_code == 401, 'attacker password from re-registration does not work', r.text)
r = p.post('/api/portal/register', {'name': 'Again', 'email': EMAIL, 'password': 'Whatever123!'})
check(r.status_code == 200 and 'already have an account' in mails_to(EMAIL)[-1], 'existing account: same answer, owner told by email')

print('== login, gates, 2FA enrolment, terms')
p = Client('/portal/login.php')
r = p.post('/api/portal/login', {'email': EMAIL, 'password': 'Merchant123!'})
check(r.status_code == 200 and r.json().get('enroll_2fa'), 'first login -> enrol 2FA', r.text)
p.refresh('/portal/security.php')
r = p.get('/api/portal/case')
check(r.status_code == 403 and r.json().get('redirect', '').startswith('/portal/security.php'), 'gate: 2FA before anything', r.text)
r = p.s.get(B + '/portal/home.php', allow_redirects=False)
check(r.status_code == 302 and 'security.php' in r.headers.get('Location', ''), 'page gate redirects to security')
r = p.post('/api/portal/terms-accept', {'version_id': 1, 'sha256': 'x', 'agree': True})
check(r.status_code == 403, 'terms cannot be accepted before 2FA')
r = p.post('/api/portal/2fa-setup')
check(r.status_code == 200 and r.json()['uri'].startswith('otpauth://totp/MIPS%20merchant%20portal'), '2FA setup', r.text)
secret = r.json()['secret']
r = p.post('/api/portal/2fa-enable', {'code': '000000' if totp(secret) != '000000' else '111111'})
check(r.status_code == 422, 'wrong code refused')
r = p.post('/api/portal/2fa-enable', {'code': totp(secret)})
check(r.status_code == 200 and len(r.json()['recovery_codes']) == 10, '2FA enabled, 10 recovery codes', r.text)
codes = r.json()['recovery_codes']
r = p.get('/api/portal/case')
check(r.status_code == 403 and r.json()['redirect'] == '/portal/terms.php', 'gate: terms after 2FA', r.text)
t = p.get('/api/portal/terms').json()['terms']
check(t['version'] == 'T1-' + run, 'current terms served')
r = p.post('/api/portal/terms-accept', {'version_id': t['id'], 'sha256': t['sha256']})
check(r.status_code == 422, 'acceptance needs the box ticked')
r = p.post('/api/portal/terms-accept', {'version_id': t['id'], 'sha256': '0' * 64, 'agree': True})
check(r.status_code == 409, 'acceptance of a different text refused')
r = p.post('/api/portal/terms-accept', {'version_id': t['id'], 'sha256': t['sha256'], 'agree': True})
check(r.status_code == 200, 'terms accepted', r.text)
uid = sql(f"select id from portal_users where email='{EMAIL}'")
row = sql(f"select a.body_sha256, a.ip_address, length(a.user_agent) from terms_acceptances a where a.portal_user_id={uid}")
check(t['sha256'] in row and '127.0.0.1' in row, 'consent log row: hash + IP + UA', row)
r = p.get('/api/portal/case')
check(r.status_code == 200 and r.json()['stage'] == 'application', 'stage = application', r.text)

print('== isolation from staff')
r = requests.get(B + '/api/onboarding/list', cookies={'MIPSSESSID': p.s.cookies.get('MIPSPORTAL')}, headers={'User-Agent': UA, 'Accept': 'application/json'})
check(r.status_code == 401, 'portal session id used as staff cookie -> 401', r.status_code)
r = p.s.get(B + '/api/onboarding/list', headers={'Accept': 'application/json'})
check(r.status_code == 401, 'portal client has no staff access', r.status_code)
r = fin.get('/api/portal/case')
check(r.status_code == 401, 'staff session has no portal identity', r.status_code)

print('== pre-qualification')
app = {'legal_name': 'Portal Test Ltd ' + run, 'trading_name': 'Portal Test ' + run, 'brn': 'C' + run[-8:], 'country_of_incorporation': 'Mauritius',
       'registered_address': '1 Test Street, Port Louis', 'sector': 'gambling', 'products_services': 'Test products', 'website': 'https://example.com',
       'countries_of_operation': 'Mauritius, Reunion', 'monthly_volume_band': 'gt_5m', 'average_ticket_mur': '1500', 'payment_methods': ['card', 'ecommerce'],
       'contact_name': 'Owner Test', 'contact_phone': '+230 5000 0000'}
r = p.post('/api/portal/application', app)
check(r.status_code == 422 and 'Confirm' in r.json()['error'], 'declaration required', r.text)
r = p.post('/api/portal/application', dict(app, website='', declaration=True))
check(r.status_code == 422 and 'website is required' in r.json()['error'], 'e-commerce needs a website', r.text)
r = p.post('/api/portal/application', dict(app, declaration=True))
check(r.status_code == 201, 'application sent', r.text)
r = p.post('/api/portal/application', dict(app, declaration=True))
check(r.status_code == 409, 'only one application per account')
a = p.get('/api/portal/application').json()['application']
check('flags' not in a and 'decision_note' not in a, 'merchant never sees flags or internal note')
check(p.get('/api/portal/case').json()['stage'] == 'application_review', 'stage = application_review')
r = p.post('/api/portal/upload', files={'file': ('a.pdf', PDF, 'application/pdf')}, data={'requirement': 'brn'})
check(r.status_code == 409, 'no upload before acceptance', r.text)

print('== staff: application list / accept')
lst = fin.get('/api/applications/list').json()['applications']
mine = [x for x in lst if x['brn'] == app['brn']]
check(len(mine) == 1 and len(mine[0]['flags']) == 3, 'listed with 3 flags (sector, countries, volume)', mine)
aid = mine[0]['id']
d = fin.get(f'/api/applications/get?id={aid}').json()
check(d['account']['email'] == EMAIL and len(d['consents']) == 1, 'detail shows account and consent')
r = fin.post('/api/applications/decline', {'id': aid, 'note': ''})
check(r.status_code == 422, 'decline needs an internal note')
r = fin.post('/api/applications/accept', {'id': aid, 'note': 'ok to proceed'})
check(r.status_code == 200 and r.json()['case_id'], 'accepted -> merchant + case', r.text)
case_id, merchant_id = r.json()['case_id'], r.json()['merchant_id']
r = fin.post('/api/applications/accept', {'id': aid})
check(r.status_code == 409, 'cannot accept twice')
m = sql(f"select status, legal_name, brn from merchants where id={merchant_id}")
check(m.startswith('onboarding') and app['brn'] in m, 'merchant created in onboarding with BRN', m)
c = sql(f"select concat(name,'|',email,'|',is_primary) from merchant_contacts where merchant_id={merchant_id}")
check(EMAIL in c and c.endswith('|1'), 'applicant becomes primary contact', c)
check(any('next step' in x for x in mails_to(EMAIL)), 'applicant emailed about next step')

print('== merchant: people')
cv = p.get('/api/portal/case').json()
check(cv['stage'] == 'documents' and cv['case']['editable'], 'stage = documents')
check('risk_rating' not in cv['case'] and 'blockers' not in cv['case'], 'no internal fields exposed')
r = p.post('/api/portal/party-save', {'full_name': 'Director A', 'roles': ['director', 'signatory'], 'nationality': 'Mauritian', 'date_of_birth': '2030-01-01'})
check(r.status_code == 422, 'invalid date of birth refused')
r = p.post('/api/portal/party-save', {'full_name': 'Director A', 'roles': ['director', 'signatory'], 'nationality': 'Mauritian', 'date_of_birth': '1980-05-01'})
check(r.status_code == 200, 'director added', r.text)
pa = r.json()['id']
r = p.post('/api/portal/party-save', {'full_name': 'Owner B', 'roles': ['ubo', 'shareholder'], 'ownership_pct': '60', 'nationality': 'Mauritian', 'date_of_birth': '1975-02-03', 'is_pep': True})
check(r.status_code == 200, 'UBO added (declared PEP)', r.text)
pb = r.json()['id']
r = p.post('/api/portal/party-save', {'id': pb, 'full_name': 'Owner B', 'roles': ['ubo', 'shareholder'], 'ownership_pct': '60', 'nationality': 'Mauritian', 'date_of_birth': '1975-02-03', 'is_pep': False})
check(r.status_code == 200 and sql(f'select is_pep from kyc_parties where id={pb}') == '1', 'merchant cannot clear a PEP flag')
sql(f"update kyc_parties set screening_result='clear', screened_at=CURDATE() where id={pb}")
r = p.post('/api/portal/party-save', {'id': pb, 'full_name': 'Owner B Changed', 'roles': ['ubo'], 'ownership_pct': '60', 'nationality': 'Mauritian', 'date_of_birth': '1975-02-03'})
check(sql(f'select screening_result from kyc_parties where id={pb}') == 'pending', 'identity change resets screening')

print('== merchant: documents')
items = p.get('/api/portal/case').json()['case']['checklist']
req = [i for i in items if i['required']]
check(len(req) == 5 + 2 * 2, '5 company (agreement comes from MIPS) + 2x2 personal required items', len(req))
r = p.post('/api/portal/upload', files={'file': ('x.pdf', b'MZ\x90\x00 not a pdf', 'application/pdf')}, data={'requirement': 'brn'})
check(r.status_code == 422 and 'formats' in r.json()['error'], 'content-type checked on content', r.text)
r = p.post('/api/portal/upload', files={'file': ('id.png', PNG, 'image/png')}, data={'requirement': 'id', 'party_id': pa})
check(r.status_code == 422 and 'expiry' in r.json()['error'], 'ID needs an expiry date')
r = p.post('/api/portal/upload', files={'file': ('id.png', PNG, 'image/png')}, data={'requirement': 'id', 'party_id': pa, 'expires_at': '2020-01-01'})
check(r.status_code == 422 and 'expired' in r.json()['error'], 'expired ID refused')
foreign = sql('select id from kyc_parties where case_id <> %d limit 1' % case_id)
r = p.post('/api/portal/upload', files={'file': ('id.png', PNG, 'image/png')}, data={'requirement': 'id', 'party_id': foreign, 'expires_at': '2031-01-01'})
check(r.status_code == 422, 'person of another case refused (object level)', r.text)
doc_ids = []
for i in req:
    data = {'requirement': i['requirement']}
    if i['party_id']:
        data['party_id'] = i['party_id']
    if i['expires']:
        data['expires_at'] = '2031-12-31'
    f = ('id.png', PNG, 'image/png') if i['party_id'] else ('doc.pdf', PDF, 'application/pdf')
    r = p.post('/api/portal/upload', files={'file': f}, data=data)
    if r.status_code != 201:
        check(False, 'upload ' + i['requirement'], r.text)
    else:
        doc_ids.append(r.json()['id'])
check(len(doc_ids) == len(req), 'all required documents uploaded', len(doc_ids))
row = sql(f"select count(*), sum(uploaded_by is null), sum(uploaded_by_portal={uid}), sum(scan_status='not_scanned') from kyc_documents where case_id={case_id}")
check(row.split() == [str(len(req))] * 4, 'stored as merchant uploads, not scanned (no scanner configured)', row)
paths = sql(f"select path from kyc_documents where case_id={case_id} limit 1")
check(paths.startswith('kyc/%d/' % case_id) and os.path.exists(os.path.join(APP_DIR, 'storage', paths)), 'file stored outside web root', paths)
r = p.s.get(B + '/storage/' + paths)
check(r.status_code == 404, 'file not reachable over the web')
cv = p.get('/api/portal/case').json()
check(cv['case']['missing'] == [] and cv['case']['can_submit'], 'nothing missing, can submit', cv['case']['missing'])
check(all(i['document'] is None or i['document']['name'] for i in cv['case']['checklist'] if i['provided_by'] == 'you'), 'own file names visible')

print('== second merchant cannot touch the first one')
q = Client('/portal/register.php')
q.post('/api/portal/register', {'name': 'Other', 'email': EMAIL2, 'password': 'Merchant123!'})
t2 = last_link(EMAIL2, 'verify.php')
q.post('/api/portal/verify', {'token': t2})
q.refresh('/portal/login.php')
q.post('/api/portal/login', {'email': EMAIL2, 'password': 'Merchant123!'})
q.refresh('/portal/security.php')
s2 = q.post('/api/portal/2fa-setup').json()['secret']
q.post('/api/portal/2fa-enable', {'code': totp(s2)})
t = q.get('/api/portal/terms').json()['terms']
q.post('/api/portal/terms-accept', {'version_id': t['id'], 'sha256': t['sha256'], 'agree': True})
check(q.get('/api/portal/case').json()['case'] is None, 'other account sees no case')
r = q.post('/api/portal/document-delete', {'id': doc_ids[0]})
check(r.status_code == 409, 'other account cannot delete (no case at all)', r.text)
r = q.post('/api/portal/party-save', {'id': pa, 'full_name': 'Hijack', 'roles': ['director'], 'nationality': 'X', 'date_of_birth': '1970-01-01'})
check(r.status_code == 409, 'other account cannot edit a person', r.text)
check(sql(f'select full_name from kyc_parties where id={pa}') == 'Director A', 'person unchanged')

print('== submit, staff review, four eyes')
r = p.post('/api/portal/document-delete', {'id': doc_ids[0]})
check(r.status_code == 200, 'merchant removes own pending upload')
cv = p.get('/api/portal/case').json()
check(len(cv['case']['missing']) == 1, 'item missing again', cv['case']['missing'])
r = p.post('/api/portal/submit')
check(r.status_code == 422 and 'not complete' in r.json()['error'], 'cannot submit incomplete file')
first = req[0]
data = {'requirement': first['requirement']}
if first['party_id']:
    data['party_id'] = first['party_id']
if first['expires']:
    data['expires_at'] = '2031-12-31'
r = p.post('/api/portal/upload', files={'file': ('doc.pdf', PDF, 'application/pdf')}, data=data)
doc_ids[0] = r.json()['id']
r = p.post('/api/portal/submit')
check(r.status_code == 200, 'file sent to MIPS', r.text)
check(p.get('/api/portal/case').json()['stage'] == 'submitted', 'stage = submitted (not approved)')
r = p.post('/api/portal/submit')
check(r.status_code == 409, 'cannot send twice')
g = fin.get(f'/api/onboarding/get?id={case_id}').json()
check(g['portal'] and g['portal']['email'] == EMAIL and g['case']['merchant_submitted_at'], 'staff case shows portal account and submission')
d0 = [i['document'] for i in g['checklist'] if i['document']][0]
check(d0['uploaded_by_portal_email'] == EMAIL and d0['uploaded_by'] is None, 'staff sees merchant as uploader')
# reject one document -> merchant sees the reason and can upload again
r = fin.post('/api/onboarding/document-review', {'id': doc_ids[1], 'decision': 'reject', 'reason': 'Page 2 missing (test)'})
check(r.status_code == 200, 'finance rejects a merchant document (four eyes OK: uploader is the merchant)', r.text)
for did in doc_ids[2:]:
    fin.post('/api/onboarding/document-review', {'id': did, 'decision': 'accept'})
cv = p.get('/api/portal/case').json()
rej = [i for i in cv['case']['checklist'] if i['status'] == 'rejected']
check(len(rej) == 1 and rej[0]['document']['rejection_reason'] == 'Page 2 missing (test)', 'merchant sees the rejection reason')
r = p.post('/api/portal/document-delete', {'id': doc_ids[2]})
check(r.status_code == 409, 'checked document cannot be removed by merchant')
r = p.post('/api/portal/party-save', {'id': pa, 'full_name': 'Director A2', 'roles': ['director'], 'nationality': 'Mauritian', 'date_of_birth': '1980-05-01'})
check(r.status_code == 409, 'person with accepted documents locked', r.text)
fin.post('/api/onboarding/transition', {'id': case_id, 'to': 'under_review'})
r = p.post('/api/portal/upload', files={'file': ('doc.pdf', PDF, 'application/pdf')}, data={'requirement': 'constitution'})
check(r.status_code == 409 and 'reviewing' in r.json()['error'], 'no merchant upload while under review')
check(p.get('/api/portal/case').json()['stage'] == 'review', 'stage = review')
fin.post('/api/onboarding/transition', {'id': case_id, 'to': 'collecting'})
cv = p.get('/api/portal/case').json()
check(cv['stage'] == 'documents' and cv['case']['merchant_submitted_at'] is None and cv['case']['can_submit'], 'back to collecting: merchant can send again')

print('== reminder email points to the portal')
r = fin.post('/api/onboarding/remind', {'id': case_id})
check(r.status_code == 200 and '/portal/documents.php' in mails_to(EMAIL)[-1] and 'Never send identity documents by email' in mails_to(EMAIL)[-1], 'reminder links the portal', r.text)

print('== antivirus')
cfg = os.path.join(APP_DIR, 'config', 'config.php')
orig = open(cfg).read()
scanner = os.path.join(APP_DIR, 'fakescan.sh')
open(scanner, 'w').write('#!/bin/sh\ngrep -q EICAR-STANDARD-ANTIVIRUS-TEST-FILE "$1" && exit 1\nexit 0\n')
os.chmod(scanner, 0o755)
try:
    open(cfg, 'w').write(orig.replace("'require_antivirus'      => false", "'require_antivirus'      => true"))
    time.sleep(1.2)  # config is read per request; opcache is off in the test server
    r = p.post('/api/portal/upload', files={'file': ('doc.pdf', PDF, 'application/pdf')}, data={'requirement': 'constitution'})
    check(r.status_code == 503, 'required antivirus missing -> upload refused (fail closed)', r.text)
    open(cfg, 'w').write(orig.replace("'antivirus_command'      => null", "'antivirus_command'      => ['%s']" % scanner))
    time.sleep(1.2)
    eicar = PDF + b'\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n'
    r = p.post('/api/portal/upload', files={'file': ('doc.pdf', eicar, 'application/pdf')}, data={'requirement': 'constitution'})
    check(r.status_code == 422 and 'antivirus' in r.json()['error'], 'infected file rejected', r.text)
    r = p.post('/api/portal/upload', files={'file': ('doc.pdf', PDF, 'application/pdf')}, data={'requirement': 'constitution'})
    check(r.status_code == 201 and sql('select scan_status from kyc_documents where id=%d' % r.json()['id']) == 'clean', 'clean file stored as scanned', r.text)
    check(sql(f"select count(*) from audit_log where action='onboarding.portal_upload_infected' and entity_id='{merchant_id}'") == '1', 'infected upload audited')
finally:
    open(cfg, 'w').write(orig)
    time.sleep(1.2)

print('== new terms version forces re-acceptance')
r = staff.post('/api/terms/publish', {'version': 'T2-' + run, 'title': 'Merchant portal terms v2 (test)', 'body': body1 + '\nNew clause.'})
check(r.status_code == 201, 'v2 published')
r = p.get('/api/portal/case')
check(r.status_code == 403 and r.json()['redirect'] == '/portal/terms.php', 'merchant blocked until v2 accepted')
t = p.get('/api/portal/terms').json()
check(t['accepted_previous'] and not t['accepted_at'], 'terms page knows it is a new version')
p.post('/api/portal/terms-accept', {'version_id': t['terms']['id'], 'sha256': t['terms']['sha256'], 'agree': True})
check(p.get('/api/portal/case').status_code == 200, 'access back after accepting v2')

print('== 2FA sign-in, recovery code, password reset, account switched off')
wait_next_step()
c2 = Client('/portal/login.php')
r = c2.post('/api/portal/login', {'email': EMAIL, 'password': 'Merchant123!'})
check(r.json().get('two_factor_required'), 'password step -> second factor')
r = c2.post('/api/portal/2fa', {'code': '123456' if totp(secret) != '123456' else '654321'})
check(r.status_code == 401, 'wrong code')
r = c2.post('/api/portal/2fa', {'code': totp(secret)})
check(r.status_code == 200, 'TOTP sign-in', r.text)
c2.refresh('/portal/login.php')
r = c2.post('/api/portal/2fa', {'code': totp(secret)})
check(r.status_code == 401, 'pending state cleared after login', r.status_code)
c3 = Client('/portal/login.php')
c3.post('/api/portal/login', {'email': EMAIL, 'password': 'Merchant123!'})
r = c3.post('/api/portal/2fa', {'code': totp(secret)})
check(r.status_code == 401, 'same TOTP code cannot be replayed')
r = c3.post('/api/portal/2fa', {'code': codes[0]})
check(r.status_code == 200 and r.json()['recovery_codes_left'] == 9, 'recovery code sign-in', r.text)
c4 = Client('/portal/forgot.php')
r = c4.post('/api/portal/forgot', {'email': EMAIL})
check(r.status_code == 200, 'forgot')
rt = last_link(EMAIL, 'reset.php')
c4.refresh('/portal/reset.php?token=' + rt)
r = c4.post('/api/portal/reset', {'token': rt, 'password': 'NewMerchant123!'})
check(r.status_code == 200, 'password reset', r.text)
check(c2.get('/api/portal/case').status_code == 401, 'other sessions signed out after reset')
c5 = Client('/portal/login.php')
r = c5.post('/api/portal/login', {'email': EMAIL, 'password': 'NewMerchant123!'})
check(r.json().get('two_factor_required'), 'new password works, 2FA kept')
r = fin.post('/api/applications/account-status', {'portal_user_id': uid, 'active': False})
check(r.status_code == 200 and c3.get('/api/portal/case').status_code == 401, 'switched-off account loses its session at once')
fin.post('/api/applications/account-status', {'portal_user_id': uid, 'active': True})

print('== audit trail')
acts = sql(f"select group_concat(distinct action order by action) from audit_log where user_email='portal:{EMAIL}'")
for a in ['portal.register', 'portal.email_verified', 'portal.login', 'portal.2fa_enable', 'portal.terms_accept', 'portal.application_submit',
          'onboarding.portal_party_save', 'onboarding.portal_upload', 'onboarding.portal_document_delete', 'onboarding.portal_submit']:
    check(a in acts, 'audited: ' + a)
hist = fin.get(f'/api/onboarding/get?id={case_id}').json()['history']
check(any(h['action'] == 'onboarding.portal_submit' for h in hist), 'merchant actions appear in the case history')

finish()
