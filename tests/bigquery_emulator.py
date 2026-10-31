"""Local stand-in for the BigQuery REST API and Google's OAuth token endpoint (tests only).

    python3 bigquery_emulator.py PUBLIC_KEY.pem ROWS.csv LOG PORT TABLE

Rejects what the real service would reject: a JWT with a bad signature or
claims, a wrong bearer token, legacy SQL, a query without named parameters or
cost cap, an unknown table. Serves rows from a CSV whose date_transaction is
Mauritius local time, exposed as a TIMESTAMP (epoch seconds), booleans as
"true"/"false", NULLs as null. The first answer is jobComplete=false, then
results come in pages of PAGE rows, so polling and paging are exercised.
"""
import base64, csv, datetime, json, re, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

PUB = serialization.load_pem_public_key(open(sys.argv[1], 'rb').read())
ROWS_CSV, LOG_PATH, PORT, TABLE = sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
LOG = open(LOG_PATH, 'a')
PAGE = 2
TOKEN = 'ya29.test-token'
AUD = f'http://127.0.0.1:{PORT}/token'
MU = datetime.timezone(datetime.timedelta(hours=4))
jobs = {}

FIELDS = [('date_transaction', 'TIMESTAMP'), ('form_name', 'STRING'), ('form_nickname', 'STRING'), ('sof_proc_nickname', 'STRING'),
          ('somme_totale', 'FLOAT'), ('symbole_monnaie', 'STRING'), ('is_for_till_id', 'STRING'), ('fi_name', 'STRING'),
          ('last_transaction_status', 'STRING'), ('est_test', 'BOOLEAN'), ('is_test_order', 'BOOLEAN'), ('refund_total_refunded', 'FLOAT')]


def b64d(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def load_rows():
    out = []
    for r in csv.DictReader(open(ROWS_CSV)):
        local = datetime.datetime.strptime(r['date_transaction'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=MU)
        vals = []
        for name, typ in FIELDS:
            v = r.get(name, '')
            if name == 'date_transaction':
                v = '%.6E' % local.timestamp()     # BigQuery style: "1.7923068E9"
            elif typ == 'BOOLEAN':
                v = 'true' if v in ('1', 'True', 'true') else 'false'
            elif v == '':
                v = None
            vals.append({'v': v})
        out.append((local.date(), {'f': vals}))
    return out


ROWS = load_rows()


def log(line):
    LOG.write(line + '\n')
    LOG.flush()


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def authed(self):
        if self.headers.get('Authorization') != 'Bearer ' + TOKEN:
            self.send(401, {'error': {'message': 'Request had invalid authentication credentials.'}})
            return False
        return True

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if self.path == '/token':
            return self.token(parse_qs(body.decode()))
        m = re.match(r'^/bigquery/v2/projects/([^/]+)/queries$', self.path)
        if m and self.authed():
            q = json.loads(body)
            log('QUERY project=%s sql=%s params=%s maxBytes=%s legacy=%s' % (
                m.group(1), q['query'], json.dumps(q.get('queryParameters')), q.get('maximumBytesBilled'), q.get('useLegacySql')))
            if q.get('useLegacySql') is not False or 'maximumBytesBilled' not in q or '@start' not in q['query'] \
                    or q.get('parameterMode') != 'NAMED':
                return self.send(400, {'error': {'message': 'test emulator: unsafe query'}})
            if f'FROM `{TABLE}`' not in q['query']:
                return self.send(404, {'error': {'message': 'Not found: Table'}})
            p = {x['name']: x['parameterValue']['value'] for x in q['queryParameters']}
            if p.get('tz') != 'Indian/Mauritius':
                return self.send(400, {'error': {'message': 'test emulator: unexpected time zone'}})
            start, end = datetime.date.fromisoformat(p['start']), datetime.date.fromisoformat(p['end'])
            rows = [r for d, r in ROWS if start <= d <= end]
            jid = 'job_%d' % (len(jobs) + 1)
            jobs[jid] = {'rows': rows, 'polled': 0}
            return self.send(200, {'kind': 'bigquery#queryResponse', 'jobComplete': False,
                                   'jobReference': {'projectId': m.group(1), 'jobId': jid, 'location': 'asia-south1'}})
        if m is None:
            self.send(404, {'error': {'message': 'not found'}})

    def token(self, q):
        if q.get('grant_type', [''])[0] != 'urn:ietf:params:oauth:grant-type:jwt-bearer' or 'assertion' not in q:
            return self.send(400, {'error': 'unsupported_grant_type'})
        try:
            h, p, s = q['assertion'][0].split('.')
            PUB.verify(b64d(s), (h + '.' + p).encode(), padding.PKCS1v15(), hashes.SHA256())
            c, hd = json.loads(b64d(p)), json.loads(b64d(h))
        except Exception:
            log('TOKEN rejected: bad signature')
            return self.send(400, {'error': 'invalid_grant', 'error_description': 'Invalid JWT Signature.'})
        ok = hd.get('alg') == 'RS256' and c.get('aud') == AUD and str(c.get('scope', '')).endswith('bigquery.readonly') \
            and 0 < c.get('exp', 0) - c.get('iat', 0) <= 3600
        log('TOKEN ok=%s iss=%s scope=%s' % (ok, c.get('iss'), c.get('scope')))
        if not ok:
            return self.send(400, {'error': 'invalid_grant'})
        self.send(200, {'access_token': TOKEN, 'expires_in': 3599, 'token_type': 'Bearer'})

    def do_GET(self):
        u = urlparse(self.path)
        m = re.match(r'^/bigquery/v2/projects/([^/]+)/queries/([^/]+)$', u.path)
        if m and self.authed():
            j = jobs.get(m.group(2))
            if j is None:
                return self.send(404, {'error': {'message': 'Not found: Job'}})
            q = parse_qs(u.query)
            j['polled'] += 1
            if j['polled'] == 1:   # still running on first poll
                return self.send(200, {'jobReference': {'jobId': m.group(2), 'location': 'asia-south1'}, 'jobComplete': False})
            off = int(q.get('pageToken', ['0'])[0])
            page = j['rows'][off:off + PAGE]
            res = {'jobComplete': True, 'schema': {'fields': [{'name': n, 'type': t, 'mode': 'NULLABLE'} for n, t in FIELDS]},
                   'totalRows': str(len(j['rows'])), 'rows': page, 'jobReference': {'jobId': m.group(2)}}
            if off + PAGE < len(j['rows']):
                res['pageToken'] = str(off + PAGE)
            log('PAGE job=%s offset=%d rows=%d' % (m.group(2), off, len(page)))
            return self.send(200, res)
        if m is None:
            self.send(404, {'error': {'message': 'not found'}})


ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
