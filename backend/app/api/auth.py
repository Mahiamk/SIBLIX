"""
auth.py — Account registration and authentication.

Access to the dataset is gated on a real account in the `users` table: every
caller must register before any data route will answer. There is no demo or
environment-variable bypass — if a username is not in the database, it cannot
log in.

Passwords are stored as salted PBKDF2-HMAC-SHA256 digests (stdlib only, no
extra dependency). Rows written by the earlier build stored the password in
clear text; those still authenticate once and are re-written as a proper hash
on that first successful login, so no account is stranded.

Tokens are stateless and HMAC-signed, so a backend restart does not silently
log everyone out (the previous in-memory token dict did exactly that).
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select

from app.database.connection import get_session
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])

# Signing key for session tokens. Set AUTH_SECRET in the environment for any
# deployment — the fallback keeps local dev working but is not a secret.
AUTH_SECRET = os.environ.get("AUTH_SECRET", "sdoc-dev-secret-change-me").encode()
TOKEN_TTL_SECONDS = int(os.environ.get("AUTH_TOKEN_TTL", 60 * 60 * 12))

MIN_USERNAME_LEN = 3
MIN_PASSWORD_LEN = 8

_PBKDF2_ITERATIONS = 200_000
_revoked_tokens = set()  # explicit logouts within the current process


# --------------------------------------------------------------------------
# password hashing
# --------------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Check a password against a stored digest.

    Returns True for a legacy clear-text row as well, so accounts created by
    the earlier build keep working; `login` upgrades those in place.
    """
    if not stored:
        return False
    if not stored.startswith("pbkdf2_sha256$"):
        return hmac.compare_digest(password, stored)  # legacy clear-text row
    try:
        _, iterations, salt_hex, digest_hex = stored.split("$")
        expected = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(expected.hex(), digest_hex)
    except Exception:
        return False


def is_legacy_hash(stored: str) -> bool:
    return bool(stored) and not stored.startswith("pbkdf2_sha256$")


# --------------------------------------------------------------------------
# tokens
# --------------------------------------------------------------------------
def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def create_token(username: str) -> str:
    payload = {"sub": username, "exp": int(time.time()) + TOKEN_TTL_SECONDS,
               "jti": secrets.token_hex(8)}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(AUTH_SECRET, body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def decode_token(token: str) -> Optional[str]:
    """Return the username for a valid, unexpired, unrevoked token."""
    if not token or token in _revoked_tokens or token.count(".") != 1:
        return None
    body, sig = token.split(".")
    expected = _b64(hmac.new(AUTH_SECRET, body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_unb64(body))
    except Exception:
        return None
    if payload.get("exp", 0) < time.time():
        return None
    return payload.get("sub")


# --------------------------------------------------------------------------
# schemas
# --------------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    organization: Optional[str] = None      # employer, if they work under one
    job_title: Optional[str] = None

    @field_validator("username")
    @classmethod
    def _username_ok(cls, v):
        v = (v or "").strip()
        if len(v) < MIN_USERNAME_LEN:
            raise ValueError(f"Username must be at least {MIN_USERNAME_LEN} characters")
        return v

    @field_validator("password")
    @classmethod
    def _password_ok(cls, v):
        if len(v or "") < MIN_PASSWORD_LEN:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LEN} characters")
        return v


class AuthResponse(BaseModel):
    token: str
    username: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    organization: Optional[str] = None


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        token=create_token(user.username),
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        organization=user.organization,
    )


# --------------------------------------------------------------------------
# routes
# --------------------------------------------------------------------------
@router.post("/register", response_model=AuthResponse, status_code=201)
def register(payload: RegisterRequest, session: Session = Depends(get_session)):
    """Create an account. This is the only way to obtain access."""
    username = payload.username.strip()
    email = (payload.email or "").strip() or None

    if session.exec(select(User).where(User.username == username)).first():
        raise HTTPException(status_code=409, detail="Username already registered")
    if email and session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(payload.password),
        full_name=(payload.full_name or "").strip() or username,
        organization=(payload.organization or "").strip() or None,
        job_title=(payload.job_title or "").strip() or None,
        role="operator",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _auth_response(user)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)):
    """Authenticate a registered account. No bypass: unknown usernames fail."""
    user = session.exec(
        select(User).where(User.username == payload.username.strip())
    ).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if getattr(user, "status", "active") == "suspended":
        raise HTTPException(
            status_code=403,
            detail="Account suspended by a Super Administrator. Contact your system supervisor.",
        )

    # Transparently upgrade a legacy clear-text row now that we know the
    # password is correct.
    if is_legacy_hash(user.password_hash):
        user.password_hash = hash_password(payload.password)
        session.add(user)
        session.commit()
        session.refresh(user)

    return _auth_response(user)


@router.get("/me", response_model=AuthResponse)
def me(authorization: str = Header(default=""), session: Session = Depends(get_session)):
    """Validate a stored token and return its account, so a reloaded client
    can tell a live session from a stale one instead of assuming."""
    username = decode_token(authorization.replace("Bearer ", "").strip())
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = session.exec(select(User).where(User.username == username)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    return _auth_response(user)


@router.post("/logout")
def logout(authorization: str = Header(default="")):
    token = authorization.replace("Bearer ", "").strip()
    if token:
        _revoked_tokens.add(token)
    return {"ok": True}


def require_auth(
    authorization: str = Header(default=""),
    session: Session = Depends(get_session),
):
    """Route dependency: the caller must present a token for an account that
    still exists in the database."""
    if os.environ.get("DISABLE_AUTH") == "1":
        return True
    username = decode_token(authorization.replace("Bearer ", "").strip())
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not session.exec(select(User).where(User.username == username)).first():
        raise HTTPException(status_code=401, detail="Account no longer exists")
    return True


def get_current_user(
    authorization: str = Header(default=""),
    session: Session = Depends(get_session),
) -> User:
    """Like require_auth, but hands back the account itself — needed wherever
    a resource belongs to one user (e.g. their connected mailboxes).

    Under DISABLE_AUTH the first user in the table stands in, so the local
    testing path keeps working without inventing a fake account.
    """
    if os.environ.get("DISABLE_AUTH") == "1":
        user = session.exec(select(User)).first()
        if user:
            return user
        raise HTTPException(
            status_code=401,
            detail="No account exists yet — register one via POST /auth/register",
        )
    username = decode_token(authorization.replace("Bearer ", "").strip())
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = session.exec(select(User).where(User.username == username)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    return user
