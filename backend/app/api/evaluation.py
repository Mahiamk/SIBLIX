"""
evaluation.py — evaluation integration.

Workflow: process dataset -> generate submission.json -> submit evaluation
-> receive score -> display score.

The scoring service is the evaluation Docker package (sdoc-verification-
docker.zip); it is a separate service exposing `POST /submit`. We only need
its base URL (EVAL_SERVER_URL). If it isn't reachable (e.g. running the demo
without the scoring container available), `/evaluation/submit`
still returns the generated submission.json plus a clear error rather than
crashing, so the rest of the demo keeps working.
"""
import json
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.api.auth import get_current_user, require_auth
from app.database.connection import get_session
from app.models.email import Email
from app.models.discrepancy import ComparisonResult
from app.models.review import Review
from app.services.scoping import get_scope_filter

router = APIRouter(prefix="/evaluation", tags=["evaluation"], dependencies=[Depends(require_auth)])

EVAL_SERVER_URL = os.environ.get("EVAL_SERVER_URL", "http://eval-server:8000")
SUBMISSION_PATH = os.environ.get(
    "SUBMISSION_PATH",
    os.path.join(os.path.dirname(__file__), "..", "..", "storage", "reports", "submission.json"),
)


def _build_submission(session: Session, user):
    emails = session.exec(select(Email).where(get_scope_filter(Email, user))).all()
    submission = {}
    for e in emails:
        if e.status == "PENDING":
            continue  # not processed yet — leave out rather than guess
        cr = session.exec(
            select(ComparisonResult).where(ComparisonResult.email_id == e.email_id)
        ).first()
        r = session.exec(
            select(Review).where(Review.email_id == e.email_id).order_by(Review.id.desc())
        ).first()
        submission[e.email_id] = {
            "category": e.category,
            "status": e.status,
            "review_reason": cr.review_reason if cr else None,
            "has_defect": cr.has_defect if cr else False,
            "defect_fields": cr.defect_fields_list() if cr else [],
            "human_reviewed": bool(r or e.status in ("REVIEWED", "REJECTED")),
            "reviewer": r.reviewer if r else None,
            "action_taken": r.action_taken if r else None,
            "audit_reason_code": r.audit_reason_code if r else None,
            "voice_note": getattr(r, "voice_note", None) if r else None,
            "review_notes": getattr(r, "notes", None) if r else None,
            "reviewed_at": (r.resolved_at or r.created_at).isoformat() if r and (r.resolved_at or r.created_at) else None,
        }
    return submission


@router.post("/generate")
def generate_submission(
    session: Session = Depends(get_session),
    user=Depends(get_current_user),
):
    """Build submission.json from whatever has been processed so far and
    write it to storage/reports/submission.json."""
    submission = _build_submission(session, user)
    os.makedirs(os.path.dirname(SUBMISSION_PATH), exist_ok=True)
    with open(SUBMISSION_PATH, "w") as f:
        json.dump(submission, f, indent=2)
    return {"emails_included": len(submission), "path": SUBMISSION_PATH}


@router.post("/submit")
def submit_evaluation(
    session: Session = Depends(get_session),
    user=Depends(get_current_user),
):
    """Generate the submission (if not already on disk) and POST it to the
    organizers' scoring server, returning the scoreboard JSON."""
    submission = _build_submission(session, user)
    os.makedirs(os.path.dirname(SUBMISSION_PATH), exist_ok=True)
    with open(SUBMISSION_PATH, "w") as f:
        json.dump(submission, f, indent=2)

    try:
        import httpx
        resp = httpx.post(f"{EVAL_SERVER_URL}/submit", json=submission, timeout=30.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Could not reach evaluation server at {EVAL_SERVER_URL} ({exc}). "
                f"submission.json was written to {SUBMISSION_PATH} — "
                "set EVAL_SERVER_URL to the organizers' scoring endpoint and retry."
            ),
        )


@router.get("/submission")
def get_submission():
    if not os.path.exists(SUBMISSION_PATH):
        raise HTTPException(status_code=404, detail="No submission generated yet")
    with open(SUBMISSION_PATH) as f:
        return json.load(f)
