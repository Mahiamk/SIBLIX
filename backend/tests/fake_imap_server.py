"""A minimal IMAP4rev1-over-SSL server good enough to exercise the real
imaplib client path: LOGIN, LIST, SELECT, UID SEARCH, UID FETCH, LOGOUT."""
import socket, ssl, threading, subprocess, os, tempfile

class FakeIMAP(threading.Thread):
    daemon = True
    def __init__(self, messages, user="ops@example.com", password="app-password"):
        super().__init__()
        self.messages = messages           # {uid: raw_bytes}
        self.user, self.password = user, password
        d = tempfile.mkdtemp()
        self.cert, self.key = os.path.join(d,"c.pem"), os.path.join(d,"k.pem")
        subprocess.run(["openssl","req","-x509","-newkey","rsa:2048","-nodes",
                        "-keyout",self.key,"-out",self.cert,"-days","1",
                        "-subj","/CN=localhost"],check=True,
                       stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        self.sock=socket.socket(); self.sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
        self.sock.bind(("127.0.0.1",0)); self.sock.listen(5)
        self.port=self.sock.getsockname()[1]
        self.ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); self.ctx.load_cert_chain(self.cert,self.key)
        self.stop_flag=False
    def run(self):
        while not self.stop_flag:
            try: raw,_=self.sock.accept()
            except OSError: return
            threading.Thread(target=self._serve,args=(raw,),daemon=True).start()
    def _serve(self, raw):
        try: c=self.ctx.wrap_socket(raw,server_side=True)
        except Exception: return
        f=c.makefile("rwb")
        f.write(b"* OK FakeIMAP ready\r\n"); f.flush()
        while True:
            line=f.readline()
            if not line: break
            try: text=line.decode(errors="replace").strip()
            except Exception: break
            parts=text.split(" ",2)
            if len(parts)<2: continue
            tag,cmd=parts[0],parts[1].upper()
            arg=parts[2] if len(parts)>2 else ""
            if cmd=="CAPABILITY":
                f.write(b"* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n"+tag.encode()+b" OK done\r\n")
            elif cmd=="LOGIN":
                u,_,p=arg.partition(" ")
                u,p=u.strip('"'),p.strip('"')
                if u==self.user and p==self.password:
                    f.write(tag.encode()+b" OK LOGIN completed\r\n")
                else:
                    f.write(tag.encode()+b" NO [AUTHENTICATIONFAILED] Invalid credentials\r\n")
            elif cmd=="LIST":
                f.write(b'* LIST (\\HasNoChildren) "/" "INBOX"\r\n')
                f.write(b'* LIST (\\HasNoChildren) "/" "Archive"\r\n')
                f.write(tag.encode()+b" OK LIST completed\r\n")
            elif cmd in ("SELECT","EXAMINE"):
                folder=arg.split(" ")[0].strip('"')
                if folder not in ("INBOX","Archive"):
                    f.write(tag.encode()+b" NO no such folder\r\n")
                else:
                    n=len(self.messages)
                    f.write(f"* {n} EXISTS\r\n".encode())
                    f.write(b"* OK [UIDVALIDITY 1] UIDs valid\r\n")
                    f.write(tag.encode()+b" OK [READ-ONLY] done\r\n")
            elif cmd=="UID":
                sub,_,rest=arg.partition(" ")
                sub=sub.upper()
                if sub=="SEARCH":
                    lo=1
                    import re
                    m=re.search(r"UID (\d+):",rest)
                    if m: lo=int(m.group(1))
                    hits=sorted(u for u in self.messages if u>=lo)
                    f.write(b"* SEARCH "+" ".join(str(u) for u in hits).encode()+b"\r\n")
                    f.write(tag.encode()+b" OK SEARCH completed\r\n")
                elif sub=="FETCH":
                    uid=int(rest.split(" ")[0])
                    body=self.messages.get(uid)
                    if body:
                        f.write(f"* 1 FETCH (UID {uid} RFC822 {{{len(body)}}}\r\n".encode())
                        f.write(body); f.write(b")\r\n")
                    f.write(tag.encode()+b" OK FETCH completed\r\n")
                else:
                    f.write(tag.encode()+b" BAD unknown uid cmd\r\n")
            elif cmd=="LOGOUT":
                f.write(b"* BYE\r\n"+tag.encode()+b" OK LOGOUT completed\r\n"); f.flush(); break
            else:
                f.write(tag.encode()+b" OK noop\r\n")
            f.flush()
        try: c.close()
        except Exception: pass
