from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DatasetUpload(SQLModel, table=True):
    """One record per ingestion a user performed.

    The emails table itself is shared — a dataset row is not "owned" by
    whoever loaded it — so provenance lives here instead: who imported what,
    from where, and how much of it was new. This is what the profile page
    reports, rather than guessing an owner from the email rows.
    """

    __tablename__ = "dataset_uploads"

    id: Optional[int] = Field(default=None, primary_key=True)
    owner: str = Field(index=True)                  # users.username
    organization: Optional[str] = Field(default=None, index=True)  # organization sharing scope
    source: str = Field(default="bundled")          # bundled | mailbox
    label: Optional[str] = None                     # dataset name / mailbox address
    emails_created: int = Field(default=0)          # rows this run actually added
    emails_total: int = Field(default=0)            # rows present afterwards
    created_at: datetime = Field(default_factory=utc_now)
