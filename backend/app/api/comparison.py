from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.api.auth import require_auth
from app.database.connection import get_session
from app.models.discrepancy import ComparisonResult

router = APIRouter(prefix="/comparison", tags=["comparison"], dependencies=[Depends(require_auth)])


@router.get("/{email_id}")
def get_comparison(email_id: str, session: Session = Depends(get_session)):
    cr = session.exec(
        select(ComparisonResult).where(ComparisonResult.email_id == email_id)
    ).first()
    if not cr:
        raise HTTPException(status_code=404, detail="No comparison result for this email")
    return {
        "email_id": cr.email_id,
        "status": cr.status,
        "has_defect": cr.has_defect,
        "defect_fields": cr.defect_fields_list(),
        "review_reason": cr.review_reason,
    }
