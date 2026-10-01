from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Review(SQLModel, table=True):
    __tablename__ = "reviews"

    id: Optional[int] = Field(default=None, primary_key=True)
    email_id: str = Field(index=True, foreign_key="emails.email_id")
    reviewer: Optional[str] = Field(default=None, index=True)      # username of operator
    organization: Optional[str] = Field(default=None, index=True)  # organization scope
    reason: Optional[str] = None              # review_reason copied from comparison_results
    human_decision: Optional[str] = None      # approve | correct | retry
    action_taken: Optional[str] = Field(default=None, index=True)        # AUTO_RELEASED | MANUAL_OVERRIDE_APPROVED | REJECTED_TO_SHIPPER
    audit_reason_code: Optional[str] = Field(default=None, index=True)   # PHONE_CONFIRMATION_NBE | AMENDED_PERMIT_RECEIVED | OCR_READING_CORRECTED | ...
    notes: Optional[str] = None               # review notes / operator notes
    voice_note: Optional[str] = None          # captured spoken voice note audio transcription
    final_result: Optional[str] = None        # JSON-encoded corrected record, when human_decision == correct
    created_at: datetime = Field(default_factory=utc_now)
    resolved_at: Optional[datetime] = None

