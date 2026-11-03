import socketserver, sys, os
OUT = sys.argv[1]
class H(socketserver.StreamRequestHandler):
    def handle(self):
        w = lambda s: self.wfile.write((s + "\r\n").encode())
        w("220 fake ESMTP")
        data, in_data, n = [], False, 0
        while True:
            line = self.rfile.readline()
            if not line: return
            l = line.decode().rstrip("\r\n")
            if in_data:
                if l == ".":
                    in_data = False
                    n = len(os.listdir(OUT))
                    open(os.path.join(OUT, f"{n:03d}.eml"), "w").write("\n".join(data)); data = []
                    w("250 queued"); continue
                data.append(l); continue
            cmd = l.split(" ")[0].upper()
            if cmd == "EHLO": w("250-fake\r\n250 AUTH LOGIN")
            elif cmd == "AUTH": w("334 VXNlcm5hbWU6"); self.rfile.readline(); w("334 UGFzc3dvcmQ6"); self.rfile.readline(); w("235 ok")
            elif cmd == "MAIL": w("250 ok")
            elif cmd == "RCPT": w("550 no such user" if "reject" in l else "250 ok")
            elif cmd == "DATA": in_data = True; w("354 go")
            elif cmd == "QUIT": w("221 bye"); return
            else: w("500 ?")
socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer(("127.0.0.1", 2525), H).serve_forever()
