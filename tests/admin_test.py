"""Staff accounts and administration: registration and activation, roles, the
administrator safeguards, reset links, forgotten password, password change,
two-factor authentication (TOTP and recovery codes), admin 2FA reset, audit
log viewer and sign-in rate limiting.

Run it last: the rate-limit section deliberately locks sign-in from 127.0.0.1.
The test config sets security.require_2fa_roles to [] so test staff can sign in
without 2FA; the "2FA required for admin and finance" rule is therefore NOT
exercised here. Same environment as portal_test.py.
"""
import re

from helpers import Client, check, finish, mails_to, sql, staff, totp, wait_next_step

EMAIL, PW = 'newstaff@example.com', 'Staff-Test-Pass-1'
adm = staff('admin@example.com', '/users.php')
fin = staff('fin@example.com')


def clear_attempts():
    # Every test client comes from 127.0.0.1, and failed attempts are counted per IP:
    # reset the counter after sections that fail on purpose.
    sql('delete from login_attempts')


def login(email, pw):
    c = Client('/login.php')
    r = c.post('/api/auth/login', {'email': email, 'password': pw})
    c.refresh('/account.php')
    return c, r


def last_reset_token(addr):
    for m in reversed(mails_to(addr)):
        x = re.search(r'/reset-password\.php\?token=([A-Za-z0-9_-]{43})', m)
        if x:
            return x.group(1)
    return None


def reset(token, pw):
    c = Client(f'/reset-password.php?token={token}')
    return c.post('/api/auth/reset', {'token': token, 'password': pw})


print('== access')
check(fin.get('/api/admin/users').status_code == 403, 'finance cannot manage users')
check(fin.get('/api/audit/list').status_code == 403, 'finance cannot read the audit log')
check(Client('/login.php').get('/api/admin/users').status_code == 401, 'signed-out request refused')

print('== registration and activation')
reg = Client('/register.php')
r = reg.post('/api/auth/register', {'email': EMAIL, 'name': 'New Staff', 'password': 'short'})
check(r.status_code == 422 and 'at least' in r.json()['error'], 'short password refused')
r = reg.post('/api/auth/register', {'email': 'not-an-email', 'name': 'New Staff', 'password': PW})
check(r.status_code == 422, 'invalid email refused')
r = reg.post('/api/auth/register', {'email': EMAIL, 'name': 'New Staff', 'password': PW})
check(r.status_code == 201 and 'administrator will activate' in r.json()['message'], 'account requested', r.text)
uid = int(sql(f"select id from users where email = '{EMAIL}'"))
check(sql(f'select concat(role, is_active) from users where id = {uid}') == 'user0', 'new account: role user, inactive')
r = reg.post('/api/auth/register', {'email': EMAIL, 'name': 'Someone Else', 'password': 'Other-Pass-123'})
check(r.status_code == 409 and sql(f"select name from users where id = {uid}") == 'New Staff', 'second registration cannot take over the account')
_, r = login(EMAIL, PW)
check(r.status_code == 401, 'inactive account cannot sign in')
clear_attempts()

u = adm.get('/api/admin/users?status=pending').json()
check(any(x['email'] == EMAIL and x['status'] == 'pending' for x in u['users']) and u['pending'] >= 1, 'listed as pending')
check(u['roles'] == ['user', 'finance', 'admin'], 'roles offered')
check(adm.get('/api/admin/users?status=nope').status_code == 422, 'invalid status filter refused')
check([x['email'] for x in adm.get('/api/admin/users?q=newstaff').json()['users']] == [EMAIL], 'search by email')

check(adm.post('/api/admin/user-update', {'id': uid}).status_code == 422, 'nothing to update refused')
check(adm.post('/api/admin/user-update', {'id': uid, 'role': 'root'}).status_code == 422, 'unknown role refused')
check(adm.post('/api/admin/user-update', {'id': 999999, 'is_active': True}).status_code == 404, 'unknown user answers 404')
check(fin.post('/api/admin/user-update', {'id': uid, 'is_active': True}).status_code == 403, 'finance cannot activate accounts')
r = adm.post('/api/admin/user-update', {'id': uid, 'is_active': True, 'role': 'finance'})
check(r.status_code == 200, 'admin activates the account as finance')
check(any('account is active' in m for m in mails_to(EMAIL)), 'activation email sent')
mails_before = len(mails_to(EMAIL))

staff_c, r = login(EMAIL, PW)
check(r.status_code == 200 and r.json()['user']['role'] == 'finance', 'activated account signs in')
check(staff_c.get('/api/reports/periods').status_code == 200 and staff_c.get('/api/admin/users').status_code == 403,
      'finance role: reporting yes, user admin no')

print('== administrator safeguards')
admin_id = int(sql("select id from users where email = 'admin@example.com'"))
r = adm.post('/api/admin/user-update', {'id': admin_id, 'role': 'finance'})
check(r.status_code == 409 and 'your own account' in r.json()['error'], 'an admin cannot demote themselves')
r = adm.post('/api/admin/user-update', {'id': admin_id, 'is_active': False})
check(r.status_code == 409, 'an admin cannot deactivate themselves')
check(sql(f'select concat(role, is_active) from users where id = {admin_id}') == 'admin1', 'admin unchanged')

print('== role and status changes apply on the next request')
adm.post('/api/admin/user-update', {'id': uid, 'role': 'user'})
check(staff_c.get('/api/reports/periods').status_code == 403, 'demoted: reporting closed at once, same session')
adm.post('/api/admin/user-update', {'id': uid, 'role': 'finance'})
check(staff_c.get('/api/reports/periods').status_code == 200, 'promoted back')
adm.post('/api/admin/user-update', {'id': uid, 'is_active': False})
check(staff_c.get('/api/auth/me').status_code == 401, 'deactivated: session ends at once')
_, r = login(EMAIL, PW)
check(r.status_code == 401, 'deactivated account cannot sign in')
clear_attempts()
adm.post('/api/admin/user-update', {'id': uid, 'is_active': True})
check(len(mails_to(EMAIL)) == mails_before, 'reactivation sends no new activation email')
acts = sql(f"select group_concat(action order by id) from audit_log where entity_type = 'user' and entity_id = '{uid}' and action like 'user.%'")
check(acts == 'user.activate,user.role_change,user.role_change,user.role_change,user.deactivate,user.reactivate', 'each change audited', acts)

print('== reset link from an administrator')
staff_c, _ = login(EMAIL, PW)
r = adm.post('/api/admin/user-reset-link', {'id': uid})
url = r.json().get('url', '')
token = url.split('token=')[-1]
check(r.status_code == 200 and len(token) == 43 and r.json()['minutes'] == 60, 'single-use link shown once to the admin', r.text)
check(sql(f"select count(*) from password_resets where token_hash = sha2('{token}', 256)") == '1', 'only the token hash is stored')
r = reset(token, 'short')
check(r.status_code == 422, 'weak new password refused, link not consumed')
PW2 = 'Staff-Test-Pass-2'
r = reset(token, PW2)
check(r.status_code == 200, 'password reset through the link')
check(reset(token, 'Staff-Test-Pass-3').status_code == 410, 'link cannot be used twice')
check(staff_c.get('/api/auth/me').status_code == 401, 'reset ends the sessions opened with the old password')
_, r = login(EMAIL, PW)
check(r.status_code == 401, 'old password no longer works')
clear_attempts()
_, r = login(EMAIL, PW2)
check(r.status_code == 200, 'new password works')

print('== forgotten password')
anon = Client('/forgot-password.php')
n = len(mails_to('nobody@example.com'))
r1 = anon.post('/api/auth/forgot', {'email': 'nobody@example.com'})
r2 = anon.post('/api/auth/forgot', {'email': EMAIL})
check(r1.status_code == r2.status_code == 200 and r1.json() == r2.json(), 'same answer whether the account exists or not')
check(len(mails_to('nobody@example.com')) == n, 'no email to an unknown address')
t1 = last_reset_token(EMAIL)
anon.post('/api/auth/forgot', {'email': EMAIL})
t2 = last_reset_token(EMAIL)
check(t1 and t2 and t1 != t2, 'reset link emailed')
check(reset(t1, 'Staff-Test-Pass-4').status_code == 410, 'a new request cancels the previous link')
check(reset('x' * 43, 'Staff-Test-Pass-4').status_code == 410, 'forged token refused')
PW3 = 'Staff-Test-Pass-5'
check(reset(t2, PW3).status_code == 200, 'latest link works')
clear_attempts()

print('== password change')
me, _ = login(EMAIL, PW3)
other, _ = login(EMAIL, PW3)
check(me.post('/api/account/password', {'current_password': 'wrong-password', 'new_password': 'Staff-Test-Pass-6'}).status_code == 422,
      'wrong current password refused')
check(me.post('/api/account/password', {'current_password': PW3, 'new_password': PW3}).status_code == 422, 'same password refused')
check(me.post('/api/account/password', {'current_password': PW3, 'new_password': 'short'}).status_code == 422, 'short password refused')
PW4 = 'Staff-Test-Pass-6'
r = me.post('/api/account/password', {'current_password': PW3, 'new_password': PW4})
check(r.status_code == 200, 'password changed')
check(me.get('/api/account/status').status_code == 200, 'current session kept')
check(other.get('/api/account/status').status_code == 401, 'other sessions signed out')

print('== two-factor authentication')
me.refresh('/account.php')
st = me.get('/api/account/status').json()
check(st['two_factor_enabled'] is False and st['two_factor_required'] is False and st['app_key_configured'] is True, 'status before 2FA')
secret = me.post('/api/account/2fa-setup').json().get('secret', '')
check(len(secret) >= 16, 'setup returns a secret')
check(me.post('/api/account/2fa-enable', {'code': '000000'}).status_code == 422, 'wrong code refused')
r = me.post('/api/account/2fa-enable', {'code': totp(secret)})
codes = r.json().get('recovery_codes', [])
check(r.status_code == 200 and len(codes) >= 8, 'enabled, recovery codes shown once', r.text)
check(me.post('/api/account/2fa-setup').status_code == 409, 'setup refused once enabled')
check(sql(f"select count(*) from users where id = {uid} and totp_secret is not null and instr(totp_secret, '{secret}') = 0") == '1',
      'secret encrypted at rest')

c = Client('/login.php')
r = c.post('/api/auth/login', {'email': EMAIL, 'password': PW4})
check(r.json() == {'two_factor_required': True}, 'password alone no longer signs in')
check(c.get('/api/auth/me').status_code == 401, 'no session before the second factor')
check(c.post('/api/auth/2fa', {'code': '123456'}).status_code == 401, 'wrong code refused')
check(c.post('/api/auth/2fa', {'code': totp(secret)}).status_code == 401, 'code already used at activation cannot be replayed')
wait_next_step()
r = c.post('/api/auth/2fa', {'code': totp(secret)})
check(r.status_code == 200 and c.get('/api/auth/me').status_code == 200, 'next code signs in')
check(Client('/login.php').post('/api/auth/2fa', {'code': totp(secret)}).json().get('restart') is True,
      'second step without the password step refused')

c = Client('/login.php')
c.post('/api/auth/login', {'email': EMAIL, 'password': PW4})
r = c.post('/api/auth/2fa', {'code': codes[0]})
check(r.status_code == 200 and r.json()['recovery_codes_left'] == len(codes) - 1, 'recovery code signs in, remaining count shown')
c = Client('/login.php')
c.post('/api/auth/login', {'email': EMAIL, 'password': PW4})
check(c.post('/api/auth/2fa', {'code': codes[0]}).status_code == 401, 'a recovery code works once')

me.refresh('/account.php')
check(me.post('/api/account/recovery-codes', {'password': 'wrong-password'}).status_code == 422, 'new codes need the password')
new_codes = me.post('/api/account/recovery-codes', {'password': PW4}).json()['recovery_codes']
c = Client('/login.php')
c.post('/api/auth/login', {'email': EMAIL, 'password': PW4})
check(c.post('/api/auth/2fa', {'code': codes[1]}).status_code == 401, 'old codes void after regeneration')
check(me.post('/api/account/2fa-disable', {'password': PW4, 'code': '000000'}).status_code == 422, 'disabling needs a valid code')
check(me.post('/api/account/2fa-disable', {'password': 'wrong-password', 'code': new_codes[0]}).status_code == 422, 'and the password')
check(me.post('/api/account/2fa-disable', {'password': PW4, 'code': new_codes[0]}).status_code == 200, '2FA disabled by its owner')
clear_attempts()

print('== administrator resets 2FA (lost phone)')
secret = me.post('/api/account/2fa-setup').json()['secret']
me.post('/api/account/2fa-enable', {'code': totp(secret)})
check(adm.post('/api/admin/user-reset-2fa', {'id': admin_id}).status_code == 409, 'an admin cannot reset their own 2FA from here')
check(fin.post('/api/admin/user-reset-2fa', {'id': uid}).status_code == 403, 'finance cannot reset 2FA')
check(adm.post('/api/admin/user-reset-2fa', {'id': uid}).status_code == 200, 'admin removes the 2FA')
_, r = login(EMAIL, PW4)
check(r.status_code == 200 and 'user' in r.json(), 'signs in with the password again, then must re-enrol')
check(sql(f'select count(*) from recovery_codes where user_id = {uid}') == '0', 'recovery codes removed with it')

print('== audit log viewer')
a = adm.get('/api/audit/list?action=user.').json()
check(a['total'] >= 7 and a['per_page'] == 50 and all(e['action'].startswith('user.') for e in a['entries']), 'filter by action prefix')
a = adm.get(f'/api/audit/list?entity_type=user&entity_id={uid}').json()
check(a['total'] >= 10 and all(e['entity_id'] == str(uid) for e in a['entries']), 'filter by entity')
a = adm.get(f'/api/audit/list?user={EMAIL}&action=account.').json()
check({'account.password_change', 'account.2fa_enable', 'account.2fa_disable', 'account.recovery_codes_regenerate'} <= {e['action'] for e in a['entries']},
      'account security actions logged under the user', [e['action'] for e in a['entries']])
check(adm.get('/api/audit/list?from=2026-02-30').status_code == 422, 'invalid date refused')
a = adm.get('/api/audit/list?from=2000-01-01&to=2000-01-01').json()
check(a['total'] == 0, 'date window applied')
check(adm.get('/api/audit/list?action=auth.login_failed').json()['total'] >= 2, 'failed sign-ins logged')
p2 = adm.get('/api/audit/list?page=2').json()
p1 = adm.get('/api/audit/list?page=1').json()
check(p1['total'] > 50 and len(p1['entries']) == 50 and p2['entries'][0]['id'] < p1['entries'][-1]['id'], 'paged, newest first')
leak = sql("select count(*) from audit_log where details like '%Staff-Test-Pass%' or details like '%Admin123%'")
check(leak == '0', 'no password ever written to the audit log')

print('== sign-in rate limiting (keep last)')
for i in range(5):
    Client('/login.php').post('/api/auth/login', {'email': 'nobody@example.com', 'password': 'Wrong-Pass-123'})
_, r = login('nobody@example.com', 'Wrong-Pass-123')
check(r.status_code == 429, 'sixth failed attempt blocked')
_, r = login('admin@example.com', 'Admin123!')
check(r.status_code == 429, 'the block is per IP: a valid account from the same address is blocked too (see README)')
check(adm.get('/api/audit/list?action=auth.rate_limited').json()['total'] >= 2, 'blocked attempts logged')
clear_attempts()
_, r = login('admin@example.com', 'Admin123!')
check(r.status_code == 200, 'sign-in open again once the window is cleared')

finish()
