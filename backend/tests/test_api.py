"""
API tests — exercise the real FastAPI app end to end with an isolated
in-memory SQLite DB. Requires the backend's requirements.txt to be
installed (fastapi/sqlmodel), so this runs inside the backend Docker image
or a local venv — NOT in a bare-python environment.

    cd backend && pip install -r requirements.txt
    DATABASE_URL=sqlite:///./storage/test.db DISABLE_AUTH=1 pytest tests/test_api.py
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./storage/test.db")
os.environ.setdefault("DISABLE_AUTH", "1")

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _auth_bypass():
    """This module drives the API without tokens, so it needs the bypass on.
    Another module may have turned it off (the flag is global and read per
    request), so each test states the mode it needs instead of relying on
    import order."""
    os.environ["DISABLE_AUTH"] = "1"



def test_health():
    _auth_bypass()
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# Access requires a registered account — there are no built-in credentials,
# so the auth tests create one first.
_ACCOUNT = {
    "username": "apitestuser",
    "password": "apitestpassword",
    "email": "apitest@example.com",
    "full_name": "API Test User",
}


def _ensure_account():
    r = client.post("/auth/register", json=_ACCOUNT)
    assert r.status_code in (201, 409), r.text


def test_register_creates_an_account():
    _auth_bypass()
    _ensure_account()
    r = client.post("/auth/register", json=_ACCOUNT)
    assert r.status_code == 409  # already registered


def test_register_rejects_a_weak_password():
    _auth_bypass()
    r = client.post("/auth/register", json={"username": "weakling", "password": "short"})
    assert r.status_code == 422


def test_login():
    _auth_bypass()
    _ensure_account()
    r = client.post(
        "/auth/login",
        json={"username": _ACCOUNT["username"], "password": _ACCOUNT["password"]},
    )
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_rejects_bad_password():
    _auth_bypass()
    _ensure_account()
    r = client.post(
        "/auth/login", json={"username": _ACCOUNT["username"], "password": "wrong"}
    )
    assert r.status_code == 401


def test_login_rejects_an_unregistered_user():
    _auth_bypass()
    r = client.post(
        "/auth/login", json={"username": "neverregistered", "password": "whatever"}
    )
    assert r.status_code == 401


def test_data_routes_require_a_token():
    """DISABLE_AUTH is on for the rest of this module, so assert the real
    gate in a sub-app that has it switched off."""
    _auth_bypass()
    import importlib
    os.environ["DISABLE_AUTH"] = "0"
    try:
        from app.api import auth as auth_mod
        importlib.reload(auth_mod)
        assert auth_mod.decode_token("garbage") is None
        token = auth_mod.create_token(_ACCOUNT["username"])
        assert auth_mod.decode_token(token) == _ACCOUNT["username"]
        assert auth_mod.decode_token(token[:-2] + "zz") is None
    finally:
        os.environ["DISABLE_AUTH"] = "1"
        importlib.reload(auth_mod)


def test_logout_invalidates_token_and_requires_relogin():
    """Verify that logging out permanently expires the user's token across
    all endpoints, requiring them to sign in again to regain access."""
    # 1. Login to get a valid token
    r = client.post("/auth/login", json={"username": _ACCOUNT["username"], "password": _ACCOUNT["password"]})
    assert r.status_code == 200
    token1 = r.json()["token"]
    headers1 = {"Authorization": f"Bearer {token1}"}

    # 2. Token1 works on /auth/me
    r = client.get("/auth/me", headers=headers1)
    assert r.status_code == 200
    assert r.json()["username"] == _ACCOUNT["username"]

    # 3. User logs out
    r = client.post("/auth/logout", headers=headers1)
    assert r.status_code == 200
    assert r.json()["ok"] is True

    # 4. Old token1 is now immediately expired on /auth/me
    r = client.get("/auth/me", headers=headers1)
    assert r.status_code == 401
    assert "expired" in r.json()["detail"].lower()

    # 5. User signs back in to get access
    r = client.post("/auth/login", json={"username": _ACCOUNT["username"], "password": _ACCOUNT["password"]})
    assert r.status_code == 200
    token2 = r.json()["token"]
    assert token2 != token1  # fresh token with incremented token_version
    headers2 = {"Authorization": f"Bearer {token2}"}

    # 6. New token grants access back to dashboard/account
    r = client.get("/auth/me", headers=headers2)
    assert r.status_code == 200
    assert r.json()["username"] == _ACCOUNT["username"]

    # 7. Old token remains invalid
    assert client.get("/auth/me", headers=headers1).status_code == 401


def test_upload_and_list_emails():
    _auth_bypass()
    r = client.post("/upload")
    assert r.status_code == 200
    assert r.json()["total_emails"] > 0

    r = client.get("/emails?limit=5")
    assert r.status_code == 200
    assert len(r.json()) <= 5


def test_upload_single_file_multipart():
    _auth_bypass()
    import io
    content = b'{"email_id": "test_single_upload_01", "from": "shipper@example.com", "subject": "Test B/L", "body": "Body"}'
    files = {"files": ("test_single_upload_01.json", io.BytesIO(content), "application/json")}
    r = client.post("/upload", files=files)
    assert r.status_code == 200
    data = r.json()
    assert data["uploaded_files"] == 1
    assert data["created"] >= 0


def test_process_single_email_and_read_detail():
    _auth_bypass()
    r = client.get("/emails?limit=1")
    email_id = r.json()[0]["email_id"]

    r = client.post(f"/emails/{email_id}/process")
    assert r.status_code == 200
    assert r.json()["status"] == "queued"

    # BackgroundTasks run synchronously under TestClient, so the result
    # should already be there.
    r = client.get(f"/emails/{email_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["category"] in {"BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"}


def test_dashboard_stats_shape():
    _auth_bypass()
    r = client.get("/dashboard")
    assert r.status_code == 200
    keys = {"total_emails", "processed_emails", "bl_comparison_requests",
            "successful_matches", "mismatches", "human_review_cases"}
    assert keys.issubset(r.json().keys())


def test_reviews_queue_only_contains_needs_review():
    _auth_bypass()
    r = client.get("/reviews")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_evaluation_generate_submission():
    _auth_bypass()
    r = client.post("/evaluation/generate")
    assert r.status_code == 200
    assert "emails_included" in r.json()
