"""Shared helpers for the end-to-end tests (see tests/README.md)."""
import base64, hashlib, hmac, quopri, re, struct, subprocess, sys, time, os
import requests

B = os.environ.get('BASE_URL', 'http://127.0.0.1:8099')
MAIL = os.environ['MAIL_FILE']
APP_DIR = os.environ['APP_DIR']
DB = os.environ.get('DB_NAME', 'mips_test')
UA = 'portal-test/1.0'
FILES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
RESULT = {'ok': 0, 'fail': 0}


def check(cond, label, extra=''):
    if cond:
        RESULT['ok'] += 1
        print('  PASS', label)
    else:
        RESULT['fail'] += 1
        print('  FAIL', label, extra)


def finish():
    print(f"\n{RESULT['ok']} passed, {RESULT['fail']} failed")
    sys.exit(1 if RESULT['fail'] else 0)


def sql(q):
    return subprocess.run((os.environ.get('MYSQL', 'mysql').split() + ['-N', DB, '-e', q]), capture_output=True, text=True).stdout.strip()


class Client:
    def __init__(self, page):
        self.s = requests.Session()
        self.s.headers['User-Agent'] = UA
        self.page = page
        self.refresh()

    def refresh(self, page=None):
        html = self.s.get(B + (page or self.page)).text
        m = re.search(r'csrf-token" content="([^"]+)', html)
        self.token = m.group(1) if m else None
        return html

    def post(self, path, body=None, files=None, data=None):
        h = {'X-CSRF-Token': self.token or '', 'Accept': 'application/json'}
        if files is not None:
            r = self.s.post(B + path, headers=h, files=files, data=data or {})
        else:
            r = self.s.post(B + path, headers=h, json=body or {})
        return r

    def get(self, path):
        return self.s.get(B + path, headers={'Accept': 'application/json'})


def totp(secret, step=None):
    key = base64.b32decode(secret + '=' * (-len(secret) % 8))
    step = step if step is not None else int(time.time()) // 30
    h = hmac.new(key, struct.pack('>Q', step), hashlib.sha1).digest()
    o = h[19] & 15
    v = ((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 10 ** 6
    return '%06d' % v


def mails_to(addr):
    if not os.path.exists(MAIL):
        return []
    out = []
    for m in open(MAIL).read().split('\n=====\n'):
        if re.search(r'^To: .*' + re.escape(addr), m, re.M | re.I):
            out.append(quopri.decodestring(m.encode()).decode(errors='replace'))
    return out


def last_link(addr, page):
    for m in reversed(mails_to(addr)):
        x = re.search(r'/portal/' + page + r'\?token=([A-Za-z0-9_-]{43})', m)
        if x:
            return x.group(1)
    return None


def wait_next_step():
    time.sleep(31 - time.time() % 30)


