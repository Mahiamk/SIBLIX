from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field
from app.models.shipment_folder import ShipmentFolder  # noqa: F401


class Email(SQLModel, table=True):
    __tablename__ = "emails"

    id: Optional[int] = Field(default=None, primary_key=True)
    email_id: str = Field(index=True, unique=True)  # dataset id, e.g. "email_004"
    owner: Optional[str] = Field(default=None, index=True)         # username of uploader
    organization: Optional[str] = Field(default=None, index=True)  # organization sharing scope
    shipment_id: Optional[int] = Field(default=None, index=True, foreign_key="shipment_folders.id")
    sender: str = Field(default="", alias="from")
    subject: str = ""
    body: str = ""
    category: Optional[str] = None                  # BL_COMPARISON | SI_REQUEST | ...
    classification_confidence: Optional[float] = None
    status: str = Field(default="PENDING")           # PENDING|PROCESSING|OK|MISMATCH|NEEDS_REVIEW
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
