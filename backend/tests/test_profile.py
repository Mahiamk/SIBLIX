"""
test_profile.py — the signed-in operator's own view of the workspace.

Checks that the profile reports what the user actually did (datasets
imported, mailboxes connected, organization colleagues) and that one user's
profile never leaks another's mailboxes.

    python3 tests/test_profile.py
"""
import os
import sys
import tempfile

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ["AUTH_SECRET"] = "profile-test-secret"
os.environ["LLM_DISABLE_FALLBACK"] = "1"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient      # noqa: E402
from app.main import app                       # noqa: E402
from app.database.connection import init_db    # noqa: E402
init_db()

client = TestClient(app)


def _auth_required():
    """These tests are about per-user data, so the auth bypass must be off.

    Other modules in the suite set DISABLE_AUTH=1 at import time; whichever
    imported last would otherwise decide the mode for everyone. The flag is
    read per request, so each test asserts it for itself.
    """
    os.environ["DISABLE_AUTH"] = "0"


def _register(username, **extra):
    _auth_required()
    r = client.post("/auth/register", json={
        "username": username, "password": "profilepass123",
        "email": f"{username}@example.com", **extra})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_profile_requires_authentication():
    _auth_required()
    assert client.get("/profile").status_code == 401


def test_profile_reports_the_users_own_details():
    _auth_required()
    h = _register("prof_solo", full_name="Solo Operator", job_title="Docs Clerk")
    body = client.get("/profile", headers=h).json()
    assert body["user"]["username"] == "prof_solo"
    assert body["user"]["full_name"] == "Solo Operator"
    assert body["user"]["job_title"] == "Docs Clerk"
    assert body["organization"] is None, "no employer given -> no org section"


def test_uploading_the_dataset_shows_up_on_the_profile():
    _auth_required()
    h = _register("prof_uploader")
    assert client.get("/profile", headers=h).json()["uploads"] == []

    r = client.post("/upload", headers=h)
    assert r.status_code == 200, r.text

    body = client.get("/profile", headers=h).json()
    assert len(body["uploads"]) == 1
    upload = body["uploads"][0]
    assert upload["source"] == "bundled"
    assert upload["emails_total"] > 0
    assert body["activity"]["datasets_imported"] == 1
    assert body["workspace"]["total_emails"] == upload["emails_total"]


def test_an_upload_is_attributed_to_whoever_ran_it():
    _auth_required()
    h1 = _register("prof_a")
    h2 = _register("prof_b")
    client.post("/upload", headers=h1)
    assert len(client.get("/profile", headers=h1).json()["uploads"]) >= 1
    assert client.get("/profile", headers=h2).json()["uploads"] == [], \
        "another user's import must not appear on this profile"


def test_organization_groups_colleagues():
    _auth_required()
    h1 = _register("org_one", organization="Pacific Maritime Line", job_title="Lead")
    _register("org_two", organization="Pacific Maritime Line", job_title="Clerk")
    _register("org_other", organization="Someone Else Ltd")

    org = client.get("/profile", headers=h1).json()["organization"]
    assert org["name"] == "Pacific Maritime Line"
    assert org["member_count"] == 2, org
    names = [m["username"] for m in org["members"]]
    assert names[0] == "org_one", "you appear first in your own org listing"
    assert "org_two" in names
    assert "org_other" not in names, "a different employer must not leak in"


def test_an_operator_can_fill_in_their_organization_later():
    _auth_required()
    h = _register("prof_later")
    assert client.get("/profile", headers=h).json()["organization"] is None
    r = client.patch("/profile", headers=h,
                     json={"organization": "Global Ocean Logistics", "job_title": "Analyst"})
    assert r.status_code == 200, r.text
    body = client.get("/profile", headers=h).json()
    assert body["organization"]["name"] == "Global Ocean Logistics"
    assert body["user"]["job_title"] == "Analyst"


def test_mailboxes_are_listed_and_never_leak_between_users():
    _auth_required()
    h1 = _register("mb_owner")
    h2 = _register("mb_other")
    from sqlmodel import Session
    from app.database.connection import engine
    from app.models.email_account import EmailAccount
    from app.services import secrets as sb
    with Session(engine) as s:
        s.add(EmailAccount(owner="mb_owner", provider="gmail",
                           email_address="ops@example.com",
                           imap_host="imap.gmail.com", imap_port=993,
                           imap_username="ops@example.com",
                           password_encrypted=sb.encrypt("app-password"),
                           total_imported=7))
        s.commit()

    mine = client.get("/profile", headers=h1).json()
    assert [m["email_address"] for m in mine["mailboxes"]] == ["ops@example.com"]
    assert mine["activity"]["emails_imported_from_mailboxes"] == 7
    assert "password" not in str(mine).lower() or "password_encrypted" not in str(mine)

    assert client.get("/profile", headers=h2).json()["mailboxes"] == []


TESTS = [
    test_profile_requires_authentication,
    test_profile_reports_the_users_own_details,
    test_uploading_the_dataset_shows_up_on_the_profile,
    test_an_upload_is_attributed_to_whoever_ran_it,
    test_organization_groups_colleagues,
    test_an_operator_can_fill_in_their_organization_later,
    test_mailboxes_are_listed_and_never_leak_between_users,
]

if __name__ == "__main__":
    failed = 0
    for t in TESTS:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"  FAIL  {t.__name__}: {exc}")
    print("All profile tests passed." if not failed else f"{failed} failed.")
    sys.exit(1 if failed else 0)
