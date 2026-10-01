import hashlib
from datetime import datetime, timezone
from typing import Optional, Any
from sqlmodel import SQLModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# --- Standardized Legal Action Taken ---
ACTION_AUTO_RELEASED = "AUTO_RELEASED"
ACTION_MANUAL_OVERRIDE_APPROVED = "MANUAL_OVERRIDE_APPROVED"
ACTION_REJECTED_TO_SHIPPER = "REJECTED_TO_SHIPPER"

# --- Standardized Regulatory Audit Reason Codes ---
REASON_PHONE_CONFIRMATION_NBE = "PHONE_CONFIRMATION_NBE"
REASON_AMENDED_PERMIT_RECEIVED = "AMENDED_PERMIT_RECEIVED"
REASON_OCR_READING_CORRECTED = "OCR_READING_CORRECTED"
REASON_WEIGHT_TOLERANCE_ACCEPTED = "WEIGHT_TOLERANCE_ACCEPTED"
REASON_ENTITY_ALIAS_CONFIRMED = "ENTITY_ALIAS_CONFIRMED"
REASON_SYSTEM_CLEARED_MATCH = "SYSTEM_CLEARED_MATCH"
REASON_DEFECT_STANDS_UNRESOLVED = "DEFECT_STANDS_UNRESOLVED"


class AuditLog(SQLModel, table=True):
    __tablename__: Any = "audit_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    organization: Optional[str] = Field(default=None, index=True)
    owner: Optional[str] = Field(default=None, index=True)
    
    # Legal Audit Identification
    operator_id: Optional[str] = Field(default=None, index=True)   # Operator identifier (e.g. ops_officer_01, admin)
    user_email: Optional[str] = Field(default=None, index=True)    # Verified operator email
    action_taken: Optional[str] = Field(default=None, index=True)  # AUTO_RELEASED | MANUAL_OVERRIDE_APPROVED | REJECTED_TO_SHIPPER
    audit_reason_code: Optional[str] = Field(default=None, index=True) # PHONE_CONFIRMATION_NBE | AMENDED_PERMIT_RECEIVED | OCR_READING_CORRECTED | ...

    action: str = Field(index=True)                                # Legacy / event code (e.g. MANUAL_OVERRIDE_APPROVED, AUTO_RELEASED, etc.)
    entity_type: str = Field(default="SHIPMENT", index=True)       # SHIPMENT, DOCUMENT, INGESTION, MAILBOX, SECURITY
    entity_id: Optional[str] = Field(default=None, index=True)
    description: str
    severity: str = Field(default="INFO", index=True)              # INFO | NOTICE | WARNING | HIGH_RISK | RESOLVED
    status: str = Field(default="COMPLIANT", index=True)           # COMPLIANT | FLAGGED | RESOLVED | AUTO_APPROVED
    metadata_json: Optional[str] = None
    verification_hash: Optional[str] = None
    timestamp: datetime = Field(default_factory=utc_now, index=True)


def compute_audit_hash(
    owner: Optional[str],
    org: Optional[str],
    action: str,
    entity_id: Optional[str],
    description: str,
    ts: datetime,
    action_taken: Optional[str] = None,
    audit_reason_code: Optional[str] = None,
    user_email: Optional[str] = None,
) -> str:
    """Generate tamper-evident cryptographic SHA-256 seal for compliance verification."""
    raw = (
        f"{owner or ''}:{user_email or ''}:{org or ''}:{action}:{action_taken or ''}:"
        f"{audit_reason_code or ''}:{entity_id or ''}:{description}:{ts.isoformat()}"
    )
    return "sha256:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:28]
