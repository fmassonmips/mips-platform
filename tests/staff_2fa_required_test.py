"""Mandatory two-factor authentication for staff roles (security.require_2fa_roles).

The test configuration switches the rule off so that the other suites can sign
in with a password only. This suite switches it on, as in production
(['admin', 'finance']), in the throw-away copy of the application, and puts the
test value back at the end, whatever happens. PHP runs without opcache, so the
change applies from the next request.
Accounts created here: fin2fa@, admin2fa@ (fictitious). Same environment as portal_test.py.
"""
import os

from helpers import APP_DIR, B, Client, check, finish, sql, totp

CONFIG = os.path.join(APP_DIR, 'config', 'config.php')
OFF = "'require_2fa_roles'   => []"
ON = "'require_2fa_roles'   => ['admin', 'finance']"
MODULES = ['/api/reports/periods', '/api/billing/fee-rules', '/api/recon/runs', '/api/merchants/list', '/api/onboarding/list']


def set_rule(on):
    s = open(CONFIG).read()
    old, new = (OFF, ON) if on else (ON, OFF)
    if old in s:
        open(CONFIG, 'w').write(s.replace(old, new, 1))


def add_user(email, role):
    sql(f"insert into users (email, password_hash, name, role, is_active, activated_at) select '{email}', password_hash, "
        f"'2FA Test', '{role}', 1, now() from users where email = 'admin@example.com'")
    return int(sql(f"select id from users where email = '{email}'"))


def login(email):
    c = Client('/login.php')
    r = c.post('/api/auth/login', {'email': email, 'password': 'Admin123!'})
    c.refresh('/account.php')
    return c, r


def enrol(c):
    secret = c.post('/api/account/2fa-setup').json()['secret']
    return c.post('/api/account/2fa-enable', {'code': totp(secret)}).json()['recovery_codes']


fin_id = add_user('fin2fa@example.com', 'finance')
adm_id = add_user('admin2fa@example.com', 'admin')
set_rule(True)
try:
    print('== finance without 2FA: password accepted, every module closed')
    fin, r = login('fin2fa@example.com')
    check(r.status_code == 200 and r.json().get('success'), 'password step succeeds (enrolment happens after sign-in)')
    st = fin.get('/api/account/status').json()
    check(st['two_factor_required'] is True and st['two_factor_enabled'] is False, 'account page reports 2FA as required and missing')
    for path in MODULES:
        r = fin.get(path)
        check(r.status_code == 403 and r.json().get('redirect') == '/account.php', f'refused until enrolment: {path}', r.text[:120])
    r = fin.s.get(B + '/reports.php', allow_redirects=False)
    check(r.status_code == 302 and r.headers.get('Location') == '/account.php?enroll=1', 'pages redirect to the enrolment screen')
    r = fin.s.get(B + '/account.php')
    check(r.status_code == 200 and 'Your role requires two-factor authentication' in r.text, 'enrolment screen reachable, with the reason shown')

    print('== admin without 2FA: same rule')
    adm, _ = login('admin2fa@example.com')
    check(adm.get('/api/admin/users').status_code == 403 and adm.get('/api/audit/list').status_code == 403, 'user admin and audit log closed too')
    old, _ = login('admin@example.com')
    check(old.get('/api/admin/users').status_code == 403, 'existing admin accounts without 2FA are caught as well')

    print('== after enrolment')
    codes = enrol(fin)
    check(len(codes) >= 8, 'finance enrols')
    check(all(fin.get(p).status_code == 200 for p in MODULES), 'modules open once 2FA is on')
    r = fin.post('/api/account/2fa-disable', {'password': 'Admin123!', 'code': codes[0]})
    check(r.status_code == 409 and 'role requires' in r.json()['error'], 'a required 2FA cannot be switched off by its owner')
    c = Client('/login.php')
    r = c.post('/api/auth/login', {'email': 'fin2fa@example.com', 'password': 'Admin123!'})
    check(r.json() == {'two_factor_required': True}, 'next sign-in asks for the second factor')
    check(c.post('/api/auth/2fa', {'code': codes[1]}).status_code == 200 and c.get(MODULES[0]).status_code == 200, 'signed in with the second factor')

    print('== administrator removes the 2FA (lost phone)')
    enrol(adm)
    check(adm.post('/api/admin/user-reset-2fa', {'id': fin_id}).status_code == 200, 'admin resets the finance user 2FA')
    r = fin.get(MODULES[0])
    check(r.status_code == 403 and r.json().get('redirect') == '/account.php', 'open session closed to modules at once: re-enrolment required')

    print('== role change')
    viewer, _ = login('viewer@example.com')
    check(viewer.get('/api/account/status').json()['two_factor_required'] is False, 'role user: 2FA not required')
    vid = int(sql("select id from users where email = 'viewer@example.com'"))
    check(adm.post('/api/admin/user-update', {'id': vid, 'role': 'finance'}).status_code == 200, 'viewer promoted to finance')
    r = viewer.get(MODULES[0])
    check(r.status_code == 403 and r.json().get('redirect') == '/account.php', 'promoted without 2FA: blocked at the next request')
    adm.post('/api/admin/user-update', {'id': vid, 'role': 'user'})
    check(sql(f'select role from users where id = {vid}') == 'user', 'viewer restored')
finally:
    set_rule(False)

print('== rule switched back off for the other suites')
c, _ = login('admin@example.com')
check(c.get('/api/admin/users').status_code == 200, 'test configuration restored')

finish()
