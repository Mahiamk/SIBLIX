"""
mailbox.py — live mailbox ingestion over IMAP.

Lets a user point the platform at a real inbox instead of the bundled
dataset. Messages are converted into exactly the record shape the existing
pipeline already consumes:

    {"email_id", "from", "subject", "body", "attachments": [relative paths]}

and written to storage/inbox/<email_id>.json with attachments saved under
storage/attachments/, so classification, extraction, comparison and the
decision engine run unchanged — a fetched email and a dataset email are the
same thing by the time the pipeline sees them.

IMAP (imaplib/email, both stdlib) rather than a provider API: it works with
Gmail, Outlook/Microsoft 365, Yahoo, iCloud and any corporate server without
per-provider OAuth client registration. Gmail and iCloud require an
app-specific password when 2FA is on, which is what we prompt for.
"""
import imaplib
import json
import os
import re
import ssl
from datetime import datetime
from email import policy
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.parser import BytesParser

# Only the types the extractor can actually read are persisted; anything else
# would land in the review queue as an unreadable attachment for no reason.
SUPPORTED_ATTACHMENTS = {".txt", ".pdf", ".docx", ".xlsx"}
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_BODY_CHARS = 20000
DEFAULT_FETCH_LIMIT = 50

PROVIDER_PRESETS = {
    "gmail": {"host": "imap.gmail.com", "port": 993,
              "note": "Requires a Google App Password when 2-step verification is on."},
    "outlook": {"host": "outlook.office365.com", "port": 993,
                "note": "Microsoft 365 / Outlook.com."},
    "yahoo": {"host": "imap.mail.yahoo.com", "port": 993,
              "note": "Requires a Yahoo app password."},
    "icloud": {"host": "imap.mail.me.com", "port": 993,
               "note": "Requires an Apple app-specific password."},
    "imap": {"host": "", "port": 993, "note": "Custom IMAP server."},
}


class MailboxError(Exception):
    """Raised for any connection/login/fetch problem, with a message safe to
    show the user (never contains the password)."""


def resolve_provider(provider, host=None, port=None):
    preset = PROVIDER_PRESETS.get((provider or "imap").lower(), PROVIDER_PRESETS["imap"])
    resolved_host = (host or "").strip() or preset["host"]
    if not resolved_host:
        raise MailboxError("An IMAP host is required for a custom provider.")
    return resolved_host, int(port or preset["port"] or 993)


APP_PASSWORD_HELP = {
    "imap.gmail.com": (
        "Gmail does not accept your normal Google password over IMAP. Create a "
        "16-character App Password at https://myaccount.google.com/apppasswords "
        "and use that here. (App Passwords require 2-Step Verification to be on, "
        "and IMAP must be enabled in Gmail → Settings → Forwarding and POP/IMAP.)"
    ),
    "imap.mail.yahoo.com": (
        "Yahoo requires an app password. Generate one under Account Security → "
        "Generate app password, and use that instead of your normal password."
    ),
    "imap.mail.me.com": (
        "iCloud requires an app-specific password. Create one at "
        "https://account.apple.com under Sign-In and Security → App-Specific "
        "Passwords, and use that here."
    ),
    "outlook.office365.com": (
        "Microsoft rejected the password. Outlook.com accounts with 2-step "
        "verification need an app password (Security → Advanced security "
        "options). Many Microsoft 365 work/school tenants disable IMAP basic "
        "authentication altogether — if so, your admin has to enable it."
    ),
}


def _clean_imap_detail(exc) -> str:
    """imaplib raises with a bytes argument, so str(exc) renders as b'...'.
    Unwrap it so the user sees the server's actual sentence."""
    args = getattr(exc, "args", None)
    raw = args[0] if args else exc
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    return str(raw).strip()


def login_error_message(detail: str, host: str) -> str:
    """Translate a server's login rejection into something actionable.

    Providers phrase this several different ways — Gmail says
    "Application-specific password required", others say AUTHENTICATIONFAILED
    — so match on intent rather than one exact string.
    """
    upper = (detail or "").upper()
    host = (host or "").lower()
    help_text = APP_PASSWORD_HELP.get(host)

    if "APPLICATION-SPECIFIC PASSWORD" in upper or "APP PASSWORD" in upper:
        return help_text or (
            "This mailbox requires an app-specific password rather than your "
            "normal account password. Generate one in your email provider's "
            "security settings and use it here."
        )
    if "IMAP" in upper and "DISABL" in upper:
        return (
            "IMAP access is switched off for this mailbox. Enable IMAP in your "
            "email provider's settings (for a work account, ask your admin), "
            "then try again."
        )
    if "BASIC AUTH" in upper or "AUTHENTICATION IS DISABLED" in upper:
        return (
            "The server has disabled password-based IMAP sign-in for this "
            "account. Your administrator needs to re-enable IMAP access."
        )
    if ("AUTHENTICATIONFAILED" in upper or "INVALID CREDENTIALS" in upper
            or "LOGIN FAILED" in upper or "AUTHENTICATION FAILED" in upper):
        base = "The server rejected that username and password."
        return f"{base} {help_text}" if help_text else (
            f"{base} If your provider uses 2-step verification, you need an "
            "app-specific password rather than your normal one."
        )
    return f"IMAP login failed — {detail}"


def connect(host, port, username, password, timeout=30):
    """Open an authenticated IMAP4_SSL connection."""
    try:
        conn = imaplib.IMAP4_SSL(host, int(port),
                                 ssl_context=ssl.create_default_context(),
                                 timeout=timeout)
    except Exception as exc:
        raise MailboxError(f"Could not reach {host}:{port} — {exc}") from exc
    try:
        conn.login(username, password)
    except imaplib.IMAP4.error as exc:
        try:
            conn.logout()
        except Exception:
            pass
        raise MailboxError(
            login_error_message(_clean_imap_detail(exc), host)
        ) from exc
    return conn


def list_folders(conn):
    ok, data = conn.list()
    if ok != "OK":
        return []
    names = []
    for raw in data or []:
        line = raw.decode(errors="replace") if isinstance(raw, bytes) else str(raw)
        m = re.search(r'"([^"]*)"\s*$', line) or re.search(r"(\S+)\s*$", line)
        if m:
            names.append(m.group(1))
    return names


def test_connection(host, port, username, password, folder="INBOX"):
    """Verify credentials before we store them. Returns a small summary."""
    conn = connect(host, port, username, password)
    try:
        ok, data = conn.select(folder, readonly=True)
        if ok != "OK":
            raise MailboxError(
                f"Connected, but the folder {folder!r} could not be opened."
            )
        total = int(data[0]) if data and data[0] else 0
        return {"ok": True, "folder": folder, "message_count": total,
                "folders": list_folders(conn)[:50]}
    finally:
        try:
            conn.logout()
        except Exception:
            pass


# --------------------------------------------------------------------------
# message parsing
# --------------------------------------------------------------------------
def _decode(value):
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return str(value)


def _plain_body(msg: EmailMessage) -> str:
    """Best-effort readable body: prefer text/plain, fall back to HTML with
    the tags stripped so the classifier still sees the wording."""
    try:
        part = msg.get_body(preferencelist=("plain",))
        if part is not None:
            return (part.get_content() or "").strip()
    except Exception:
        pass
    try:
        part = msg.get_body(preferencelist=("html",))
        if part is not None:
            html = part.get_content() or ""
            text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html,
                          flags=re.S | re.I)
            text = re.sub(r"<br\s*/?>|</p>", "\n", text, flags=re.I)
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"&nbsp;?", " ", text)
            text = re.sub(r"[ \t]+", " ", text)
            return re.sub(r"\n{3,}", "\n\n", text).strip()
    except Exception:
        pass
    return ""


def safe_attachment_name(email_id, raw_name, index):
    """Strip any path information from a sender-supplied filename — an
    attachment must never be able to write outside storage/attachments."""
    name = os.path.basename((raw_name or "").replace("\\", "/")).strip()
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name) or f"attachment_{index}"
    ext = os.path.splitext(name)[1].lower()
    if not ext:
        name, ext = f"{name}.txt", ".txt"
    return f"{email_id}_{index}_{name}", ext


def save_attachments(msg: EmailMessage, email_id, storage_root):
    """Persist supported attachments and return their storage-relative paths."""
    out_dir = os.path.join(storage_root, "attachments")
    os.makedirs(out_dir, exist_ok=True)
    saved = []
    for index, part in enumerate(msg.iter_attachments(), start=1):
        filename, ext = safe_attachment_name(email_id, part.get_filename(), index)
        if ext not in SUPPORTED_ATTACHMENTS:
            continue
        try:
            payload = part.get_payload(decode=True) or b""
        except Exception:
            continue
        if not payload or len(payload) > MAX_ATTACHMENT_BYTES:
            continue
        full = os.path.join(out_dir, filename)
        with open(full, "wb") as f:
            f.write(payload)
        saved.append(f"attachments/{filename}")
    return saved


def message_to_record(raw_bytes, email_id, storage_root):
    """Turn a raw RFC-822 message into the pipeline's email record."""
    msg = BytesParser(policy=policy.default).parsebytes(raw_bytes)
    return {
        "email_id": email_id,
        "from": _decode(msg.get("From")),
        "subject": _decode(msg.get("Subject")),
        "body": _plain_body(msg)[:MAX_BODY_CHARS],
        "attachments": save_attachments(msg, email_id, storage_root),
        "received_at": _decode(msg.get("Date")),
        "message_id": _decode(msg.get("Message-ID")),
    }


def write_inbox_record(record, storage_root):
    """Write the record where the pipeline already looks for its input."""
    inbox_dir = os.path.join(storage_root, "inbox")
    os.makedirs(inbox_dir, exist_ok=True)
    path = os.path.join(inbox_dir, f"{record['email_id']}.json")
    with open(path, "w") as f:
        json.dump(record, f, indent=2)
    return path


# --------------------------------------------------------------------------
# fetching
# --------------------------------------------------------------------------
def fetch_new_messages(conn, folder="INBOX", since_uid=0, limit=DEFAULT_FETCH_LIMIT):
    """Yield (uid, raw_bytes) for messages newer than `since_uid`.

    UID-based so a sync never re-imports what it already has, and never
    misses a message because sequence numbers shifted.
    """
    ok, _ = conn.select(folder, readonly=True)
    if ok != "OK":
        raise MailboxError(f"Could not open folder {folder!r}.")

    ok, data = conn.uid("search", None, f"UID {int(since_uid) + 1}:*")
    if ok != "OK":
        raise MailboxError("Mailbox search failed.")

    uids = [int(u) for u in (data[0].split() if data and data[0] else [])]
    uids = [u for u in uids if u > int(since_uid)]
    uids.sort()
    if limit:
        uids = uids[-int(limit):]   # newest N when there is a big backlog

    for uid in uids:
        ok, payload = conn.uid("fetch", str(uid), "(RFC822)")
        if ok != "OK" or not payload or not payload[0]:
            continue
        chunk = payload[0]
        raw = chunk[1] if isinstance(chunk, tuple) and len(chunk) > 1 else None
        if raw:
            yield uid, raw
