"""
email_accounts.py — connect a real mailbox as a live source of emails.

A third ingestion route alongside the bundled dataset (`POST /upload`) and
whatever is already in the database: the user connects their own inbox over
IMAP and syncs it. Fetched messages are written into the same
storage/inbox + storage/attachments layout the dataset uses, so they run
through the identical five-stage pipeline.

Mailboxes belong to the account that connected them; every route scopes its
query by owner, so one user can never read or sync another user's inbox.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.auth import get_current_user
from app.database.connection import get_session, session_scope
from app.models.dataset_upload import DatasetUpload
from app.models.email import Email
from app.models.email_account import EmailAccount
from app.models.user import User
from app.services import mailbox as mb
from app.services import secrets as secretbox
from app.services.processing import STORAGE_ROOT, process_email_job
from app.services.scoping import get_scope_filter, can_user_access

router = APIRouter(prefix="/email-accounts", tags=["email-accounts"])


# --------------------------------------------------------------------------
# schemas
# --------------------------------------------------------------------------
class ConnectRequest(BaseModel):
    email_address: str
    password: str
    provider: str = "imap"
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_username: Optional[str] = None   # defaults to email_address
    folder: str = "INBOX"


class AccountOut(BaseModel):
    """Never includes the password, encrypted or otherwise."""
    id: int
    provider: str
    email_address: str
    imap_host: str
    imap_port: int
    folder: str
    status: str
    last_error: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    total_imported: int = 0


def _out(a: EmailAccount) -> AccountOut:
    return AccountOut(
        id=a.id, provider=a.provider, email_address=a.email_address,
        imap_host=a.imap_host, imap_port=a.imap_port, folder=a.folder,
        status=a.status, last_error=a.last_error,
        last_synced_at=a.last_synced_at, total_imported=a.total_imported,
    )


def _owned(session: Session, account_id: int, user: User) -> EmailAccount:
    account = session.get(EmailAccount, account_id)
    if not account or not can_user_access(account, user):
        raise HTTPException(status_code=404, detail="Mailbox not found")
    return account


# --------------------------------------------------------------------------
# routes
# --------------------------------------------------------------------------
@router.get("/providers")
def providers():
    """IMAP presets so the UI can offer one-field setup for common hosts."""
    return {
        "providers": [
            {"id": key, "host": val["host"], "port": val["port"], "note": val["note"]}
            for key, val in mb.PROVIDER_PRESETS.items()
        ]
    }


@router.get("", response_model=List[AccountOut])
def list_accounts(
    session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    rows = session.exec(
        select(EmailAccount).where(get_scope_filter(EmailAccount, user))
    ).all()
    return [_out(a) for a in rows]


@router.post("", response_model=AccountOut, status_code=201)
def connect_account(
    payload: ConnectRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Verify the credentials, then store the mailbox. Nothing is saved
    unless the login actually succeeds — a connected mailbox in the UI
    always means a working one."""
    host, port = mb.resolve_provider(payload.provider, payload.imap_host, payload.imap_port)
    login = (payload.imap_username or payload.email_address).strip()

    existing = session.exec(
        select(EmailAccount).where(
            EmailAccount.owner == user.username,
            EmailAccount.email_address == payload.email_address.strip(),
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="That mailbox is already connected")

    try:
        mb.test_connection(host, port, login, payload.password, payload.folder)
    except mb.MailboxError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    account = EmailAccount(
        owner=user.username,
        organization=user.organization,
        provider=(payload.provider or "imap").lower(),
        email_address=payload.email_address.strip(),
        imap_host=host,
        imap_port=port,
        imap_username=login,
        password_encrypted=secretbox.encrypt(payload.password),
        folder=payload.folder or "INBOX",
        status="CONNECTED",
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    return _out(account)


@router.post("/test")
def test_account(payload: ConnectRequest, user: User = Depends(get_current_user)):
    """Dry-run the credentials without saving anything."""
    host, port = mb.resolve_provider(payload.provider, payload.imap_host, payload.imap_port)
    login = (payload.imap_username or payload.email_address).strip()
    try:
        return mb.test_connection(host, port, login, payload.password, payload.folder)
    except mb.MailboxError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{account_id}/sync")
def sync_account(
    account_id: int,
    background_tasks: BackgroundTasks,
    limit: int = 25,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Pull new mail and queue each message through the pipeline."""
    account = _owned(session, account_id, user)
    password = secretbox.decrypt(account.password_encrypted)
    if not password:
        account.status = "ERROR"
        account.last_error = "Stored credentials could not be read — reconnect this mailbox."
        session.add(account)
        session.commit()
        raise HTTPException(status_code=400, detail=account.last_error)

    try:
        conn = mb.connect(account.imap_host, account.imap_port,
                          account.imap_username, password)
    except mb.MailboxError as exc:
        account.status = "ERROR"
        account.last_error = str(exc)
        session.add(account)
        session.commit()
        raise HTTPException(status_code=400, detail=str(exc))

    imported, skipped, highest = [], 0, account.last_uid
    try:
        for uid, raw in mb.fetch_new_messages(
            conn, account.folder, account.last_uid, limit
        ):
            highest = max(highest, uid)
            email_id = f"mail_{account.id}_{uid}"
            if session.exec(select(Email).where(Email.email_id == email_id)).first():
                skipped += 1
                continue
            record = mb.message_to_record(raw, email_id, STORAGE_ROOT)
            mb.write_inbox_record(record, STORAGE_ROOT)
            session.add(Email(
                email_id=email_id,
                owner=account.owner,
                organization=account.organization,
                sender=record["from"],
                subject=record["subject"],
                body=record["body"],
                status="PENDING",
            ))
            imported.append(email_id)
        session.commit()
    except mb.MailboxError as exc:
        account.status = "ERROR"
        account.last_error = str(exc)
        session.add(account)
        session.commit()
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        try:
            conn.logout()
        except Exception:
            pass

    if imported:
        session.add(DatasetUpload(
            owner=user.username,
            organization=user.organization,
            source="mailbox",
            label=account.email_address,
            emails_created=len(imported),
            emails_total=len(session.exec(select(Email).where(get_scope_filter(Email, user))).all()),
        ))

    account.last_uid = highest
    account.last_synced_at = datetime.now(timezone.utc)
    account.total_imported += len(imported)
    account.status = "CONNECTED"
    account.last_error = None
    session.add(account)
    session.commit()
    session.refresh(account)

    for email_id in imported:
        background_tasks.add_task(_run_process_job, email_id)

    return {
        "imported": len(imported),
        "skipped": skipped,
        "queued_for_processing": len(imported),
        "email_ids": imported,
        "account": _out(account).model_dump(),
    }


@router.delete("/{account_id}")
def disconnect_account(
    account_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Disconnect a mailbox. Already-imported emails are left in place —
    they are verification records, not mailbox state."""
    account = _owned(session, account_id, user)
    session.delete(account)
    session.commit()
    return {"ok": True, "disconnected": account_id}


def _run_process_job(email_id: str):
    """Background worker — needs its own DB session."""
    with session_scope() as session:
        process_email_job(session, email_id)
