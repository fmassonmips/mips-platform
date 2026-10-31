"""Fake MRA e-Invoicing API following the MRA Technical Guidelines 2023 (sections 5-6)."""
import base64, json, os, sys, uuid, secrets, datetime, struct, zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding as sympad

DIR = sys.argv[1]
USERS = {"mips-test": {"password": "S3cret!pass", "ebs": "EBS-123", "tan": "27000000"}}
priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
open(os.path.join(DIR, "mra_public_key.pem"), "wb").write(priv.public_key().public_bytes(
    serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
TOKENS = {}
counter = {"auth": 0}

def png():
    raw = b"\x00\xff\x00\x00\xff"  # 2x2 grayscale-ish row data placeholder
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", 2, 2, 8, 0, 0, 0, 0)
    data = zlib.compress(b"\x00\x00\xff\x00\xff\x00")
    return base64.b64encode(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", data) + chunk(b"IEND", b"")).decode()

def aes_ecb(key, data, enc=True):
    c = Cipher(algorithms.AES(key), modes.ECB())
    if enc:
        p = sympad.PKCS7(128).padder(); data = p.update(data) + p.finalize()
        e = c.encryptor(); return e.update(data) + e.finalize()
    d = c.decryptor(); out = d.update(data) + d.finalize()
    u = sympad.PKCS7(128).unpadder(); return u.update(out) + u.finalize()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def reply(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code)
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        if os.path.exists(os.path.join(DIR, "DOWN")):
            return self.reply(503, {"status": "ERROR"})
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        user, ebs = self.headers.get("username"), self.headers.get("ebsMraId")
        if self.path.endswith("/token-api/generate-token"):
            counter["auth"] += 1
            if user not in USERS or USERS[user]["ebs"] != ebs:
                return self.reply(400, {"status": "ERROR", "requestId": body.get("requestId"), "errors": ["Invalid Header Request"]})
            try:
                creds = json.loads(priv.decrypt(base64.b64decode(body["payload"]), padding.PKCS1v15()))
            except Exception:
                return self.reply(400, {"status": "ERROR", "errors": ["Decryption failed"]})
            if creds.get("password") != USERS[user]["password"] or creds.get("username") != user:
                return self.reply(400, {"status": "ERROR", "errors": ["Invalid User"]})
            assert creds["refreshToken"] in ("false", "true")
            client_key = base64.b64decode(creds["encryptKey"]); assert len(client_key) == 32
            session = secrets.token_bytes(32); tok = secrets.token_urlsafe(40)
            TOKENS[tok] = (user, session)
            exp = (datetime.datetime.now() + datetime.timedelta(hours=24)).strftime("%Y%m%d %H:%M:%S")
            return self.reply(200, {"responseId": "TK1", "requestId": body["requestId"], "status": "SUCCESS", "token": tok,
                "key": base64.b64encode(aes_ecb(client_key, base64.b64encode(session))).decode(), "expiryDate": exp})
        if self.path.endswith("/transmit-simulation"):
            tok = self.headers.get("token")
            if tok not in TOKENS or os.path.exists(os.path.join(DIR, "EXPIRE")):
                if os.path.exists(os.path.join(DIR, "EXPIRE")): os.remove(os.path.join(DIR, "EXPIRE")); TOKENS.clear()
                return self.reply(400, {"status": "ERROR", "errorMessages": [{"code": "ERR0050", "description": "Token sent in not valid"}]})
            for f in ("requestId", "requestDateTime", "encryptedInvoice"):
                assert body.get(f), f
            user, session = TOKENS[tok]
            try:
                invoices = json.loads(aes_ecb(session, base64.b64decode(body["encryptedInvoice"]), enc=False))
            except Exception:
                return self.reply(400, {"status": "ERROR", "errorMessages": [{"code": "ERR0200", "description": "Could not decrypt invoice data"}]})
            n = len(os.listdir(os.path.join(DIR, "received")))
            json.dump(invoices, open(os.path.join(DIR, "received", f"{n:03d}.json"), "w"), indent=1, ensure_ascii=False)
            out = []
            for inv in invoices:
                errs = []
                for f in ["invoiceCounter","transactionType","personType","invoiceTypeDesc","invoiceIdentifier","previousNoteHash",
                          "totalVatAmount","totalAmtWoVatCur","totalAmtPaid","dateTimeInvoiceIssued","seller","buyer","itemList","salesTransactions"]:
                    if f not in inv or inv[f] in (None, ""): errs.append({"code": "VAL001", "description": f + " is mandatory"})
                if inv.get("invoiceTypeDesc") == "CRN" and (not inv.get("invoiceRefIdentifier") or not inv.get("reasonStated")):
                    errs.append({"code": "VAL002", "description": "invoiceRefIdentifier and reasonStated are mandatory for CRN"})
                if inv.get("seller", {}).get("tan") != USERS[user]["tan"]:
                    errs.append({"code": "LV_ERR002", "description": "TAN of registered user does not match with TAN of seller in invoice details"})
                for it in inv.get("itemList", []):
                    if it.get("taxCode") not in ("TC01", "TC02", "TC03"): errs.append({"code": "VAL003", "description": "invalid taxCode"})
                tot = round(float(inv["totalAmtWoVatCur"]) + float(inv["totalVatAmount"]), 2)
                if abs(tot - float(inv["totalAmtPaid"])) > 0.001: errs.append({"code": "VAL004", "description": "totals mismatch"})
                if errs:
                    out.append({"invoiceIdentifier": inv.get("invoiceIdentifier"), "uuid": None, "qrCode": None, "status": "ERROR", "errorMessages": errs})
                else:
                    out.append({"invoiceIdentifier": inv["invoiceIdentifier"], "uuid": str(uuid.uuid4()), "qrCode": png(), "status": "SUCCESS", "errorMessages": None})
            st = "SUCCESS" if all(o["status"] == "SUCCESS" for o in out) else "ERROR"
            return self.reply(200, {"responseId": "R1", "requestId": body["requestId"], "status": st, "environment": "SANDBOX", "fiscalisedInvoices": out})
        self.reply(404, {})

os.makedirs(os.path.join(DIR, "received"), exist_ok=True)
ThreadingHTTPServer(("127.0.0.1", 8098), H).serve_forever()
