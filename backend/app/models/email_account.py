from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class EmailAccount(SQLModel, table=True):
    """A mailbox a registered user has connected for live ingestion.

    The password is stored encrypted (see services/secrets.py) because IMAP
    needs to replay it on every sync; it is never returned by the API.
    """

    __tablename__ = "email_accounts"

    id: Optional[int] = Field(default=None, primary_key=True)
    owner: str = Field(index=True)                 # users.username
    organization: Optional[str] = Field(default=None, index=True)  # shared within organization
    provider: str = Field(default="imap")          # gmail|outlook|yahoo|icloud|imap
    email_address: str = Field(index=True)
    imap_host: str
    imap_port: int = Field(default=993)
    imap_username: str
    password_encrypted: str
    folder: str = Field(default="INBOX")

    status: str = Field(default="CONNECTED")       # CONNECTED | ERROR
    last_error: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    last_uid: int = Field(default=0)               # highest IMAP UID ingested
    total_imported: int = Field(default=0)

    created_at: datetime = Field(default_factory=utc_now)
