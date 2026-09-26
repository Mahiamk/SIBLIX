"""
test_mailbox_ingestion.py — end-to-end test for connecting a real mailbox.

Runs a throwaway IMAP4-over-SSL server (tests/fake_imap_server.py) and drives
the real imaplib client path through the actual API: connect, test, sync,
incremental sync, per-user isolation and disconnect — including that fetched
mail lands in the pipeline and produces a real verdict.

    python3 tests/test_mailbox_ingestion.py

Needs requirements.txt installed (fastapi/sqlmodel/cryptography) and openssl
on PATH for the throwaway certificate.
"""
import os, sys, ssl, tempfile, shutil, json
BE=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE=tempfile.mkdtemp()
os.makedirs(f"{STORE}/inbox"); os.makedirs(f"{STORE}/attachments"); os.makedirs(f"{STORE}/reports")
db=tempfile.mktemp(suffix=".db")
os.environ.update(DATABASE_URL="sqlite:///"+db, STORAGE_ROOT=STORE,
                  AUTH_SECRET="mail-test-secret")
os.environ.pop("DISABLE_AUTH",None)
sys.path.insert(0,BE); sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))

# trust the fake server's self-signed cert
_orig = ssl.create_default_context
ssl.create_default_context = lambda *a, **k: (lambda c: (setattr(c,'check_hostname',False), setattr(c,'verify_mode',ssl.CERT_NONE), c)[-1])(_orig(*a,**k))

from fake_imap_server import FakeIMAP
from email.message import EmailMessage

def build(subject, body, atts=()):
    m=EmailMessage(); m["From"]="Willy Situmorang <willy@april.com>"
    m["To"]="ops@example.com"; m["Subject"]=subject
    m["Date"]="Mon, 22 Sep 2026 09:14:00 +0800"; m["Message-ID"]="<x@april.com>"
    m.set_content(body)
    for name,data in atts:
        m.add_attachment(data, maintype="text", subtype="plain", filename=name)
    return m.as_bytes()

SI=open(f"{BE}/storage/attachments/email_004_SI.txt","rb").read()
BL=open(f"{BE}/storage/attachments/email_004_BL.txt","rb").read()

msgs={
 101: build("TO CONFIRM DOCS _ 5RSG-00133 _ CALLAO_PERU _ MEDUUD104332",
            "Hi,\n\nAttached are the SI and draft BL. Please check the details and confirm.\n\nRegards",
            [("email_SI.txt",SI),("email_BL.txt",BL)]),
 102: build("Congratulations! You have won a $1000 gift card - claim now",
            "Click here to claim now! Bitcoin guaranteed returns."),
 103: build("Invoice query - missing GR for local charges",
            "Please advise on the total freight and D&D charges on this invoice."),
}
srv=FakeIMAP(msgs); srv.start()
HOST,PORT="127.0.0.1",srv.port

from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import init_db
init_db()
c=TestClient(app)
ok=fail=0
def chk(n,cond,extra=""):
    global ok,fail
    if cond: ok+=1; print(f"  PASS  {n}")
    else: fail+=1; print(f"  FAIL  {n}  {extra}")

print("### account + auth")
r=c.post("/auth/register",json={"username":"mailops","password":"mailpassword1","email":"m@x.com"})
H={"Authorization":f"Bearer {r.json()['token']}"}
chk("registered",r.status_code==201)
chk("mailbox routes need auth", c.get("/email-accounts").status_code==401)
chk("providers listed", "gmail" in json.dumps(c.get("/email-accounts/providers",headers=H).json()))

print("### connecting a mailbox")
bad={"email_address":"ops@example.com","password":"WRONG","provider":"imap","imap_host":HOST,"imap_port":PORT}
r=c.post("/email-accounts",json=bad,headers=H)
chk("wrong password rejected (400)", r.status_code==400, r.text[:160])
chk("error mentions app password", "app-specific password" in r.text, r.text[:160])
chk("nothing saved on failure", c.get("/email-accounts",headers=H).json()==[])

good={"email_address":"ops@example.com","password":"app-password","provider":"imap","imap_host":HOST,"imap_port":PORT}
r=c.post("/email-accounts/test",json=good,headers=H)
chk("test endpoint works", r.status_code==200 and r.json().get("ok") is True, r.text[:160])
chk("test does not save", c.get("/email-accounts",headers=H).json()==[])

r=c.post("/email-accounts",json=good,headers=H)
chk("connect 201", r.status_code==201, r.text[:200])
acct=r.json(); aid=acct["id"]
chk("password never returned", "password" not in json.dumps(acct).lower(), json.dumps(acct))
chk("duplicate mailbox rejected", c.post("/email-accounts",json=good,headers=H).status_code==409)

print("### password at rest")
from sqlmodel import Session, select
from app.database.connection import engine
from app.models.email_account import EmailAccount
with Session(engine) as s:
    row=s.exec(select(EmailAccount)).first()
    chk("password encrypted at rest", row.password_encrypted!="app-password", row.password_encrypted[:20])
    from app.services import secrets as sb
    chk("decrypts back for IMAP replay", sb.decrypt(row.password_encrypted)=="app-password")

print("### sync -> pipeline")
r=c.post(f"/email-accounts/{aid}/sync",headers=H)
chk("sync 200", r.status_code==200, r.text[:250])
body=r.json(); chk("imported 3 messages", body["imported"]==3, json.dumps(body)[:200])
chk("inbox json written", len(os.listdir(f"{STORE}/inbox"))==3, os.listdir(f"{STORE}/inbox"))
chk("attachments saved", len(os.listdir(f"{STORE}/attachments"))==2, os.listdir(f"{STORE}/attachments"))

r=c.get("/emails?limit=50",headers=H); rows=r.json()
byid={e["email_id"]:e for e in rows}
chk("emails in DB", len(rows)==3, len(rows))
cats={e["email_id"]:e.get("category") for e in rows}
chk("BL_COMPARISON classified", cats.get(f"mail_{aid}_101")=="BL_COMPARISON", cats)
chk("SPAM classified", cats.get(f"mail_{aid}_102")=="SPAM", cats)
chk("INVOICE_QUERY classified", cats.get(f"mail_{aid}_103")=="INVOICE_QUERY", cats)
st={e["email_id"]:e.get("status") for e in rows}
chk("real mail produced a MISMATCH verdict", st.get(f"mail_{aid}_101")=="MISMATCH", st)

r=c.get(f"/comparison/mail_{aid}_101",headers=H)
chk("comparison persisted for fetched mail", r.status_code==200 and r.json()["has_defect"] is True, r.text[:200])
chk("defect fields match the planted ones",
    sorted(r.json()["defect_fields"])==["consignee","notify_party"], r.text[:200])

print("### incremental sync")
r=c.post(f"/email-accounts/{aid}/sync",headers=H)
chk("second sync imports nothing new", r.json()["imported"]==0, r.text[:200])
srv.messages[104]=build("SI needed - request SI for booking","Please find shipping instruction attached.")
r=c.post(f"/email-accounts/{aid}/sync",headers=H)
chk("new message picked up", r.json()["imported"]==1, r.text[:200])
chk("total_imported tracked", r.json()["account"]["total_imported"]==4, r.text[:200])

print("### isolation between users")
r2=c.post("/auth/register",json={"username":"otheruser","password":"otherpassword1"})
H2={"Authorization":f"Bearer {r2.json()['token']}"}
chk("other user sees no mailboxes", c.get("/email-accounts",headers=H2).json()==[])
chk("other user cannot sync it", c.post(f"/email-accounts/{aid}/sync",headers=H2).status_code==404)
chk("other user cannot delete it", c.delete(f"/email-accounts/{aid}",headers=H2).status_code==404)

print("### disconnect")
chk("disconnect 200", c.delete(f"/email-accounts/{aid}",headers=H).status_code==200)
chk("mailbox gone", c.get("/email-accounts",headers=H).json()==[])
chk("imported emails retained", len(c.get("/emails?limit=50",headers=H).json())==4)

print(f"\n{ok} passed, {fail} failed")
shutil.rmtree(STORE,ignore_errors=True); os.unlink(db)
sys.exit(1 if fail else 0)
