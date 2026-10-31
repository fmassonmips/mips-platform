"""KYC case approval: the approval blockers, the approver role, four eyes on the
decision (approver != analyst) and on documents (reviewer != uploader), the
decision record, final states and the periodic review carry-over.

Fictitious data only: merchant "Approval Test Ltd", people "Dir Test One" etc.,
documents = fixtures/specimen.pdf. Accounts: fin@ (finance, analyst), admin@
(approver), plus a second administrator created here.
Same environment as portal_test.py.
"""
import datetime

from helpers import Client, check, finish, fixture, sql, staff

PDF = fixture('specimen.pdf')
fin = staff('fin@example.com', '/onboarding.php')
adm = staff('admin@example.com', '/onboarding.php')
fin_id = int(sql("select id from users where email = 'fin@example.com'"))
adm_id = int(sql("select id from users where email = 'admin@example.com'"))
sql("insert into users (email, password_hash, name, role, is_active, activated_at) select 'admin2@example.com', password_hash, "
    "'Second Admin', 'admin', 1, now() from users where email = 'admin@example.com'")
adm2 = staff('admin2@example.com', '/onboarding.php')
adm2_id = int(sql("select id from users where email = 'admin2@example.com'"))
today = datetime.date.today()


def merchant(name):
    r = fin.post('/api/merchants/save', {'name': name, 'status': 'prospect', 'is_billable': 1})
    return r.json()['id']


def upload(c, case, req, party=None, expires=None):
    data = {'case_id': case, 'requirement': req}
    if party:
        data['party_id'] = party
    if expires:
        data['expires_at'] = expires
    r = c.post('/api/onboarding/upload', files={'file': ('doc.pdf', PDF, 'application/pdf')}, data=data)
    return r.json().get('id') if r.status_code == 201 else None


def review(c, doc, decision='accept', reason=''):
    return c.post('/api/onboarding/document-review', {'id': doc, 'decision': decision, 'reason': reason})


def party(case, name, roles, pct=None, screening='pending', pep=False, pid=None):
    body = {'case_id': case, 'full_name': name, 'roles': roles, 'screening_result': screening, 'is_pep': pep}
    if pct is not None:
        body['ownership_pct'] = pct
    if screening != 'pending':
        body['screening_reference'] = 'SCR-TEST-' + name.split()[-1]
    if pid:
        body['id'] = pid
    r = fin.post('/api/onboarding/party-save', body)
    check(r.status_code == 200, f'person saved: {name}', r.text)
    return r.json().get('id')


def blockers(case):
    return adm.get(f'/api/onboarding/get?id={case}').json()['blockers']


def move(c, case, to, notes=None):
    return c.post('/api/onboarding/transition', {'id': case, 'to': to, 'notes': notes})


def has(bl, text):
    return any(text in b for b in bl)


print('== setup: case opened by the analyst')
mid = merchant('Approval Test Ltd')
r = fin.post('/api/onboarding/open', {'merchant_id': mid})
check(r.status_code == 201, 'analyst opens the case', r.text)
cid = r.json()['id']
case = adm.get(f'/api/onboarding/get?id={cid}').json()
check(int(case['case']['assigned_to']) == fin_id and case['case']['kind'] == 'initial', 'case assigned to the analyst who opened it')
check(fin.get(f'/api/onboarding/get?id={cid}').json()['can_decide'] is False and case['can_decide'] is True,
      'decision buttons: analyst no, other approver yes')
check(fin.post('/api/onboarding/open', {'merchant_id': mid}).status_code == 409, 'one open case per merchant')

print('== approval blocked from the start')
r = move(adm, cid, 'approved', 'too early')
check(r.status_code == 409 and 'Cannot move a case from collecting' in r.json()['error'], 'cannot approve straight from collection')
check(move(fin, cid, 'under_review').status_code == 200, 'case submitted for review')
bl = blockers(cid)
for text in ('Legal name and BRN', 'Certificate of incorporation: missing', 'BRN certificate: missing', 'Registers of directors',
             'Bank account proof', 'Proof of business address', 'Signed MIPS merchant agreement: missing',
             'No director recorded', 'No beneficial owner recorded', 'Risk rating not set'):
    check(has(bl, text), f'blocker listed: {text}', bl)
check(not has(bl, 'Constitution') and not has(bl, 'VAT registration'), 'optional documents never block')
r = move(adm, cid, 'approved', 'all good?')
check(r.status_code == 409 and 'Cannot approve yet' in r.json()['error'] and 'Risk rating not set' in r.json()['error'],
      'approval refused by the server, blockers returned')

print('== resolving the blockers one by one')
m = fin.get(f'/api/merchants/get?id={mid}').json()['merchant']
fin.post('/api/merchants/save', {'id': mid, 'name': m['name'], 'status': m['status'], 'is_billable': 1,
                                 'legal_name': 'Approval Test Company Ltd', 'brn': 'C99999999'})
check(not has(blockers(cid), 'Legal name and BRN'), 'legal name and BRN filled in: blocker gone')

docs = {}
for req in ('incorporation', 'brn', 'registers', 'bank_proof', 'business_address'):
    docs[req] = upload(fin, cid, req)
check(all(docs.values()), 'company documents uploaded by the analyst')
check(has(blockers(cid), 'Certificate of incorporation: pending'), 'uploaded but not reviewed: still blocking')
r = review(fin, docs['incorporation'])
check(r.status_code == 409 and 'Four eyes' in r.json()['error'], 'four eyes: the uploader cannot accept their own document')
r = review(adm, docs['bank_proof'], 'reject')
check(r.status_code == 422, 'a rejection needs a reason')
r = review(adm, docs['bank_proof'], 'reject', 'Statement older than 3 months')
check(r.status_code == 200 and has(blockers(cid), 'Bank account proof (bank letter or statement): rejected'), 'rejected document blocks')
check(review(adm, docs['bank_proof'], 'accept').status_code == 409, 'a reviewed document cannot be reviewed again')
docs['bank_proof'] = upload(fin, cid, 'bank_proof')
for req, d in docs.items():
    review(adm, d)
bl = blockers(cid)
check(not any(has(bl, t) for t in ('Certificate of incorporation', 'BRN certificate', 'Registers', 'Bank account proof', 'Proof of business address')),
      'company documents accepted by another person: blockers gone', bl)

r = fin.post('/api/merchants/contract-save', files={'document': ('msa.pdf', PDF, 'application/pdf')},
             data={'merchant_id': mid, 'reference': 'MSA-APPROVAL-TEST', 'type': 'MSA', 'status': 'signed', 'signed_at': today.isoformat()})
check(r.status_code == 200 and not has(blockers(cid), 'Signed MIPS merchant agreement'), 'signed contract with PDF on the merchant record satisfies the agreement')

d1 = party(cid, 'Dir Test One', ['director'])
u2 = party(cid, 'Owner Test Two', ['ubo'], pct=40)
h3 = party(cid, 'Holder Test Three', ['shareholder'], pct=25)
bl = blockers(cid)
check(not has(bl, 'No director') and not has(bl, 'No beneficial owner'), 'director and beneficial owner recorded')
check(has(bl, 'Holder Test Three holds 25') and has(bl, 'must be recorded as a beneficial owner'), 'shareholder at the 25 % threshold must be a beneficial owner', bl)
check(has(bl, 'Identity document (passport or national ID) — Dir Test One: missing') and has(bl, 'Proof of residential address (less than 3 months) — Owner Test Two: missing'),
      'identity and address documents required per director and beneficial owner')
check(not has(bl, 'Holder Test Three: missing'), 'a plain shareholder below the documents roles needs no documents')
check(has(bl, 'Dir Test One: sanctions/PEP screening is not recorded'), 'screening required per person')
party(cid, 'Holder Test Three', ['shareholder'], pct=24.99, pid=h3)
check(not has(blockers(cid), 'Holder Test Three holds'), 'below the threshold: blocker gone')

pdocs = []
for p in (d1, u2):
    pdocs.append(upload(fin, cid, 'id', p, (today + datetime.timedelta(days=900)).isoformat()))
    pdocs.append(upload(fin, cid, 'address_proof', p))
r = fin.post('/api/onboarding/upload', files={'file': ('id.pdf', PDF, 'application/pdf')}, data={'case_id': cid, 'requirement': 'id', 'party_id': d1})
check(r.status_code == 422, 'identity document needs an expiry date')
for d in pdocs:
    review(adm, d)
expired_id = pdocs[0]
sql(f"update kyc_documents set expires_at = '{(today - datetime.timedelta(days=1)).isoformat()}' where id = {expired_id}")
check(has(blockers(cid), 'Identity document (passport or national ID) — Dir Test One: expired'), 'an expired identity document counts as missing')
sql(f"update kyc_documents set expires_at = '{(today + datetime.timedelta(days=900)).isoformat()}' where id = {expired_id}")

party(cid, 'Dir Test One', ['director'], screening='match', pid=d1)
check(has(blockers(cid), 'Dir Test One: sanctions/PEP screening is a MATCH'), 'a screening match blocks until resolved')
party(cid, 'Dir Test One', ['director'], screening='clear', pid=d1)
party(cid, 'Owner Test Two', ['ubo'], pct=40, screening='clear', pep=True, pid=u2)
check(not has(blockers(cid), 'screening'), 'screening recorded as clear for each person')

fin.post('/api/onboarding/update', {'id': cid, 'risk_rating': 'medium', 'assigned_to': fin_id})
bl = blockers(cid)
check(bl == ['A politically exposed person is involved: the risk rating must be high.'], 'PEP involved: risk rating must be high (only blocker left)', bl)
fin.post('/api/onboarding/update', {'id': cid, 'risk_rating': 'high', 'assigned_to': fin_id})
check(blockers(cid) == [], 'no blocker left')

print('== who may decide')
r = move(fin, cid, 'approved', 'Looks complete')
check(r.status_code == 403 and 'Your role cannot approve' in r.json()['error'], 'finance (analyst) cannot approve')
fin.post('/api/onboarding/update', {'id': cid, 'risk_rating': 'high', 'assigned_to': adm2_id})
r = move(adm2, cid, 'approved', 'Looks complete')
check(r.status_code == 409 and 'Four eyes' in r.json()['error'], 'an approver who is the assigned analyst cannot decide')
check(adm2.get(f'/api/onboarding/get?id={cid}').json()['can_decide'] is False, 'no decision button for the assigned analyst')
fin.post('/api/onboarding/update', {'id': cid, 'risk_rating': 'high', 'assigned_to': fin_id})
r = move(adm2, cid, 'approved', 'Looks complete')
check(r.status_code == 409 and 'Four eyes' in r.json()['error'], 'once unassigned, the former analyst still cannot decide')
r = move(adm, cid, 'approved', '   ')
check(r.status_code == 422 and 'decision note' in r.json()['error'], 'a decision note is required')
check(sql(f'select status from onboarding_cases where id = {cid}') == 'under_review', 'still under review after every refusal')

print('== approval')
r = move(adm, cid, 'approved', 'All documents verified; PEP owner, enhanced due diligence done (test).')
check(r.status_code == 200, 'another approver approves', r.text)
row = sql(f'select status, decided_by, decision_notes is not null, next_review_date from onboarding_cases where id = {cid}').split('\t')
next_review = (today.replace(year=today.year + 1) if not (today.month == 2 and today.day == 29) else today + datetime.timedelta(days=365)).isoformat()
check(row[:3] == ['approved', str(adm_id), '1'], 'decision recorded: status, approver, note', row)
check(row[3] == next_review, 'next review in 1 year for a high-risk merchant', row)
check(sql(f'select status from merchants where id = {mid}') == 'active', 'merchant becomes active')
a = sql(f"select concat(user_email, '|', json_value(details, '$.from')) from audit_log where action = 'onboarding.approved' and entity_id = '{mid}'")
check(a == 'admin@example.com|under_review', 'approval in the audit log with who and from which state', a)

print('== approved is final')
check(move(adm, cid, 'collecting').status_code == 409, 'an approved case cannot be reopened')
check(fin.post('/api/onboarding/party-save', {'id': d1, 'full_name': 'Changed', 'roles': ['director']}).status_code == 409, 'people frozen')
check(upload(fin, cid, 'vat') is None, 'no new document')
check(fin.post('/api/onboarding/update', {'id': cid, 'risk_rating': 'low'}).status_code == 409, 'risk rating frozen')

print('== periodic review starts from the approved file')
r = fin.post('/api/onboarding/open', {'merchant_id': mid})
pid_case = r.json()['id']
pc = adm.get(f'/api/onboarding/get?id={pid_case}').json()
check(pc['case']['kind'] == 'periodic_review' and len(pc['parties']) == 3, 'review case carries the people over')
check(all(p['screening_result'] == 'pending' for p in pc['parties']), 'screening must be redone')
check(sql(f"select count(*) from kyc_documents where case_id = {pid_case} and status = 'pending'") == '9', 'accepted documents back to pending for re-confirmation')
move(fin, pid_case, 'under_review')
r = move(adm, pid_case, 'approved', 'same as last year')
check(r.status_code == 409 and 'Cannot approve yet' in r.json()['error'], 'a review cannot be approved without re-checking')

print('== rejection')
mid2 = merchant('Rejection Test Ltd')
c2 = adm.post('/api/onboarding/open', {'merchant_id': mid2}).json()['id']
adm.post('/api/onboarding/update', {'id': c2, 'assigned_to': ''})
move(adm, c2, 'under_review')
r = move(adm, c2, 'rejected', 'Out of scope')
check(r.status_code == 409 and 'Four eyes' in r.json()['error'], 'no assigned analyst: the creator counts as analyst')
fin.post('/api/onboarding/update', {'id': c2, 'assigned_to': fin_id})
check(move(fin, c2, 'rejected', 'Out of scope').status_code == 403, 'finance cannot reject')
check(move(adm, c2, 'rejected', 'Out of scope').status_code == 409, 'the creator still cannot decide after handing the case over')
check(move(adm2, c2, 'rejected', '').status_code == 422, 'a rejection needs a note')
r = move(adm2, c2, 'rejected', 'Activity outside our risk appetite (test).')
check(r.status_code == 200 and sql(f'select status from onboarding_cases where id = {c2}') == 'rejected', 'rejected with a note, no blocker needed')
check(move(adm, c2, 'under_review').status_code == 409, 'a rejected case is final')
check(sql(f'select status from merchants where id = {mid2}') == 'onboarding', 'rejected merchant not activated')

print('== four eyes cannot be bypassed by reassigning the case')
mid3 = merchant('Bypass Test Ltd')
c3 = adm2.post('/api/onboarding/open', {'merchant_id': mid3}).json()['id']
move(adm2, c3, 'under_review')
r = adm2.post('/api/onboarding/update', {'id': c3, 'assigned_to': fin_id})
check(r.status_code == 200, 'the analyst (an admin) hands the case to a colleague')
r = move(adm2, c3, 'rejected', 'Self-decision attempt (test).')
check(r.status_code == 409 and 'Four eyes' in r.json().get('error', ''), 'the former analyst still cannot decide the case', r.text)
mid4 = merchant('Reassign Test Ltd')
c4 = fin.post('/api/onboarding/open', {'merchant_id': mid4}).json()['id']
move(fin, c4, 'under_review')
adm2.post('/api/onboarding/update', {'id': c4, 'assigned_to': fin_id})
adm2.post('/api/onboarding/update', {'id': c4, 'assigned_to': adm_id})
adm2.post('/api/onboarding/update', {'id': c4, 'assigned_to': fin_id})
check(move(adm2, c4, 'rejected', 'Reassigner decision attempt (test).').status_code == 409, 'whoever reassigned the case cannot decide it either')
check(move(adm, c4, 'rejected', 'Former assignee attempt (test).').status_code == 409, 'nor anyone it was assigned to along the way')
check(sql(f'select count(*) from onboarding_case_handlers where case_id = {c4}') == '3', 'handlers recorded: creator, assignees, reassigner')
r = move(adm, c3, 'rejected', 'Decided by an independent approver (test).')
check(r.status_code == 200, 'an approver who never handled the case can decide', r.text)

finish()
