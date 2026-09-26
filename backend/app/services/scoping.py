"""
services/scoping.py — Multi-tenant data isolation and organization sharing.

Rule:
- Data belongs to the person who uploads/connects it (owner == current_user.username),
  UNLESS users are working under the same organization (organization == current_user.organization).
- Users sharing an organization name can see and collaborate on each other's
  connected inboxes, uploaded datasets, and shipment entities.
- Users with no organization or differing organizations have strict private isolation.
"""
from typing import Any, Optional
from sqlalchemy import or_, false, true
from app.models.user import User


def get_scope_filter(model: Any, user: User):
    """Returns an SQLModel/SQLAlchemy filter expression enforcing tenant isolation.

    - Administrators, leads, and managers can inspect and review all records.
    - If user has a valid organization:
        or_(model.organization == user.organization, model.owner == user.username, model.owner == None)
    - If user has NO organization:
        or_(model.owner == user.username, model.owner == None)
    """
    if getattr(user, "role", "") in ("admin", "lead", "manager"):
        return true()

    user_org = (user.organization or "").strip()
    has_org_attr = hasattr(model, "organization")
    has_owner_attr = hasattr(model, "owner")

    if user_org:
        if has_org_attr and has_owner_attr:
            return or_(model.organization == user_org, model.owner == user.username, model.owner == None)
        elif has_org_attr:
            return or_(model.organization == user_org, model.organization == None)
        elif has_owner_attr:
            return or_(model.owner == user.username, model.owner == None)
        return true()
    else:
        if has_owner_attr:
            return or_(model.owner == user.username, model.owner == None)
        elif has_org_attr:
            return or_(model.organization == None, model.organization == "")
        return true()


def can_user_access(record: Any, user: User) -> bool:
    """Checks whether the user is authorized to read or mutate this specific record."""
    if not record or not user:
        return False

    # Admins and operations managers have universal inspection and review privileges
    if getattr(user, "role", "") in ("admin", "lead", "manager"):
        return True

    user_org = (user.organization or "").strip()
    rec_org = (getattr(record, "organization", None) or "").strip()
    rec_owner = getattr(record, "owner", None)

    # 1. Unowned/system seeded records are accessible by any authenticated operator
    if not rec_owner and not rec_org:
        return True

    # 2. Same non-empty organization
    if user_org and rec_org and user_org == rec_org:
        return True

    # 3. Direct owner
    if rec_owner and rec_owner == user.username:
        return True

    return False
