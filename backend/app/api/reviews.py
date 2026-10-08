import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlmodel import Session, select

from app.api.auth import get_current_user, require_auth
from app.database.connection import get_session, session_scope
from app.models.email import Email
from app.models.discrepancy import ComparisonResult
from app.models.review import Review
from app.services.processing import process_email_job
from app.services.scoping import get_scope_filter, can_user_access

router = APIRouter(prefix="/reviews", tags=["reviews"], dependencies=[Depends(require_auth)])


@router.get("")
def list_reviews(
    session: Session = Depends(get_session),
    user=Depends(get_current_user),
):
    """The human queue: anything the pipeline could not clear on its own —
    escalations (NEEDS_REVIEW) and flagged discrepancies (MISMATCH) — minus
    whatever an operator has already resolved, scoped to user/organization.
    """
    open_emails = session.exec(
        select(Email).where(
            Email.status.in_(("NEEDS_REVIEW", "MISMATCH")),
            get_scope_filter(Email, user),
        )
    ).all()
    comparisons = {
        c.email_id: c for c in session.exec(select(ComparisonResult)).all()
    }
    resolved = {
        r.email_id
        for r in session.exec(select(Review).where(Review.resolved_at.is_not(None))).all()
    }

    out = []
    for email in open_emails:
        if email.email_id in resolved:
            continue
        cr = comparisons.get(email.email_id)
        out.append({
            "email_id": email.email_id,
            "subject": email.subject,
            "status": email.status,
            "reason": cr.review_reason if cr else None,
            "defect_fields": cr.defect_fields_list() if cr else [],
        })
    return out


from app.models.audit import (
    ACTION_AUTO_RELEASED,
    ACTION_MANUAL_OVERRIDE_APPROVED,
    ACTION_REJECTED_TO_SHIPPER,
    REASON_PHONE_CONFIRMATION_NBE,
    REASON_AMENDED_PERMIT_RECEIVED,
    REASON_OCR_READING_CORRECTED,
    REASON_WEIGHT_TOLERANCE_ACCEPTED,
    REASON_ENTITY_ALIAS_CONFIRMED,
    REASON_DEFECT_STANDS_UNRESOLVED,
)
from app.services.audit import record_audit


class ReviewDecision(BaseModel):
    """What the operator decided.

    Supports both UI button actions (approve, reject, correct) and regulatory HITL
    signed action logs:
        action_taken: AUTO_RELEASED | MANUAL_OVERRIDE_APPROVED | REJECTED_TO_SHIPPER
        audit_reason_code: PHONE_CONFIRMATION_NBE | AMENDED_PERMIT_RECEIVED | OCR_READING_CORRECTED | ...
    """
    decision: Optional[str] = None
    action: Optional[str] = None
    action_taken: Optional[str] = None
    audit_reason_code: Optional[str] = None
    operator_id: Optional[str] = None
    user_email: Optional[str] = None
    notes: Optional[str] = None
    voice_note: Optional[str] = None
    corrections: Optional[Dict[str, Any]] = None        # {field: corrected value}
    corrected_status: Optional[str] = None
    corrected_defect_fields: Optional[List[str]] = None

    @model_validator(mode="after")
    def _normalise(self):
        # Support either decision, action, or action_taken
        raw = (self.action_taken or self.decision or self.action or "").strip()
        if raw == ACTION_MANUAL_OVERRIDE_APPROVED or raw.lower() in ("approve", "approved"):
            self.decision = "approve"
            self.action_taken = ACTION_MANUAL_OVERRIDE_APPROVED
        elif raw == ACTION_REJECTED_TO_SHIPPER or raw.lower() in ("reject", "rejected"):
            self.decision = "reject"
            self.action_taken = ACTION_REJECTED_TO_SHIPPER
        elif raw == ACTION_AUTO_RELEASED or raw.lower() in ("auto_released", "auto_approve"):
            self.decision = "approve"
            self.action_taken = ACTION_AUTO_RELEASED
        elif raw.lower() in ("correct", "override"):
            self.decision = "correct"
            self.action_taken = ACTION_MANUAL_OVERRIDE_APPROVED
        elif raw.lower() == "retry":
            self.decision = "retry"
            self.action_taken = "PIPELINE_RETRY_TRIGGERED"
        else:
            raise ValueError(f"Unrecognized decision / action_taken: '{raw}'. Expected approve, reject, correct, retry or standard legal action_taken")
        return self


@router.post("/{email_id}")
def submit_review(
    email_id: str,
    payload: ReviewDecision,
    session: Session = Depends(get_session),
    user=Depends(get_current_user),
):
    """Record a human decision, apply it, and generate a signed HITL legal audit log entry."""
    email = session.exec(select(Email).where(Email.email_id == email_id)).first()
    if not email or not can_user_access(email, user):
        raise HTTPException(status_code=404, detail="Email not found")
    cr = session.exec(
        select(ComparisonResult).where(ComparisonResult.email_id == email_id)
    ).first()

    # Determine legal operator identification
    operator_id = payload.operator_id or getattr(user, "username", "OPERATOR")
    user_email = (
        payload.user_email
        or getattr(user, "email", None)
        or (f"{operator_id}@siblix.ai" if "@" not in operator_id else operator_id)
    )

    # Determine standardized legal action_taken
    if payload.decision in ("approve", "correct"):
        action_taken = payload.action_taken or ACTION_MANUAL_OVERRIDE_APPROVED
    elif payload.decision == "reject":
        action_taken = payload.action_taken or ACTION_REJECTED_TO_SHIPPER
    else:
        action_taken = payload.action_taken or "PIPELINE_RETRY_TRIGGERED"

    # Determine standardized legal audit_reason_code
    reason_code = payload.audit_reason_code
    if not reason_code:
        notes_lower = (payload.notes or "").lower()
        if "nbe" in notes_lower or "phone" in notes_lower or "call" in notes_lower:
            reason_code = REASON_PHONE_CONFIRMATION_NBE
        elif "permit" in notes_lower or "amend" in notes_lower:
            reason_code = REASON_AMENDED_PERMIT_RECEIVED
        elif "ocr" in notes_lower or "reading" in notes_lower or payload.decision == "correct":
            reason_code = REASON_OCR_READING_CORRECTED
        elif "weight" in notes_lower or "tolerance" in notes_lower or "%" in notes_lower:
            reason_code = REASON_WEIGHT_TOLERANCE_ACCEPTED
        elif "alias" in notes_lower or "entity" in notes_lower or "party" in notes_lower:
            reason_code = REASON_ENTITY_ALIAS_CONFIRMED
        elif payload.decision == "reject":
            reason_code = REASON_DEFECT_STANDS_UNRESOLVED
        else:
            reason_code = (
                REASON_PHONE_CONFIRMATION_NBE
                if action_taken == ACTION_MANUAL_OVERRIDE_APPROVED
                else REASON_DEFECT_STANDS_UNRESOLVED
            )

    # Extract clean voice note if present in notes
    voice_note = payload.voice_note
    if not voice_note and payload.notes:
        if "[VOICE NOTE]:" in payload.notes:
            voice_note = payload.notes.split("[VOICE NOTE]:", 1)[1].strip()
        elif "[VOICE OVERRIDE]:" in payload.notes:
            voice_note = payload.notes.split("[VOICE OVERRIDE]:", 1)[1].strip()

    review = Review(
        email_id=email_id,
        reviewer=operator_id,
        organization=user.organization,
        reason=cr.review_reason if cr else None,
        human_decision=payload.decision,
        action_taken=action_taken,
        audit_reason_code=reason_code,
        notes=payload.notes,
        voice_note=voice_note,
    )
    corrections = payload.corrections or {}

    if payload.decision == "retry":
        email.status = "PENDING"
        session.add(email)
        session.add(review)
        session.commit()
        with session_scope() as bg_session:
            process_email_job(bg_session, email_id)
        session.refresh(email)
        return {
            "email_id": email_id,
            "decision": "retry",
            "action_taken": action_taken,
            "audit_reason_code": reason_code,
            "operator_id": operator_id,
            "user_email": user_email,
            "status": email.status,
            "resolved": False,
        }

    if payload.decision == "approve":
        # The operator releases the shipment: it is no longer a defect.
        new_status = payload.corrected_status or "REVIEWED"
        new_defects = payload.corrected_defect_fields or []
    elif payload.decision == "reject":
        # The defect stands; the case is closed for the queue as REJECTED.
        new_status = payload.corrected_status or "REJECTED"
        new_defects = (payload.corrected_defect_fields
                       or (cr.defect_fields_list() if cr else []))
    else:  # correct
        new_status = payload.corrected_status or "REVIEWED"
        new_defects = payload.corrected_defect_fields or []

    if cr:
        cr.status = new_status
        cr.has_defect = bool(new_defects) or new_status in ("MISMATCH", "REJECTED")
        cr.defect_fields = ComparisonResult.encode_fields(new_defects)
        cr.review_reason = None
        session.add(cr)
    else:
        cr = ComparisonResult(
            email_id=email_id,
            status=new_status,
            has_defect=bool(new_defects) or new_status in ("MISMATCH", "REJECTED"),
            defect_fields=ComparisonResult.encode_fields(new_defects),
            review_reason=None,
        )
        session.add(cr)

    email.status = new_status
    session.add(email)

    if email.shipment_id:
        from app.models.shipment_folder import ShipmentFolder
        folder = session.exec(select(ShipmentFolder).where(ShipmentFolder.id == email.shipment_id)).first()
        if folder:
            folder.status = new_status
            folder.has_defect = bool(new_defects) or new_status == "REJECTED"
            folder.defect_fields = json.dumps(new_defects)
            if new_status in ("OK", "REVIEWED"):
                folder.regulatory_status = "COMPLIANT"
                folder.regulatory_defects = "[]"
            elif new_status == "REJECTED":
                folder.regulatory_status = "NON_COMPLIANT"
            session.add(folder)

    review.final_result = json.dumps({
        "status": new_status,
        "action_taken": action_taken,
        "audit_reason_code": reason_code,
        "operator_id": operator_id,
        "user_email": user_email,
        "defect_fields": new_defects,
        "corrections": corrections,
        "notes": payload.notes,
        "voice_note": voice_note,
        "reviewer": operator_id,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    })
    review.resolved_at = datetime.now(timezone.utc)
    session.add(review)
    session.commit()
    session.refresh(email)

    audit_entry = None
    try:
        status_map = {
            "approve": "RESOLVED",
            "reject": "FLAGGED",
            "correct": "RESOLVED",
            "retry": "PENDING",
        }
        severity_map = {
            "approve": "NOTICE",
            "reject": "HIGH_RISK",
            "correct": "NOTICE",
            "retry": "INFO",
        }
        desc_text = f"HITL Override ({action_taken}): Operator {operator_id} ({user_email}) recorded {payload.decision} under '{reason_code}'"
        if voice_note:
            desc_text += f' with Voice Note: "{voice_note}"'
        else:
            desc_text += f" on shipment ({email.subject[:45]})"

        audit_entry = record_audit(
            session=session,
            action=action_taken,
            action_taken=action_taken,
            audit_reason_code=reason_code,
            operator_id=operator_id,
            user_email=user_email,
            description=desc_text,
            entity_type="SHIPMENT",
            entity_id=email_id,
            owner=user.username,
            organization=user.organization,
            severity=severity_map.get(payload.decision, "INFO"),
            status=status_map.get(payload.decision, "COMPLIANT"),
            metadata={
                "decision": payload.decision,
                "action_taken": action_taken,
                "audit_reason_code": reason_code,
                "operator_id": operator_id,
                "user_email": user_email,
                "status": new_status,
                "notes": payload.notes,
                "voice_note": voice_note,
                "corrections": corrections,
                "legal_liability_attested": True,
            },
        )
    except Exception as e:
        # Fallback log in console if audit logging raises
        print(f"[Audit Log Warning] Failed to log review audit: {e}")

    return {
        "email_id": email_id,
        "decision": payload.decision,
        "action_taken": action_taken,
        "audit_reason_code": reason_code,
        "operator_id": operator_id,
        "user_email": user_email,
        "status": email.status,
        "notes": payload.notes,
        "voice_note": voice_note,
        "defect_fields": new_defects,
        "corrections": corrections,
        "verification_hash": getattr(audit_entry, "verification_hash", None),
        "timestamp": audit_entry.timestamp.isoformat() if audit_entry and audit_entry.timestamp else datetime.utcnow().isoformat(),
        "resolved": True,
    }


@router.get("/{email_id}/history")
def review_history(
    email_id: str,
    session: Session = Depends(get_session),
    user=Depends(get_current_user),
):
    """Every decision recorded against an email, newest first — the audit
    trail behind the current status."""
    email = session.exec(select(Email).where(Email.email_id == email_id)).first()
    if not email or not can_user_access(email, user):
        raise HTTPException(status_code=404, detail="Email not found")

    rows = session.exec(
        select(Review).where(Review.email_id == email_id).order_by(Review.id.desc())
    ).all()
    out = []
    for r in rows:
        try:
            final = json.loads(r.final_result) if r.final_result else None
        except (ValueError, TypeError):
            final = None
        action_taken = getattr(r, "action_taken", None) or (final.get("action_taken") if final else None)
        audit_reason_code = getattr(r, "audit_reason_code", None) or (final.get("audit_reason_code") if final else None)
        operator_id = r.reviewer or (final.get("operator_id") if final else None)
        user_email = (final.get("user_email") if final else None) or f"{operator_id or 'operator'}@siblix.ai"
        notes_val = getattr(r, "notes", None) or (final.get("notes") if final else None)
        voice_note_val = getattr(r, "voice_note", None) or (final.get("voice_note") if final else None)
        if not voice_note_val and notes_val and "[VOICE NOTE]:" in notes_val:
            voice_note_val = notes_val.split("[VOICE NOTE]:", 1)[1].strip()
        out.append({
            "id": r.id,
            "decision": r.human_decision,
            "action_taken": action_taken,
            "audit_reason_code": audit_reason_code,
            "operator_id": operator_id,
            "user_email": user_email,
            "notes": notes_val,
            "voice_note": voice_note_val,
            "reason": r.reason,
            "result": final,
            "created_at": r.created_at,
            "resolved_at": r.resolved_at,
        })
    return out
