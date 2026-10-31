"""Minimal SMTP sink for tests: appends every message to the file given as first argument (port: second argument, default 2525)."""
import socketserver, sys
class H(socketserver.StreamRequestHandler):
    def handle(self):
        w=lambda s:self.wfile.write((s+"\r\n").encode())
        w("220 sink"); data=False; buf=[]
        for raw in self.rfile:
            line=raw.decode(errors='replace').rstrip("\r\n")
            if data:
                if line==".":
                    data=False; open(sys.argv[1],'a').write("\n".join(buf)+"\n=====\n"); buf=[]; w("250 ok")
                else: buf.append(line)
                continue
            u=line.upper()
            if u.startswith("EHLO"): w("250-sink"); w("250 AUTH LOGIN")
            elif u.startswith("DATA"): data=True; w("354 go")
            elif u.startswith("QUIT"): w("221 bye"); return
            else: w("250 ok")
socketserver.TCPServer.allow_reuse_address=True
socketserver.ThreadingTCPServer(("127.0.0.1",int(sys.argv[2]) if len(sys.argv)>2 else 2525),H).serve_forever()
