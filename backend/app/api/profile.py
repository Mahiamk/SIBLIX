"""
profile.py — everything the signed-in operator has in this workspace.

One call behind the profile screen: who they are, the organization they work
under (and who else is in it), the mailboxes they connected, the datasets
they imported, and what those imports produced.

Provenance for imports comes from the `dataset_uploads` table rather than
from the emails themselves: the inbox is shared, so an email row has no
owner, and claiming otherwise on a profile page would be a lie.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.auth import get_current_user
from app.database.connection import get_session
from app.models.dataset_upload import DatasetUpload
from app.models.email import Email
from app.models.email_account import EmailAccount
from app.models.review import Review
from app.models.user import User
from app.services.scoping import get_scope_filter

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    organization: Optional[str] = None
    job_title: Optional[str] = None


def _user_payload(u: User) -> dict:
    return {
        "username": u.username,
        "full_name": u.full_name,
        "email": u.email,
        "role": u.role,
        "organization": u.organization,
        "job_title": u.job_title,
        "created_at": u.created_at,
    }


@router.get("")
def get_profile(session: Session = Depends(get_session),
                user: User = Depends(get_current_user)):
    # --- organization ----------------------------------------------------
    organization = None
    if user.organization:
        colleagues = session.exec(
            select(User).where(User.organization == user.organization)
        ).all()
        organization = {
            "name": user.organization,
            "member_count": len(colleagues),
            "members": sorted(
                (
                    {
                        "username": c.username,
                        "full_name": c.full_name,
                        "job_title": c.job_title,
                        "role": c.role,
                        "is_you": c.username == user.username,
                    }
                    for c in colleagues
                ),
                key=lambda m: (not m["is_you"], m["username"]),
            ),
        }

    # --- connected mailboxes --------------------------------------------
    accounts = session.exec(
        select(EmailAccount).where(get_scope_filter(EmailAccount, user))
    ).all()
    mailboxes = [
        {
            "id": a.id,
            "email_address": a.email_address,
            "provider": a.provider,
            "folder": a.folder,
            "status": a.status,
            "last_error": a.last_error,
            "last_synced_at": a.last_synced_at,
            "total_imported": a.total_imported,
        }
        for a in accounts
    ]

    # --- datasets this user/organization imported ------------------------
    uploads = session.exec(
        select(DatasetUpload)
        .where(get_scope_filter(DatasetUpload, user))
        .order_by(DatasetUpload.id.desc())
    ).all()
    upload_payload = [
        {
            "id": u.id,
            "source": u.source,
            "label": u.label,
            "emails_created": u.emails_created,
            "emails_total": u.emails_total,
            "created_at": u.created_at,
        }
        for u in uploads
    ]

    # --- what the workspace currently holds ------------------------------
    emails = session.exec(select(Email).where(get_scope_filter(Email, user))).all()
    status_counts = {}
    for e in emails:
        status_counts[e.status] = status_counts.get(e.status, 0) + 1

    my_reviews = session.exec(select(Review).where(get_scope_filter(Review, user))).all()

    return {
        "user": _user_payload(user),
        "organization": organization,
        "mailboxes": mailboxes,
        "uploads": upload_payload,
        "activity": {
            "datasets_imported": len([u for u in uploads if u.source == "bundled"]),
            "emails_imported_from_mailboxes": sum(a.total_imported for a in accounts),
            "mailboxes_connected": len(accounts),
            "reviews_resolved": len([r for r in my_reviews if r.resolved_at]),
        },
        "workspace": {
            "total_emails": len(emails),
            "by_status": status_counts,
        },
    }


@router.patch("")
def update_profile(payload: ProfileUpdate,
                   session: Session = Depends(get_session),
                   user: User = Depends(get_current_user)):
    """Let an operator fill in their own details — including the organization
    they work under, which is not asked for at registration."""
    for field in ("full_name", "email", "organization", "job_title"):
        value = getattr(payload, field)
        if value is not None:
            setattr(user, field, value.strip() or None)
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_payload(user)
